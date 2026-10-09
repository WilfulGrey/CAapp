import { assert, assertEquals } from "@std/assert";
import {
  type AnreiseDaten,
  anreiseAusConfirmation,
  anreiseModus,
  type ArrivalConfirmation,
  berlinJetzt,
} from "../anreise.ts";
import {
  type AnreiseKandidat,
  type AnreiseStandRow,
  type DetectSecrets,
  type DetectSupabase,
  handleRequest,
} from "../index.ts";
import { _resetAgencyTokenCache } from "../../_shared/mamamiaClient.ts";

// Mittwoch, 07.10.2026, 12:00 Berlin (10:00 UTC).
const JETZT = new Date("2026-10-07T10:00:00Z");
const ALT = "2026-10-06T08:00:00Z"; // updated_at: lange genug her

function fc(over: Partial<ArrivalConfirmation> = {}, arrival: Partial<NonNullable<ArrivalConfirmation["arrival"]>> = {}): ArrivalConfirmation {
  return {
    id: 4711,
    rejected_at: null,
    arrival_date: "2026-10-12",
    caregiver: { id: 501, first_name: "Ewa", last_name: "Lis", avatar: { aws_url: "https://cdn.test/e.jpg" } },
    contract_patient: { street_number: "Musterstraße 12", zip_code: "80687", city: "München" },
    arrival: {
      arrival_date: "2026-10-12",
      arrival_time_from: "14:00:00",
      arrival_time_to: "18:00:00",
      note: "Ewa reist mit einem Koffer an.",
      updated_at: ALT,
      arrival_type: { id: 1, type: "Minibus" },
      ...arrival,
    },
    ...over,
  };
}

function daten(r: ReturnType<typeof anreiseAusConfirmation>): AnreiseDaten {
  assert("daten" in r, `erwartet Daten, bekam ${JSON.stringify(r)}`);
  return r.daten;
}

function grund(r: ReturnType<typeof anreiseAusConfirmation>): string {
  assert("grund" in r, `erwartet Grund, bekam ${JSON.stringify(r)}`);
  return r.grund;
}

// ─── Reine Logik ───────────────────────────────────────────────────────────

Deno.test("vollständige Anreise → Daten für die Mail", () => {
  const d = daten(anreiseAusConfirmation(33001, fc(), JETZT));
  assertEquals(d, {
    confirmation_id: 4711,
    arrival_key: "33001|4711|2026-10-12|14:00|18:00|1",
    anreise_datum: "2026-10-12",
    anreise_von: "14:00",
    anreise_bis: "18:00",
    verkehrsmittel: "Minibus",
    hinweis: "Ewa reist mit einem Koffer an.",
    einsatzort_strasse: "Musterstraße 12",
    einsatzort_plz_ort: "80687 München",
  });
});

Deno.test("HH:MM und HH:MM:SS ergeben denselben Schlüssel", () => {
  const a = daten(anreiseAusConfirmation(1, fc({}, { arrival_time_from: "14:00", arrival_time_to: "18:00" }), JETZT));
  const b = daten(anreiseAusConfirmation(1, fc(), JETZT));
  assertEquals(a.arrival_key, b.arrival_key);
});

Deno.test("Datum mit Uhrzeit (YYYY-MM-DD 00:00:00) wird gelesen", () => {
  const d = daten(anreiseAusConfirmation(1, fc({ arrival_date: "2026-10-12 00:00:00" }, { arrival_date: "2026-10-12 00:00:00" }), JETZT));
  assertEquals(d.anreise_datum, "2026-10-12");
});

Deno.test("geänderte Uhrzeit → anderer Schlüssel, geänderte Notiz → gleicher", () => {
  const basis = daten(anreiseAusConfirmation(1, fc(), JETZT)).arrival_key;
  assert(daten(anreiseAusConfirmation(1, fc({}, { arrival_time_from: "15:00" }), JETZT)).arrival_key !== basis);
  assert(daten(anreiseAusConfirmation(1, fc({}, { arrival_type: { id: 3, type: "Own transport" } }), JETZT)).arrival_key !== basis);
  assertEquals(daten(anreiseAusConfirmation(1, fc({}, { note: "anders" }), JETZT)).arrival_key, basis);
});

