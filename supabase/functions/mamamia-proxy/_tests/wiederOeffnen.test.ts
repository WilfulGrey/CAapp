// Registry #170 — geschlossener Kunde speichert den Patientenbogen ⇒ wieder offen.
import { assertEquals } from "@std/assert";
import { ACTIONS } from "../actions.ts";
import {
  anreiseZumOeffnen,
  hatOffenenJob,
  heuteBerlin,
  jobOeffnenVariablen,
  jobZumOeffnen,
  type StandJob,
} from "../wiederOeffnen.ts";
import type { ActionDeps, SessionPayload } from "../types.ts";

const SESSION: SessionPayload = {
  customer_id: 7570,
  job_offer_id: 16226,
  lead_id: "c4286032-9e06-453d-93f2-52779127c8e5",
  email: "test@example.com",
};

const HEUTE = "2026-11-23";

const job = (o: Partial<StandJob> & { id: number }): StandJob => ({
  status: "search",
  visibility: "hide",
  arrival_at: "2099-01-01 00:00:00",
  departure_at: null,
  title: "Primundus Kunde",
  salary_offered: 2800,
  salary_commission: 250,
  visible_caregiver_agencies: [],
  final_confirmation: null,
  ...o,
});

// ─── Auswahl (pure) ───────────────────────────────────────────────────────

Deno.test("jobZumOeffnen: der Job der Sitzung geht vor, sonst der neueste passende", () => {
  const jobs = [job({ id: 100 }), job({ id: 200 }), job({ id: 300 })];
  assertEquals(jobZumOeffnen(jobs, 200, HEUTE)?.id, 200);
  assertEquals(jobZumOeffnen(jobs, 999, HEUTE)?.id, 300);
});

Deno.test("jobZumOeffnen: beendet, abgebrochen, abgereist, gebucht, schon sichtbar ⇒ nie", () => {
  const jobs = [
    job({ id: 1, status: "done" }),
    job({ id: 2, status: "aborted" }),
    job({ id: 3, departure_at: "2026-11-23 00:00:00" }),
    job({ id: 4, final_confirmation: { id: 9, rejected_at: null } }),
    job({ id: 6, visibility: "public" }),
    job({ id: 7, status: "on_job" }),
  ];
  assertEquals(jobZumOeffnen(jobs, 1, HEUTE), null);
});

Deno.test("jobZumOeffnen: abgesagte Buchung hält den Job nicht fest", () => {
  const jobs = [job({ id: 8, final_confirmation: { id: 9, rejected_at: "2026-11-01" } })];
  assertEquals(jobZumOeffnen(jobs, 8, HEUTE)?.id, 8);
});

Deno.test("hatOffenenJob: laufend sichtbar oder besetzt hält offen, Historie nie", () => {
  assertEquals(hatOffenenJob([job({ id: 1 })], HEUTE), false);
  assertEquals(hatOffenenJob([job({ id: 1, visibility: "public" })], HEUTE), true);
  assertEquals(hatOffenenJob([job({ id: 1, visibility: "public_limited" })], HEUTE), true);
  assertEquals(hatOffenenJob([job({ id: 1, final_confirmation: { id: 2, rejected_at: null } })], HEUTE), true);
  assertEquals(hatOffenenJob([job({ id: 1, final_confirmation: { id: 2, rejected_at: null }, departure_at: null })], HEUTE), true);
  // Historie: beendet, abgebrochen, abgereist (Abreisetag zählt schon) — auch gebucht oder sichtbar
  assertEquals(hatOffenenJob([job({ id: 1, visibility: "public", status: "done" })], HEUTE), false);
  assertEquals(hatOffenenJob([job({ id: 1, status: "done", final_confirmation: { id: 2, rejected_at: null } })], HEUTE), false);
  assertEquals(hatOffenenJob([job({ id: 1, final_confirmation: { id: 2, rejected_at: null }, departure_at: "2026-11-15 00:00:00" })], HEUTE), false);
  assertEquals(hatOffenenJob([job({ id: 1, visibility: "public", departure_at: "2026-11-23 00:00:00" })], HEUTE), false);
});

