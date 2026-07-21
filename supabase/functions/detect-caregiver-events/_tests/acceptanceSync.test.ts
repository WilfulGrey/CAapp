// Tests des Acceptance→Mamamia-Sync-Moduls (_shared/acceptanceSync.ts) +
// der Retry-Phase des Detect-Crons + Auth der sync-acceptance Edge Fn.
// Liegen bewusst in detect/_tests — der bestehende CI-Job (deno-detect)
// deckt sie ohne Workflow-Änderung ab.

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  type AcceptanceRow,
  buildCustomerContract,
  isAgGleich,
  isPdfBytes,
  mapContractContact,
  mapContractPatient,
  splitEinsatzort,
  syncAcceptance,
} from "../../_shared/acceptanceSync.ts";
import { handleRequest as syncHandler, runRetryChain, type SyncStore } from "../../sync-acceptance/index.ts";
import { retryAcceptanceSyncs, type HandlerDeps, type PendingAcceptanceSync } from "../index.ts";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<AcceptanceRow> = {}): AcceptanceRow {
  return {
    lead_id: "lead-1",
    application_id: 9001,
    caregiver_id: 501,
    signatur: "Steffen Krumbholz",
    contract_patient: {
      anrede: "Frau",
      vorname: "Gerda",
      nachname: "Krumbholz",
      strasse: "Musterstraße 12",
      einsatzort: "80331, München",
      telefon: "089 111",
      email: "gerda@example.de",
    },
    contract_contact: {
      anrede: "Herr",
      vorname: "Steffen",
      nachname: "Krumbholz",
      telefon: "089 222",
      email: "steffen@example.de",
    },
    contract_snapshot: {
      datum: "22.07.2026",
      ag: { name: "Steffen Krumbholz", strasse: "Beispielweg 5", plz: "", ort: "80333 München", email: "steffen@example.de", telefon: "089 222" },
      le: { name: "Gerda Krumbholz", strasse: "Musterstraße 12", plz: "", ort: "80331, München" },
      vertragsbeginn: "01.08.2026",
      tagessatz: "EUR 95,00",
    },
    mamamia_confirmed_at: null,
    mamamia_confirmation_id: null,
    mamamia_pdf_uploaded_at: null,
    pdf_sha256: null,
    ...overrides,
  };
}

const LEAD = { id: "lead-1", token: "tok-abc", mamamia_customer_id: 7777 };
const SECRETS = {
  mamamiaEndpoint: "https://mm.example/graphql",
  kostenrechnerUrl: "https://kr.example",
  supabaseUrl: "https://supa.example",
  supabaseServiceKey: "srv-key",
};

// Fake-Fetch: routet nach URL/Body — sammelt GraphQL-Operationen zur Assertion.
interface FakeNet {
  fetch: typeof fetch;
  ops: Array<{ op: string; variables: Record<string, unknown> }>;
  pdfBody?: Uint8Array | string;
  finalConfirmations?: Array<{ id: number; caregiver: { id: number } | null }>;
  // Fehler-Injektion für StoreConfirmation (Alarm-Policy-Tests):
  //   "graphql" = GraphQL-Fehler (⇒ permanent), "http500" = HTTP 500 (⇒ transient).
  // confirmFailTimes = wie viele Versuche fehlschlagen (undefined ⇒ alle).
  confirmFailMode?: "graphql" | "http500";
  confirmFailTimes?: number;
  // Bridge-Route /api/lead-event — Alarm-POSTs des Crons (Body gesammelt).
  bridgePosts: Array<Record<string, unknown>>;
  bridgeStatus?: number;
  // Kein bestehender Contract am Customer (kein location_id-Carry möglich).
  noExistingContract?: boolean;
  // PLZ→location_id Katalog (AcceptanceSyncLocations); fehlende PLZ ⇒ [].
  locationHits?: Record<string, number>;
  // Kanonischer PDF im Storage-Bucket; null/undefined ⇒ 404 (Fallback-Render).
  storageBody?: Uint8Array | string | null;
}

