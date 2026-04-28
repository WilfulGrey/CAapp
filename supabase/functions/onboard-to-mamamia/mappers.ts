import type {
  CaregiverWishInput,
  CustomerContactInput,
  CustomerContractInput,
  CustomerInput,
  FormularDaten,
  Lead,
  PatientInput,
} from "./types.ts";

// ─── Mobility ────────────────────────────────────────────────────────────────
// Mamamia mobility_id values (from SADASH docs + live beta):
// 1 = Mobile, 2 = Walking stick, 3 = Walker/Rollator, 4 = Wheelchair, 5 = Bedridden
// `mobility_id` MUST be set, or StoreJobOffer crashes in checkSuperJob3.
//
// formularDaten uses several variants for the "needs walking aid" tier —
// keep the dictionary inclusive so we don't silently default to 1 (Mobile)
// when the user actually selected a Rollator (CLAUDE.md §1).
const MOBILITY_MAP: Record<string, number> = {
  mobil: 1,
  gehstock: 2,
  gehfaehig: 3,
  gehhilfe: 3,
  rollator: 3,
  rollstuhl: 4,
  bettlaegerig: 5,
};

export function mapMobilityToId(fd: FormularDaten): number {
  const key = (fd?.mobilitaet ?? "").toString().toLowerCase();
  return MOBILITY_MAP[key] ?? 1; // default 1 = Mobile (safest — no crash)
}

// ─── Care level (Pflegegrad) ────────────────────────────────────────────────
// Valid 1-5. Mamamia required. Default 2 if missing/invalid.
export function mapCareLevel(fd: FormularDaten): number {
  const v = fd?.pflegegrad;
  if (typeof v === "number" && v >= 1 && v <= 5) return v;
  return 2;
}

// ─── Dementia ───────────────────────────────────────────────────────────────
export function mapDementia(fd: FormularDaten): "yes" | "no" {
  const v = (fd?.demenz ?? "").toString().toLowerCase();
  if (v === "ja" || v === "yes") return "yes";
  return "no";
}

// ─── Night operations ───────────────────────────────────────────────────────
// Mamamia enum (verified via prod DB read-only on 2026-04-27):
//   "no"           — 65%
//   "up_to_1_time" — 22% (≤1×)
//   "1_2_times"    —  5%
//   "more_than_2"  —  1% (>2×)
//   "occasionally" —  0.2%
//
// Primundus calculator (project 3 MultiStepForm) emits 4 distinct values:
//   "nein", "gelegentlich", "taeglich" (=1×), "mehrmals" (multiple times).
// Map them onto Mamamia's 4-bucket scale by frequency.
//
// Note: legacy "regelmaessig" kept for back-compat with leads created
// before the calculator UX update.
export type NightOperations =
  | "no"
  | "up_to_1_time"
  | "1_2_times"
  | "more_than_2"
  | "occasionally";

export function mapNightOperations(fd: FormularDaten): NightOperations {
  const v = (fd?.nachteinsaetze ?? "").toString().toLowerCase();
  if (v === "gelegentlich") return "occasionally";
  if (v === "taeglich") return "up_to_1_time";   // Primundus "1×" → Mamamia "≤1×"
  if (v === "mehrmals") return "1_2_times";       // Primundus "multiple" → Mamamia 1-2×
  if (v === "regelmaessig") return "up_to_1_time"; // legacy alias
  return "no";
}

// ─── Gender — TWO distinct dimensions in Mamamia ────────────────────────────
//
//   1. customer_caregiver_wish.gender  → preferred CAREGIVER gender
//      Accepts "female" / "male" / "not_important". Source: Primundus
//      formularDaten.geschlecht ("weiblich" / "maennlich" / "egal").
//
//   2. patient.gender → PATIENT's actual gender
//      Validator rejects "not_important" (verified beta 2026-04-28).
//      Source: lead salutation (anrede) — Frau→female, Herr→male.
//      Primundus does NOT capture patient gender separately.
//
// Pre-2026-04-28 we used mapGender for both, which broke when the
// customer answered "egal" on the caregiver-preference question.