Deno.test("ohne Notiz, Bis-Zeit und Adresse → null-Felder, trotzdem Mail", () => {
  const d = daten(anreiseAusConfirmation(1, fc({ contract_patient: null }, { note: "  ", arrival_time_to: null }), JETZT));
  assertEquals([d.hinweis, d.anreise_bis, d.einsatzort_strasse, d.einsatzort_plz_ort], [null, null, null, null]);
});

Deno.test("Ablehnungsgründe", () => {
  assertEquals(grund(anreiseAusConfirmation(1, null, JETZT)), "keine_confirmation");
  assertEquals(grund(anreiseAusConfirmation(1, fc({ rejected_at: "2026-10-01 10:00:00" }), JETZT)), "storniert");
  assertEquals(grund(anreiseAusConfirmation(1, fc({ caregiver: null }), JETZT)), "keine_pflegekraft");
  assertEquals(grund(anreiseAusConfirmation(1, fc({ arrival: null }), JETZT)), "keine_anreise");
  assertEquals(grund(anreiseAusConfirmation(1, fc({}, { arrival_time_from: null }), JETZT)), "unvollstaendig");
  assertEquals(grund(anreiseAusConfirmation(1, fc({}, { arrival_type: null }), JETZT)), "unvollstaendig");
  assertEquals(grund(anreiseAusConfirmation(1, fc({}, { arrival_date: "12.10.2026" }), JETZT)), "format");
  assertEquals(grund(anreiseAusConfirmation(1, fc({}, { arrival_time_from: "14 Uhr" }), JETZT)), "format");
  assertEquals(grund(anreiseAusConfirmation(1, fc({ arrival_date: "2026-10-13" }), JETZT)), "datum_konflikt");
  assertEquals(grund(anreiseAusConfirmation(1, fc({}, { updated_at: "2026-10-07T09:55:00Z" }), JETZT)), "frisch");
});

Deno.test("vorbei: gestern, oder heute nach Beginn des Zeitfensters (Berliner Zeit)", () => {
  const gestern = { arrival_date: "2026-10-06" };
  assertEquals(grund(anreiseAusConfirmation(1, fc(gestern, gestern), JETZT)), "vorbei");
  const heute = { arrival_date: "2026-10-07" };
  // 12:00 Berlin: Fenster ab 11:00 hat begonnen, ab 14:00 noch nicht.
  assertEquals(grund(anreiseAusConfirmation(1, fc(heute, { ...heute, arrival_time_from: "11:00" }), JETZT)), "vorbei");
  assert("daten" in anreiseAusConfirmation(1, fc(heute, heute), JETZT));
});

Deno.test("berlinJetzt: 23:30 UTC ist in Berlin schon der nächste Tag", () => {
  assertEquals(berlinJetzt(new Date("2026-10-07T23:30:00Z")), { datum: "2026-10-08", zeit: "01:30" });
});

Deno.test("anreiseModus: nur test/live schalten ein", () => {
  assertEquals([anreiseModus(undefined), anreiseModus(""), anreiseModus("1"), anreiseModus("aus")], ["aus", "aus", "aus", "aus"]);
  assertEquals([anreiseModus("test"), anreiseModus(" LIVE ")], ["test", "live"]);
});

// ─── Modus { mode: "anreise" } ─────────────────────────────────────────────

const SECRETS: DetectSecrets = {
  supabaseUrl: "https://supabase.test",
  supabaseServiceKey: "service-key",
  mamamiaEndpoint: "https://mamamia.test/graphql",
  mamamiaAuthEndpoint: "https://mamamia.test/graphql/auth",
  mamamiaAgencyEmail: "agency@test",
  mamamiaAgencyPassword: "secret",
  kostenrechnerUrl: "https://kr.test",
};