function makeNet(opts: Partial<FakeNet> = {}): FakeNet {
  const net: FakeNet = {
    ops: [],
    pdfBody: new TextEncoder().encode("%PDF-1.7 fake"),
    finalConfirmations: [],
    locationHits: { "80331": 111, "80333": 222 },
    bridgePosts: [],
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      // KANON aus dem Storage-Bucket (contracts/<lead>/<app>.pdf)
      if (url.includes("/storage/v1/object/contracts/")) {
        net.ops.push({ op: "StorageDownload", variables: { url } });
        const body = net.storageBody;
        if (body == null) return new Response("not found", { status: 404 });
        return new Response(
          typeof body === "string" ? body : (body.buffer as ArrayBuffer),
          { status: 200 },
        );
      }
      // contract-pdf Render (Kostenrechner) — Fallback für Alt-Rows
      if (url.includes("/api/contract-pdf/")) {
        net.ops.push({ op: "ContractPdfRender", variables: { url } });
        const body = net.pdfBody!;
        return new Response(typeof body === "string" ? body : (body.buffer as ArrayBuffer), { status: 200 });
      }
      // Bridge: Alarm-Event-POST (Cron → Team-Mail)
      if (url.includes("/api/lead-event")) {
        net.bridgePosts.push(JSON.parse((init?.body ?? "{}") as string));
        return new Response("{}", { status: net.bridgeStatus ?? 200 });
      }
      // StoreFile Multipart (FormData-Body)
      if (init?.body instanceof FormData) {
        net.ops.push({ op: "StoreFile", variables: {} });
        return new Response(JSON.stringify({ data: { StoreFile: { id: 1, token: "ft-1" } } }), { status: 200 });
      }
      // Normale GraphQL-JSON-Calls
      const parsed = JSON.parse((init?.body ?? "{}") as string);
      const q: string = parsed.query ?? "";
      const v: Record<string, unknown> = parsed.variables ?? {};
      if (q.includes("AcceptanceSyncLocations")) {
        net.ops.push({ op: "AcceptanceSyncLocations", variables: v });
        const hit = net.locationHits?.[String(v.search)];
        return new Response(JSON.stringify({
          data: {
            LocationsWithPagination: {
              data: hit
                ? [{ id: hit, location: "Fake", zip_code: v.search, country_code: "DE" }]
                : [],
            },
          },
        }), { status: 200 });
      }
      if (q.includes("AcceptanceSyncCustomer")) {
        net.ops.push({ op: "AcceptanceSyncCustomer", variables: v });
        return new Response(JSON.stringify({
          data: {
            Customer: {
              id: 7777,
              equipments: [{ id: 1 }, { id: 2 }],
              patients: [{ id: 42, tools: [{ id: 3 }] }],
              customer_contract: net.noExistingContract ? null : { location_id: 13035 },
              job_offers: [
                { id: 100, final_confirmation: net.finalConfirmations!.length ? net.finalConfirmations![0] : null },
              ],
            },
          },
        }), { status: 200 });
      }
      if (q.includes("UpdateCustomerContract")) {
        net.ops.push({ op: "UpdateCustomerContract", variables: v });
        return new Response(JSON.stringify({ data: { UpdateCustomer: { id: 7777, customer_id: "ts-3-7777" } } }), { status: 200 });
      }
      if (q.includes("StoreConfirmation")) {
        net.ops.push({ op: "StoreConfirmation", variables: v });
        if (net.confirmFailMode && (net.confirmFailTimes === undefined || net.confirmFailTimes > 0)) {
          if (net.confirmFailTimes !== undefined) net.confirmFailTimes -= 1;
          if (net.confirmFailMode === "http500") return new Response("oops", { status: 500 });
          return new Response(JSON.stringify({
            errors: [{
              message: "Anwendungs-ID ungültig.",
              extensions: { validation: { application_id: ["Anwendungs-ID ungültig."] } },
            }],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: { StoreConfirmation: { id: 555, application_id: v.application_id, is_confirm_binding: true } } }), { status: 200 });
      }
      if (q.includes("UpdateConfirmation")) {
        net.ops.push({ op: "UpdateConfirmation", variables: v });
        return new Response(JSON.stringify({ data: { UpdateConfirmation: { id: v.id, signed_contract: { id: 9, original_name: "x.pdf" } } } }), { status: 200 });
      }
      throw new Error(`fake fetch: unrouted call ${url} ${q.slice(0, 60)}`);
    }) as typeof fetch,
    ...opts,
  };
  return net;
}

function makeStamps() {
  const calls: Array<{ kind: string; confirmationId?: number | null; sha?: string | null }> = [];
  return {
    calls,
    supabase: {
      stampConfirmed(_l: string, _a: number, confirmationId: number | null) {
        calls.push({ kind: "confirmed", confirmationId });
        return Promise.resolve();
      },
      stampPdfUploaded(_l: string, _a: number, sha: string | null) {
        calls.push({ kind: "pdf", sha });
        return Promise.resolve();
      },
    },
  };
}

const agencyToken = () => Promise.resolve("agency-jwt");

// ─── Mapping ───────────────────────────────────────────────────────────────

Deno.test("splitEinsatzort: Komma, Leerzeichen-PLZ und Nur-Ort", () => {
  assertEquals(splitEinsatzort("80331, München"), { zip: "80331", city: "München" });
  assertEquals(splitEinsatzort("80331 München"), { zip: "80331", city: "München" });
  assertEquals(splitEinsatzort("München"), { zip: "München", city: null }); // Legacy-Verhalten (1:1 vom Client)
});

Deno.test("mapContractPatient: Deutsch→Mamamia inkl. Salutation-Enum (Divers→null)", () => {
  const p = mapContractPatient({
    anrede: "Frau", vorname: "Gerda", nachname: "K", strasse: "Weg 1",
    einsatzort: "80331 München", telefon: "1", email: "g@e.de",
  })!;
  assertEquals(p.salutation, "Mrs.");
  assertEquals(p.first_name, "Gerda");
  assertEquals(p.street_number, "Weg 1");
  assertEquals(p.zip_code, "80331");
  assertEquals(p.city, "München");

  const divers = mapContractPatient({ anrede: "Divers", vorname: "X", nachname: "Y", einsatzort: "" })!;
  assertEquals(divers.salutation, null); // Mamamia-Enum kennt nur Mr./Mrs. (Fall Diesmann)
});

Deno.test("mapContractContact: Herr→Mr., ohne Adresse", () => {
  const c = mapContractContact({ anrede: "Herr", vorname: "S", nachname: "K", telefon: "2", email: "s@e.de" })!;
  assertEquals(c.salutation, "Mr.");
  assertEquals("street_number" in c, false);
});

Deno.test("buildCustomerContract: agGleich (le=null) → diskrete LE-Felder", () => {
  const row = makeRow({ contract_snapshot: { ...makeRow().contract_snapshot!, le: null } });
  const cc = buildCustomerContract(row)!;
  assertEquals(cc.salutation, "Mrs.");
  assertEquals(cc.first_name, "Gerda");
  assertEquals(cc.last_name, "Krumbholz");
  assertEquals(cc.zip_code, "80331");
});

