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

export interface MamamiaCustomer {
  id: number;
  customer_id: string;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  location_id: number | null;
  location_custom_text: string | null;
  job_description: string | null;
  arrival_at: string | null;
  departure_at: string | null;
  care_budget: number | null;
  /** Existing patients — used to thread patient.id when UpdateCustomer mutates them. */
  patients?: Array<{ id: number }>;
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
