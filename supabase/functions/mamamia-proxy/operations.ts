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

// Multi-Job sync query (GET_CUSTOMER_JOB_OFFERS) lives in
// ../_shared/leadJobsSync.ts — shared with the detect-caregiver-events cron.

// GET_CUSTOMER pulls every field the in-portal patient-form wizard
// needs to seed itself. Without these we'd silently fall back to the
// calculator's stage-A formularDaten prefill — which can drift from the
// real Mamamia state if anyone edited the customer (panel admin, an
// earlier UpdateCustomer save, etc.).
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
      job_description_de
      job_description_en
      job_description_pl
      arrival_at
      departure_at
      care_budget
      gender
      year_of_birth
      accommodation
      caregiver_accommodated
      other_people_in_house
      has_family_near_by
      smoking_household
      internet
      urbanization_id
      pets
      is_pet_dog
      is_pet_cat
      is_pet_other
      day_care_facility
      day_care_facility_description
      day_care_facility_description_de
      day_care_facility_description_en
      day_care_facility_description_pl
      patients {
        id
        gender
        year_of_birth
        care_level
        mobility_id
        weight
        height
        night_operations
        night_operations_description
        night_operations_description_de
        night_operations_description_en
        night_operations_description_pl
        dementia
        dementia_description
        dementia_description_de
        dementia_description_en
        dementia_description_pl
        incontinence
        incontinence_feces
        incontinence_urine
        smoking
        lift_id
        lift_description
        lift_description_de
        lift_description_en
        lift_description_pl
        features_condition
        features_condition_de
        features_condition_en
        features_condition_pl
        other_tools
        other_tools_de
        other_tools_en
        other_tools_pl
        lift_mobility_description
        lift_mobility_description_de
        lift_mobility_description_en
        lift_mobility_description_pl
      }
      customer_caregiver_wish {
        id
        gender
        germany_skill
        driving_license
        driving_license_gearbox
        smoking
        shopping
        tasks
        other_wishes
      }
      customer_contract {
        id
        salutation
        first_name
        last_name
        phone
        email
        location_id
        zip_code
        city
        street_number
      }
      equipments {
        id
        equipment
      }
      # Gebucht-Ableitung (Fix Hagedorn 2026-07-15): akzeptiert die AGENTUR
      # eine Bewerbung im SA-Portal, entsteht KEINE
      # lead_application_acceptances-Zeile und Mamamia entfernt die Bewerbung
      # aus listApplications — der einzige sichtbare Beleg ist
      # JobOffer.final_confirmation. Feld-Kombination prod-verifiziert (das
      # SA-Portal fragt exakt diese final_confirmation-Felder täglich ab;
      # job_offers-Basisfelder wie in _shared/leadJobsSync.ts).
      job_offers {
        id
        arrival_at
        departure_at
        salary_offered
        status
        final_confirmation {
          id
          final_confirmed_at
          caregiver {
            id
            first_name
            last_name
          }
        }
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
        # 'message' intentionally NOT fetched. Defense in depth for the
        # AppCard / AngebotPruefenModal redaction — Mamamia's application
        # message field carries agency-internal back-office notes (caregiver
        # full name, phone, salary breakdown DLV/PK Netto/RK, ID stubs like
        # pr-XXXX-N). Verified live 2026-05-19 on Customer 8546 application
        # 7997. By dropping the field at the GraphQL boundary the data
        # never crosses the proxy, even if the frontend regresses.
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
          avatar { aws_url }
          avatar_retouched_promo { aws_url }
          avatar_retouched { aws_url }
        }
      }
    }
  }