Deno.test("buildCustomerContract: AG separat → Composed-Name-Split (letzte Leerstelle)", () => {
  const cc = buildCustomerContract(makeRow())!; // Snapshot: ag.name = "Steffen Krumbholz", le != null
  assertEquals(cc.first_name, "Steffen");
  assertEquals(cc.last_name, "Krumbholz");
  assertEquals("salutation" in cc, false); // Composed-Form trägt keine Anrede
  assertEquals(cc.zip_code, "80333");
  assertEquals(cc.city, "München");
});

Deno.test("isAgGleich: le=null ⇒ true; separater AG ⇒ false; kein Snapshot (Legacy) ⇒ true", () => {
  assertEquals(isAgGleich(makeRow({ contract_snapshot: { ...makeRow().contract_snapshot!, le: null } })), true);
  assertEquals(isAgGleich(makeRow()), false);
  assertEquals(isAgGleich(makeRow({ contract_snapshot: null })), true);
});

Deno.test("isPdfBytes: %PDF- ja, HTML nein", () => {
  assertEquals(isPdfBytes(new TextEncoder().encode("%PDF-1.7")), true);
  assertEquals(isPdfBytes(new TextEncoder().encode("<!DOCTYPE html>")), false);
});

// ─── syncAcceptance Sequenz ────────────────────────────────────────────────

Deno.test("sync: frischer Akzept — Reihenfolge UpdateCustomer→StoreConfirmation; PDF wartet auf Verarbeitung", async () => {
  const net = makeNet(); // keine final_confirmation ⇒ frisch bestätigt, aber noch nicht verarbeitet
  const stamps = makeStamps();
  const r = await syncAcceptance({
    lead: LEAD, row: makeRow(), secrets: SECRETS,
    supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
  });

  // Michałs Reihenfolge: 1. UpdateCustomer VOR 2. StoreConfirmation
  // (dazwischen best-effort Location-Lookups — Reihenfolge relativ prüfen).
  const order = net.ops.map((o) => o.op);
  assertEquals(order[0], "AcceptanceSyncCustomer");
  const idxUc = order.indexOf("UpdateCustomerContract");
  const idxSc = order.indexOf("StoreConfirmation");
  assertEquals(idxUc > 0, true);
  assertEquals(idxSc > idxUc, true);
  // Preserve: equipments zurückgereicht; patients = non-empty Stubs mit
  // tool_ids (Beta-Tenant verlangt non-empty; Stubs preserven Tools).
  const uc = net.ops[idxUc].variables;
  assertEquals(uc.equipment_ids, [1, 2]);
  assertEquals(uc.patients, [{ id: 42, tool_ids: [3] }]);
  // Die DREI Personen in Mamamias native Slots (Fix „Customer 8394"):
  // LE → patient_contracts[patient_contact] mit location_id-Carry,
  // AG → invoice_contract[contract_contact] (Snapshot-AG, Composed-Split),
  // KP → customer_contacts[]. Singular customer_contract wird NICHT mehr
  // geschrieben (typte die AG-Daten als patient_contact — Ursprungs-Bug).
  // Flagi is_same_as_* IMMER explizit false (sonst spiegelt Mamamia die
  // Patientendaten in die Row und die Panel-Checkbox bleibt an) — AUSSER
  // invoice_contract bei agGleich (separater AG hier ⇒ false).
  // location_id per Row aus IHRER PLZ (Katalog-Lookup wie Bug #13d): LE 80331
  // → 111, AG 80333 → 222 (AG wohnt NICHT am Einsatzort — Feedback Michał).
  assertEquals(uc.patient_contracts, [{
    contact_type: "patient_contact",
    is_same_as_first_patient: false,
    is_same_as_contact: false,
    salutation: "Mrs.",
    first_name: "Gerda",
    last_name: "Krumbholz",
    street_number: "Musterstraße 12",
    zip_code: "80331",
    city: "München",
    phone: "089 111",
    email: "gerda@example.de",
    location_id: 111,
  }]);
  assertEquals(uc.invoice_contract, {
    contact_type: "contract_contact",
    is_same_as_first_patient: false,
    is_same_as_contact: false,
    first_name: "Steffen",
    last_name: "Krumbholz",
    street_number: "Beispielweg 5",
    zip_code: "80333",
    city: "München",
    phone: "089 222",
    email: "steffen@example.de",
    location_id: 222,
  });
  assertEquals(uc.customer_contacts, [{
    is_same_as_first_patient: false,
    salutation: "Mr.",
    first_name: "Steffen",
    last_name: "Krumbholz",
    phone: "089 222",
    email: "steffen@example.de",
  }]);
  assertEquals("customer_contract" in uc, false);
  // Confirm-Ergebnis + Stempel
  assertEquals(r.confirmed, true);
  assertEquals(r.confirmation_id, 555);
  assertEquals(stamps.calls[0], { kind: "confirmed", confirmationId: 555 });
  // PDF NICHT hochgeladen — Confirmation noch nicht verarbeitet (Bramka)
  assertEquals(r.pdf_uploaded, false);
  assertEquals(order.includes("StoreFile"), false);
  assertStringIncludes(r.deferred.join("|"), "not processed");
});

