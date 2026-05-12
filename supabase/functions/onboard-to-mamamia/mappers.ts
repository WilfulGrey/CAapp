import type {
  CaregiverWishInput,
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
// Mamamia panel "Keine" = `care_level: null` (zweryfikowane live na
// Customer 7658, 2026-05-07). Calculator allows pflegegrad=0 → null
// verbatim. NIE wymyślamy mapowania (patrz CLAUDE.md "ŚWIĘTA ZASADA NR 1.5").
//
// Sygnatura:
//   - number 1-5: explicit Pflegegrad
//   - null: "Keine" (explicit no PG — Mamamia native option)
//   - missing/invalid: default 2 (most-common active value, defensive)
export function mapCareLevel(fd: FormularDaten): number | null {
  const v = fd?.pflegegrad;
  if (typeof v === "number" && v >= 1 && v <= 5) return v;
  if (v === 0) return null;
  return 2;
}

// ─── Dementia ───────────────────────────────────────────────────────────────
// Helper kept for patient form save flow (patientFormMapper) — onboard does
// NOT set patient.dementia anymore (calculator never asks; surfaces as
// fake "Nein" preselect in UI per Bug #13).
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
  // NOTE: 'gelegentlich' used to map to 'occasionally' — a valid Mamamia DB enum
  // but NOT rendered in the Mamamia panel dropdown (shows "Bitte wählen" even when
  // stored). Closest renderable option is 'up_to_1_time' ("Bis zu 1 Mal"). 2026-05-12.
  if (v === "gelegentlich") return "up_to_1_time";
  if (v === "taeglich") return "up_to_1_time";       // Primundus "Täglich (1×)" → Mamamia "≤1×"
  if (v === "mehrmals") return "more_than_2";        // Primundus "Mehrmals nachts" → Mamamia ">2×"
  if (v === "regelmaessig") return "up_to_1_time";   // legacy alias
  return "no";
}

// ─── Gender — TWO distinct dimensions in Mamamia ────────────────────────────
//
//   1. customer_caregiver_wish.gender  → preferred CAREGIVER gender
//      Accepts "female" / "male" / "not_important". Source: Primundus
//      formularDaten.geschlecht ("weiblich" / "maennlich" / "egal").
//
//   2. patient.gender → real PATIENT's gender. Mamamia validator rejects
//      "not_important" here BUT accepts null/omitted. Bug #13 refactor:
//      we no longer set patient.gender at onboard time (Marcin's calculator
//      does not collect anrede; the previous "female" fallback surfaced in
//      the UI as a phantom preselect). Patient form sets it from the user's
//      explicit pick.

