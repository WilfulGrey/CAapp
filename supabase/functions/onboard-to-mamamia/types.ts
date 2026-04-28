// Supabase `leads` row shape — matches Primundus landing-page schema
// (project 3/supabase/migrations + the MultiStepForm submission contract).
//
// Two-stage life-cycle relevant here:
//   A) `angebot_requested` (after kalkulator) — formularDaten populated,
//      address fields (patient_*) NOT YET captured.
//   B) `vertrag_abgeschlossen` (after Betreuung-beauftragen form) —
//      patient_zip / patient_street / patient_city / patient_anrede /
//      patient_nachname now present. THIS is the safe trigger for our
//      onboard-to-mamamia, because location_id needs PLZ to resolve.

export interface FormularDaten {
  // ─── Stage-A fields populated by MultiStepForm ───────────────────────
  // Source of truth: project 3/components/calculator/MultiStepForm.tsx:154
  pflegegrad?: number;                                    // 0..5 (int)
  mobilitaet?: "mobil" | "rollator" | "rollstuhl" | "bettlaegerig" | string;
  nachteinsaetze?: "nein" | "gelegentlich" | "taeglich" | "mehrmals" | string;
  weitere_personen?: "ja" | "nein" | string;              // others in household, NOT 2nd patient
  betreuung_fuer?: "1-person" | "ehepaar" | string;       // 1 vs 2 patients under care
  geschlecht?: "weiblich" | "maennlich" | "egal" | string; // preferred caregiver gender
  // Caregiver-wish fields (mapped to customer_caregiver_wish in Mamamia)
  deutschkenntnisse?: "grundlegend" | "kommunikativ" | "sehr-gut" | string;
  fuehrerschein?: "ja" | "nein" | "egal" | string;
  erfahrung?: "einsteiger" | "erfahren" | "sehr-erfahren" | string;
  // Optional / legacy
  demenz?: string;
  // PLZ does NOT live in formularDaten — Primundus calculator never
  // collects it. It surfaces on lead.patient_zip after stage B.
  [key: string]: unknown;
}

export interface LeadKalkulation {
  bruttopreis: number;
  eigenanteil: number;
  formularDaten?: FormularDaten;
  [key: string]: unknown;
}

export interface Lead {
  id: string;
  email: string;
  vorname: string | null;
  nachname: string | null;
  anrede: string | null;
  anrede_text: string | null;
  telefon: string | null;
  status: string;
  token: string | null;
  token_expires_at: string | null;
  token_used: boolean;
  care_start_timing: string | null;
  kalkulation: LeadKalkulation | null;
  // ─── Stage-B fields (populated by /api/betreuung-beauftragen) ─────────
  // The customer types these in manually after clicking through the
  // calculator email. Until stage B runs they're null.
  patient_anrede?: string | null;
  patient_vorname?: string | null;
  patient_nachname?: string | null;
  patient_street?: string | null;
  patient_zip?: string | null;
  patient_city?: string | null;
  special_requirements?: string | null;
  order_confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
  // Rev2 Mamamia cache columns (migration 20260423)
  mamamia_customer_id: number | null;
  mamamia_job_offer_id: number | null;
  mamamia_user_token: string | null;
  mamamia_onboarded_at: string | null;
}

// Mamamia PatientInputType (introspected from beta GraphQL on 2026-04-28
// + cross-referenced with prod DB fill-rate sweep).
//
// 100%-fill columns in prod active customers (must-fill set):
//   gender, mobility_id, year_of_birth, weight, lift_id,
//   night_operations, dementia
// We fill all of these; the rest are optional and either come from
// formularDaten or get sensible production-most-common defaults.
export interface PatientInput {
  gender?: "male" | "female" | "not_important" | null;
  year_of_birth?: number;
  care_level: number;       // required by Mamamia (1-5)
  mobility_id: number;      // required by Mamamia to prevent checkSuperJob3 crash
  // lift_id active-customers distribution (verified prod sweep 2026-04-28):
  //   2 (No)  = 53%, 1 (Yes) = 42%, 3 = 7%. **lift_id=4 (not_important)
  //   does not appear in active patients** — the customer-facing form
  //   only renders 1/2/3 as selectable, so we MUST pick from those.
  lift_id?: number;
  // tool_ids ([Int]) — patient_tools pivot. Customer panel marks "Jakie
  // pomoce są dostępne?" as required, so ship at least one tool. Most
  // common in active prod: 2 (Rollator), 7 (Others), 3 (Wheelchair).
  tool_ids?: number[];
  dementia?: "yes" | "no";
  // Auto-text required by panel form when dementia=yes (otherwise UI
  // blocks Save with "To pole jest wymagane"). 45% fill in active prod
  // patients but the form-validator is stricter than the DB.
  dementia_description?: string;
  dementia_description_de?: string;
  dementia_description_en?: string;
  dementia_description_pl?: string;
  night_operations?:
    | "no"
    | "up_to_1_time"
    | "1_2_times"
    | "more_than_2"
    | "occasionally";
  // Auto-text required by panel form when night_operations != 'no'.
  night_operations_description?: string;
  night_operations_description_de?: string;
  night_operations_description_en?: string;
  night_operations_description_pl?: string;
  // Both height and weight use string buckets in prod, NOT numbers
  // (varchar(191) — prod values like "161-170", "61-70").
  weight?: string;
  height?: string;
  incontinence?: boolean;
  incontinence_feces?: boolean;
  incontinence_urine?: boolean;
  smoking?: boolean;
  // lift_description — required when lift_id is set (panel form rule).
  lift_description?: string;
  lift_description_de?: string;
  lift_description_en?: string;
  lift_description_pl?: string;
  features_condition?: string;
  features_condition_de?: string;
  features_condition_en?: string;
  features_condition_pl?: string;
}