Deno.test("sync: Retry — final_confirmation verarbeitet ⇒ PDF wird hochgeladen + SHA gestempelt", async () => {
  const net = makeNet({ finalConfirmations: [{ id: 555, caregiver: { id: 501 } }] });
  const stamps = makeStamps();
  const r = await syncAcceptance({
    lead: LEAD,
    row: makeRow({ mamamia_confirmed_at: "2026-07-22T10:00:00Z", mamamia_confirmation_id: 555 }),
    secrets: SECRETS, supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
  });
  assertEquals(r.pdf_uploaded, true);
  const order = net.ops.map((o) => o.op);
  assertEquals(order.includes("StoreConfirmation"), false); // längst bestätigt
  assertEquals(order.includes("StoreFile"), true);
  const upd = net.ops.find((o) => o.op === "UpdateConfirmation")!.variables;
  assertEquals(upd.id, 555);
  assertEquals(upd.file_tokens, ["ft-1"]);
  const pdfStamp = stamps.calls.find((c) => c.kind === "pdf")!;
  assertEquals(typeof pdfStamp.sha, "string");
  assertEquals((pdfStamp.sha as string).length, 64); // sha256 hex
});

Deno.test("sync: Adoption — final_confirmation existiert (SA-Portal/Alt-Client) ⇒ KEIN doppelter Accept", async () => {
  const net = makeNet({ finalConfirmations: [{ id: 777, caregiver: { id: 501 } }] });
  const stamps = makeStamps();
  const r = await syncAcceptance({
    lead: LEAD, row: makeRow(), secrets: SECRETS,
    supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
  });
  assertEquals(net.ops.map((o) => o.op).includes("StoreConfirmation"), false);
  assertEquals(r.confirmation_id, 777);
  assertEquals(stamps.calls[0], { kind: "confirmed", confirmationId: 777 });
  assertEquals(r.pdf_uploaded, true); // verarbeitet ⇒ Upload läuft direkt durch
});

Deno.test("sync: skipConfirm (Alt-Bundle hat akzeptiert, noch unverarbeitet) ⇒ weder Store noch Stempel", async () => {
  const net = makeNet(); // final_confirmation noch nicht sichtbar
  const stamps = makeStamps();
  const r = await syncAcceptance({
    lead: LEAD, row: makeRow(), skipConfirm: true, secrets: SECRETS,
    supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
  });
  assertEquals(net.ops.map((o) => o.op).includes("StoreConfirmation"), false);
  assertEquals(r.confirmed, false);
  assertEquals(stamps.calls.length, 0);
  assertStringIncludes(r.deferred.join("|"), "client already accepted");
});

async function shaHex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("sync: KANON aus dem Storage ⇒ genau diese Bytes zu Mamamia, KEIN Re-Render", async () => {
  const canon = new TextEncoder().encode("%PDF-1.7 canonical");
  const net = makeNet({
    finalConfirmations: [{ id: 555, caregiver: { id: 501 } }],
    storageBody: canon,
  });
  const stamps = makeStamps();
  const r = await syncAcceptance({
    lead: LEAD,
    row: makeRow({ mamamia_confirmed_at: "2026-07-22T10:00:00Z", mamamia_confirmation_id: 555, pdf_sha256: await shaHex(canon) }),
    secrets: SECRETS, supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
  });
  assertEquals(r.pdf_uploaded, true);
  const order = net.ops.map((o) => o.op);
  assertEquals(order.includes("StorageDownload"), true);
  assertEquals(order.includes("ContractPdfRender"), false); // 1 Datei — nie neu rendern
  assertEquals(order.includes("StoreFile"), true);
  const pdfStamp = stamps.calls.find((c) => c.kind === "pdf")!;
  assertEquals(pdfStamp.sha, await shaHex(canon)); // Stempel == Kanon-Bytes
});

Deno.test("sync: Kanon-Bytes ≠ pdf_sha256 ⇒ Integritäts-Gate blockt Upload (deferred)", async () => {
  const net = makeNet({
    finalConfirmations: [{ id: 555, caregiver: { id: 501 } }],
    storageBody: new TextEncoder().encode("%PDF-1.7 tampered"),
  });
  const stamps = makeStamps();
  const r = await syncAcceptance({
    lead: LEAD,
    row: makeRow({ mamamia_confirmed_at: "2026-07-22T10:00:00Z", mamamia_confirmation_id: 555, pdf_sha256: "00".repeat(32) }),
    secrets: SECRETS, supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
  });
  assertEquals(r.pdf_uploaded, false);
  assertEquals(net.ops.map((o) => o.op).includes("StoreFile"), false);
  assertStringIncludes(r.deferred.join("|"), "pdf_sha256");
});

Deno.test("sync: kein Kanon im Storage (404) ⇒ Fallback-Render via Kostenrechner (Alt-Rows)", async () => {
  const net = makeNet({ finalConfirmations: [{ id: 555, caregiver: { id: 501 } }] }); // storageBody undefined ⇒ 404
  const stamps = makeStamps();
  const r = await syncAcceptance({
    lead: LEAD,
    row: makeRow({ mamamia_confirmed_at: "2026-07-22T10:00:00Z", mamamia_confirmation_id: 555 }),
    secrets: SECRETS, supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
  });
  assertEquals(r.pdf_uploaded, true);
  const order = net.ops.map((o) => o.op);
  assertEquals(order.includes("StorageDownload"), true);
  assertEquals(order.includes("ContractPdfRender"), true);
});

Deno.test("sync: HTML-Fallback vom Renderer ⇒ Magic-Byte-Gate blockt Upload (deferred)", async () => {
  const net = makeNet({
    finalConfirmations: [{ id: 555, caregiver: { id: 501 } }],
    pdfBody: "<!DOCTYPE html><html>fallback</html>",
  });
  const stamps = makeStamps();
  const r = await syncAcceptance({
    lead: LEAD,
    row: makeRow({ mamamia_confirmed_at: "2026-07-22T10:00:00Z", mamamia_confirmation_id: 555 }),
    secrets: SECRETS, supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
  });
  assertEquals(r.pdf_uploaded, false);
  assertEquals(net.ops.map((o) => o.op).includes("StoreFile"), false);
  assertStringIncludes(r.deferred.join("|"), "non-PDF");
});