export function mapGender(
  fd: FormularDaten,
): "male" | "female" | "not_important" | null {
  const v = (fd?.geschlecht ?? "").toString().toLowerCase();
  if (v === "weiblich") return "female";
  if (v === "maennlich") return "male";
  if (v === "egal") return "not_important";
  return null;
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
// Bug #13 refactor (2026-05-07): patient row carries ONLY fields the
// calculator actually collects (or fields derivable from those — lift_id /
// tool_ids from mobility_id). All previously-injected defaults
// (weight, height, gender, dementia, incontinence_*, smoking,
// *_description{,_de,_en,_pl}) are deferred to patient form save via
// UpdateCustomer; Mamamia accepts them as null/omitted at StoreCustomer time
// (Customer lands as status='draft', flips to 'active' once patient form
// completes the picture). See docs/customer-portal-flow.md §5 ⑤.
//
// weitere_personen=ja → 2 patients flag (couple-under-care): the
// `betreuung_fuer === 'ehepaar'` field gates a 2nd patient row that
// inherits Person 1's care attrs (Pflegegrad, mobility, lift, night-ops);
// the calculator collects ONE set of answers for the couple as a unit.

// lift_id: pick based on mobility — 4 ("not_important") is allowed by
// the schema but doesn't appear in any active customer's patient row,
// because the customer-facing panel renders only Yes/No/(optional 3).
// Mapping (verified prod 2026-04-28):
//   wheelchair (4) / bedridden (5) → lift_id=1 (Yes — lift required)
//   walker / walking-stick / mobile → lift_id=2 (No — no lift needed)
export function mapLiftId(mobilityId: number): number {
  return mobilityId >= 4 ? 1 : 2;
}

// tool_ids: mobility-specific concrete tools. NEVER include id 7
// (Others) — selecting "Inne" triggers a required free-text field
// "Jakie inne narzędzia są używane?" which we have no answer for.
//   bedridden (5)  → [4 Patient hoist, 6 Care bed]
//   wheelchair (4) → [3 Wheelchair]
//   walker (3)     → [2 Rollator]
//   walking-stick (2) → [1 Walking stick]
//   mobile (1) → [] (independent — no mobility aid; auto-adding
//                Gehstock falsifies customer's "Mobil – geht selbständig"
//                pick. User feedback 2026-05-12.)
export function mapToolIds(mobilityId: number): number[] {
  switch (mobilityId) {
    case 5:
      return [4, 6];
    case 4:
      return [3];
    case 3:
      return [2];
    case 2:
      return [1];
    default:
      return [];
  }
}

export function buildPatients(fd: FormularDaten): PatientInput[] {
  const mobility = mapMobilityToId(fd);
  const liftId = mapLiftId(mobility);
  const nightOps = mapNightOperations(fd);

  const first: PatientInput = {
    care_level: mapCareLevel(fd),
    mobility_id: mobility,
    lift_id: liftId,
    tool_ids: mapToolIds(mobility),
    night_operations: nightOps,
  };

  // year_of_birth — only set when formularDaten provides it. Don't
  // fabricate; the form will fill it.
  if (typeof fd?.geburtsjahr === "number") first.year_of_birth = fd.geburtsjahr;

  // ⚠ CORRECTNESS: a 2nd patient is added when Primundus reports
  // `betreuung_fuer === 'ehepaar'` (couple under care). The
  // `weitere_personen` flag is a different question — "are there
  // OTHER people in the household who do NOT need care" — and maps to
  // customer.other_people_in_house, NOT to a second patient row.
  const isCouple = fd?.betreuung_fuer === "ehepaar";
  const second: PatientInput | null = isCouple
    ? {
      care_level: mapCareLevel(fd),
      mobility_id: mobility,
      lift_id: liftId,
      tool_ids: mapToolIds(mobility),
      night_operations: nightOps,
    }
    : null;

  return second ? [first, second] : [first];
}

// ─── Salutation ─────────────────────────────────────────────────────────────
// Prod customer_contracts.salutation enum is "Mr." / "Mrs." (NOT German
// "Herr"/"Frau"). lead.anrede comes from the calculator which uses the
// German labels — translate explicitly. Helper kept for use by patient
// form save / acceptance flow (Bug #13 refactor: onboard no longer sets
// contracts; they are populated at StoreConfirmation accept time).
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
// Primundus calculator collects 3 levels (step 7 wymagany, canProceed blokuje
// dalej bez wyboru). Mapowanie zaktualizowane 2026-05-12 wg decyzji
// biznesowej Michała:
//   "grundlegend"  → Mamamia "level_1"   (było level_2)
//   "kommunikativ" → Mamamia "level_2"   (było level_3)
//   "sehr-gut"     → Mamamia "level_4"   (unchanged)
// `level_3` świadomie pomijany — calculator nie ma odpowiadającego pytania,
// agency może je samodzielnie pickować w panelu Mamamia jeśli chce.
// Mamamia enum 0..4 + "not_important" verified prod sweep 2026-04-28.
//
// NO SOFT DEFAULT (Święta zasada nr 1) — gdy formularDaten missing albo
// unknown value, THROW. Lead onboard pada wyraźnie zamiast wstawiać dumb
// wartość typu level_3 udając "we got something". Caller (onboardLead)
// catchuje, surface'uje błąd jako "onboarding failed" (lub real message
// gdy DEBUG_ONBOARD=1).
export function mapGermanySkill(
  fd: FormularDaten,
): "level_1" | "level_2" | "level_4" {
  const v = (fd?.deutschkenntnisse ?? "").toString().toLowerCase();
  if (v === "grundlegend") return "level_1";
  if (v === "kommunikativ") return "level_2";
  if (v === "sehr-gut" || v === "sehr_gut") return "level_4";
  throw new Error(
    `mapGermanySkill: unknown deutschkenntnisse value ${JSON.stringify(v)} — ` +
      `calculator should emit one of "grundlegend" / "kommunikativ" / "sehr-gut". ` +
      `Brak default'u celowo (Święta zasada nr 1).`,
  );
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


// ─── Build the CustomerCaregiverWish from formularDaten ─────────────────────
// Bug #13 refactor (2026-05-07): wish carries ONLY fields the calculator
// collects (gender / germany_skill / driving_license). Free-text auto-strings
// (tasks*, shopping_be_done*) and enum defaults (smoking, shopping,
// driving_license_gearbox) are deferred to patient form save: the user picks
// real values via patientFormMapper → UpdateCustomer.customer_caregiver_wish.
// `is_open_for_all: false` is a Primundus business default, not pytanie do
// klienta — keeps Mamamia matcher in "filter by wish" mode rather than
// "match anyone".
export function buildCaregiverWish(fd: FormularDaten): CaregiverWishInput {
  return {
    is_open_for_all: false,
    gender: mapGender(fd) ?? "not_important",
    germany_skill: mapGermanySkill(fd),
    driving_license: mapDrivingLicense(fd),
  };
}

// ─── Extract PLZ from a lead ────────────────────────────────────────────────
// Source-of-truth (verified vs project 3 schema 2026-04-28):
//   - Primary: lead.patient_zip — populated by /api/betreuung-beauftragen
//     (stage B). MVP: stage B never runs, so this is null.
//   - Fallback: formularDaten.{plz, postleitzahl, postal_code, zip,
//     zip_code} — none of these are written by the current Primundus
//     calculator. Defensive look-up retained in case a future UX iteration
//     adds PLZ to stage A.
//
// Returns 5-digit PLZ string or null when no PLZ is available — caller
// passes null to StoreCustomer (location_id stays null too).
function isPlzString(v: unknown): v is string {
  return typeof v === "string" && /^\d{4,5}$/.test(v.trim());
}
function isPlzNumber(v: unknown): v is number {
  return typeof v === "number" && v >= 1000 && v <= 99999;
}

export function extractPlzFromLead(lead: Lead): string | null {
  if (isPlzString(lead.patient_zip)) {
    return (lead.patient_zip as string).trim().padStart(5, "0");
  }
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
// MVP: stage B never runs → patient_* are null → these helpers fall back
// to lead.* (the orderer-from-calculator). Onboard uses them to populate
// Customer.first_name/last_name (the panel-display identity); the legal
// PATIENT vs ORDERER split is recorded later via StoreConfirmation at
// acceptance time (Bug #13 refactor).
export function resolvePatientFirstName(lead: Lead): string | undefined {
  return lead.patient_vorname ?? lead.vorname ?? undefined;
}
export function resolvePatientLastName(lead: Lead): string | undefined {
  return lead.patient_nachname ?? lead.nachname ?? undefined;
}
export function resolvePatientSalutation(lead: Lead): "Mr." | "Mrs." {
  return mapSalutation(lead.patient_anrede ?? lead.anrede);
}

// ─── Top-level CustomerInput builder ────────────────────────────────────────
// Bug #13 refactor (2026-05-07): minimal payload — ONLY fields the
// calculator collects (or business defaults that aren't pytania do
// klienta). Goal: Mamamia Customer lands as status='draft' carrying
// truth-only data; everything else is deferred to:
//   - patient form save  → UpdateCustomer (accommodation, urbanization_id,
//     equipment_ids, day_care_facility, has_family_near_by, internet,
//     pets, is_pet_*, smoking_household, weight/height/dementia/
//     incontinence_*/smoking on patients, wish.smoking/shopping/tasks*/
//     shopping_be_done*/driving_license_gearbox, job_description).
//   - acceptance         → StoreConfirmation (customer_contract,
//     invoice_contract, customer_contacts — real identity collected at
//     AngebotPruefenModal step 2).
//
// Business defaults that DO ship in onboard (NOT pytania do klienta):
//   - language_id = 1   → Primundus is German market
//   - visibility = "public"
//   - commission_agent_salary = 10  → Primundus baseline (panel rejects 0;
//     było 300, obniżone 2026-05-11 wg decyzji biznesowej Michała)
//   - is_open_for_all = false (in wish) → matcher should respect filters
//
// caller passes locationId from Locations(plz) lookup; null when PLZ
// unknown (MVP norm). location_custom_text fallback NOT shipped — the
// patient form sets PLZ + Ort which propagate via UpdateCustomer.
export function buildCustomerInput(
  lead: Lead,
  locationId: number | null = null,
  nowISO: string = new Date().toISOString(),
): CustomerInput {
  const fd = lead.kalkulation?.formularDaten ?? {};
  const careBudget = lead.kalkulation?.bruttopreis ?? null;
  const arrivalAt = computeArrivalDate(lead.care_start_timing, nowISO);

  return {
    // Identity — patient_* (stage-B) → fallback to lead.* (orderer).
    // Customer.first_name/last_name is the panel-display identity.
    first_name: resolvePatientFirstName(lead) ?? null,
    last_name: resolvePatientLastName(lead) ?? null,
    email: lead.email,
    phone: lead.telefon,
    // Location — best-effort. Null when PLZ unknown; patient form fills
    // via UpdateCustomer (location_id or location_custom_text).
    location_id: locationId,
    // Business defaults
    language_id: 1,
    visibility: "public",
    commission_agent_salary: 10,
    // Pricing (real, from kalkulation)
    care_budget: careBudget,
    monthly_salary: careBudget,
    // Time (derived from real care_start_timing)
    arrival_at: arrivalAt,
    // Real formularDaten
    other_people_in_house: mapOtherPeopleInHouse(fd),
    gender: mapGender(fd) ?? "not_important",
    // Nested — patients carry only real care attrs; wish carries only
    // real preference enums (no auto-strings).
    patients: buildPatients(fd),
    customer_caregiver_wish: buildCaregiverWish(fd),
  };
}
