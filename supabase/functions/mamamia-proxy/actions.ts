import { mamamiaRequest } from "../_shared/mamamiaClient.ts";
import { loginAsAgency, panelMutateAsCustomer } from "../_shared/mamamiaPanelClient.ts";
import type { ActionDeps, ActionHandler, ProxyAction, SessionPayload } from "./types.ts";
import {
  GET_CAREGIVER,
  GET_CUSTOMER,
  GET_JOB_OFFER,
  LIST_APPLICATIONS,
  LIST_MATCHINGS,
  REJECT_APPLICATION,
  SEARCH_LOCATIONS,
  STORE_CONFIRMATION,
  STORE_REQUEST,
  UPDATE_CUSTOMER,
} from "./operations.ts";

// ─── Helper — run GraphQL with agency token ─────────────────────────────────

async function runGraphQL<T>(
  deps: ActionDeps,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  return await mamamiaRequest<T>({
    endpoint: deps.endpoint,
    token: await deps.getAgencyToken(),
    query,
    variables,
    fetchFn: deps.fetchFn,
  });
}


// ─── Ownership-bound actions (session overrides client variables) ───────────

const getJobOffer: ActionHandler = (session, _variables, deps) =>
  runGraphQL(deps, GET_JOB_OFFER, { id: session.job_offer_id });

const getCustomer: ActionHandler = (session, _variables, deps) =>
  runGraphQL(deps, GET_CUSTOMER, { id: session.customer_id });

const listApplications: ActionHandler = (session, variables, deps) => {
  const { limit, page } = variables as { limit?: number; page?: number };
  return runGraphQL(deps, LIST_APPLICATIONS, {
    job_offer_id: session.job_offer_id,
    limit: limit ?? 20,
    page: page ?? 1,
  });
};

const listMatchings: ActionHandler = (session, variables, deps) => {
  const { limit, page, filters, order_by } = variables as {
    limit?: number;
    page?: number;
    filters?: Record<string, unknown>;
    order_by?: string;
  };
  // Only pass non-empty filters/order_by — Mamamia default if undefined.
  const payload: Record<string, unknown> = {
    job_offer_id: session.job_offer_id,
    limit: limit ?? 20,
    page: page ?? 1,
  };
  if (filters && Object.keys(filters).length > 0) payload.filters = filters;
  if (typeof order_by === "string" && order_by.length > 0) payload.order_by = order_by;
  return runGraphQL(deps, LIST_MATCHINGS, payload);
};

// ─── Public/open actions (id from variables) ────────────────────────────────

const getCaregiver: ActionHandler = async (_session, variables, deps) => {
  const id = (variables as { id?: unknown }).id;
  if (typeof id !== "number") throw new Error("id required");
  return await runGraphQL(deps, GET_CAREGIVER, { id });
};

const searchLocations: ActionHandler = (_session, variables, deps) => {
  const { search, limit, page } = variables as {
    search?: string;
    limit?: number;
    page?: number;
  };
  return runGraphQL(deps, SEARCH_LOCATIONS, {
    search: search ?? "",
    limit: limit ?? 10,
    page: page ?? 1,
  });
};

// ─── Ownership check for application-bound mutations ───────────────────────
// Any mutation that targets an Application must first verify the application
// belongs to session.job_offer_id — otherwise a malicious client could reject
// arbitrary applications across tenants.

const ASSERT_APP_BELONGS = /* GraphQL */ `
  query AssertAppBelongs($job_offer_id: Int!) {
    JobOfferApplicationsWithPagination(job_offer_id: $job_offer_id, limit: 100, page: 1) {
      data { id }
    }
  }
`;

