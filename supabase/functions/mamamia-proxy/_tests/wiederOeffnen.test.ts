// Registry #170 — geschlossener Kunde speichert den Patientenbogen ⇒ wieder offen.
import { assertEquals } from "@std/assert";
import { ACTIONS } from "../actions.ts";
import { hatOffenenJob, jobOeffnenVariablen, jobZumOeffnen, type StandJob } from "../wiederOeffnen.ts";
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
  arrival_at: "2026-12-01 00:00:00",
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

Deno.test("jobZumOeffnen: beendet, abgebrochen, abgereist, gebucht, ohne Anreise, schon sichtbar ⇒ nie", () => {
  const jobs = [
    job({ id: 1, status: "done" }),
    job({ id: 2, status: "aborted" }),
    job({ id: 3, departure_at: "2026-11-23 00:00:00" }),
    job({ id: 4, final_confirmation: { id: 9, rejected_at: null } }),
    job({ id: 5, arrival_at: null }),
    job({ id: 6, visibility: "public" }),
    job({ id: 7, status: "on_job" }),
  ];
  assertEquals(jobZumOeffnen(jobs, 1, HEUTE), null);
});

Deno.test("jobZumOeffnen: abgesagte Buchung hält den Job nicht fest", () => {
  const jobs = [job({ id: 8, final_confirmation: { id: 9, rejected_at: "2026-11-01" } })];
  assertEquals(jobZumOeffnen(jobs, 8, HEUTE)?.id, 8);
});

Deno.test("hatOffenenJob: sichtbar oder besetzt hält den Kunden offen", () => {
  assertEquals(hatOffenenJob([job({ id: 1 })]), false);
  assertEquals(hatOffenenJob([job({ id: 1, visibility: "public" })]), true);
  assertEquals(hatOffenenJob([job({ id: 1, visibility: "public_limited" })]), true);
  assertEquals(hatOffenenJob([job({ id: 1, visibility: "public", status: "done" })]), false);
  assertEquals(hatOffenenJob([job({ id: 1, final_confirmation: { id: 2, rejected_at: null } })]), true);
});

Deno.test("jobOeffnenVariablen: Fetch-Merge, Datum ohne Uhrzeit, CGA-Liste ⇒ public_limited", () => {
  assertEquals(jobOeffnenVariablen(job({ id: 5, departure_at: "2027-01-31 00:00:00" }), 7570), {
    id: 5,
    customer_id: 7570,
    title: "Primundus Kunde",
    salary_offered: 2800,
    salary_commission: 250,
    arrival_at: "2026-12-01",
    visibility: "public",
    departure_at: "2027-01-31",
  });
  const begrenzt = jobOeffnenVariablen(job({ id: 5, visible_caregiver_agencies: [{ id: 42 }] }), 7570);
  assertEquals(begrenzt.visibility, "public_limited");
  assertEquals(begrenzt.visible_caregiver_agency_ids, [42]);
  assertEquals("departure_at" in begrenzt, false);
});

// ─── updateCustomer (Ablauf gegen eine Mamamia-Attrappe) ───────────────────

