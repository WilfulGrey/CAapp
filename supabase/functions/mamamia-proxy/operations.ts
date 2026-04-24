// GraphQL query + mutation strings for mamamia-proxy actions.
// Kept in one file for simplicity; can be split per-action later.

export const GET_JOB_OFFER = /* GraphQL */ `
  query GetJobOffer($id: Int!) {
    JobOffer(id: $id) {
      id
      job_offer_id
      status
      title
      salary_offered
      arrival_at
      departure_at
      applications_count
      confirmations_count
      created_at
    }
  }
`;

export const GET_CUSTOMER = /* GraphQL */ `
  query GetCustomer($id: Int!) {
    Customer(id: $id) {
      id
      customer_id
      status
      first_name
      last_name
      email
      location_id
      location_custom_text
      job_description
      arrival_at
      departure_at
      care_budget
    }
  }
`;

// K3 — list applications for customer's job_offer_id (ownership via session).
// Mamamia returns AnonymousApplication for customer-facing queries —
// agency-side fields (rejected_at/reject_type/is_active/is_reserved) stripped.
export const LIST_APPLICATIONS = /* GraphQL */ `
  query ListApplications($job_offer_id: Int!, $limit: Int, $page: Int) {
    JobOfferApplicationsWithPagination(
      job_offer_id: $job_offer_id
      limit: $limit
      page: $page
    ) {
      total
      data {
        id
        caregiver_id
        job_offer_id
        parent_id
        is_counter_offer
        salary
        message
        arrival_at
        departure_at
        arrival_fee
        departure_fee
        holiday_surcharge
        active_until_at
        caregiver {
          id
          first_name
          last_name
          gender
          year_of_birth
          birth_date
          germany_skill
          care_experience
          available_from
          last_contact_at
          last_login_at
          is_active_user
          hp_total_jobs
          hp_total_days
          hp_avg_mission_days
          avatar_retouched { aws_url }
        }
      }
    }
  }
`;

// K3 — matchings (personalised by JobOffer).
// JobOfferMatchingFiltersInputType only has boolean status flags
// (is_request, is_like, is_match, is_rejected etc.) — NO gender/language filter.
// Client-side filtering for wunschGeschlecht happens in frontend mapper.
export const LIST_MATCHINGS = /* GraphQL */ `
  query ListMatchings(
    $job_offer_id: Int!
    $limit: Int
    $page: Int
    $filters: JobOfferMatchingFiltersInputType
    $order_by: String
  ) {
    JobOfferMatchingsWithPagination(
      job_offer_id: $job_offer_id
      limit: $limit
      page: $page
      filters: $filters
      order_by: $order_by
    ) {
      total
      data {
        id
        percentage_match
        is_show
        is_best_matching
        caregiver {
          id
          first_name
          last_name
          gender
          year_of_birth
          birth_date
          germany_skill
          care_experience
          available_from
          last_contact_at
          last_login_at
          is_active_user
          hp_total_jobs
          hp_total_days
          hp_avg_mission_days
          avatar_retouched { aws_url }
        }
      }
    }
  }
`;

// K3 — full caregiver profile (when user opens modal).
export const GET_CAREGIVER = /* GraphQL */ `
  query GetCaregiver($id: Int!) {
    Caregiver(id: $id) {
      id
      first_name
      last_name
      gender
      year_of_birth
      birth_date
      germany_skill
      care_experience
      available_from
      last_contact_at
      last_login_at
      is_active_user
      hp_total_jobs
      hp_total_days
      hp_avg_mission_days
      avatar_retouched { aws_url }
      hp_recent_assignments(limit: 5) {
        arrival_date
        departure_date
        postal_code
        city
        status
      }
    }
  }
`;

// K3 — location autocomplete for patient form.
export const SEARCH_LOCATIONS = /* GraphQL */ `
  query SearchLocations($search: String, $limit: Int, $page: Int) {
    LocationsWithPagination(search: $search, limit: $limit, page: $page) {
      data {
        id
        location
        zip_code
        country_code
      }
    }
  }
`;

// K4 — patient form persistence. id from session (not variables) — ownership.
export const UPDATE_CUSTOMER = /* GraphQL */ `
  mutation UpdateCustomer(
    $id: Int
    $first_name: String
    $last_name: String
    $email: String
    $phone: String
    $location_id: Int
    $location_custom_text: String
    $urbanization_id: Int
    $job_description: String
    $accommodation: String
    $other_people_in_house: String
    $has_family_near_by: String
    $smoking_household: String
    $internet: String
    $day_care_facility: String
    $caregiver_time_off: String
    $patients: [PatientInputType]
  ) {
    UpdateCustomer(
      id: $id
      first_name: $first_name
      last_name: $last_name
      email: $email
      phone: $phone
      location_id: $location_id
      location_custom_text: $location_custom_text
      urbanization_id: $urbanization_id
      job_description: $job_description
      accommodation: $accommodation
      other_people_in_house: $other_people_in_house
      has_family_near_by: $has_family_near_by
      smoking_household: $smoking_household
      internet: $internet
      day_care_facility: $day_care_facility
      caregiver_time_off: $caregiver_time_off
      patients: $patients
    ) {
      id
      customer_id
    }
  }
`;