Deno.test("sync: agGleich (le=null) ⇒ invoice_contract = LE-Daten (mit Salutation) + gleiche location_id (EIN Lookup)", async () => {
  const net = makeNet({ noExistingContract: true });
  const stamps = makeStamps();
  const row = makeRow({ contract_snapshot: { ...makeRow().contract_snapshot!, le: null } });
  await syncAcceptance({
    lead: LEAD, row, secrets: SECRETS,
    supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
  });
  const uc = net.ops.find((o) => o.op === "UpdateCustomerContract")!.variables;
  // AG == LE ⇒ Vertragspartner-Slot bekommt die diskreten LE-Felder und
  // is_same_as_first_patient: TRUE (ehrlicher Spiegel — Panel-Checkbox an).
  assertEquals(uc.invoice_contract, {
    contact_type: "contract_contact",
    is_same_as_first_patient: true,
    is_same_as_contact: false,
    salutation: "Mrs.",
    first_name: "Gerda",
    last_name: "Krumbholz",
    street_number: "Musterstraße 12",
    zip_code: "80331",
    city: "München",
    phone: "089 111",
    email: "gerda@example.de",
    location_id: 111,
  });
  const pc = (uc.patient_contracts as Array<Record<string, unknown>>)[0];
  assertEquals(pc.location_id, 111);
  // Gleiche PLZ ⇒ EIN Katalog-Lookup, nicht zwei.
  assertEquals(net.ops.filter((o) => o.op === "AcceptanceSyncLocations").length, 1);
});

Deno.test("sync: Katalog ohne Treffer ⇒ LE-Row fällt auf getragene location_id zurück; AG-Row ohne location_id", async () => {
  const net = makeNet({ locationHits: {} }); // Lookup liefert nichts
  const stamps = makeStamps();
  await syncAcceptance({
    lead: LEAD, row: makeRow(), secrets: SECRETS,
    supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
  });
  const uc = net.ops.find((o) => o.op === "UpdateCustomerContract")!.variables;
  const pc = (uc.patient_contracts as Array<Record<string, unknown>>)[0];
  assertEquals(pc.location_id, 13035); // Carry aus bestehendem Contract (Patientenbogen)
  assertEquals("location_id" in (uc.invoice_contract as Record<string, unknown>), false);
});

// ─── Confirm-Fehlerklassifikation + interne Retries (Alarm-Policy) ────────

Deno.test("sync: StoreConfirmation GraphQL-Fehler ⇒ permanent, KEIN Retry, kein Throw", async () => {
  const net = makeNet({ confirmFailMode: "graphql" }); // Mamamia lehnt deterministisch ab
  const stamps = makeStamps();
  const sleeps: number[] = [];
  const r = await syncAcceptance({
    lead: LEAD, row: makeRow(), secrets: SECRETS,
    supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
    sleepFn: (ms) => { sleeps.push(ms); return Promise.resolve(); },
  });
  // Genau EIN Versuch — permanente Fehler werden nicht wiederholt.
  assertEquals(net.ops.filter((o) => o.op === "StoreConfirmation").length, 1);
  assertEquals(sleeps, []);
  assertEquals(r.confirmed, false);
  assertEquals(r.confirm_error?.permanent, true);
  assertStringIncludes(r.confirm_error!.message, "ungültig");
  // Kein Stempel, kein PDF (Sequenz 2 vor 3+4), UpdateCustomer lief davor.
  assertEquals(stamps.calls.length, 0);
  assertEquals(net.ops.map((o) => o.op).includes("StoreFile"), false);
  assertEquals(r.customer_updated, true);
});

Deno.test("sync: StoreConfirmation transient (HTTP 500) ⇒ 3 Versuche mit Backoff, permanent=false", async () => {
  const net = makeNet({ confirmFailMode: "http500" }); // alle Versuche scheitern
  const stamps = makeStamps();
  const sleeps: number[] = [];
  const r = await syncAcceptance({
    lead: LEAD, row: makeRow(), secrets: SECRETS,
    supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
    sleepFn: (ms) => { sleeps.push(ms); return Promise.resolve(); },
  });
  assertEquals(net.ops.filter((o) => o.op === "StoreConfirmation").length, 3);
  assertEquals(sleeps, [2000, 4000]);
  assertEquals(r.confirmed, false);
  assertEquals(r.confirm_error?.permanent, false);
  assertEquals(stamps.calls.length, 0);
});

Deno.test("sync: transient, 2. Versuch klappt ⇒ confirmed + Stempel, kein confirm_error", async () => {
  const net = makeNet({ confirmFailMode: "http500", confirmFailTimes: 1 });
  const stamps = makeStamps();
  const r = await syncAcceptance({
    lead: LEAD, row: makeRow(), secrets: SECRETS,
    supabase: stamps.supabase, getAgencyToken: agencyToken, fetchFn: net.fetch,
    sleepFn: () => Promise.resolve(),
  });
  assertEquals(net.ops.filter((o) => o.op === "StoreConfirmation").length, 2);
  assertEquals(r.confirmed, true);
  assertEquals(r.confirmation_id, 555);
  assertEquals(r.confirm_error, undefined);
  assertEquals(stamps.calls[0], { kind: "confirmed", confirmationId: 555 });
});