// Caregiver-preference gender (used in customer_caregiver_wish.gender).
export function mapGender(
  fd: FormularDaten,
): "male" | "female" | "not_important" | null {
  const v = (fd?.geschlecht ?? "").toString().toLowerCase();
  if (v === "weiblich") return "female";
  if (v === "maennlich") return "male";
  if (v === "egal") return "not_important";
  return null;
}

// Patient's actual gender (used in patients[].gender). Reads anrede
// fields with stage-B priority. Defaults to "female" — the prod-most-
// common patient gender (61%), and a safe assumption that lets the
// matcher run; the customer can update later via UpdateCustomer/patient
// form once they know the real recipient.
export function resolvePatientGender(lead: Lead): "male" | "female" {
  const candidates = [
    lead.patient_anrede,
    lead.anrede,
    lead.anrede_text,
  ];
  for (const c of candidates) {
    const v = (c ?? "").toString().trim().toLowerCase();
    if (v === "frau" || v === "mrs." || v === "mrs") return "female";
    if (v === "herr" || v === "mr." || v === "mr") return "male";
  }
  return "female";
}

// ─── Arrival date from care_start_timing ────────────────────────────────────
// Returns YYYY-MM-DD format expected by Mamamia StoreJobOffer.arrival_at.
// Values are taken from the live `leads` table — counted on 2026-04-27:
//   sofort       (34) → ~7 days  (ASAP)
//   unklar       (32) → ~30 days (uncertain → middle ground, customer adjusts)
//   2-4-wochen   (27) → ~21 days (≈3 weeks)
//   1-2-monate   (14) → ~45 days
// Anything unknown defaults to "sofort" (7 days). The customer always
// adjusts later via the patient form / UpdateJobOffer.
const OFFSET_DAYS: Record<string, number> = {
  sofort: 7,
  "1-2-wochen": 10,
  "2-4-wochen": 21,
  "1-monat": 30,
  unklar: 30,
  "1-2-monate": 45,
  spaeter: 60,
};