// Mamamia CustomerCaregiverWishInputType — preferred caregiver profile.
// 100% in active customer rows. Every active customer has one.
// Enum values verified vs prod DB sweep 2026-04-28.
export interface CaregiverWishInput {
  is_open_for_all?: boolean;
  // gender: "female" (66%), "not_important" (12%), "male" (3%)
  gender?: "female" | "male" | "not_important";
  // germany_skill: "level_3" (50%), "level_2" (22%), "level_4" (8%), "level_1" (1%)
  germany_skill?: "level_0" | "level_1" | "level_2" | "level_3" | "level_4" | "not_important";
  alternative_germany_skill?: "level_1" | "level_2" | "level_3" | "level_4";
  driving_license?: "yes" | "not_important";
  driving_license_gearbox?: "automatic" | "manual";
  // smoking: "yes_outside" (52%), "no" (17%), "not_important" (11%)
  smoking?: "yes_outside" | "no" | "yes" | "not_important";
  // shopping: "no" (43%), "yes" (31%), "occasionally" (7%)
  shopping?: "yes" | "no" | "occasionally";
  shopping_be_done?: string;
  shopping_be_done_de?: string;
  shopping_be_done_en?: string;
  shopping_be_done_pl?: string;
  tasks?: string;
  tasks_de?: string;
  tasks_en?: string;
  tasks_pl?: string;
  night_operations?: string;
  night_operations_de?: string;
  night_operations_en?: string;
  night_operations_pl?: string;
  other_wishes?: string;
  other_wishes_de?: string;
  other_wishes_en?: string;
  other_wishes_pl?: string;
}

// Mamamia CustomerContractInputType — invoice/billing target.
// Used as `customer_contract` (legal-entity contract) and
// `invoice_contract` (where to send invoices). For a Primundus lead we
// can collapse these into "patient" since lead.email + lead.telefon
// describe the same person who pays + receives care.
export interface CustomerContractInput {
  contact_type?: "patient" | "customer" | "invoice";
  is_same_as_first_patient?: boolean;
  is_same_as_contact?: boolean;
  salutation?: "Mr." | "Mrs.";
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  // Either location_id (preferred — comes from Locations(search) lookup)
  // OR location_custom_text (fallback — mirrors the panel checkbox
  // "Lokalizacja poza Niemcami / Wprowadź ręcznie"). One of these must
  // be set or the panel form blocks Save with red "To pole jest wymagane".
  location_id?: number;
  location_custom_text?: string;
  street_number?: string;
  zip_code?: string;
  city?: string;
}

// Mamamia CustomerContactInputType — contact entry (one customer can
// have multiple contacts, e.g. customer + family members).
export interface CustomerContactInput {
  is_same_as_first_patient?: boolean;
  salutation?: "Mr." | "Mrs.";
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
}

// Top-level Customer input — what we send to StoreCustomer to land a
// customer that's already close to "active" status.
export interface CustomerInput {
  // Identity
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  // Location (location_id requires Locations(search) lookup; null until K-loc lands)
  location_id?: number | null;
  urbanization_id?: number | null;
  language_id?: number | null;
  // Equipment ids ([Int]) — customer_equipments pivot. Panel form has
  // "Wyposażenie zakwaterowania" as required. 94% of active customers
  // have at least one. Equipments lookup (non-deleted): 1=Own TV,
  // 2=Own Bathroom, 6=Own kitchen, 8=Others. Most popular set in
  // active prod: [1, 2, 8] (1195 customers).
  equipment_ids?: number[];
  // day_care_facility — panel form "Czy do Pacjenta przyjeżdża
  // Pflegedienst?" required. Active distribution: no=52%, yes=44%.
  day_care_facility?: "yes" | "no";
  // Care budget — both fields are kept in sync per prod (100% fill)
  care_budget?: number | null;
  monthly_salary?: number | null;
  // Agent commission — panel form rejects 0. 365 is the prod-most-common
  // value for low-bracket customers; we set 300 as the Primundus default.
  commission_agent_salary?: number;
  // arrival_at — Customer-level, separate from JobOffer.arrival_at.
  // Required by the "complete state" gate in Mamamia's customer-active
  // check (Laravel: $customer->arrival_at && ...).
  arrival_at?: string;
  departure_at?: string;
  // Visibility / publication state
  visibility?: "public" | "public_limited" | "hide";
  // Living conditions (3-5 enum values — prod-most-common as defaults)
  accommodation?: "single_family_house" | "apartment" | "other";
  caregiver_accommodated?:
    | "room_premises"
    | "area_premises"
    | "room_other_premises"
    | "area_other_premises";
  has_family_near_by?: "yes" | "no" | "not_important";
  internet?: "yes" | "no";
  pets?: "yes" | "no" | "no_information";
  is_pet_dog?: boolean;
  is_pet_cat?: boolean;
  is_pet_other?: boolean;
  other_people_in_house?: "yes" | "no";
  smoking_household?: "yes" | "yes_outside" | "no";
  // Job description (de/en/pl — prod has all four)
  job_description?: string;
  job_description_de?: string;
  job_description_en?: string;
  job_description_pl?: string;
  // Caregiver gender preference (mirrors wish.gender in active customers)
  gender?: "male" | "female" | "not_important";
  // Nested
  patients: PatientInput[];
  customer_caregiver_wish?: CaregiverWishInput;
  customer_contract?: CustomerContractInput;
  invoice_contract?: CustomerContractInput;
  customer_contacts?: CustomerContactInput[];
}

export interface OnboardResult {
  customer_id: number;
  job_offer_id: number;
}

// Re-export SessionPayload from _shared to keep onboard consumers stable
export type { SessionPayload } from "../_shared/sessionTypes.ts";