Deno.test("anreiseZumOeffnen: Startdatum aus dem Bogen, sonst alte Anreise ab heute, sonst keine", () => {
  const alt = job({ id: 1, arrival_at: "2026-11-01 00:00:00" });
  assertEquals(anreiseZumOeffnen(alt, "2026-12-05", HEUTE), "2026-12-05");
  assertEquals(anreiseZumOeffnen(alt, "2026-11-23", HEUTE), "2026-11-23");
  assertEquals(anreiseZumOeffnen(alt, undefined, HEUTE), null);       // Anreise vorbei, kein Startdatum
  assertEquals(anreiseZumOeffnen(alt, "2026-11-20", HEUTE), null);    // Startdatum vorbei
  assertEquals(anreiseZumOeffnen(alt, "5.12.2026", HEUTE), null);     // kein ISO-Tag
  const kommt = job({ id: 2, arrival_at: "2026-12-10 00:00:00" });
  assertEquals(anreiseZumOeffnen(kommt, "", HEUTE), "2026-12-10");
  // Abreise vor (oder am) Anreisetag ⇒ nicht veröffentlichen
  assertEquals(anreiseZumOeffnen(job({ id: 3, departure_at: "2026-12-04 00:00:00" }), "2026-12-05", HEUTE), null);
});

Deno.test("heuteBerlin: Berliner Kalendertag, nicht UTC", () => {
  assertEquals(heuteBerlin(new Date("2026-11-23T23:30:00Z")), "2026-11-24");
  assertEquals(heuteBerlin(new Date("2026-07-01T21:59:00Z")), "2026-07-01");
});

Deno.test("jobOeffnenVariablen: Fetch-Merge, Datum ohne Uhrzeit, CGA-Liste ⇒ public_limited", () => {
  assertEquals(jobOeffnenVariablen(job({ id: 5, departure_at: "2099-02-28 00:00:00" }), 7570, "2098-12-24"), {
    id: 5,
    customer_id: 7570,
    title: "Primundus Kunde",
    salary_offered: 2800,
    salary_commission: 250,
    arrival_at: "2098-12-24",
    visibility: "public",
    departure_at: "2099-02-28",
  });
  const begrenzt = jobOeffnenVariablen(job({ id: 5, visible_caregiver_agencies: [{ id: 42 }] }), 7570, "2098-12-24");
  assertEquals(begrenzt.visibility, "public_limited");
  assertEquals(begrenzt.visible_caregiver_agency_ids, [42]);
  assertEquals("departure_at" in begrenzt, false);
});

// ─── updateCustomer (Ablauf gegen eine Mamamia-Attrappe) ───────────────────

