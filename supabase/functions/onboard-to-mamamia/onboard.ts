import type { Lead, OnboardResult, SessionPayload } from "./types.ts";
import { buildJobOfferTitle, buildPatients, computeArrivalDate } from "./mappers.ts";
import { getOrRefreshAgencyToken, mamamiaRequest } from "./mamamiaClient.ts";

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

const STORE_CUSTOMER = /* GraphQL */ `
  mutation StoreCustomer(
    $first_name: String, $last_name: String, $email: String,
    $location_id: Int, $care_budget: Float,
    $patients: [PatientInputType]
  ) {
    StoreCustomer(
      first_name: $first_name, last_name: $last_name, email: $email,
      location_id: $location_id, care_budget: $care_budget,
      patients: $patients
    ) { id customer_id status }
  }
`;

const STORE_JOB_OFFER = /* GraphQL */ `
  mutation StoreJobOffer(
    $customer_id: Int, $service_agency_id: Int,
    $title: String, $description: String,
    $salary_offered: Float, $arrival_at: String
  ) {
    StoreJobOffer(
      customer_id: $customer_id, service_agency_id: $service_agency_id,
      title: $title, description: $description,
      salary_offered: $salary_offered, arrival_at: $arrival_at
    ) { id job_offer_id title status }
  }
`;

// Primundus agency id (ServiceAgency w Mamamia beta — zarejestrowany 2026-04-23)
const PRIMUNDUS_AGENCY_ID = 18;

// ─── Main flow ─────────────────────────────────────────────────────────────

export async function onboardLead(opts: OnboardOptions): Promise<OnboardResult & { lead_id: string }> {
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
    };
  }

  // 4. Login as agency (cached)
  const agencyToken = await getOrRefreshAgencyToken({
    authEndpoint: secrets.mamamiaAuthEndpoint,
    email: secrets.mamamiaAgencyEmail,
    password: secrets.mamamiaAgencyPassword,
    fetchFn,
  });

  // 5. StoreCustomer
  const formularDaten = lead.kalkulation?.formularDaten ?? {};
  const patients = buildPatients(formularDaten);
  const careBudget = lead.kalkulation?.bruttopreis ?? null;

  const customerResp = await mamamiaRequest<{
    StoreCustomer: { id: number; customer_id: string; status: string };
  }>({
    endpoint: secrets.mamamiaEndpoint,
    token: agencyToken,
    query: STORE_CUSTOMER,
    variables: {
      first_name: lead.vorname,
      last_name: lead.nachname,
      email: lead.email,
      // location_id: TODO — wymaga lookup przez Locations(search); na MVP null
      location_id: null,
      care_budget: careBudget,
      patients,
    },
    fetchFn,
  });

  const mamamiaCustomerId = customerResp.StoreCustomer.id;

  // 6. StoreJobOffer
  const arrivalAt = computeArrivalDate(lead.care_start_timing, now().toISOString());
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
  };
}

// Build session payload ready for JWT signing (used by handler after onboarding)
export function sessionPayloadFromResult(result: OnboardResult & { lead_id: string }): SessionPayload {
  return {
    customer_id: result.customer_id,
    job_offer_id: result.job_offer_id,
    lead_id: result.lead_id,
  };
}
