// Types mirroring mamamia-proxy GraphQL responses (subset of Mamamia schema).

export interface MamamiaSession {
  customer_id: number;
  job_offer_id: number;
}

// ─── Multi-Job (Variant A): "Alle meine Einsätze" overview ──────────────────
// One row of the lead_jobs table as surfaced by the `listLeadJobs` proxy
// action (returns `{ jobs: LeadJobRow[] }`). Mirrors the edge function's
// LeadJobRow. `status` is the STORED status; 'laufend' is NOT stored — it is
// derived client-side via deriveJobDisplayStatus().
export type LeadJobStoredStatus = 'geplant' | 'gebucht' | 'abgeschlossen' | 'storniert';
export type LeadJobDisplayStatus = 'laufend' | 'gebucht' | 'geplant' | 'abgeschlossen' | 'storniert';

export interface LeadJobRow {
  // lead_jobs.id (UUID) — the value that goes into a `?job=<id>` deep link.
  id: string;
  mamamia_job_offer_id: number;
  status: string;
  anreise: string | null; // ISO date (yyyy-mm-dd) or null
  abreise: string | null;
  position: number;
  // Card enrichment (mirrored from Mamamia into lead_jobs by the sync): booked
  // caregiver name + application count. Null when not applicable.
  pflegekraft: string | null;
  bewerbungen: number | null;
}

export interface MamamiaJobOffer {
  id: number;
  job_offer_id: string;
  status: string | null;
  title: string | null;
  salary_offered: number | null;
  arrival_at: string | null;
  departure_at: string | null;
  applications_count: number | null;
  confirmations_count: number | null;
  created_at: string;
}

// Existing patient row pulled from GetCustomer. Used both to thread
// patient.id into UpdateCustomer (so Mamamia doesn't silently drop
// fields) AND to seed the patient-form wizard with the real Mamamia
// state instead of the stale calculator prefill.
export interface MamamiaPatient {
  id: number;
  gender?: 'male' | 'female' | 'not_important' | null;
  year_of_birth?: number | null;
  care_level?: number | null;
  mobility_id?: number | null;
  weight?: string | null;
  height?: string | null;
  night_operations?: string | null;
  // Nacht-Beschreibung — im GET selektiert; Basis + _de reichen für die
  // Rückspiegelung von „Was ist in der Nacht zu machen?".
  night_operations_description?: string | null;
  night_operations_description_de?: string | null;
  dementia?: 'yes' | 'no' | null;
  dementia_description?: string | null;
  incontinence?: boolean | null;
  incontinence_feces?: boolean | null;
  incontinence_urine?: boolean | null;
  smoking?: boolean | null;
  lift_id?: number | null;
}

export interface MamamiaCaregiverWish {
  id?: number | null;
  gender?: string | null;
  germany_skill?: string | null;
  driving_license?: string | null;
  driving_license_gearbox?: string | null;
  smoking?: string | null;
  shopping?: string | null;
  tasks?: string | null;
  other_wishes?: string | null;
}

export interface MamamiaCustomerContract {
  id?: number;
  // contact_type — beta-only field, prod nie zwraca (singular customer_contract
  // jest 1:1 więc discriminator zbędny). Pole zostawione dla backward compat
  // gdyby kod gdziekolwiek go odczytywał.
  contact_type?: string | null;
  salutation?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  location_id?: number | null;
  zip_code?: string | null;
  city?: string | null;
  street_number?: string | null;
}

/** Registry #130: die drei Personen der letzten Annahme, wie die erste Annahme sie
 *  nach Mamamia schreibt (_shared/acceptanceSync.ts) — Proxy-Aktion getCustomerKontakte. */
export interface MamamiaKontaktperson {
  id?: number;
  salutation?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
}
export interface MamamiaKontakte {
  id?: number;
  customer_contracts?: MamamiaCustomerContract[] | null;
  customer_contacts?: MamamiaKontaktperson[] | null;
}

