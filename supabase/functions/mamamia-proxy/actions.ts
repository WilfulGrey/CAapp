import { mamamiaRequest } from "../_shared/mamamiaClient.ts";
import type { ActionDeps, ActionHandler, ProxyAction, SessionPayload } from "./types.ts";
import {
  GET_CAREGIVER,
  GET_CUSTOMER,
  GET_JOB_OFFER,
  LIST_APPLICATIONS,
  LIST_MATCHINGS,
  SEARCH_LOCATIONS,
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
  "other_people_in_house",
  "has_family_near_by",
  "smoking_household",
  "internet",
  "day_care_facility",
  "caregiver_time_off",
  "patients",
]);

const updateCustomer: ActionHandler = (session, variables, deps) => {
  const patch: Record<string, unknown> = { id: session.customer_id };
  for (const [k, v] of Object.entries(variables)) {
    if (UPDATE_CUSTOMER_ALLOWED.has(k)) patch[k] = v;
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
};

export function isKnownAction(name: string): name is ProxyAction {
  return name in ACTIONS;
}

// Re-export for tests
export type { ActionDeps, ActionHandler, SessionPayload };