// ─── Detect-Cron Retry-Phase ───────────────────────────────────────────────

const DETECT_SECRETS = {
  supabaseUrl: "https://supa.example",
  supabaseServiceKey: "srv",
  mamamiaEndpoint: SECRETS.mamamiaEndpoint,
  mamamiaAuthEndpoint: "https://mm.example/graphql/auth",
  mamamiaAgencyEmail: "a@e",
  mamamiaAgencyPassword: "pw",
  kostenrechnerUrl: SECRETS.kostenrechnerUrl,
};

Deno.test("retryAcceptanceSyncs: Adapter ohne Retry-Methoden ⇒ No-op", async () => {
  const deps = {
    secrets: DETECT_SECRETS,
    supabase: {},
  } as unknown as HandlerDeps;
  const r = await retryAcceptanceSyncs(deps);
  assertEquals(r, { scanned: 0, completed: 0, errors: 0, alerts: 0 });
});

// Login-Call der Agency-Token-Beschaffung mitrouten (alle Cron-Tests).
function withAuthRoute(net: FakeNet): typeof fetch {
  const baseFetch = net.fetch;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/graphql/auth")) {
      return new Response(JSON.stringify({ data: { LoginAgency: { id: 1, name: "P", email: "x", token: "agency-jwt" } } }), { status: 200 });
    }
    return baseFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

function makePending(overrides: Partial<PendingAcceptanceSync> = {}): PendingAcceptanceSync {
  return {
    ...makeRow(),
    accepted_at: new Date(Date.now() - 60_000).toISOString(), // 1 Min alt
    mamamia_sync_alerted_at: null,
    lead_token: LEAD.token,
    lead_mamamia_customer_id: LEAD.mamamia_customer_id,
    ...overrides,
  };
}

function makeCronDeps(net: FakeNet, pending: PendingAcceptanceSync[], alerted: string[]): HandlerDeps {
  return {
    secrets: DETECT_SECRETS,
    fetchFn: withAuthRoute(net),
    sleepFn: () => Promise.resolve(),
    supabase: {
      selectPendingAcceptanceSyncs: () => Promise.resolve(pending),
      stampAcceptanceConfirmed: () => Promise.resolve(),
      stampAcceptancePdfUploaded: () => Promise.resolve(),
      stampAcceptanceSyncAlerted: (l: string, a: number) => {
        alerted.push(`${l}:${a}`);
        return Promise.resolve();
      },
    },
  } as unknown as HandlerDeps;
}

Deno.test("retryAcceptanceSyncs: Retry repariert den Row ⇒ completed, KEIN Alarm (auch wenn alt)", async () => {
  const net = makeNet({ finalConfirmations: [{ id: 555, caregiver: { id: 501 } }] });
  const alerted: string[] = [];
  const pending = makePending({
    mamamia_confirmed_at: "2026-07-20T10:00:00Z",
    mamamia_confirmation_id: 555,
    accepted_at: new Date(Date.now() - 48 * 3600_000).toISOString(), // 48h alt
  });
  const r = await retryAcceptanceSyncs(makeCronDeps(net, [pending], alerted));
  assertEquals(r.scanned, 1);
  assertEquals(r.completed, 1); // PDF-Upload lief in DIESEM Lauf durch
  assertEquals(r.alerts, 0); // repariert ⇒ kein Alarmfall
  assertEquals(alerted, []);
  assertEquals(net.bridgePosts.length, 0);
});

Deno.test("retryAcceptanceSyncs: Confirm PERMANENT abgelehnt ⇒ Alarm SOFORT (auch <5 Min alt)", async () => {
  const net = makeNet({ confirmFailMode: "graphql" }); // Bewerbung zurückgezogen o.ä.
  const alerted: string[] = [];
  const pending = makePending(); // 1 Min alt — unter dem 5-Min-Fenster
  const r = await retryAcceptanceSyncs(makeCronDeps(net, [pending], alerted));
  assertEquals(r.alerts, 1);
  assertEquals(alerted, ["lead-1:9001"]);
  assertEquals(net.bridgePosts.length, 1);
  const post = net.bridgePosts[0] as { event: string; token: string; metadata: Record<string, unknown> };
  assertEquals(post.event, "acceptance_sync_alarm");
  assertEquals(post.token, "tok-abc");
  assertEquals(post.metadata.permanent, true);
  assertEquals(post.metadata.confirmed, false);
  assertStringIncludes(String(post.metadata.error), "ungültig");
});

Deno.test("retryAcceptanceSyncs: transient + jünger als 5 Min ⇒ KEIN Alarm (Cron versucht weiter)", async () => {
  const net = makeNet({ confirmFailMode: "http500" });
  const alerted: string[] = [];
  const pending = makePending({ accepted_at: new Date(Date.now() - 2 * 60_000).toISOString() }); // 2 Min
  const r = await retryAcceptanceSyncs(makeCronDeps(net, [pending], alerted));
  assertEquals(r.alerts, 0);
  assertEquals(alerted, []);
  assertEquals(net.bridgePosts.length, 0);
});

Deno.test("retryAcceptanceSyncs: transient + älter als 5 Min ⇒ Alarm über die Bridge + Stempel", async () => {
  const net = makeNet({ confirmFailMode: "http500" });
  const alerted: string[] = [];
  const pending = makePending({ accepted_at: new Date(Date.now() - 10 * 60_000).toISOString() }); // 10 Min
  const r = await retryAcceptanceSyncs(makeCronDeps(net, [pending], alerted));
  assertEquals(r.alerts, 1);
  assertEquals(alerted, ["lead-1:9001"]);
  assertEquals(net.bridgePosts.length, 1);
  const post = net.bridgePosts[0] as { metadata: Record<string, unknown> };
  assertEquals(post.metadata.permanent, false);
});