const KANDIDAT: AnreiseKandidat = { lead_id: "lead-1", token: "tok-1", mamamia_job_offer_id: 33001 };

// Anreise in 10 Tagen ab heute — der Modus nutzt die echte Uhr.
function zukunft(): string {
  return new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
}

function fcZukunft(arrival: Partial<NonNullable<ArrivalConfirmation["arrival"]>> = {}): ArrivalConfirmation {
  const tag = zukunft();
  return fc({ arrival_date: tag }, { arrival_date: tag, updated_at: "2026-01-01T00:00:00Z", ...arrival });
}

interface Lauf {
  bridge: Array<{ event: string; metadata: Record<string, unknown> }>;
  graphql: string[];
}

function fakes(opts: {
  fcByJob: Record<number, ArrivalConfirmation | null | "error">;
  kandidaten?: AnreiseKandidat[];
  stand?: AnreiseStandRow[];
}): { supabase: DetectSupabase; fetchFn: typeof fetch; lauf: Lauf } {
  const lauf: Lauf = { bridge: [], graphql: [] };
  const supabase: DetectSupabase = {
    fetchLead: () => Promise.resolve(null),
    fetchActiveLeads: () => Promise.reject(new Error("Batch darf im Anreise-Modus nicht laufen")),
    fetchPastEvents: () => Promise.resolve([]),
    fetchAppStatusEvents: () => Promise.resolve([]),
    refreshReminderPhotos: () => Promise.resolve(0),
    fetchAnreiseKandidaten: () => Promise.resolve(opts.kandidaten ?? [KANDIDAT]),
    fetchAnreiseStand: () => Promise.resolve(opts.stand ?? []),
  };
  const fetchFn: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const body = JSON.parse(String((init as { body?: string } | undefined)?.body ?? "{}"));
    if (url.includes("/graphql/auth")) {
      return Promise.resolve(Response.json({ data: { LoginAgency: { id: 1, name: "A", email: "a@b", token: "jwt" } } }));
    }
    if (url.includes("mamamia.test/graphql")) {
      const op = (body.query.match(/(?:query|mutation)\s+(\w+)/) || [, ""])[1];
      lauf.graphql.push(op);
      const fcx = opts.fcByJob[body.variables.id as number];
      if (fcx === "error") return Promise.resolve(Response.json({ errors: [{ message: "boom" }] }));
      return Promise.resolve(Response.json({ data: { JobOffer: { id: body.variables.id, final_confirmation: fcx ?? null } } }));
    }
    if (url.includes("/api/lead-event")) {
      lauf.bridge.push({ event: body.event, metadata: body.metadata });
      return Promise.resolve(Response.json({ ok: true }));
    }
    return Promise.resolve(new Response("unexpected " + url, { status: 500 }));
  };
  return { supabase, fetchFn, lauf };
}

async function lauf(modus: string | null, f: ReturnType<typeof fakes>): Promise<Record<string, unknown>> {
  _resetAgencyTokenCache();
  if (modus == null) Deno.env.delete("ANREISE_MAILS");
  else Deno.env.set("ANREISE_MAILS", modus);
  try {
    const res = await handleRequest(
      new Request("https://x/functions/v1/detect-caregiver-events", { method: "POST", body: JSON.stringify({ mode: "anreise" }) }),
      { secrets: SECRETS, supabase: f.supabase, fetchFn: f.fetchFn },
    );
    assertEquals(res.status, 200);
    return await res.json();
  } finally {
    Deno.env.delete("ANREISE_MAILS");
  }
}

Deno.test("Modus anreise: ohne ANREISE_MAILS nur lesen, nichts an die Bridge", async () => {
  const f = fakes({ fcByJob: { 33001: fcZukunft() } });
  const r = await lauf(null, f);
  assertEquals(f.lauf.graphql, ["DetectJobOfferArrival"]);
  assertEquals(f.lauf.bridge.length, 0);
  assertEquals([r.modus, r.kandidaten, r.gemeldet], ["aus", 1, 0]);
});

