// Tests des Acceptance→Mamamia-Sync-Moduls (_shared/acceptanceSync.ts) +
// der Retry-Phase des Detect-Crons + Auth der sync-acceptance Edge Fn.
// Liegen bewusst in detect/_tests — der bestehende CI-Job (deno-detect)
// deckt sie ohne Workflow-Änderung ab.

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  type AcceptanceRow,
  buildCustomerContract,
  isPdfBytes,
  mapContractContact,
  mapContractPatient,
  splitEinsatzort,
  syncAcceptance,
} from "../../_shared/acceptanceSync.ts";
import { handleRequest as syncHandler, type SyncStore } from "../../sync-acceptance/index.ts";
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
    ...overrides,
  };
}

const LEAD = { id: "lead-1", token: "tok-abc", mamamia_customer_id: 7777 };
const SECRETS = { mamamiaEndpoint: "https://mm.example/graphql", kostenrechnerUrl: "https://kr.example" };

// Fake-Fetch: routet nach URL/Body — sammelt GraphQL-Operationen zur Assertion.
interface FakeNet {
  fetch: typeof fetch;
  ops: Array<{ op: string; variables: Record<string, unknown> }>;
  pdfBody?: Uint8Array | string;
  finalConfirmations?: Array<{ id: number; caregiver: { id: number } | null }>;
}

function makeNet(opts: Partial<FakeNet> = {}): FakeNet {
  const net: FakeNet = {
    ops: [],
    pdfBody: new TextEncoder().encode("%PDF-1.7 fake"),
    finalConfirmations: [],
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      // contract-pdf Render (Kostenrechner)
      if (url.includes("/api/contract-pdf/")) {
        const body = net.pdfBody!;
        return new Response(typeof body === "string" ? body : (body.buffer as ArrayBuffer), { status: 200 });
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
      if (q.includes("AcceptanceSyncCustomer")) {
        net.ops.push({ op: "AcceptanceSyncCustomer", variables: v });
        return new Response(JSON.stringify({
          data: {
            Customer: {
              id: 7777,
              equipments: [{ id: 1 }, { id: 2 }],
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
  const order = net.ops.map((o) => o.op);
  assertEquals(order[0], "AcceptanceSyncCustomer");
  assertEquals(order[1], "UpdateCustomerContract");
  assertEquals(order[2], "StoreConfirmation");
  // Preserve: equipments zurückgereicht, patients leer (kein Wipe)
  const uc = net.ops[1].variables;
  assertEquals(uc.equipment_ids, [1, 2]);
  assertEquals(uc.patients, []);
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

Deno.test("retryAcceptanceSyncs: >24h unvollständig ⇒ Alert-Stempel (einmalig)", async () => {
  // Login-Call der Agency-Token-Beschaffung mitrouten.
  const net = makeNet({ finalConfirmations: [{ id: 555, caregiver: { id: 501 } }] });
  const baseFetch = net.fetch;
  const fetchWithAuth = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/graphql/auth")) {
      return new Response(JSON.stringify({ data: { LoginAgency: { id: 1, name: "P", email: "x", token: "agency-jwt" } } }), { status: 200 });
    }
    return baseFetch(input as RequestInfo, init);
  }) as typeof fetch;

  const alerted: string[] = [];
  const pending: PendingAcceptanceSync = {
    ...makeRow({ mamamia_confirmed_at: "2026-07-20T10:00:00Z", mamamia_confirmation_id: 555 }),
    accepted_at: new Date(Date.now() - 48 * 3600_000).toISOString(), // 48h alt
    mamamia_sync_alerted_at: null,
    lead_token: LEAD.token,
    lead_mamamia_customer_id: LEAD.mamamia_customer_id,
  };
  const deps = {
    secrets: DETECT_SECRETS,
    fetchFn: fetchWithAuth,
    supabase: {
      selectPendingAcceptanceSyncs: () => Promise.resolve([pending]),
      stampAcceptanceConfirmed: () => Promise.resolve(),
      stampAcceptancePdfUploaded: () => Promise.resolve(),
      stampAcceptanceSyncAlerted: (l: string, a: number) => {
        alerted.push(`${l}:${a}`);
        return Promise.resolve();
      },
    },
  } as unknown as HandlerDeps;

  const r = await retryAcceptanceSyncs(deps);
  assertEquals(r.scanned, 1);
  assertEquals(r.completed, 1); // PDF-Upload lief durch (verarbeitet + PDF ok)
  assertEquals(r.alerts, 1);
  assertEquals(alerted, ["lead-1:9001"]);
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
    { secrets: SYNC_FN_SECRETS, store: makeStore(makeRow()), fetchFn: net.fetch, getAgencyToken: agencyToken },
  );
  assertEquals(srvRes.status, 200);
});

Deno.test("sync-acceptance: korrekter Bearer ⇒ Sequenz läuft (200 + Ergebnis)", async () => {
  const net = makeNet();
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
    },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.confirmed, true);
  assertEquals(body.customer_updated, true);
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