type Antwort = { data?: unknown; errors?: unknown[] };
function mamamia(antworten: Record<string, Antwort | (() => Antwort | Promise<Antwort>)>) {
  const aufrufe: Array<{ op: string; variables: Record<string, unknown> }> = [];
  const fetchFn: typeof fetch = async (_input, init) => {
    const body = JSON.parse((init as RequestInit).body as string);
    const op = /(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? "?";
    aufrufe.push({ op, variables: body.variables });
    const a = antworten[op];
    if (!a) throw new Error(`unerwarteter Aufruf ${op}`);
    return new Response(JSON.stringify(typeof a === "function" ? await a() : a), { status: 200 });
  };
  return { aufrufe, fetchFn, ops: () => aufrufe.map((a) => a.op) };
}

function deps(fetchFn: typeof fetch): ActionDeps {
  return { endpoint: "https://beta.example/graphql", getAgencyToken: async () => "t", fetchFn };
}

// Wie der Patientenbogen speichert: Ausstattung und Tools stehen im Patch, also
// läuft kein PRESERVE_QUERY. startDate = Pflichtfeld des Bogens.
const BOGEN = {
  phone: "+49 170 1234567",
  equipment_ids: [1, 2],
  patients: [{ id: 13076, care_level: 3, tool_ids: [] }],
  portal_form_snapshot: { anzahl: "1", startDate: "2099-03-01" },
};

const GESPEICHERT = { data: { UpdateCustomer: { id: 7570, customer_id: "pr-7570" } } };
const FRISCH = {
  data: { Customer: { equipments: [{ id: 1 }, { id: 2 }], patients: [{ id: 13076, tools: [] }, { id: 13077, tools: [{ id: 2 }] }] } },
};
const GEOEFFNET = { data: { UpdateCustomer: { id: 7570, is_disabled: false } } };
const VEROEFFENTLICHT = { data: { UpdateJobOffer: { id: 16226, visibility: "public" } } };
const stand = (is_disabled: boolean, job_offers: StandJob[], status = "active") =>
  ({ data: { Customer: { is_disabled, status, job_offers } } });

Deno.test("offener Kunde: Speichern wie bisher, kein weiterer Schreibzugriff", async () => {
  const m = mamamia({ KundeOffenStand: stand(false, [job({ id: 16226, visibility: "public" })]), UpdateCustomer: GESPEICHERT });
  const r = await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(r, GESPEICHERT.data);
  assertEquals(m.ops().sort(), ["KundeOffenStand", "UpdateCustomer"]);
});

Deno.test("geschlossen + aktiv + Job verborgen: ERST Job mit dem Startdatum veröffentlichen, DANN Kunde öffnen", async () => {
  const m = mamamia({
    KundeOffenStand: stand(true, [job({ id: 16226, arrival_at: "2026-11-01 00:00:00" })]),
    UpdateCustomer: GESPEICHERT,
    JobOeffnen: VEROEFFENTLICHT,
    KundeOeffnenLesen: FRISCH,
    KundeOeffnen: GEOEFFNET,
  });
  const r = await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(r, GESPEICHERT.data);

  const ops = m.ops();
  assertEquals(ops.slice(-3), ["JobOeffnen", "KundeOeffnenLesen", "KundeOeffnen"]);
  assertEquals(ops.indexOf("UpdateCustomer") < ops.indexOf("JobOeffnen"), true);

  const jobVars = m.aufrufe.find((a) => a.op === "JobOeffnen")!.variables;
  assertEquals(jobVars.id, 16226);
  assertEquals(jobVars.customer_id, 7570);
  assertEquals(jobVars.visibility, "public");
  // die alte Anreise (01.11.) ist vorbei — es gilt das Startdatum aus dem Bogen
  assertEquals(jobVars.arrival_at, "2099-03-01");

  assertEquals(m.aufrufe.find((a) => a.op === "KundeOeffnen")!.variables, {
    id: 7570,
    is_disabled: false,
    equipment_ids: [1, 2],
    // frisch gelesen: auch die gerade angelegte zweite Person bleibt (REPLACE-Semantik)
    patients: [{ id: 13076, tool_ids: [] }, { id: 13077, tool_ids: [2] }],
  });
});

Deno.test("geschlossener Entwurf (Hauptfall): nur den Kunden öffnen, den Job macht Mamamia beim Aktivieren sichtbar", async () => {
  const m = mamamia({
    KundeOffenStand: stand(true, [job({ id: 16226 })], "draft"),
    UpdateCustomer: GESPEICHERT,
    KundeOeffnenLesen: FRISCH,
    KundeOeffnen: GEOEFFNET,
  });
  await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(m.ops().includes("JobOeffnen"), false);
  assertEquals(m.ops().includes("KundeOeffnen"), true);
});

Deno.test("beendeter Einsatz + verborgener Folgejob: der Folgejob wird veröffentlicht", async () => {
  const m = mamamia({
    KundeOffenStand: stand(true, [
      job({ id: 100, status: "done", final_confirmation: { id: 5, rejected_at: null }, departure_at: "2026-11-15 00:00:00" }),
      job({ id: 200 }),
    ]),
    UpdateCustomer: GESPEICHERT,
    JobOeffnen: VEROEFFENTLICHT,
    KundeOeffnenLesen: FRISCH,
    KundeOeffnen: GEOEFFNET,
  });
  await ACTIONS.updateCustomer({ ...SESSION, job_offer_id: 100 }, BOGEN, deps(m.fetchFn));
  assertEquals(m.aufrufe.find((a) => a.op === "JobOeffnen")?.variables.id, 200);
});

Deno.test("Job hält ihn schon sichtbar: nur den Kunden öffnen", async () => {
  const m = mamamia({
    KundeOffenStand: stand(true, [job({ id: 16226, visibility: "public" }), job({ id: 200 })]),
    UpdateCustomer: GESPEICHERT,
    KundeOeffnenLesen: FRISCH,
    KundeOeffnen: GEOEFFNET,
  });
  await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(m.ops().includes("JobOeffnen"), false);
  assertEquals(m.ops().includes("KundeOeffnen"), true);
});

const ABLEHNUNGEN: Array<[string, Antwort]> = [
  ["Mamamia lehnt das Veröffentlichen ab", { errors: [{ message: "validation", extensions: { category: "validation" } }] }],
  ["Mamamia lässt den Job verborgen", { data: { UpdateJobOffer: { id: 16226, visibility: "hide" } } }],
];
for (const [name, antwort] of ABLEHNUNGEN) {
  Deno.test(`${name}: Speichern gilt, Kunde bleibt zu — das nächste Speichern versucht es wieder`, async () => {
    const m = mamamia({ KundeOffenStand: stand(true, [job({ id: 16226 })]), UpdateCustomer: GESPEICHERT, JobOeffnen: antwort });
    const r = await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
    assertEquals(r, GESPEICHERT.data);
    assertEquals(m.ops().includes("KundeOeffnen"), false);

    // zweites Speichern: der Kunde ist noch zu, derselbe Weg greift wieder
    const m2 = mamamia({
      KundeOffenStand: stand(true, [job({ id: 16226 })]),
      UpdateCustomer: GESPEICHERT,
      JobOeffnen: VEROEFFENTLICHT,
      KundeOeffnenLesen: FRISCH,
      KundeOeffnen: GEOEFFNET,
    });
    await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m2.fetchFn));
    assertEquals(m2.ops().slice(-3), ["JobOeffnen", "KundeOeffnenLesen", "KundeOeffnen"]);
  });
}