export function computeArrivalDate(
  timing: string | null | undefined,
  nowISO: string,
): string {
  const days = OFFSET_DAYS[timing ?? "sofort"] ?? OFFSET_DAYS.sofort;
  const d = new Date(nowISO);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── JobOffer title generator ───────────────────────────────────────────────
// Mamamia requires non-empty title. Use "Primundus — {nachname}" when available,
// fall back to "Primundus — {first-8-chars-of-lead-id}" if nachname is null.
export function buildJobOfferTitle(lead: Lead): string {
  if (lead.nachname && lead.nachname.trim().length > 0) {
    return `Primundus — ${lead.nachname}`;
  }
  return `Primundus — ${lead.id.slice(0, 8)}`;
}

// ─── Build patients[] from formularDaten ────────────────────────────────────
// We map every formularDaten field for which Mamamia exposes a known-valid
// patient enum (verified vs prod DB read-only).
//
// dementia: prod uses "yes"/"no" cleanly (51%/48%) — re-included after
// the discovery sweep on 2026-04-27. Earlier suspicion that Laravel rejected
// "yes"/"no" turned out to come from another field's validator, not dementia.
//
// weitere_personen=ja → 2 patients; second carries minimum required fields
// (mobility_id + care_level) to prevent StoreJobOffer checkSuperJob3 crash;
// patient form fills the second's details later via UpdateCustomer.
// Default weight/height buckets — prod-most-common values from the
// patients table sweep on 2026-04-28:
//   weight: "61-70" (29%), "71-80" (27%), "51-60" (23%) ...
//   height: "161-170" (44%), "171-180" (26%) ...
// "Default" here means "we don't know, fill with statistically-likely
// value so checkSuperJob3 / matching can run". Patient form will
// override via UpdateCustomer once the user actually fills it in.
const DEFAULT_WEIGHT = "61-70";
const DEFAULT_HEIGHT = "161-170";

// lift_id: pick based on mobility — 4 ("not_important") is allowed by
// the schema but doesn't appear in any active customer's patient row,
// because the customer-facing panel renders only Yes/No/(optional 3).
// Mapping (verified prod 2026-04-28):
//   wheelchair (4) / bedridden (5) → lift_id=1 (Yes — lift required)
//   walker / walking-stick / mobile → lift_id=2 (No — no lift needed)
export function mapLiftId(mobilityId: number): number {
  return mobilityId >= 4 ? 1 : 2;
}

// tool_ids: panel form "Jakie pomoce są dostępne?" is required, ship at
// least one. NEVER include id 7 (Others) — selecting "Inne" triggers a
// required free-text field "Jakie inne narzędzia są używane?" which we
// have no answer for. Use mobility-specific concrete tools only.
//   bedridden (5)  → [4 Patient hoist, 6 Care bed]
//   wheelchair (4) → [3 Wheelchair]
//   walker (3)     → [2 Rollator]
//   walking-stick (2) / mobile (1) → [1 Walking stick]
export function mapToolIds(mobilityId: number): number[] {
  switch (mobilityId) {
    case 5:
      return [4, 6];
    case 4:
      return [3];
    case 3:
      return [2];
    default:
      return [1];
  }
}

// Auto-text generators for the 3 description fields the panel form
// requires (lift_description, night_operations_description,
// dementia_description). The lead's calculator never collects these —
// we fill with "to be specified" placeholders that match the live-data
// patterns and that the customer can refine later via UpdateCustomer.
function liftDescriptionFor(mobilityId: number): {
  de: string;
  en: string;
  pl: string;
} {
  if (mobilityId >= 4) {
    return {
      de: "Transfer mit Unterstützung — Details werden in der Patientenform ergänzt.",
      en: "Transfer with assistance — details to be added via the patient form.",
      pl: "Transfer z pomocą — szczegóły zostaną podane w formularzu pacjenta.",
    };
  }
  return {
    de: "Patient transferiert sich selbstständig.",
    en: "Patient transfers independently.",
    pl: "Pacjent przemieszcza się samodzielnie.",
  };
}

function nightOperationsDescriptionFor(no: string): { de: string; en: string; pl: string } {
  if (no === "no") {
    return {
      de: "Keine nächtlichen Einsätze erforderlich.",
      en: "No night-time operations required.",
      pl: "Brak konieczności nocnych operacji.",
    };
  }
  return {
    de: "Gelegentliche nächtliche Unterstützung — Details folgen.",
    en: "Occasional night-time assistance — details to follow.",
    pl: "Sporadyczna pomoc nocna — szczegóły zostaną podane.",
  };
}

function dementiaDescriptionFor(d: string): { de: string; en: string; pl: string } {
  if (d === "yes") {
    return {
      de: "Demenzdiagnose vorhanden — Stadium und Verhalten werden in der Patientenform präzisiert.",
      en: "Dementia diagnosis present — stage and behaviour to be detailed via the patient form.",
      pl: "Rozpoznana demencja — stopień i zachowanie zostaną dopowiedziane w formularzu pacjenta.",
    };
  }
  return {
    de: "Keine Demenzdiagnose.",
    en: "No dementia diagnosis.",
    pl: "Brak rozpoznania demencji.",
  };
}

export function buildPatients(
  fd: FormularDaten,
  opts: { primaryGender?: "male" | "female" } = {},
): PatientInput[] {
  const mobility = mapMobilityToId(fd);
  const liftId = mapLiftId(mobility);
  const dementia = mapDementia(fd);
  const nightOps = mapNightOperations(fd);
  const liftDesc = liftDescriptionFor(mobility);
  const nightDesc = nightOperationsDescriptionFor(nightOps);
  const demDesc = dementiaDescriptionFor(dementia);

  // patient.gender: real patient gender (NOT caregiver preference).
  // Mamamia validator rejects "not_important" on patients; default to
  // the prod-most-common "female" if the caller didn't resolve it from
  // the lead's salutation.
  const primaryGender = opts.primaryGender ?? "female";

  const first: PatientInput = {
    gender: primaryGender,
    care_level: mapCareLevel(fd),
    mobility_id: mobility,
    lift_id: liftId,
    tool_ids: mapToolIds(mobility),
    night_operations: nightOps,
    dementia,
    weight: DEFAULT_WEIGHT,
    height: DEFAULT_HEIGHT,
    incontinence: false,
    incontinence_feces: false,
    incontinence_urine: false,
    smoking: false,
    lift_description: liftDesc.de,
    lift_description_de: liftDesc.de,
    lift_description_en: liftDesc.en,
    lift_description_pl: liftDesc.pl,
    night_operations_description: nightDesc.de,
    night_operations_description_de: nightDesc.de,
    night_operations_description_en: nightDesc.en,
    night_operations_description_pl: nightDesc.pl,
    dementia_description: demDesc.de,
    dementia_description_de: demDesc.de,
    dementia_description_en: demDesc.en,
    dementia_description_pl: demDesc.pl,
  };

  // year_of_birth — only set when formularDaten provides it (or we add
  // a prefill source later). Don't fabricate; the form will fill it.
  if (typeof fd?.geburtsjahr === "number") first.year_of_birth = fd.geburtsjahr;

  // Second-patient placeholder uses mobile/no-lift defaults; same
  // description scaffold so panel form passes for both rows.
  // ⚠ CORRECTNESS: a 2nd patient is added when Primundus reports
  // `betreuung_fuer === 'ehepaar'` (couple under care). The
  // `weitere_personen` flag is a different question — "are there
  // OTHER people in the household who do NOT need care" — and maps to
  // customer.other_people_in_house, NOT to a second patient row.
  // Pre-2026-04-28 we used the wrong key here; legacy leads with only
  // weitere_personen='ja' set are now treated as single-patient.
  const isCouple = fd?.betreuung_fuer === "ehepaar";
  const secondMob = 1;
  const secondLiftDesc = liftDescriptionFor(secondMob);
  const secondNightDesc = nightOperationsDescriptionFor("no");
  const secondDemDesc = dementiaDescriptionFor("no");

  // For "ehepaar" the 2nd patient is the spouse — opposite gender as a
  // best-guess heuristic. Customer corrects via patient form when
  // editing the second-patient row.
  const secondGender: "male" | "female" = primaryGender === "female" ? "male" : "female";
  const second: PatientInput | null = isCouple
    ? {
      care_level: 2,
      mobility_id: secondMob,
      lift_id: mapLiftId(secondMob),
      tool_ids: mapToolIds(secondMob),
      gender: secondGender,
      weight: DEFAULT_WEIGHT,
      height: DEFAULT_HEIGHT,
      night_operations: "no",
      dementia: "no",
      incontinence: false,
      incontinence_feces: false,
      incontinence_urine: false,
      smoking: false,
      lift_description: secondLiftDesc.de,
      lift_description_de: secondLiftDesc.de,
      lift_description_en: secondLiftDesc.en,
      lift_description_pl: secondLiftDesc.pl,
      night_operations_description: secondNightDesc.de,
      night_operations_description_de: secondNightDesc.de,
      night_operations_description_en: secondNightDesc.en,
      night_operations_description_pl: secondNightDesc.pl,
      dementia_description: secondDemDesc.de,
      dementia_description_de: secondDemDesc.de,
      dementia_description_en: secondDemDesc.en,
      dementia_description_pl: secondDemDesc.pl,
    }
    : null;

  return second ? [first, second] : [first];
}

// ─── Salutation ─────────────────────────────────────────────────────────────
// Prod customer_contracts.salutation enum is "Mr." / "Mrs." (NOT German
// "Herr"/"Frau"). lead.anrede comes from the calculator which uses the
// German labels — translate explicitly.
export function mapSalutation(anrede: string | null | undefined): "Mr." | "Mrs." {
  const v = (anrede ?? "").toString().trim().toLowerCase();
  if (v === "frau" || v === "mrs." || v === "mrs") return "Mrs.";
  return "Mr."; // Herr / unknown / null → default to Mr.
}

// ─── other_people_in_house from formularDaten ───────────────────────────────
export function mapOtherPeopleInHouse(fd: FormularDaten): "yes" | "no" {
  return fd?.weitere_personen === "ja" ? "yes" : "no";
}

// ─── German skill (caregiver-wish) ──────────────────────────────────────────
// Primundus calculator collects 3 levels:
//   "grundlegend"  → A1-A2 territory  → Mamamia "level_2"
//   "kommunikativ" → B1-B2            → Mamamia "level_3"
//   "sehr-gut"     → C1+              → Mamamia "level_4"
// Mamamia enum 0..4 + "not_important" — verified prod sweep 2026-04-28.
// Default level_3 (50% of active customers) when formularDaten missing.
export function mapGermanySkill(
  fd: FormularDaten,
):
  | "level_0"
  | "level_1"
  | "level_2"
  | "level_3"
  | "level_4"
  | "not_important" {
  const v = (fd?.deutschkenntnisse ?? "").toString().toLowerCase();
  if (v === "grundlegend") return "level_2";
  if (v === "kommunikativ") return "level_3";
  if (v === "sehr-gut" || v === "sehr_gut") return "level_4";
  return "level_3"; // default — most-common in prod active customers
}

// ─── Driving license (caregiver-wish) ───────────────────────────────────────
// Primundus calculator: "egal" / "ja" / "nein". Mamamia enum: "yes" /
// "not_important" (no "no" — semantics are "must have license" vs "any").
// "nein" → not_important: we don't reject licensed cgs, just don't require.
export function mapDrivingLicense(
  fd: FormularDaten,
): "yes" | "not_important" {
  const v = (fd?.fuehrerschein ?? "").toString().toLowerCase();
  if (v === "ja") return "yes";
  return "not_important"; // egal / nein / missing
}

// ─── Build the CustomerCaregiverWish from formularDaten + defaults ──────────
// 100% of active customers have one. Real lead data (deutschkenntnisse,
// fuehrerschein, geschlecht) is preferred; prod-most-common defaults
// only when calculator didn't capture it.
export function buildCaregiverWish(fd: FormularDaten): CaregiverWishInput {
  // When driving_license=yes the panel form requires
  // driving_license_gearbox (automatic / manual). Default 'automatic' —
  // prod-most-common (712 vs 547) and the more permissive choice (any
  // licensed caregiver can drive it). Skip when driving_license is
  // not_important (no follow-up question shown).
  const drivingLicense = mapDrivingLicense(fd);
  const wish: CaregiverWishInput = {
    is_open_for_all: false,
    gender: mapGender(fd) ?? "not_important",
    germany_skill: mapGermanySkill(fd),
    driving_license: drivingLicense,
    smoking: "yes_outside",
    shopping: "no",
    // Free-text fields — ship a sensible auto-string so customer.tasks
    // and customer.shopping_be_done are non-null (they're 99-100% in active
    // and the matcher uses them as filter input).
    tasks: "Grundpflege, Hauswirtschaft, Gesellschaft",
    tasks_de: "Grundpflege, Hauswirtschaft, Gesellschaft",
    tasks_en: "Basic care, housekeeping, companionship",
    tasks_pl: "Opieka podstawowa, prowadzenie domu, towarzystwo",
    shopping_be_done: "Nach Absprache",
    shopping_be_done_de: "Nach Absprache",
    shopping_be_done_en: "By arrangement",
    shopping_be_done_pl: "Wedle uzgodnienia",
  };
  if (drivingLicense === "yes") {
    wish.driving_license_gearbox = "automatic";
  }
  return wish;
}

// ─── Extract PLZ from a lead ────────────────────────────────────────────────
// Source-of-truth (verified vs project 3 schema 2026-04-28):
//   - Primary: lead.patient_zip — populated by /api/betreuung-beauftragen
//     (stage B). This is the form where the customer types their actual
//     PLZ for the care location.
//   - Fallback: formularDaten.{plz, postleitzahl, postal_code, zip,
//     zip_code} — none of these are written by the current Primundus
//     calculator, but keep the look-ups defensively in case a future
//     UX iteration adds PLZ to stage A or a manually-edited lead
//     surfaces it through admin.
//
// Returns 5-digit PLZ string or null when no PLZ is available — caller
// falls back to location_custom_text.
function isPlzString(v: unknown): v is string {
  return typeof v === "string" && /^\d{4,5}$/.test(v.trim());
}
function isPlzNumber(v: unknown): v is number {
  return typeof v === "number" && v >= 1000 && v <= 99999;
}

export function extractPlzFromLead(lead: Lead): string | null {
  // Stage-B field — preferred and verified-by-customer source.
  if (isPlzString(lead.patient_zip)) {
    return (lead.patient_zip as string).trim().padStart(5, "0");
  }
  // Fallbacks inside formularDaten (defensive — none currently written
  // by Primundus calculator, but cheap to check).
  const fd = lead.kalkulation?.formularDaten ?? {};
  for (const k of ["plz", "postleitzahl", "postal_code", "zip", "zip_code"]) {
    const v = fd[k];
    if (isPlzString(v)) return v.trim().padStart(5, "0");
    if (isPlzNumber(v)) return String(v).padStart(5, "0");
  }
  return null;
}

// Back-compat alias — kept so old call sites don't break, but new code
// should use extractPlzFromLead which sees the stage-B patient_zip.
export function extractPlzFromFormularDaten(fd: FormularDaten): string | null {
  for (const k of ["plz", "postleitzahl", "postal_code", "zip", "zip_code"]) {
    const v = fd?.[k];
    if (isPlzString(v)) return v.trim().padStart(5, "0");
    if (isPlzNumber(v)) return String(v).padStart(5, "0");
  }
  return null;
}

// ─── Patient identity helpers ──────────────────────────────────────────────
// Primundus stage-B form (Betreuung beauftragen) collects the PATIENT's
// own name + salutation in `patient_anrede / patient_vorname /
// patient_nachname` — distinct from `lead.vorname / nachname / anrede`,
// which describe the CONTRACT-CONTACT (the person who orders + pays,
// e.g. an adult child of the patient).
//
// These two often differ (Michał Test orders care for Zenon Test) and
// Mamamia tracks them on separate rows:
//   - customer_contract  (contact_type='patient_contact')   ← patient
//   - invoice_contract / customer_contracts[contact_contact] ← orderer
//
// When stage-B has not run yet (status='angebot_requested'), both
// identities collapse to lead.* — falling back keeps the helpers safe
// for stage-A re-onboards.
export function resolvePatientFirstName(lead: Lead): string | undefined {
  return lead.patient_vorname ?? lead.vorname ?? undefined;
}
export function resolvePatientLastName(lead: Lead): string | undefined {
  return lead.patient_nachname ?? lead.nachname ?? undefined;
}
export function resolvePatientSalutation(lead: Lead): "Mr." | "Mrs." {
  return mapSalutation(lead.patient_anrede ?? lead.anrede);
}

// ─── Customer-level contract & contacts ─────────────────────────────────────
//
// `location_id` is required for the panel form's "Lokalizacja opieki"
// dropdown. We resolve it via Locations(search: PLZ) BEFORE building the
// contract; if the lead carries no PLZ, we set location_custom_text as
// the manual-entry fallback (mirrors the panel checkbox "Lokalizacja
// poza Niemcami / Wprowadź ręcznie").
//
// `kind` decides which Primundus identity feeds the row:
//   - "patient": the actual care recipient (Zenon Test). Goes into
//     customer.customer_contract (Mamamia contact_type='patient_contact').
//   - "contact": the contract/billing contact (Michał Test = lead.*). Goes
//     into customer.invoice_contract (Mamamia contact_type='contract_contact').
//   - "invoice": legacy alias of "contact" — Mamamia field is invoice_contract.
//
// is_same_as_first_patient — true only when contact identity collapses to
// patient identity (e.g. stage-A leads with no patient_* yet).
export function buildContractFromLead(
  lead: Lead,
  locationId: number | null = null,
  kind: "patient" | "contact" = "patient",
): CustomerContractInput {
  const usePatient = kind === "patient";
  const firstName = usePatient
    ? resolvePatientFirstName(lead)
    : lead.vorname ?? undefined;
  const lastName = usePatient
    ? resolvePatientLastName(lead)
    : lead.nachname ?? undefined;
  const salutation = usePatient
    ? resolvePatientSalutation(lead)
    : mapSalutation(lead.anrede);

  // patient identity == contact identity? Then 2nd contract is just a
  // mirror — flag is_same_as_first_patient so Mamamia panel UI can
  // collapse the row. Detect by comparing resolved patient names against
  // lead.* (the contact source).
  const patientFirst = resolvePatientFirstName(lead);
  const patientLast = resolvePatientLastName(lead);
  const sameIdentity =
    patientFirst === (lead.vorname ?? undefined) &&
    patientLast === (lead.nachname ?? undefined);

  const base: CustomerContractInput = {
    contact_type: usePatient ? "patient" : "invoice",
    is_same_as_first_patient: usePatient ? true : sameIdentity,
    salutation,
    first_name: firstName,
    last_name: lastName,
    phone: lead.telefon ?? undefined,
    email: lead.email,
  };
  // Use patient_street fields for both contracts when present — care
  // location is shared between patient + invoice contact in the
  // Primundus billing model.
  if (lead.patient_street) base.street_number = lead.patient_street;
  if (lead.patient_zip) base.zip_code = lead.patient_zip;
  if (lead.patient_city) base.city = lead.patient_city;

  if (locationId !== null) {
    base.location_id = locationId;
  } else {
    // Manual-entry fallback. Panel form accepts non-empty string here
    // and skips the dropdown validation.
    base.location_custom_text = "Wird vom Kunden ergänzt";
  }
  return base;
}

// customer_contacts holds the contract-contact identity (the orderer/
// payer — `lead.*`). When Primundus stage-B has not run, patient and
// contact share the same identity, so is_same_as_first_patient=true
// signals to the panel that the row mirrors the patient.
export function buildContactsFromLead(lead: Lead): CustomerContactInput[] {
  const patientFirst = resolvePatientFirstName(lead);
  const patientLast = resolvePatientLastName(lead);
  const sameIdentity =
    patientFirst === (lead.vorname ?? undefined) &&
    patientLast === (lead.nachname ?? undefined);

  return [
    {
      is_same_as_first_patient: sameIdentity,
      salutation: mapSalutation(lead.anrede),
      first_name: lead.vorname ?? undefined,
      last_name: lead.nachname ?? undefined,
      phone: lead.telefon ?? undefined,
      email: lead.email,
    },
  ];
}

// ─── Job description (auto-generated, multi-language) ───────────────────────
// 100% in active customers — must be non-empty. Auto-generate from
// formularDaten so caregivers can read what's expected before applying.
export function buildJobDescription(fd: FormularDaten): {
  de: string;
  en: string;
  pl: string;
} {
  const careLevel = mapCareLevel(fd);
  const mobilityId = mapMobilityToId(fd);
  // ID → human label for the auto-text. Match mobilities lookup (prod).
  const mobilityLabel: Record<number, { de: string; en: string; pl: string }> = {
    1: { de: "selbstständig mobil", en: "fully mobile", pl: "samodzielnie mobilna" },
    2: { de: "mit Gehstock", en: "walking stick", pl: "o lasce" },
    3: { de: "mit Rollator", en: "walker / rollator", pl: "z chodzikiem" },
    4: { de: "im Rollstuhl", en: "wheelchair-bound", pl: "na wózku" },
    5: { de: "bettlägerig", en: "bedridden", pl: "leżąca" },
  };
  const m = mobilityLabel[mobilityId] ?? mobilityLabel[1];
  return {
    de: `24-Stunden-Betreuung gesucht. Pflegegrad ${careLevel}, ${m.de}.`,
    en: `24h care needed. Care level ${careLevel}, ${m.en}.`,
    pl: `Poszukiwana całodobowa opieka. Poziom opieki ${careLevel}, ${m.pl}.`,
  };
}

// ─── Top-level CustomerInput builder ────────────────────────────────────────
// Single function: takes a Lead, returns the full StoreCustomer payload
// with every must-fill field populated and sensible defaults where the
// lead doesn't carry the answer. Goal: customer ends up in a state that
// matches the prod active distribution as closely as possible.
//
// urbanization_id default = 2 ("City") — most-common in lookup/usage.
// language_id = 1 — German (default for Primundus market).
// visibility = "public" — most-common in prod.
export function buildCustomerInput(
  lead: Lead,
  locationId: number | null = null,
  nowISO: string = new Date().toISOString(),
): CustomerInput {
  const fd = lead.kalkulation?.formularDaten ?? {};
  const careBudget = lead.kalkulation?.bruttopreis ?? null;
  const desc = buildJobDescription(fd);
  const arrivalAt = computeArrivalDate(lead.care_start_timing, nowISO);

  return {
    // Customer top-level identity = the PATIENT (care recipient).
    // Mamamia models customer.first_name/last_name as the patient's name
    // for matching/UI display (76% fill in active prod customers).
    // For stage-A leads where patient_* haven't been collected yet, the
    // helper falls back to lead.* (Primundus orderer).
    first_name: resolvePatientFirstName(lead) ?? null,
    last_name: resolvePatientLastName(lead) ?? null,
    email: lead.email,
    phone: lead.telefon,
    // Customer-level location — same as contract (resolved by caller via
    // Locations(search: PLZ)). When PLZ unknown we leave it null and let
    // the contract carry location_custom_text fallback.
    location_id: locationId,
    urbanization_id: 2,
    language_id: 1,
    // [1 Own TV, 2 Own Bathroom] — clean default without "Others"
    // (id 8 triggers a required "Inne urządzenia" free-text field
    // we have no answer for). 345 active customers in prod use
    // exactly this pair; another 552 use [1] or [2] alone.
    equipment_ids: [1, 2],
    day_care_facility: "no",
    care_budget: careBudget,
    monthly_salary: careBudget,
    // Primundus default commission. Prod active distribution: 365 (3120),
    // 780 (1890), 790 (1140), 730 (507), 0 (15). Panel form rejects 0,
    // so set 300 as the Primundus baseline (per K7 product decision).
    commission_agent_salary: 300,
    // arrival_at — same value as JobOffer.arrival_at; Customer-active
    // gate requires it (Mamamia Laravel: $customer->arrival_at && ...).
    arrival_at: arrivalAt,
    visibility: "public",
    accommodation: "single_family_house",
    caregiver_accommodated: "room_premises",
    has_family_near_by: "not_important",
    internet: "yes",
    pets: "no_information",
    is_pet_dog: false,
    is_pet_cat: false,
    is_pet_other: false,
    other_people_in_house: mapOtherPeopleInHouse(fd),
    smoking_household: "no",
    job_description: desc.de,
    job_description_de: desc.de,
    job_description_en: desc.en,
    job_description_pl: desc.pl,
    gender: mapGender(fd) ?? "not_important",
    patients: buildPatients(fd, { primaryGender: resolvePatientGender(lead) }),
    customer_caregiver_wish: buildCaregiverWish(fd),
    // customer_contract = PATIENT identity (Zenon)
    // invoice_contract = ORDERER/PAYER identity (Michał = lead.*)
    // customer_contacts = orderer in customer-contacts list (mirrors invoice
    // role — what the panel UI shows as the contract-contact block).
    customer_contract: buildContractFromLead(lead, locationId, "patient"),
    invoice_contract: buildContractFromLead(lead, locationId, "contact"),
    customer_contacts: buildContactsFromLead(lead),
  };
}