async function assertApplicationBelongsToSession(
  deps: ActionDeps,
  session: SessionPayload,
  applicationId: number,
): Promise<void> {
  const res = await mamamiaRequest<{
    JobOfferApplicationsWithPagination: { data: Array<{ id: number }> };
  }>({
    endpoint: deps.endpoint,
    token: await deps.getAgencyToken(),
    query: ASSERT_APP_BELONGS,
    variables: { job_offer_id: session.job_offer_id },
    fetchFn: deps.fetchFn,
  });
  const ids = new Set(res.JobOfferApplicationsWithPagination.data.map((a) => a.id));
  if (!ids.has(applicationId)) {
    throw new Error("forbidden: application not owned by session");
  }
}

const rejectApplication: ActionHandler = async (session, variables, deps) => {
  const v = variables as { application_id?: unknown; reject_message?: unknown };
  const appId = v.application_id;
  if (typeof appId !== "number") throw new Error("application_id required");
  await assertApplicationBelongsToSession(deps, session, appId);
  return await runGraphQL(deps, REJECT_APPLICATION, {
    id: appId,
    reject_message: typeof v.reject_message === "string" ? v.reject_message : null,
  });
};

// ─── Accept: StoreConfirmation ─────────────────────────────────────────────
// Creates binding Confirmation with contract_patient/contract_contact taken
// 1:1 from AngebotPruefenModal step-2 form. Ownership via prefetch of
// JobOfferApplicationsWithPagination(session.job_offer_id) — we verify
// application belongs before we call StoreConfirmation.

const CONTRACT_PATIENT_ALLOWED = new Set([
  "contact_type",
  "is_same_as_first_patient",
  "is_same_as_contact",
  "location_id",
  "location_custom_text",
  "salutation",
  "title",
  "first_name",
  "last_name",
  "phone",
  "email",
  "street_number",
  "zip_code",
  "city",
]);

const CONTRACT_CONTACT_ALLOWED = new Set([
  "is_same_as_first_patient",
  "location_id",
  "location_custom_text",
  "salutation",
  "title",
  "first_name",
  "last_name",
  "phone",
  "email",
  "street_number",
  "zip_code",
  "city",
]);

function pickAllowed(input: unknown, allowed: Set<string>): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

const storeConfirmation: ActionHandler = async (session, variables, deps) => {
  const v = variables as {
    application_id?: unknown;
    message?: unknown;
    is_confirm_binding?: unknown;
    contract_patient?: unknown;
    contract_contact?: unknown;
    patient_contracts?: unknown;
    contract_contacts?: unknown;
    update_customer?: unknown;
    file_tokens?: unknown;
  };
  const appId = v.application_id;
  if (typeof appId !== "number") throw new Error("application_id required");
  await assertApplicationBelongsToSession(deps, session, appId);

  const payload: Record<string, unknown> = {
    application_id: appId,
    message: typeof v.message === "string" ? v.message : null,
    is_confirm_binding: v.is_confirm_binding === true,
    update_customer: v.update_customer === true,
    contract_patient: pickAllowed(v.contract_patient, CONTRACT_PATIENT_ALLOWED),
    contract_contact: pickAllowed(v.contract_contact, CONTRACT_CONTACT_ALLOWED),
    patient_contracts: Array.isArray(v.patient_contracts)
      ? v.patient_contracts.map((p) => pickAllowed(p, CONTRACT_PATIENT_ALLOWED)).filter(Boolean)
      : null,
    contract_contacts: Array.isArray(v.contract_contacts)
      ? v.contract_contacts.map((c) => pickAllowed(c, CONTRACT_CONTACT_ALLOWED)).filter(Boolean)
      : null,
    file_tokens: Array.isArray(v.file_tokens) ? v.file_tokens.filter((t) => typeof t === "string") : null,
  };

  return await runGraphQL(deps, STORE_CONFIRMATION, payload);
};

