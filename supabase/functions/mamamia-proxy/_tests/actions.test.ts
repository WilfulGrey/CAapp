import { assertEquals, assertRejects } from "@std/assert";
import { ACTIONS } from "../actions.ts";
import type { SessionPayload, ActionDeps } from "../types.ts";

const SESSION: SessionPayload = {
  customer_id: 7570,
  job_offer_id: 16226,
  lead_id: "c4286032-9e06-453d-93f2-52779127c8e5",
};

function captureFetch(response: object, status = 200) {
  const state: { body: unknown; url: string } = { body: null, url: "" };
  const fetchFn: typeof fetch = async (input, init) => {
    state.url = input.toString();
    state.body = JSON.parse((init as RequestInit | undefined)?.body as string);
    return new Response(JSON.stringify(response), { status });
  };
  return { state, fetchFn };
}

function makeDeps(fetchFn: typeof fetch): ActionDeps {
  return {
    endpoint: "https://beta.example/graphql",
    getAgencyToken: async () => "agency-token",
    fetchFn,
  };
}

// ─── getJobOffer ─────────────────────────────────────────────────────────

Deno.test("getJobOffer: uses session.job_offer_id (IGNORES user variables)", async () => {
  const { state, fetchFn } = captureFetch({ data: { JobOffer: { id: 16226, salary_offered: 2750 } } });

  const result = await ACTIONS.getJobOffer(
    SESSION,
    { id: 9999 /* malicious attempt to override */ },
    makeDeps(fetchFn),
  );

  // Verify query variables used session.job_offer_id, not user's 9999
  const sent = state.body as { variables: { id: number } };
  assertEquals(sent.variables.id, 16226);
  assertEquals((result as { JobOffer: { salary_offered: number } }).JobOffer.salary_offered, 2750);
});

Deno.test("getJobOffer: propagates Mamamia GraphQL errors", async () => {
  const { fetchFn } = captureFetch({ errors: [{ message: "Job offer not found" }] });

  await assertRejects(
    () => ACTIONS.getJobOffer(SESSION, {}, makeDeps(fetchFn)),
    Error,
    "Job offer not found",
  );
});

// ─── getCustomer ─────────────────────────────────────────────────────────

Deno.test("getCustomer: uses session.customer_id (IGNORES user variables)", async () => {
  const { state, fetchFn } = captureFetch({
    data: { Customer: { id: 7570, first_name: "Katrin", last_name: "Clemens" } },
  });

  await ACTIONS.getCustomer(
    SESSION,
    { id: 1, first_name: "hacker-override" },
    makeDeps(fetchFn),
  );

  const sent = state.body as { variables: { id: number } };
  assertEquals(sent.variables.id, 7570);
});

// ─── listApplications ────────────────────────────────────────────────────

Deno.test("listApplications: uses session.job_offer_id, accepts limit/page from variables", async () => {
  const { state, fetchFn } = captureFetch({
    data: { JobOfferApplicationsWithPagination: { total: 0, data: [] } },
  });

  await ACTIONS.listApplications(SESSION, { limit: 5, page: 2 }, makeDeps(fetchFn));

  const sent = state.body as { variables: { job_offer_id: number; limit: number; page: number } };
  assertEquals(sent.variables.job_offer_id, 16226);
  assertEquals(sent.variables.limit, 5);
  assertEquals(sent.variables.page, 2);
});

Deno.test("listApplications: client cannot override job_offer_id", async () => {
  const { state, fetchFn } = captureFetch({
    data: { JobOfferApplicationsWithPagination: { total: 0, data: [] } },
  });

  await ACTIONS.listApplications(SESSION, { job_offer_id: 99999 }, makeDeps(fetchFn));

  const sent = state.body as { variables: { job_offer_id: number } };
  assertEquals(sent.variables.job_offer_id, 16226); // session, not 99999
});

// ─── listMatchings ───────────────────────────────────────────────────────