Deno.test("retryAcceptanceSyncs: Bridge-Mail schlägt fehl ⇒ KEIN Stempel (Re-Alarm nächster Lauf)", async () => {
  const net = makeNet({ confirmFailMode: "graphql", bridgeStatus: 500 });
  const alerted: string[] = [];
  const pending = makePending({ accepted_at: new Date(Date.now() - 10 * 60_000).toISOString() });
  const r = await retryAcceptanceSyncs(makeCronDeps(net, [pending], alerted));
  assertEquals(net.bridgePosts.length, 1); // Versuch fand statt …
  assertEquals(r.alerts, 0); // … aber ohne Mail kein Stempel
  assertEquals(alerted, []);
});

Deno.test("retryAcceptanceSyncs: Confirm ok, nur PDF offen ⇒ Alarm erst nach 24h (kein Kundenrisiko)", async () => {
  // final_confirmation NICHT sichtbar ⇒ PDF-Upload bleibt deferred.
  const net = makeNet();
  const alerted: string[] = [];
  const confirmedRow = {
    mamamia_confirmed_at: "2026-07-20T10:00:00Z" as string | null,
    mamamia_confirmation_id: 555 as number | null,
  };
  // 30 Min alt ⇒ unter der 24h-PDF-Schwelle ⇒ kein Alarm.
  const young = makePending({ ...confirmedRow, accepted_at: new Date(Date.now() - 30 * 60_000).toISOString() });
  const r1 = await retryAcceptanceSyncs(makeCronDeps(net, [young], alerted));
  assertEquals(r1.alerts, 0);
  assertEquals(net.bridgePosts.length, 0);
  // 48h alt ⇒ PDF-Alarm (confirmed=true im Metadata ⇒ „PDF fehlt"-Variante).
  const old = makePending({ ...confirmedRow, accepted_at: new Date(Date.now() - 48 * 3600_000).toISOString() });
  const r2 = await retryAcceptanceSyncs(makeCronDeps(net, [old], alerted));
  assertEquals(r2.alerts, 1);
  assertEquals(net.bridgePosts.length, 1);
  const post = net.bridgePosts[0] as { metadata: Record<string, unknown> };
  assertEquals(post.metadata.confirmed, true);
  assertEquals(post.metadata.pdf_uploaded, false);
});

// ─── sync-acceptance Edge Fn: Auth ─────────────────────────────────────────

const SYNC_FN_SECRETS = {
  supabaseUrl: "https://supa.example",
  supabaseServiceKey: "service-role-key-123",
  mamamiaEndpoint: SECRETS.mamamiaEndpoint,
  mamamiaAuthEndpoint: "https://mm.example/graphql/auth",
  mamamiaAgencyEmail: "a@e",
  mamamiaAgencyPassword: "pw",
  kostenrechnerUrl: SECRETS.kostenrechnerUrl,
};

function makeStore(row: AcceptanceRow | null): SyncStore {
  return {
    fetchLead: () => Promise.resolve(row ? LEAD : null),
    fetchAcceptance: () => Promise.resolve(row),
    stampConfirmed: () => Promise.resolve(),
    stampPdfUploaded: () => Promise.resolve(),
  };
}