type Antwort = { data?: unknown; errors?: unknown[] };
function mamamia(antworten: Record<string, Antwort | (() => Antwort)>) {
  const aufrufe: Array<{ op: string; variables: Record<string, unknown> }> = [];
  const fetchFn: typeof fetch = async (_input, init) => {
    const body = JSON.parse((init as RequestInit).body as string);
    const op = /(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? "?";
    aufrufe.push({ op, variables: body.variables });
    const a = antworten[op];
    if (!a) throw new Error(`unerwarteter Aufruf ${op}`);
    return new Response(JSON.stringify(typeof a === "function" ? a() : a), { status: 200 });
  };
  return { aufrufe, fetchFn };
}

function deps(fetchFn: typeof fetch): ActionDeps {
  return { endpoint: "https://beta.example/graphql", getAgencyToken: async () => "t", fetchFn };
}

// Wie der Patientenbogen speichert: Ausstattung und Tools stehen im Patch, also
// läuft kein PRESERVE_QUERY.
const BOGEN = {
  phone: "+49 170 1234567",
  equipment_ids: [1, 2],
  patients: [{ id: 13076, care_level: 3, tool_ids: [] }],
  portal_form_snapshot: { anzahl: "1" },
};

const GESPEICHERT = { data: { UpdateCustomer: { id: 7570, customer_id: "pr-7570" } } };
const FRISCH = {
  data: { Customer: { equipments: [{ id: 1 }, { id: 2 }], patients: [{ id: 13076, tools: [] }, { id: 13077, tools: [{ id: 2 }] }] } },
};
const stand = (is_disabled: boolean, job_offers: StandJob[]) => ({ data: { Customer: { is_disabled, job_offers } } });

Deno.test("offener Kunde: Speichern wie bisher, kein weiterer Schreibzugriff", async () => {
  const m = mamamia({ KundeOffenStand: stand(false, [job({ id: 16226, visibility: "public" })]), UpdateCustomer: GESPEICHERT });
  const r = await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(r, GESPEICHERT.data);
  assertEquals(m.aufrufe.map((a) => a.op).sort(), ["KundeOffenStand", "UpdateCustomer"]);
});

Deno.test("geschlossener Kunde mit verborgenem Job: Kunde öffnen, dann Job veröffentlichen", async () => {
  const m = mamamia({
    KundeOffenStand: stand(true, [job({ id: 16226 })]),
    UpdateCustomer: GESPEICHERT,
    KundeOeffnenLesen: FRISCH,
    KundeOeffnen: { data: { UpdateCustomer: { id: 7570, is_disabled: false } } },
    JobOeffnen: { data: { UpdateJobOffer: { id: 16226, visibility: "public" } } },
  });
  const r = await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(r, GESPEICHERT.data);

  const ops = m.aufrufe.map((a) => a.op);
  // Öffnen erst NACH dem Speichern, Job erst nach dem Kunden.
  assertEquals(ops.slice(-3), ["KundeOeffnenLesen", "KundeOeffnen", "JobOeffnen"]);
  assertEquals(ops.indexOf("UpdateCustomer") < ops.indexOf("KundeOeffnenLesen"), true);

  const oeffnen = m.aufrufe.find((a) => a.op === "KundeOeffnen")!.variables;
  assertEquals(oeffnen, {
    id: 7570,
    is_disabled: false,
    equipment_ids: [1, 2],
    // frisch gelesen: auch die gerade angelegte zweite Person bleibt (REPLACE-Semantik)
    patients: [{ id: 13076, tool_ids: [] }, { id: 13077, tool_ids: [2] }],
  });
  const jobVars = m.aufrufe.find((a) => a.op === "JobOeffnen")!.variables;
  assertEquals(jobVars.id, 16226);
  assertEquals(jobVars.customer_id, 7570);
  assertEquals(jobVars.visibility, "public");
  assertEquals(jobVars.arrival_at, "2026-12-01");
});

Deno.test("geschlossener Kunde, Job hält ihn schon sichtbar: nur den Kunden öffnen", async () => {
  const m = mamamia({
    KundeOffenStand: stand(true, [job({ id: 16226, visibility: "public" }), job({ id: 200 })]),
    UpdateCustomer: GESPEICHERT,
    KundeOeffnenLesen: FRISCH,
    KundeOeffnen: { data: { UpdateCustomer: { id: 7570, is_disabled: false } } },
  });
  await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(m.aufrufe.some((a) => a.op === "JobOeffnen"), false);
  assertEquals(m.aufrufe.some((a) => a.op === "KundeOeffnen"), true);
});

Deno.test("Mamamia lehnt das Öffnen ab: das Speichern gilt trotzdem, kein Job wird angefasst", async () => {
  const m = mamamia({
    KundeOffenStand: stand(true, [job({ id: 16226 })]),
    UpdateCustomer: GESPEICHERT,
    KundeOeffnenLesen: FRISCH,
    KundeOeffnen: { errors: [{ message: "Unauthorized", extensions: { category: "authorization" } }] },
  });
  const r = await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(r, GESPEICHERT.data);
  assertEquals(m.aufrufe.some((a) => a.op === "JobOeffnen"), false);
});

Deno.test("Stand nicht lesbar: speichern, nichts öffnen", async () => {
  const m = mamamia({
    KundeOffenStand: { errors: [{ message: "boom", extensions: { category: "internal" } }] },
    UpdateCustomer: GESPEICHERT,
  });
  const r = await ACTIONS.updateCustomer(SESSION, BOGEN, deps(m.fetchFn));
  assertEquals(r, GESPEICHERT.data);
  assertEquals(m.aufrufe.filter((a) => a.op !== "KundeOffenStand").map((a) => a.op), ["UpdateCustomer"]);
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
  assertEquals(m.aufrufe.some((a) => a.op === "KundeOeffnen" || a.op === "JobOeffnen"), false);
});

Deno.test("andere updateCustomer-Aufrufe ohne Patientenbogen: kein Stand, kein Öffnen", async () => {
  const m = mamamia({ UpdateCustomer: GESPEICHERT });
  const { portal_form_snapshot: _weg, ...ohneBogen } = BOGEN;
  await ACTIONS.updateCustomer(SESSION, ohneBogen, deps(m.fetchFn));
  assertEquals(m.aufrufe.map((a) => a.op), ["UpdateCustomer"]);
});