Deno.test("Modus anreise: live meldet mit Pflegekraft, Anreise und Job", async () => {
  const f = fakes({ fcByJob: { 33001: fcZukunft() } });
  const r = await lauf("live", f);
  assertEquals(r.gemeldet, 1);
  assertEquals(f.lauf.bridge.length, 1);
  const { event, metadata } = f.lauf.bridge[0];
  assertEquals(event, "caregiver_arrival_scheduled");
  assertEquals(metadata.caregiver_name, "Ewa Lis");
  assertEquals(metadata.caregiver_photo_url, "https://cdn.test/e.jpg");
  assertEquals(metadata.mamamia_job_offer_id, 33001);
  assertEquals(metadata.confirmation_id, 4711);
  assertEquals(metadata.verkehrsmittel, "Minibus");
  assertEquals(metadata.test, undefined);
});

Deno.test("Modus anreise: test markiert die Meldung", async () => {
  const f = fakes({ fcByJob: { 33001: fcZukunft() } });
  await lauf("test", f);
  assertEquals(f.lauf.bridge[0].metadata.test, true);
});

Deno.test("Modus anreise: gleicher Schlüssel schon gemeldet → keine Meldung", async () => {
  const key = daten(anreiseAusConfirmation(33001, fcZukunft(), new Date())).arrival_key;
  const f = fakes({
    fcByJob: { 33001: fcZukunft() },
    stand: [{ mamamia_job_offer_id: 33001, confirmation_id: 4711, arrival_key: key, test: false }],
  });
  const r = await lauf("live", f);
  assertEquals([f.lauf.bridge.length, r.bekannt], [0, 1]);
});

Deno.test("Modus anreise: Test-Meldung blockiert live nicht (Wechsel test → live schickt)", async () => {
  const key = daten(anreiseAusConfirmation(33001, fcZukunft(), new Date())).arrival_key;
  const f = fakes({
    fcByJob: { 33001: fcZukunft() },
    stand: [{ mamamia_job_offer_id: 33001, confirmation_id: 4711, arrival_key: key, test: true }],
  });
  await lauf("live", f);
  assertEquals(f.lauf.bridge.length, 1);
});

Deno.test("Modus anreise: zurück auf einen früheren Stand (A → B → A) meldet wieder", async () => {
  const a = daten(anreiseAusConfirmation(33001, fcZukunft(), new Date())).arrival_key;
  const b = daten(anreiseAusConfirmation(33001, fcZukunft({ arrival_time_from: "09:00" }), new Date())).arrival_key;
  const f = fakes({
    fcByJob: { 33001: fcZukunft() },
    // neueste zuerst: zuletzt gemeldet war B
    stand: [
      { mamamia_job_offer_id: 33001, confirmation_id: 4711, arrival_key: b, test: false },
      { mamamia_job_offer_id: 33001, confirmation_id: 4711, arrival_key: a, test: false },
    ],
  });
  await lauf("live", f);
  assertEquals(f.lauf.bridge.length, 1);
});

Deno.test("Modus anreise: Fehler bei einem Job bricht den Lauf nicht ab", async () => {
  const f = fakes({
    kandidaten: [KANDIDAT, { lead_id: "lead-2", token: "tok-2", mamamia_job_offer_id: 33002 }],
    fcByJob: { 33001: "error", 33002: fcZukunft() },
  });
  const r = await lauf("live", f);
  assertEquals([r.fehler, r.gemeldet], [1, 1]);
});

Deno.test("Modus anreise: unvollständige Anreise → übersprungen, keine Meldung", async () => {
  const f = fakes({ fcByJob: { 33001: fcZukunft({ arrival_type: null }) } });
  const r = await lauf("live", f);
  assertEquals([f.lauf.bridge.length, r.uebersprungen], [0, 1]);
});
