// Registry #170 — geschlossener Kunde speichert seinen Patientenbogen selbst.
//
// Martin 23.11.2026: „Wenn ich einen Lead im Kostenrechner oder SA-Portal
// schließe, weil er sich zum Beispiel nicht meldet, er dann aber das
// Patientenprofil selbst ausfüllt, ist er nicht mehr unter den offenen Kunden …
// und wir finden den nicht." Das SA-Portal schließt einen Kunden mit
// UpdateCustomer(is_disabled: true) und verbirgt dabei seine offenen Jobs
// (mamamia-sadash CustomerController::hideOpenJobs). Das Speichern im Portal
// fasste beides nie an: der Kunde blieb geschlossen, sein Job verborgen, das
// SA-Portal sortiert ihn nach „Historie" (Customers.vue: custClosed ⇒ historie,
// jobStatus.js isJobClosed: hide ohne Besetzung) — keine Agentur sieht ihn.
//
// Hier liegt nur die Auswahl (pure, getestet). Die Aufrufe macht
// actions.ts:kundeWiederOeffnen nach dem erfolgreichen Speichern.

export interface StandJob {
  id: number;
  status?: string | null;
  visibility?: string | null;
  arrival_at?: string | null;
  departure_at?: string | null;
  title?: string | null;
  salary_offered?: number | null;
  salary_commission?: number | null;
  visible_caregiver_agencies?: Array<{ id: number }> | null;
  final_confirmation?: { id: number; rejected_at?: string | null } | null;
}

const nurDatum = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);
const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Kalendertag in Berlin — dieselbe Uhr wie das SA-Portal (Carbon
 *  'Europe/Berlin' in hideOpenJobs). */
export function heuteBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(jetzt);
}

/** Beendet, abgebrochen oder abgereist (Abreisetag zählt schon) — SA-Portal
 *  tabOf/hideOpenJobs: solche Jobs sind Historie und halten niemanden offen. */
function historie(j: StandJob, heute: string): boolean {
  if (["done", "aborted"].includes(j.status ?? "")) return true;
  const abreise = nurDatum(j.departure_at);
  return !!abreise && abreise <= heute;
}

/** Gebucht = Confirmation ohne Absage oder Mamamia-Status „besetzt". Ein
 *  besetzter Job hält den Kunden aktiv, auch wenn er verborgen ist (SA-Portal
 *  isJobClosed, Sabina-Fall 07.08.). */
function besetzt(j: StandJob): boolean {
  return (!!j.final_confirmation && !j.final_confirmation.rejected_at) ||
    ["accepted", "on_job"].includes(j.status ?? "");
}

/** Hat der Kunde einen laufenden Job, der ihn für Agenturen sichtbar hält? */
export function hatOffenenJob(jobs: StandJob[], heute: string): boolean {
  return jobs.some((j) =>
    !historie(j, heute) && (besetzt(j) || ["public", "public_limited"].includes(j.visibility ?? ""))
  );
}

/** Der Job, den das Schließen verborgen hat und der wieder sichtbar werden
 *  soll — genau EINER: der Job der Portal-Sitzung, sonst der neueste passende.
 *  Spiegel der SA-Regel hideOpenJobs (verborgen wird nur, was nicht beendet,
 *  abgebrochen oder abgereist ist), dazu: nicht besetzt. */
export function jobZumOeffnen(
  jobs: StandJob[],
  sitzungsJobId: number | null | undefined,
  heute: string,
): StandJob | null {
  const kandidaten = jobs.filter((j) => j.visibility === "hide" && !besetzt(j) && !historie(j, heute));
  return kandidaten.find((j) => j.id === sitzungsJobId) ??
    kandidaten.sort((a, b) => b.id - a.id)[0] ??
    null;
}

/** Anreise für die Veröffentlichung. Mamamia lehnt einen öffentlichen Job mit
 *  Anreise in der Vergangenheit ab (SA-Portal NewJobWizard), und die Anreise aus
 *  dem Onboarding ist bei einem lange geschlossenen Kunden meist vorbei. Darum
 *  zuerst das Startdatum, das der Kunde gerade im Bogen gewählt hat (Pflichtfeld,
 *  das Portal schreibt es danach ohnehin per UpdateJobOfferDates), sonst die
 *  alte Anreise, wenn sie noch kommt. Kein Datum raten: sonst null. Liegt die
 *  Abreise vor der Anreise, auch null. */
export function anreiseZumOeffnen(job: StandJob, startDate: unknown, heute: string): string | null {
  const start = typeof startDate === "string" && ISO_TAG.test(startDate.trim()) ? startDate.trim() : null;
  const alt = nurDatum(job.arrival_at);
  const anreise = start && start >= heute ? start : alt && alt >= heute ? alt : null;
  const abreise = nurDatum(job.departure_at);
  return anreise && (!abreise || abreise > anreise) ? anreise : null;
}

/** Variablen für UpdateJobOffer — Fetch-Merge wie SA-Portal
 *  JobOfferController::update und onboard.ts:jobPreisNachziehen: customer_id,
 *  title, salary_offered und arrival_at bei JEDEM Update; die CGA-Liste muss
 *  mit, sonst leert Mamamia sie (QA 02.09., Job 35894). Ist eine Liste da, war
 *  der Job „nur für diese Agenturen" — dann wieder public_limited, nie public. */
export function jobOeffnenVariablen(job: StandJob, customerId: number, anreise: string): Record<string, unknown> {
  const cga = (job.visible_caregiver_agencies ?? [])
    .map((a) => a.id)
    .filter((id) => Number.isInteger(id) && id > 0);
  const vars: Record<string, unknown> = {
    id: job.id,
    customer_id: customerId,
    title: job.title ?? null,
    salary_offered: job.salary_offered ?? null,
    salary_commission: job.salary_commission ?? null,
    arrival_at: anreise,
    visibility: cga.length ? "public_limited" : "public",
  };
  if (cga.length) vars.visible_caregiver_agency_ids = cga;
  const abreise = nurDatum(job.departure_at);
  if (abreise) vars.departure_at = abreise;
  return vars;
}
