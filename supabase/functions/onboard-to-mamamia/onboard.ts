import type { Lead, OnboardResult } from "./types.ts";
import type { SessionPayload } from "../_shared/sessionTypes.ts";
import {
  buildCustomerInput,
  buildJobOfferTitle,
  computeArrivalDate,
  extractPlzFromLead,
} from "./mappers.ts";
import { getOrRefreshAgencyToken, mamamiaRequest } from "../_shared/mamamiaClient.ts";

// ─── Supabase-like interface (dependency injection for testability) ────────

export interface SupabaseLike {
  fetchLead(token: string): Lead | null | Promise<Lead | null>;
  updateLead(id: string, patch: Partial<Lead>): void | Promise<void>;
}

// ─── Secrets bundle ─────────────────────────────────────────────────────────

export interface OnboardSecrets {
  supabaseUrl: string;
  supabaseServiceKey: string;
  mamamiaEndpoint: string;
  mamamiaAuthEndpoint: string;
  mamamiaAgencyEmail: string;
  mamamiaAgencyPassword: string;
  sessionJwtSecret: string;
}

// ─── Options ────────────────────────────────────────────────────────────────

export interface OnboardOptions {
  leadToken: string;
  secrets: OnboardSecrets;
  supabase: SupabaseLike;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

// ─── GraphQL mutations ─────────────────────────────────────────────────────
// Full StoreCustomer payload — every must-fill field plus the three
// nested input types (CustomerCaregiverWishInputType,
// CustomerContractInputType, CustomerContactInputType) so the customer
// lands in a state that matches the prod active distribution.
//
// Field selection driven by docs/mamamia-customer-fields-map.md fill-rate
// diff: every column at >=99% in active customers is set here.

const STORE_CUSTOMER = /* GraphQL */ `
  mutation StoreCustomer(
    $first_name: String, $last_name: String, $email: String, $phone: String,
    $location_id: Int, $urbanization_id: Int, $language_id: Int,
    $equipment_ids: [Int], $day_care_facility: String,
    $care_budget: Float, $monthly_salary: Float, $commission_agent_salary: Float,
    $arrival_at: String,
    $visibility: String,
    $accommodation: String, $caregiver_accommodated: String,
    $has_family_near_by: String, $internet: String, $pets: String,
    $is_pet_dog: Boolean, $is_pet_cat: Boolean, $is_pet_other: Boolean,
    $other_people_in_house: String, $smoking_household: String,
    $job_description: String, $job_description_de: String,
    $job_description_en: String, $job_description_pl: String,
    $gender: String,
    $patients: [PatientInputType],
    $customer_caregiver_wish: CustomerCaregiverWishInputType,
    $customer_contract: CustomerContractInputType,
    $invoice_contract: CustomerContractInputType,
    $customer_contacts: [CustomerContactInputType]
  ) {
    StoreCustomer(
      first_name: $first_name, last_name: $last_name, email: $email, phone: $phone,
      location_id: $location_id, urbanization_id: $urbanization_id, language_id: $language_id,
      equipment_ids: $equipment_ids, day_care_facility: $day_care_facility,
      care_budget: $care_budget, monthly_salary: $monthly_salary,
      commission_agent_salary: $commission_agent_salary,
      arrival_at: $arrival_at,
      visibility: $visibility,
      accommodation: $accommodation, caregiver_accommodated: $caregiver_accommodated,
      has_family_near_by: $has_family_near_by, internet: $internet, pets: $pets,
      is_pet_dog: $is_pet_dog, is_pet_cat: $is_pet_cat, is_pet_other: $is_pet_other,
      other_people_in_house: $other_people_in_house, smoking_household: $smoking_household,
      job_description: $job_description, job_description_de: $job_description_de,
      job_description_en: $job_description_en, job_description_pl: $job_description_pl,
      gender: $gender,
      patients: $patients,
      customer_caregiver_wish: $customer_caregiver_wish,
      customer_contract: $customer_contract,
      invoice_contract: $invoice_contract,
      customer_contacts: $customer_contacts
    ) { id customer_id status }
  }
`;

const LOCATIONS_QUERY = /* GraphQL */ `
  query Locations($search: String!) {
    Locations(search: $search) { id zip_code location country_code }
  }
`;

// Resolve a Mamamia location_id from a German PLZ. Returns null if no
// match or no PLZ supplied — caller falls back to location_custom_text.
async function lookupLocationId(args: {
  endpoint: string;
  token: string;
  plz: string | null;
  fetchFn: typeof fetch;
}): Promise<number | null> {
  if (!args.plz) return null;
  try {
    const r = await mamamiaRequest<{
      Locations: Array<{ id: number; zip_code: string; location: string; country_code: string }>;
    }>({
      endpoint: args.endpoint,
      token: args.token,
      query: LOCATIONS_QUERY,
      variables: { search: args.plz },
      fetchFn: args.fetchFn,
    });
    // Prefer DE matches; otherwise take the first.
    const de = r.Locations.find(l => l.country_code === "DE");
    return (de ?? r.Locations[0])?.id ?? null;
  } catch (_) {
    // Lookup failure is non-fatal — fallback to custom_text.
    return null;
  }
}

const STORE_JOB_OFFER = /* GraphQL */ `
  mutation StoreJobOffer(
    $customer_id: Int, $service_agency_id: Int,
    $title: String, $description: String,
    $salary_offered: Float, $salary_commission: Float,
    $visibility: String,
    $arrival_at: String
  ) {
    StoreJobOffer(
      customer_id: $customer_id, service_agency_id: $service_agency_id,
      title: $title, description: $description,
      salary_offered: $salary_offered, salary_commission: $salary_commission,
      visibility: $visibility,
      arrival_at: $arrival_at
    ) { id job_offer_id title status }
  }
`;

// Primundus agency id (ServiceAgency w Mamamia beta — zarejestrowany 2026-04-23)
const PRIMUNDUS_AGENCY_ID = 18;

// ─── Main flow ─────────────────────────────────────────────────────────────

export async function onboardLead(opts: OnboardOptions): Promise<OnboardResult & { lead_id: string; email: string }> {
  const { leadToken, secrets, supabase, fetchFn = globalThis.fetch, now = () => new Date() } = opts;

  // 1. Lookup lead
  const lead = await supabase.fetchLead(leadToken);
  if (!lead) {
    throw new Error("lead token expired or invalid");
  }

  // 2. Validate token not expired (defense in depth; fetchLead should filter too)
  if (lead.token_expires_at) {
    const expiresAt = new Date(lead.token_expires_at).getTime();
    if (expiresAt < now().getTime()) {
      throw new Error("lead token expired or invalid");
    }
  }

  // 3. Cache hit?
  if (lead.mamamia_customer_id && lead.mamamia_job_offer_id) {
    return {
      customer_id: lead.mamamia_customer_id,
      job_offer_id: lead.mamamia_job_offer_id,
      lead_id: lead.id,
      email: lead.email,
    };
  }

  // 4. Login as agency (cached)
  const agencyToken = await getOrRefreshAgencyToken({
    authEndpoint: secrets.mamamiaAuthEndpoint,
    email: secrets.mamamiaAgencyEmail,
    password: secrets.mamamiaAgencyPassword,
    fetchFn,
  });

  // 5. Resolve location_id — primarily from lead.patient_zip (set during
  //    Primundus stage-B "Betreuung beauftragen" form), with formularDaten
  //    fallback. Lookup is best-effort: failure → null → contracts use
  //    location_custom_text fallback in buildContractFromLead.
  const plz = extractPlzFromLead(lead);
  const locationId = await lookupLocationId({
    endpoint: secrets.mamamiaEndpoint,
    token: agencyToken,
    plz,
    fetchFn,
  });

  // 6. StoreCustomer — full payload (customer + wish + patients + contracts + contacts)
  const nowISO = now().toISOString();
  const customerInput = buildCustomerInput(lead, locationId, nowISO);

  const customerResp = await mamamiaRequest<{
    StoreCustomer: { id: number; customer_id: string; status: string };
  }>({
    endpoint: secrets.mamamiaEndpoint,
    token: agencyToken,
    query: STORE_CUSTOMER,
    variables: customerInput as unknown as Record<string, unknown>,
    fetchFn,
  });

  const mamamiaCustomerId = customerResp.StoreCustomer.id;
  const careBudget = lead.kalkulation?.bruttopreis ?? null;

  // 7. StoreJobOffer — arrival_at must match Customer.arrival_at (set above)
  const arrivalAt = computeArrivalDate(lead.care_start_timing, nowISO);
  const title = buildJobOfferTitle(lead);

  const joResp = await mamamiaRequest<{
    StoreJobOffer: { id: number; job_offer_id: string; title: string; status: string };
  }>({
    endpoint: secrets.mamamiaEndpoint,
    token: agencyToken,
    query: STORE_JOB_OFFER,
    variables: {
      customer_id: mamamiaCustomerId,
      service_agency_id: PRIMUNDUS_AGENCY_ID,
      title,
      description: "Auto-created from Primundus kostenrechner",
      salary_offered: careBudget,
      salary_commission: 300,   // Primundus default commission, panel rejects 0
      visibility: "public",
      arrival_at: arrivalAt,
    },
    fetchFn,
  });

  const mamamiaJobOfferId = joResp.StoreJobOffer.id;

  // 7. Persist cache in Supabase
  await supabase.updateLead(lead.id, {
    mamamia_customer_id: mamamiaCustomerId,
    mamamia_job_offer_id: mamamiaJobOfferId,
    mamamia_user_token: agencyToken,
    mamamia_onboarded_at: now().toISOString(),
  });

  return {
    customer_id: mamamiaCustomerId,
    job_offer_id: mamamiaJobOfferId,
    lead_id: lead.id,
    email: lead.email,
  };
}

// Build session payload ready for JWT signing (used by handler after onboarding)
export function sessionPayloadFromResult(
  result: OnboardResult & { lead_id: string; email: string },
): SessionPayload {
  return {
    customer_id: result.customer_id,
    job_offer_id: result.job_offer_id,
    lead_id: result.lead_id,
    email: result.email,
  };
}
