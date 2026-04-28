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
      phone
      language_id
      location_id
      location_custom_text
      job_description
      arrival_at
      departure_at
      care_budget
      gender
      year_of_birth
      accommodation
      other_people_in_house
      has_family_near_by
      smoking_household
      internet
      urbanization_id
      patients {
        id
        gender
        year_of_birth
        care_level
        mobility_id
        weight
        height
        night_operations
        dementia
        incontinence
        incontinence_feces
        incontinence_urine
        smoking
        lift_id
      }
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
// Pulls every Mamamia-provided field the modal renders, replacing the
// previous mockProfile() fake-data path (CLAUDE.md §1).
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
      weight
      height
      marital_status
      smoking
      driving_license
      is_nurse
      education
      qualifications
      further_hobbies
      motivation
      about_de
      nationality { nationality }
      hobbies { hobby }
      personalities { personality }
      mobilities { mobility }
      languagables { level language { name } }
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

// K5 — customer rejects a caregiver application.
export const REJECT_APPLICATION = /* GraphQL */ `
  mutation RejectApplication($id: Int, $reject_message: String) {
    RejectApplication(id: $id, reject_message: $reject_message) {
      id
      rejected_at
      reject_message
    }
  }
`;

// K5 — customer accepts application (creates binding Confirmation).
// contract_patient / contract_contact map 1:1 from AngebotPruefenModal step 2.
export const STORE_CONFIRMATION = /* GraphQL */ `
  mutation StoreConfirmation(
    $application_id: Int
    $message: String
    $is_confirm_binding: Boolean
    $contract_patient: ContractPatientInputType
    $contract_contact: ContractContactInputType
    $patient_contracts: [ContractPatientInputType]
    $contract_contacts: [ContractContactInputType]
    $update_customer: Boolean
    $file_tokens: [String]
  ) {
    StoreConfirmation(
      application_id: $application_id
      message: $message
      is_confirm_binding: $is_confirm_binding
      contract_patient: $contract_patient
      contract_contact: $contract_contact
      patient_contracts: $patient_contracts
      contract_contacts: $contract_contacts
      update_customer: $update_customer
      file_tokens: $file_tokens
    ) {
      id
      application_id
      is_confirm_binding
    }
  }
`;

// K7 — agency-side caregiver invite. This is the mutation the Mamamia panel
// UI fires when an agency admin clicks "wyślij zaproszenie" on a customer's
// matching list (verified live on beta 2026-04-28 by inspecting DevTools).
// Auth context: panel /backend/graphql + agency-only session cookie.
//
// Earlier hypotheses (now resolved/discarded):
//   - SendInvitationCaregiver — that's the customer-side mutation; auth.user
//     must be the customer. Useless under agency-mode. Removed.
//   - SendInvitationCustomer + magic-link — was the K6 approach;
//     superseded by direct panel-mode invite once Customer.arrival_at flipped
//     status to 'active' so panel-side policy permits StoreRequest.
//   - ImpersonateCustomer + customer-mode panel — was the K7 hypothesis;
//     turned out unnecessary, agency-only panel session works.
export const STORE_REQUEST = /* GraphQL */ `
  mutation StoreRequest($caregiver_id: Int, $job_offer_id: Int, $message: String) {
    StoreRequest(
      caregiver_id: $caregiver_id
      job_offer_id: $job_offer_id
      message: $message
    ) {
      id
      caregiver_id
      job_offer_id
      message
      created_at
    }
  }
`;

// K4 — patient form persistence. id from session (not variables) — ownership.
// Field set extended after 2026-04-28 mapping audit: pets/urbanization_id/
// caregiver_accommodated/day_care_facility now propagate from the form,
// and customer_caregiver_wish carries the caregiver-side prefs (gender,
// smoking, tasks, other_wishes) instead of leaking into smoking_household
// and job_description.
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
    $caregiver_accommodated: String
    $other_people_in_house: String
    $has_family_near_by: String
    $smoking_household: String
    $internet: String
    $day_care_facility: String
    $caregiver_time_off: String
    $pets: String
    $is_pet_dog: Boolean
    $is_pet_cat: Boolean
    $is_pet_other: Boolean
    $patients: [PatientInputType]
    $customer_caregiver_wish: CustomerCaregiverWishInputType
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
      caregiver_accommodated: $caregiver_accommodated
      other_people_in_house: $other_people_in_house
      has_family_near_by: $has_family_near_by
      smoking_household: $smoking_household
      internet: $internet
      day_care_facility: $day_care_facility
      caregiver_time_off: $caregiver_time_off
      pets: $pets
      is_pet_dog: $is_pet_dog
      is_pet_cat: $is_pet_cat
      is_pet_other: $is_pet_other
      patients: $patients
      customer_caregiver_wish: $customer_caregiver_wish
    ) {
      id
      customer_id
    }
  }
`;