Deno.test("listMatchings: uses session.job_offer_id, passes filters + order_by from variables", async () => {
  const { state, fetchFn } = captureFetch({
    data: { JobOfferMatchingsWithPagination: { total: 0, data: [] } },
  });

  await ACTIONS.listMatchings(SESSION, {
    limit: 20,
    filters: { is_show: true },
    order_by: "percentage_match",
  }, makeDeps(fetchFn));

  const sent = state.body as {
    variables: { job_offer_id: number; filters: Record<string, unknown>; order_by: string };
  };
  assertEquals(sent.variables.job_offer_id, 16226);
  assertEquals(sent.variables.filters.is_show, true);
  assertEquals(sent.variables.order_by, "percentage_match");
});

Deno.test("listMatchings: omits empty filters + order_by (Mamamia defaults)", async () => {
  const { state, fetchFn } = captureFetch({
    data: { JobOfferMatchingsWithPagination: { total: 0, data: [] } },
  });

  await ACTIONS.listMatchings(SESSION, {}, makeDeps(fetchFn));

  const sent = state.body as { variables: Record<string, unknown> };
  assertEquals(sent.variables.job_offer_id, 16226);
  assertEquals(sent.variables.filters, undefined);
  assertEquals(sent.variables.order_by, undefined);
});

// ─── getCaregiver ────────────────────────────────────────────────────────

Deno.test("getCaregiver: takes id from variables (caregivers are public within agency)", async () => {
  const { state, fetchFn } = captureFetch({
    data: { Caregiver: { id: 10053, first_name: "Anna" } },
  });

  await ACTIONS.getCaregiver(SESSION, { id: 10053 }, makeDeps(fetchFn));

  const sent = state.body as { variables: { id: number } };
  assertEquals(sent.variables.id, 10053);
});

Deno.test("getCaregiver: rejects missing id", async () => {
  const { fetchFn } = captureFetch({ data: {} });

  await assertRejects(
    () => ACTIONS.getCaregiver(SESSION, {}, makeDeps(fetchFn)),
    Error,
    "id required",
  );
});

// ─── searchLocations ─────────────────────────────────────────────────────

Deno.test("searchLocations: passes search string + caps limit", async () => {
  const { state, fetchFn } = captureFetch({
    data: { LocationsWithPagination: { data: [] } },
  });

  await ACTIONS.searchLocations(SESSION, { search: "Berlin", limit: 5 }, makeDeps(fetchFn));

  const sent = state.body as { variables: { search: string; limit: number } };
  assertEquals(sent.variables.search, "Berlin");
  assertEquals(sent.variables.limit, 5);
});

// ─── updateCustomer (K4) ─────────────────────────────────────────────────

Deno.test("updateCustomer: uses session.customer_id, passes whitelisted patch fields", async () => {
  const { state, fetchFn } = captureFetch({
    data: { UpdateCustomer: { id: 7570, customer_id: "ts-18-7570" } },
  });

  await ACTIONS.updateCustomer(SESSION, {
    first_name: "Katrin",
    last_name: "Clemens",
    location_id: 1148,
    job_description: "Pflege",
    patients: [{ gender: "female", care_level: 3, mobility_id: 4 }],
    // attempt to override customer id — must be ignored
    id: 99999,
  }, makeDeps(fetchFn));

  const sent = state.body as { variables: Record<string, unknown> };
  assertEquals(sent.variables.id, 7570); // session, not 99999
  assertEquals(sent.variables.first_name, "Katrin");
  assertEquals(sent.variables.location_id, 1148);
});

Deno.test("updateCustomer: strips unexpected fields (allowlist)", async () => {
  const { state, fetchFn } = captureFetch({
    data: { UpdateCustomer: { id: 7570, customer_id: "ts-18-7570" } },
  });

  await ACTIONS.updateCustomer(SESSION, {
    first_name: "Katrin",
    role: "admin", // must NOT pass through to Mamamia
    service_agency_id: 999, // cannot change agency
  }, makeDeps(fetchFn));

  const sent = state.body as { variables: Record<string, unknown> };
  assertEquals(sent.variables.first_name, "Katrin");
  assertEquals(sent.variables.role, undefined);
  assertEquals(sent.variables.service_agency_id, undefined);
});