// ─── Invite caregiver ──────────────────────────────────────────────────────
// Mutation: StoreRequest(caregiver_id, job_offer_id, message).
//
// This is the mutation Mamamia's own panel UI fires when an agency admin
// clicks "wyślij zaproszenie" on a customer's matching list. Verified live
// on beta 2026-04-28 by inspecting DevTools network log on a real panel
// session — operationName="StoreRequest", returns Request{id, ...}.
//
// Auth model: panel /backend/graphql + agency-only session cookie. NO
// ImpersonateCustomer needed despite earlier hypothesis — Mamamia's
// panel-side policy accepts a service-agency admin owning the customer
// directly, provided customer.status='active' (which our onboard payload
// achieves by setting Customer.arrival_at — see onboard-to-mamamia/mappers.ts).
//
// Why not SendInvitationCaregiver: that mutation is customer-side
// (auth.user must be the customer), used by Mamamia's customer portal.
// It is unrelated to the agency-side invite flow we need.
const inviteCaregiver: ActionHandler = async (session, variables, deps) => {
  const id = (variables as { caregiver_id?: unknown }).caregiver_id;
  if (typeof id !== "number") throw new Error("caregiver_id required");
  const message = (variables as { message?: unknown }).message;
  if (!deps.panelBaseUrl || !deps.agencyEmail || !deps.agencyPassword) {
    throw new Error("panel auth not configured");
  }
  const panelSession = await loginAsAgency(
    { baseUrl: deps.panelBaseUrl, fetchFn: deps.fetchFn },
    deps.agencyEmail,
    deps.agencyPassword,
  );
  return await panelMutateAsCustomer(
    { baseUrl: deps.panelBaseUrl, fetchFn: deps.fetchFn },
    panelSession,
    STORE_REQUEST,
    {
      caregiver_id: id,
      job_offer_id: session.job_offer_id,
      message: typeof message === "string" ? message : null,
    },
    "StoreRequest",
  );
};


// ─── Mutations — strict allowlist + ownership ───────────────────────────────

const UPDATE_CUSTOMER_ALLOWED = new Set([
  "first_name",
  "last_name",
  "email",
  "phone",
  "location_id",
  "location_custom_text",
  "urbanization_id",
  "job_description",
  "accommodation",
  "caregiver_accommodated",
  "other_people_in_house",
  "has_family_near_by",
  "smoking_household",
  "internet",
  "day_care_facility",
  "caregiver_time_off",
  "pets",
  "is_pet_dog",
  "is_pet_cat",
  "is_pet_other",
  "patients",
  "customer_caregiver_wish",
]);

// Whitelist for the nested customer_caregiver_wish object — keep tight
// so we never leak unintended wish fields from a malicious client body.
const WISH_ALLOWED = new Set([
  "gender",
  "germany_skill",
  "driving_license",
  "smoking",
  "shopping",
  "tasks",
  "tasks_de",
  "other_wishes",
  "other_wishes_de",
]);

function pickAllowedWish(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (WISH_ALLOWED.has(k)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

const updateCustomer: ActionHandler = (session, variables, deps) => {
  const patch: Record<string, unknown> = { id: session.customer_id };
  for (const [k, v] of Object.entries(variables)) {
    if (k === "customer_caregiver_wish") {
      const wish = pickAllowedWish(v);
      if (wish) patch.customer_caregiver_wish = wish;
    } else if (UPDATE_CUSTOMER_ALLOWED.has(k)) {
      patch[k] = v;
    }
  }
  return runGraphQL(deps, UPDATE_CUSTOMER, patch);
};

// ─── Dispatcher ────────────────────────────────────────────────────────────

export const ACTIONS: Record<ProxyAction, ActionHandler> = {
  getJobOffer,
  getCustomer,
  listApplications,
  listMatchings,
  getCaregiver,
  searchLocations,
  updateCustomer,
  rejectApplication,
  storeConfirmation,
  inviteCaregiver,
};

export function isKnownAction(name: string): name is ProxyAction {
  return name in ACTIONS;
}

// Re-export for tests
export type { ActionDeps, ActionHandler, SessionPayload };