Deno.test("kein Anreisedatum ab heute: nichts veröffentlichen, Kunde bleibt zu", async () => {
  const m = mamamia({
    KundeOffenStand: stand(true, [job({ id: 16226, arrival_at: "2026-11-01 00:00:00" })]),
    UpdateCustomer: GESPEICHERT,
  });
  await ACTIONS.updateCustomer(SESSION, { ...BOGEN, portal_form_snapshot: { anzahl: "1" } }, deps(m.fetchFn));
  assertEquals(m.ops().sort(), ["KundeOffenStand", "UpdateCustomer"]);
});

Deno.test("Kunde öffnen scheitert: das Speichern gilt trotzdem", async () => {
  const m = mamamia({
    KundeOffenStand: stand(true, [job({ id: 16226, visibility: "public" })]),
    UpdateCustomer: GESPEICHERT,
    KundeOeffnenLesen: FRISCH,
    KundeOeffnen: { errors: [{ message: "Unauthorized", extensions: { category: "authorization" } }] },
  });
  const r = await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(r, GESPEICHERT.data);
});

Deno.test("Stand nicht lesbar: speichern, nichts öffnen", async () => {
  const m = mamamia({
    KundeOffenStand: { errors: [{ message: "boom", extensions: { category: "internal" } }] },
    UpdateCustomer: GESPEICHERT,
  });
  const r = await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(r, GESPEICHERT.data);
  assertEquals(m.ops().filter((o) => o !== "KundeOffenStand"), ["UpdateCustomer"]);
});

Deno.test("Stand hängt: die Antwort wartet höchstens 3 s, dann ohne Öffnen", async () => {
  let freigeben = () => {};
  const m = mamamia({
    KundeOffenStand: () => new Promise<Antwort>((r) => { freigeben = () => r(stand(true, [job({ id: 16226 })])); }),
    UpdateCustomer: GESPEICHERT,
  });
  const t0 = Date.now();
  const r = await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  const dauer = Date.now() - t0;
  assertEquals(r, GESPEICHERT.data);
  assertEquals(dauer >= 2900 && dauer < 4500, true);
  assertEquals(m.ops().includes("KundeOeffnen") || m.ops().includes("JobOeffnen"), false);
  freigeben();
});

Deno.test("Speichern scheitert: kein Öffnen", async () => {
  const m = mamamia({
    KundeOffenStand: stand(true, [job({ id: 16226 })]),
    UpdateCustomer: { errors: [{ message: "validation", extensions: { category: "validation" } }] },
  });
  let fehler = "";
  try {
    await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  } catch (e) {
    fehler = (e as Error).message;
  }
  assertEquals(fehler.length > 0, true);
  assertEquals(m.ops().some((o) => o === "KundeOeffnen" || o === "JobOeffnen"), false);
});

Deno.test("andere updateCustomer-Aufrufe ohne Patientenbogen: kein Stand, kein Öffnen", async () => {
  const m = mamamia({ UpdateCustomer: GESPEICHERT });
  const { portal_form_snapshot: _weg, ...ohneBogen } = BOGEN;
  await ACTIONS.updateCustomer(SESSION, ohneBogen, deps(m.fetchFn));
  assertEquals(m.ops(), ["UpdateCustomer"]);
});
