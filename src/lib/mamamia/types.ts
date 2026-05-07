// Types mirroring mamamia-proxy GraphQL responses (subset of Mamamia schema).

export interface MamamiaSession {
  customer_id: number;
  job_offer_id: number;
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
  customer_contracts?: MamamiaCustomerContract[];
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
  avatar_retouched: { aws_url: string | null } | null;
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
  hp_recent_assignments?: Array<{
    arrival_date: string | null;
    departure_date: string | null;
    postal_code: string | null;
    city: string | null;
    status: string | null;
  }>;
}

export interface MamamiaApplication {
  id: number;
  caregiver_id: number;
  job_offer_id: number;
  parent_id: number | null;
  is_counter_offer: boolean | null;
  salary: number | null;
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