`;

// K3b — interests on a JobOffer. Mamamia "Interest" = caregiver expressed
// soft interest via panel (precursor to formal application). Schema:
//   JobOffer { interests: [Interest] }; Interest { id, caregiver_id,
//   rejected_at, caregiver, ... }. We surface non-rejected interests in
//   the portal so customers can invite (StoreRequest) or dismiss locally.
// Nested caregiver mirrors LIST_APPLICATIONS shape so mapCaregiverToNurse
// works without a separate fetch. about_de omitted — portal uses AI overlay.
export const LIST_INTERESTS = /* GraphQL */ `
  query ListInterests($id: Int!) {
    JobOffer(id: $id) {
      id
      interests {
        id
        caregiver_id
        rejected_at
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
          hp_caregiver_id
          hp_total_jobs
          hp_total_days
          hp_avg_mission_days
          avatar { aws_url }
          avatar_retouched_promo { aws_url }
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
          avatar { aws_url }
          avatar_retouched_promo { aws_url }
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
      hp_caregiver_id
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
      avatar { aws_url }
      avatar_retouched_promo { aws_url }
      avatar_retouched { aws_url }
      hp_recent_assignments(limit: 5) {
        arrival_date
        departure_date
        postal_code
        city
        status
      }
    }
    # Reference/certificate uploads. NB: the Caregiver.certificates RELATION
    # 500s the Mamamia backend ("Internal server error") — verified live on
    # prod CG 12082 + beta CG 10099. The top-level CaregiverCertificates
    # query is the working path (same source the Mamamia UI uses; also
    # carries description + valid_from). See reference-builder
    # docs/mamamia-integration.md §4.1.
    CaregiverCertificates(caregiver_id: $id) {
      id
      description
      valid_from
      file { original_name aws_url created_at mime_type }
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

// Regenerate the caregiver's German "about" text on Mamamia's side. LLM-write
// (costs) → the portal only calls this when about_de is stale (length ≤ 200).
// translate_to_pl=false — the portal is German-only. Reply carries the fresh
// about_de (> 200) + motivation (generated together).
export const GENERATE_CAREGIVER_GERMAN_DESCRIPTION = /* GraphQL */ `
  mutation GenerateCaregiverGermanDescription($id: Int!, $translate_to_pl: Boolean) {
    GenerateCaregiverGermanDescription(id: $id, translate_to_pl: $translate_to_pl) {
      id
      about_de
      motivation
    }
  }
`;

// Invited caregivers — lightweight Set source-of-truth. Mamamia exposes
// Matching.is_request as null in the default field selection, but the
// `filters: {is_request: true}` server-side filter on
// JobOfferMatchingsWithPagination correctly returns only matchings that
// have a Request row backing them. We use that filter to derive the set
// of caregiver IDs the portal should render with status='invited'.
export const LIST_INVITED_CAREGIVER_IDS = /* GraphQL */ `
  query ListInvitedCaregiverIds($job_offer_id: Int!) {
    JobOfferMatchingsWithPagination(
      job_offer_id: $job_offer_id
      filters: { is_request: true }
      limit: 100
      page: 1
    ) {
      total
      data {
        caregiver { id }
      }
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
//
// 2026-05-07 (Bug #13k): added day_care_facility_description{,_de,_en,_pl}.
// Verified live (introspection + sanity Customer 7659): schema accepts.
// Pre-Bug-#13k pflegedienst frequency+tasks were stuffed into
// job_description as `Pflegedienst: <freq>: <tasks>` segment because
// gotcha #2 (2026-05-05) said the dedicated args broke the mutation.
// Schema changed since — empirical verification supersedes the gotcha.
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
    $job_description_de: String
    $accommodation: String
    $caregiver_accommodated: String
    $other_people_in_house: String
    $has_family_near_by: String
    $smoking_household: String
    $internet: String
    $day_care_facility: String
    $day_care_facility_description: String
    $day_care_facility_description_de: String
    $caregiver_time_off: String
    $pets: String
    $is_pet_dog: Boolean
    $is_pet_cat: Boolean
    $is_pet_other: Boolean
    $equipment_ids: [Int]
    $patients: [PatientInputType]
    $customer_caregiver_wish: CustomerCaregiverWishInputType
    $customer_contract: CustomerContractInputType
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
      job_description_de: $job_description_de
      accommodation: $accommodation
      caregiver_accommodated: $caregiver_accommodated
      other_people_in_house: $other_people_in_house
      has_family_near_by: $has_family_near_by
      smoking_household: $smoking_household
      internet: $internet
      day_care_facility: $day_care_facility
      day_care_facility_description: $day_care_facility_description
      day_care_facility_description_de: $day_care_facility_description_de
      caregiver_time_off: $caregiver_time_off
      pets: $pets
      is_pet_dog: $is_pet_dog
      is_pet_cat: $is_pet_cat
      is_pet_other: $is_pet_other
      equipment_ids: $equipment_ids
      patients: $patients
      customer_caregiver_wish: $customer_caregiver_wish
      customer_contract: $customer_contract
    ) {
      id
      customer_id
    }
  }
`;

// UpdateJobOfferDates — dedykowana Mamamia mutation do edycji
// JobOffer.arrival_at + JobOffer.departure_at po onboard. Initial
// arrival_at jest computed w onboard (`computeArrivalDate(care_start_timing)`)
// jako fuzzy offset. Dodane 2026-05-26: po PR #207 Marcin dodał pole
// "Voraussichtliches Startdatum" w step 5 patient formularza — wartość
// usera (konkretna data) wygrywa nad onboard-computed fuzzy.
//
// Schema (verified live via Mamamia GraphQL introspection 2026-05-26):
//   mutation UpdateJobOfferDates(
//     id: Int!            (= JobOffer.id)
//     customer_id: Int!   (= Customer.id)
//     arrival_at: String  (ISO YYYY-MM-DD lub null)
//     departure_at: String
//   ): JobOffer
export const UPDATE_JOB_OFFER_DATES = /* GraphQL */ `
  mutation UpdateJobOfferDates(
    $id: Int!
    $customer_id: Int!
    $arrival_at: String
    $departure_at: String
  ) {
    UpdateJobOfferDates(
      id: $id
      customer_id: $customer_id
      arrival_at: $arrival_at
      departure_at: $departure_at
    ) {
      id
      job_offer_id
      arrival_at
      departure_at
    }
  }
`;

// Unterschriebenen Vertrag an die Confirmation haengen — Schritt 2 nach
// StoreFile (Multipart, siehe actions.storeFileAsAgency). Gleiches Muster
// wie im SA-Portal live verifiziert: UpdateConfirmation verlangt zusaetzlich
// application_id + is_confirm_binding (Resolver-Pflicht); file_tokens wird
// serverseitig auf signed_contract geroutet.
export const UPDATE_CONFIRMATION_FILES = /* GraphQL */ `
  mutation UpdateConfirmation($id: Int, $application_id: Int, $is_confirm_binding: Boolean, $file_tokens: [String]) {
    UpdateConfirmation(id: $id, application_id: $application_id, is_confirm_binding: $is_confirm_binding, file_tokens: $file_tokens) {
      id
      signed_contract { id original_name }
    }
  }
`;
