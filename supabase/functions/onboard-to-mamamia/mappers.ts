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
//   "no"           — 65% of records
//   "up_to_1_time" — 22% (≤1× per night)
//   "1_2_times"    —  5% (1–2× per night)
//   "more_than_2"  —  1% (>2× per night)
//   "occasionally" —  0.2% (legacy / rare)
//
// formularDaten only offers 4 levels (nein/gelegentlich/regelmaessig/taeglich),
// so we map onto the production-supported 4-bucket scale.
export type NightOperations =
  | "no"
  | "up_to_1_time"
  | "1_2_times"
  | "more_than_2"
  | "occasionally";

export function mapNightOperations(fd: FormularDaten): NightOperations {
  const v = (fd?.nachteinsaetze ?? "").toString().toLowerCase();
  if (v === "gelegentlich") return "occasionally";
  if (v === "regelmaessig") return "up_to_1_time";
  if (v === "taeglich") return "1_2_times";
  return "no";
}

// ─── Gender ─────────────────────────────────────────────────────────────────
// Mamamia enum (verified prod DB 2026-04-27):
//   "female" (61%), "male" (38%), "not_important" (rare), null
// formularDaten "egal" → "not_important" so the matcher knows it's intentional.
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

export function buildPatients(fd: FormularDaten): PatientInput[] {
  const mobility = mapMobilityToId(fd);
  const liftId = mapLiftId(mobility);
  const dementia = mapDementia(fd);
  const nightOps = mapNightOperations(fd);
  const liftDesc = liftDescriptionFor(mobility);
  const nightDesc = nightOperationsDescriptionFor(nightOps);
  const demDesc = dementiaDescriptionFor(dementia);

  const first: PatientInput = {
    gender: mapGender(fd) ?? "not_important",
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
  const secondMob = 1;
  const secondLiftDesc = liftDescriptionFor(secondMob);
  const secondNightDesc = nightOperationsDescriptionFor("no");
  const secondDemDesc = dementiaDescriptionFor("no");

  const second: PatientInput | null = fd?.weitere_personen === "ja"
    ? {
      care_level: 2,
      mobility_id: secondMob,
      lift_id: mapLiftId(secondMob),
      tool_ids: mapToolIds(secondMob),
      gender: "not_important",
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

// ─── Build the CustomerCaregiverWish from formularDaten + defaults ──────────
// 100% of active customers have one. Prod-most-common defaults are picked
// where formularDaten doesn't carry the answer.
export function buildCaregiverWish(fd: FormularDaten): CaregiverWishInput {
  return {
    is_open_for_all: false,
    gender: mapGender(fd) ?? "not_important",
    germany_skill: "level_3",
    driving_license: "not_important",
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
}

// ─── Extract PLZ from formularDaten ────────────────────────────────────────
// Primundus calculator stores the customer's German postal code under
// various keys (the schema is loose). Try the most common ones.
export function extractPlzFromFormularDaten(fd: FormularDaten): string | null {
  const candidates = ["plz", "postleitzahl", "postal_code", "zip", "zip_code"];
  for (const k of candidates) {
    const v = fd?.[k];
    if (typeof v === "string" && /^\d{4,5}$/.test(v.trim())) {
      return v.trim().padStart(5, "0");
    }
    if (typeof v === "number" && v >= 1000 && v <= 99999) {
      return String(v).padStart(5, "0");
    }
  }
  return null;
}

// ─── Customer-level contract & contacts (invoice + main) ────────────────────
// For a Primundus lead the lead's contact data IS the patient-payer-contact
// triple — use is_same_as_first_patient on contacts to express that we've
// merged the roles. Patient form will split them later if needed.
//
// `location_id` is required for the panel form's "Lokalizacja opieki"
// dropdown. We resolve it via Locations(search: PLZ) BEFORE building the
// contract; if the lead carries no PLZ, we set location_custom_text as
// the manual-entry fallback (mirrors the panel checkbox "Lokalizacja
// poza Niemcami / Wprowadź ręcznie").
export function buildContractFromLead(
  lead: Lead,
  locationId: number | null = null,
): CustomerContractInput {
  const base: CustomerContractInput = {
    contact_type: "patient",
    is_same_as_first_patient: true,
    salutation: mapSalutation(lead.anrede),
    first_name: lead.vorname ?? undefined,
    last_name: lead.nachname ?? undefined,
    phone: lead.telefon ?? undefined,
    email: lead.email,
  };
  if (locationId !== null) {
    base.location_id = locationId;
  } else {
    // Manual-entry fallback. Panel form accepts non-empty string here
    // and skips the dropdown validation.
    base.location_custom_text = "Wird vom Kunden ergänzt";
  }
  return base;
}

export function buildContactsFromLead(lead: Lead): CustomerContactInput[] {
  return [
    {
      is_same_as_first_patient: true,
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
    first_name: lead.vorname,
    last_name: lead.nachname,
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
    patients: buildPatients(fd),
    customer_caregiver_wish: buildCaregiverWish(fd),
    customer_contract: buildContractFromLead(lead, locationId),
    invoice_contract: buildContractFromLead(lead, locationId),
    customer_contacts: buildContactsFromLead(lead),
  };
}