// Job-Offer-Teilmenge aus GET_CUSTOMER (Customer.job_offers). Für die
// Gebucht-Ableitung aus dem Mamamia-Stand (Fix 2026-07-15):
// akzeptiert die Agentur eine Bewerbung im SA-Portal, entsteht KEINE
// lead_application_acceptances-Zeile — JobOffer.final_confirmation ist
// dann der einzige Beleg. ALLE Felder optional (fail-soft): eine alte
// Proxy-Version ohne job_offers-Selektion darf das Verhalten nicht ändern.
export interface MamamiaFinalConfirmationRef {
  id: number;
  final_confirmed_at?: string | null;
  caregiver?: {
    id: number;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

export interface MamamiaCustomerJobOffer {
  id: number;
  arrival_at?: string | null;
  departure_at?: string | null;
  salary_offered?: number | null;
  status?: string | null;
  final_confirmation?: MamamiaFinalConfirmationRef | null;
}

export interface MamamiaCustomer {
  id: number;
  customer_id: string;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone?: string | null;
  language_id?: number | null;
  location_id: number | null;
  location_custom_text: string | null;
  job_description: string | null;
  arrival_at: string | null;
  departure_at: string | null;
  care_budget: number | null;
  // ── Patient-form-relevant customer-level fields (added 2026-04-29) ──
  gender?: string | null;
  year_of_birth?: number | null;
  accommodation?: string | null;
  caregiver_accommodated?: string | null;
  other_people_in_house?: string | null;
  has_family_near_by?: string | null;
  smoking_household?: string | null;
  internet?: string | null;
  urbanization_id?: number | null;
  pets?: string | null;
  is_pet_dog?: boolean | null;
  is_pet_cat?: boolean | null;
  is_pet_other?: boolean | null;
  day_care_facility?: string | null;
  // Bug #13k (2026-05-07): mutation now accepts these args (verified live
  // via introspection + Customer 7659 sanity). Frontend reads from these
  // dedicated fields instead of parsing `Pflegedienst:` segment from
  // job_description. Legacy customers with the segment still parse via
  // reverse mapper fallback for backward compat.
  day_care_facility_description?: string | null;
  day_care_facility_description_de?: string | null;
  day_care_facility_description_en?: string | null;
  day_care_facility_description_pl?: string | null;
  /** Patients — full shape for prefill, not just { id }. */
  patients?: MamamiaPatient[];
  customer_caregiver_wish?: MamamiaCaregiverWish | null;
  // Singular = pierwszy wiersz z `customer_contracts` (patient_contact).
  customer_contract?: MamamiaCustomerContract | null;
  /** Accommodation equipment — fetched by GET_CUSTOMER as `equipments { id equipment }`.
   *  id=1 = Own TV, id=2 = Own Bathroom. Used to prefill the `badezimmer` field. */
  equipments?: Array<{ id: number; equipment?: string | null }> | null;
  /** Jobs des Kunden inkl. final_confirmation — nur gefüllt, wenn der Proxy
   *  die job_offers-Selektion schon kennt (fail-soft, s. MamamiaCustomerJobOffer). */
  job_offers?: MamamiaCustomerJobOffer[] | null;
}

export interface MamamiaCaregiverRef {
  id: number;
  first_name: string | null;
  last_name: string | null;
  gender: 'male' | 'female' | null;
  year_of_birth: number | null;
  birth_date: string | null;
  germany_skill: string | null; // "level_0".."level_4"
  care_experience: string | null;
  available_from: string | null;
  last_contact_at: string | null;
  last_login_at: string | null;
  is_active_user: boolean | null;
  hp_total_jobs: number | null;
  hp_total_days: number | null;
  hp_avg_mission_days: number | null;
  // avatar = Roh-Upload, avatar_retouched = KI-verbessert,
  // avatar_retouched_promo = Promo-Retusche (höchste Priorität). Mamamia
  // retuschiert nur einen Teil, viele (v.a. erfahrene) Pflegekräfte haben
  // `avatar` aber KEIN `avatar_retouched` → wurden bei uns fälschlich ohne Foto
  // angezeigt. Foto-Queue promo → retouched → raw im Mapper + rankComparator.
  // Alle drei sind einzelne File-Relationen, sicher selektierbar (anders als die
  // `[File]`-Relation `certificates`, die den Backend 500t). promo optional →
  // bestehende Fixtures ohne das Feld kompilieren weiter.
  avatar: { aws_url: string | null } | null;
  avatar_retouched: { aws_url: string | null } | null;
  avatar_retouched_promo?: { aws_url: string | null } | null;
  // Caregiver document uploads. We surface only reference PDFs
  // (original_name matching `Referenz_*.pdf`) — the newest one becomes
  // Nurse.referencePdfUrl. Fetched by LIST_MATCHINGS / LIST_APPLICATIONS /
  // GET_CAREGIVER so the "Referenzen" badge works in cards + profile modal.
  certificates?: Array<{
    original_name: string | null;
    aws_url: string | null;
    created_at: string | null;
    mime_type: string | null;
  }> | null;
}

export interface MamamiaCaregiverFull extends MamamiaCaregiverRef {
  // Extra profile fields fetched by GET_CAREGIVER (used by CustomerNurseModal).
  weight?: string | null;
  height?: string | null;
  marital_status?: string | null;
  smoking?: 'no' | 'yes' | 'yes_outside' | null;
  driving_license?: string | null;
  is_nurse?: boolean | null;
  education?: string | null;
  qualifications?: string | null;
  further_hobbies?: string | null;
  motivation?: string | null;
  about_de?: string | null;
  nationality?: { nationality: string | null } | null;
  hobbies?: Array<{ hobby: string | null }>;
  personalities?: Array<{ personality: string | null }>;
  mobilities?: Array<{ mobility: string | null }>;
  languagables?: Array<{ level: string | null; language: { name: string | null } | null }>;
  /** Einsätze aus CaregiverDeparturesWithPagination (Proxy getCaregiver,
   *  Registry #126). status accepted | on_job | finish. Ohne customer_id. */
  einsaetze?: Array<{
    arrival_date: string | null;
    departure_date: string | null;
    duration_days: number | null;
    status: string | null;
    zip_code: string | null;
    city: string | null;
  }>;
  /** Gerade bei einem ANDEREN Kunden im Einsatz (status on_job). */
  on_other_job?: boolean;
  /** Departures-Abfrage gescheitert — Profil lebt, Liste nicht. */
  einsaetze_error?: string;
}

export interface MamamiaApplication {
  id: number;
  caregiver_id: number;
  job_offer_id: number;
  parent_id: number | null;
  is_counter_offer: boolean | null;
  salary: number | null;
  // Hinweis des Rekruters — geht seit 2026-07-22 VERBATIM an den Kunden
  // (Registry #22): keine LLM-Redaktion, kein Filter. Anzeige: AppCard +
  // AngebotPruefenModal, Label „Hinweis der Agentur".
  message: string | null;
  arrival_at: string | null;
  departure_at: string | null;
  arrival_fee: number | null;
  departure_fee: number | null;
  holiday_surcharge: number | null;
  active_until_at: string | null;
  caregiver: MamamiaCaregiverRef;
}

export interface MamamiaMatching {
  id: number;
  percentage_match: number | null;
  is_show: boolean | null;
  is_best_matching: boolean | null;
  caregiver: MamamiaCaregiverRef;
}

// Caregiver-side soft interest in a JobOffer (precursor to a formal
// Application). LIST_INTERESTS surfaces non-rejected interests to the
// portal so customers can invite (StoreRequest) or dismiss locally.
export interface MamamiaInterest {
  id: number;
  caregiver_id: number;
  rejected_at: string | null;
  caregiver: MamamiaCaregiverRef;
}

export interface MamamiaJobOfferInterestsResponse {
  JobOffer: {
    id: number;
    interests: MamamiaInterest[] | null;
  } | null;
}

// Customer-portal local dismiss-set returned by listDismissedCaregivers.
// Surface as a typed shape — frontend uses caregiver_ids for the Set
// filter, rows are kept around in case downstream wants the kind too.
export interface MamamiaDismissedCaregivers {
  caregiver_ids: number[];
  rows: Array<{ caregiver_id: number; kind: 'interest' | 'application' }>;
}

// Customer-portal acceptances (lead_application_acceptances). Written
// by the kostenrechner bridge endpoint when the customer confirms an
// application via AngebotPruefenModal step 2. Frontend reads on portal
// load to flip the matching Application's status to 'accepted' → existing
// BookedScreen surfaces, persists across reload.
/** Vollständiges Vertragsdaten-Objekt aus dem `contract_snapshot`-Feld
 *  (lead_application_acceptances). Wird vom AngebotPruefenModal beim
 *  Buchen geschrieben (siehe AngebotPruefenModal → buildVertragsDaten).
 *  Frontend nutzt es, um eine synthetische Application zu rekonstruieren,
 *  falls Mamamia die akzeptierte Application nicht (mehr) in
 *  listApplications zurückgibt. */
export interface MamamiaAcceptedContractSnapshot {
  datum: string;             // "11.06.2026"
  vertragsbeginn: string;    // "01.07.2026"
  voraussAbreise: string;    // "12.08.2026"
  tagessatz: string;         // "EUR 83,00"
  ag: { name: string; strasse?: string; plz?: string; ort?: string; email?: string; telefon?: string };
  le: { name: string; strasse?: string; plz?: string; ort?: string } | null;
  dl: { name: string; rolle?: string };
}

export interface MamamiaAcceptedApplicationRow {
  application_id: number;
  caregiver_id: number | null;
  accepted_at: string;
  /** Vertragsdaten zum Zeitpunkt der Annahme — wird vom Frontend genutzt,
   *  wenn Mamamia die Application nicht mehr in listApplications zurückgibt. */
  contract_snapshot: MamamiaAcceptedContractSnapshot | null;
}

export interface MamamiaAcceptedApplications {
  application_ids: number[];
  rows: MamamiaAcceptedApplicationRow[];
}

export interface MamamiaLocation {
  id: number;
  location: string;
  zip_code: string;
  country_code: string;
}

export interface PaginatedResponse<T> {
  total: number;
  data: T[];
}