// Hilfe: Unsigniertes Test-JWT mit gegebenem role-Claim. In Produktion prüft
// das Gateway (verify_jwt) die Signatur VOR der Funktion — der Handler prüft
// nur noch den Claim (rotations-sicher gegen Key-String-Drift Bridge↔Edge).
function fakeJwt(role: string): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role })}.sig`;
}

Deno.test("sync-acceptance: falscher Bearer (kein JWT, kein Key-Match) ⇒ 401", async () => {
  const res = await syncHandler(
    new Request("https://edge/sync-acceptance", {
      method: "POST",
      headers: { Authorization: "Bearer anon-key" },
      body: JSON.stringify({ lead_id: "lead-1", application_id: 9001 }),
    }),
    { secrets: SYNC_FN_SECRETS, store: makeStore(makeRow()) },
  );
  assertEquals(res.status, 401);
});

Deno.test("sync-acceptance: JWT mit role=anon ⇒ 401; role=service_role ⇒ läuft", async () => {
  const anonRes = await syncHandler(
    new Request("https://edge/sync-acceptance", {
      method: "POST",
      headers: { Authorization: `Bearer ${fakeJwt("anon")}` },
      body: JSON.stringify({ lead_id: "lead-1", application_id: 9001 }),
    }),
    { secrets: SYNC_FN_SECRETS, store: makeStore(makeRow()) },
  );
  assertEquals(anonRes.status, 401);

  const net = makeNet();
  const srvRes = await syncHandler(
    new Request("https://edge/sync-acceptance", {
      method: "POST",
      headers: { Authorization: `Bearer ${fakeJwt("service_role")}` },
      body: JSON.stringify({ lead_id: "lead-1", application_id: 9001 }),
    }),
    { secrets: SYNC_FN_SECRETS, store: makeStore(makeRow()), fetchFn: net.fetch, getAgencyToken: agencyToken, runRetriesFn: () => Promise.resolve() },
  );
  assertEquals(srvRes.status, 200);
});

Deno.test("sync-acceptance: korrekter Bearer ⇒ Sequenz läuft (200 + Ergebnis); unvollständig ⇒ Retry-Chain geplant", async () => {
  const net = makeNet(); // frisch bestätigt, PDF wartet auf Verarbeitung ⇒ unvollständig
  const scheduled: Array<{ leadId: string; applicationId: number }> = [];
  const res = await syncHandler(
    new Request("https://edge/sync-acceptance", {
      method: "POST",
      headers: { Authorization: "Bearer service-role-key-123" },
      body: JSON.stringify({ lead_id: "lead-1", application_id: 9001 }),
    }),
    {
      secrets: SYNC_FN_SECRETS,
      store: makeStore(makeRow()),
      fetchFn: net.fetch,
      getAgencyToken: agencyToken,
      runRetriesFn: (_deps, leadId, applicationId) => {
        scheduled.push({ leadId, applicationId });
        return Promise.resolve();
      },
    },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.confirmed, true);
  assertEquals(body.customer_updated, true);
  assertEquals(body.retries_scheduled, true);
  assertEquals(scheduled, [{ leadId: "lead-1", applicationId: 9001 }]);
});

Deno.test("sync-acceptance: permanenter Confirm-Fehler ⇒ KEINE Retry-Chain (Bridge alarmiert T+0)", async () => {
  const net = makeNet({ confirmFailMode: "graphql" }); // deterministyczna odmowa MM
  let scheduledCount = 0;
  const res = await syncHandler(
    new Request("https://edge/sync-acceptance", {
      method: "POST",
      headers: { Authorization: "Bearer service-role-key-123" },
      body: JSON.stringify({ lead_id: "lead-1", application_id: 9001 }),
    }),
    {
      secrets: SYNC_FN_SECRETS,
      store: makeStore(makeRow()),
      fetchFn: net.fetch,
      getAgencyToken: agencyToken,
      runRetriesFn: () => {
        scheduledCount += 1;
        return Promise.resolve();
      },
    },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.confirm_error?.permanent, true);
  assertEquals(body.retries_scheduled, false);
  assertEquals(scheduledCount, 0);
});

// ─── Hintergrund-Retry-Chain (15/30/60 s) ──────────────────────────────────

Deno.test("retry-chain: PDF dopięty w pierwszej stufie ⇒ stop, bez alarmu", async () => {
  // Zwischen Erstversuch und +15s hat Mamamia die Confirmation verarbeitet.
  const net = makeNet({
    finalConfirmations: [{ id: 555, caregiver: { id: 501 } }],
    storageBody: new TextEncoder().encode("%PDF-1.7 canon"),
  });
  const row = makeRow({ mamamia_confirmed_at: "2026-07-21T20:00:00Z", mamamia_confirmation_id: 555 });
  const delays: number[] = [];
  await runRetryChain(
    {
      secrets: SYNC_FN_SECRETS,
      store: makeStore(row),
      fetchFn: net.fetch,
      getAgencyToken: agencyToken,
      sleepFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    },
    "lead-1",
    9001,
    false,
  );
  assertEquals(delays, [15000]); // po pierwszej stufie komplet — 30/60 nie odpalają
  assertEquals(net.ops.filter((o) => o.op === "StoreFile").length, 1);
  assertEquals(net.bridgePosts.length, 0);
});

Deno.test("retry-chain: wyczerpana bez confirm (transient) ⇒ NATYCHMIAST alarm przez bridge (source sync-retry)", async () => {
  const net = makeNet({ confirmFailMode: "http500" }); // MM leży na każdej próbie
  const delays: number[] = [];
  await runRetryChain(
    {
      secrets: SYNC_FN_SECRETS,
      store: makeStore(makeRow()),
      fetchFn: net.fetch,
      getAgencyToken: agencyToken,
      sleepFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    },
    "lead-1",
    9001,
    false,
  );
  // 3 Stufen (15/30/60) — dazwischen interne Confirm-Retries mit eigenen Pausen.
  assertEquals(delays.filter((d) => d >= 15000).slice(0, 3), [15000, 30000, 60000]);
  assertEquals(net.bridgePosts.length, 1);
  const post = net.bridgePosts[0] as { token: string; event: string; metadata: Record<string, unknown> };
  assertEquals(post.token, "tok-abc");
  assertEquals(post.event, "acceptance_sync_alarm");
  assertEquals(post.metadata.source, "sync-retry");
  assertEquals(post.metadata.confirmed, false);
});

Deno.test("retry-chain: confirm OK, tylko PDF wisi ⇒ wyczerpana BEZ alarmu (cron-backstop, 24h-próg)", async () => {
  // finalConfirmations leer ⇒ Verarbeitungs-Bramka defer't den Upload in jeder Stufe.
  const net = makeNet();
  const row = makeRow({ mamamia_confirmed_at: "2026-07-21T20:00:00Z", mamamia_confirmation_id: 555 });
  await runRetryChain(
    {
      secrets: SYNC_FN_SECRETS,
      store: makeStore(row),
      fetchFn: net.fetch,
      getAgencyToken: agencyToken,
      sleepFn: () => Promise.resolve(),
    },
    "lead-1",
    9001,
    false,
  );
  assertEquals(net.bridgePosts.length, 0);
});

Deno.test("sync-acceptance: unbekannte Acceptance ⇒ 404", async () => {
  const res = await syncHandler(
    new Request("https://edge/sync-acceptance", {
      method: "POST",
      headers: { Authorization: "Bearer service-role-key-123" },
      body: JSON.stringify({ lead_id: "lead-1", application_id: 1 }),
    }),
    { secrets: SYNC_FN_SECRETS, store: makeStore(null) },
  );
  assertEquals(res.status, 404);
});