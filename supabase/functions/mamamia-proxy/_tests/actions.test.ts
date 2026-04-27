import { assertEquals, assertRejects } from "@std/assert";
import { ACTIONS } from "../actions.ts";
import type { SessionPayload, ActionDeps } from "../types.ts";

const SESSION: SessionPayload = {
  customer_id: 7570,
  job_offer_id: 16226,
  lead_id: "c4286032-9e06-453d-93f2-52779127c8e5",
  email: "test@example.com",
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

// ─── rejectApplication (K5) ─────────────────────────────────────────────

// Multi-response fetch helper for actions that prefetch + mutate.
function multiFetch(...responses: Array<{ body: object; status?: number }>): {
  state: { bodies: unknown[]; urls: string[] };
  fetchFn: typeof fetch;
} {
  const state = { bodies: [] as unknown[], urls: [] as string[] };
  let idx = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    state.urls.push(input.toString());
    state.bodies.push(JSON.parse((init as RequestInit | undefined)?.body as string));
    const r = responses[idx++];
    if (!r) throw new Error(`unexpected fetch call #${idx}`);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  };
  return { state, fetchFn };
}

Deno.test("rejectApplication: prefetch ownership check + reject with reject_message", async () => {
  const { state, fetchFn } = multiFetch(
    // 1. ownership prefetch — app 555 belongs to our job offer
    { body: { data: { JobOfferApplicationsWithPagination: { data: [{ id: 555 }, { id: 999 }] } } } },
    // 2. RejectApplication
    { body: { data: { RejectApplication: { id: 555, rejected_at: "2026-04-24T13:00:00Z", reject_message: "nope" } } } },
  );

  const result = await ACTIONS.rejectApplication(SESSION, {
    application_id: 555,
    reject_message: "nope",
  }, makeDeps(fetchFn));

  // 2 calls: prefetch + reject
  assertEquals(state.bodies.length, 2);
  const rejectCall = state.bodies[1] as { variables: { id: number; reject_message: string } };
  assertEquals(rejectCall.variables.id, 555);
  assertEquals(rejectCall.variables.reject_message, "nope");
  assertEquals((result as { RejectApplication: { id: number } }).RejectApplication.id, 555);
});

Deno.test("rejectApplication: forbids cross-tenant application", async () => {
  const { fetchFn } = multiFetch(
    // prefetch returns only id=111, but client tries to reject 9999
    { body: { data: { JobOfferApplicationsWithPagination: { data: [{ id: 111 }] } } } },
  );

  await assertRejects(
    () => ACTIONS.rejectApplication(SESSION, { application_id: 9999 }, makeDeps(fetchFn)),
    Error,
    "forbidden",
  );
});

Deno.test("rejectApplication: application_id required", async () => {
  const { fetchFn } = captureFetch({ data: {} });
  await assertRejects(
    () => ACTIONS.rejectApplication(SESSION, {}, makeDeps(fetchFn)),
    Error,
    "application_id required",
  );
});

// ─── storeConfirmation (K5) ─────────────────────────────────────────────

Deno.test("storeConfirmation: ownership check + allowlisted contract fields", async () => {
  const { state, fetchFn } = multiFetch(
    { body: { data: { JobOfferApplicationsWithPagination: { data: [{ id: 555 }] } } } },
    { body: { data: { StoreConfirmation: { id: 42, application_id: 555, is_confirm_binding: true } } } },
  );

  await ACTIONS.storeConfirmation(SESSION, {
    application_id: 555,
    is_confirm_binding: true,
    update_customer: true,
    contract_patient: {
      salutation: "Frau",
      first_name: "Hildegard",
      last_name: "Müller",
      email: "h@m.de",
      phone: "+49 89 1",
      street_number: "Rosenstraße 12",
      zip_code: "80331",
      city: "München",
      location_id: 1148,
      // non-allowed fields should be stripped:
      service_agency_id: 999,
      customer_id: 888,
    },
    contract_contact: {
      salutation: "Herr",
      first_name: "Michael",
      last_name: "Müller",
      phone: "+49 89 2",
      email: "m@m.de",
      role: "admin", // stripped
    },
  }, makeDeps(fetchFn));

  const confirmCall = state.bodies[1] as {
    variables: {
      application_id: number;
      contract_patient: Record<string, unknown>;
      contract_contact: Record<string, unknown>;
      is_confirm_binding: boolean;
      update_customer: boolean;
    };
  };
  assertEquals(confirmCall.variables.application_id, 555);
  assertEquals(confirmCall.variables.is_confirm_binding, true);
  assertEquals(confirmCall.variables.update_customer, true);
  assertEquals(confirmCall.variables.contract_patient.first_name, "Hildegard");
  assertEquals(confirmCall.variables.contract_patient.service_agency_id, undefined);
  assertEquals(confirmCall.variables.contract_patient.customer_id, undefined);
  assertEquals(confirmCall.variables.contract_contact.first_name, "Michael");
  assertEquals(confirmCall.variables.contract_contact.role, undefined);
});

Deno.test("storeConfirmation: forbids cross-tenant", async () => {
  const { fetchFn } = multiFetch(
    { body: { data: { JobOfferApplicationsWithPagination: { data: [{ id: 1 }] } } } },
  );
  await assertRejects(
    () => ACTIONS.storeConfirmation(SESSION, { application_id: 9999 }, makeDeps(fetchFn)),
    Error,
    "forbidden",
  );
});

// ─── inviteCaregiver (K5/K6) ───────────────────────────────────────────

Deno.test("inviteCaregiver: requires customer_token in session (K6 — agency token gets Unauthorized)", async () => {
  const { fetchFn } = captureFetch({ data: { SendInvitationCaregiver: true } });
  await assertRejects(
    () => ACTIONS.inviteCaregiver(SESSION, { caregiver_id: 10053 }, makeDeps(fetchFn)),
    Error,
    "customer email not verified",
  );
});

Deno.test("inviteCaregiver: uses session.customer_token as Bearer (NOT agency token)", async () => {
  const sessionWithCustomerToken = { ...SESSION, customer_token: "31|customer-jwt-xyz" };
  let capturedAuth = "";
  const fetchFn: typeof fetch = async (_input, init) => {
    const headers = (init as RequestInit | undefined)?.headers as Record<string, string> | undefined;
    capturedAuth = String(headers?.["Authorization"] ?? "");
    return new Response(JSON.stringify({ data: { SendInvitationCaregiver: true } }), { status: 200 });
  };
  await ACTIONS.inviteCaregiver(
    sessionWithCustomerToken,
    { caregiver_id: 10053 },
    makeDeps(fetchFn),
  );
  assertEquals(capturedAuth, "Bearer 31|customer-jwt-xyz");
});

Deno.test("inviteCaregiver: caregiver_id required (still validated when verified)", async () => {
  const sessionWithCustomerToken = { ...SESSION, customer_token: "31|x" };
  const { fetchFn } = captureFetch({ data: {} });
  await assertRejects(
    () => ACTIONS.inviteCaregiver(sessionWithCustomerToken, {}, makeDeps(fetchFn)),
    Error,
    "caregiver_id required",
  );
});

// ─── sendCustomerInvitation (K6) ────────────────────────────────────────
// Triggers Mamamia to email the customer a verify link. Once the customer
// clicks it, we exchange the magic-link token for a customer-scope JWT
// (CustomerVerifyEmail) — that JWT is what authorises SendInvitationCaregiver.

Deno.test("sendCustomerInvitation: uses session.customer_id + session.email", async () => {
  const { state, fetchFn } = captureFetch({
    data: { SendInvitationCustomer: true },
  });
  await ACTIONS.sendCustomerInvitation(SESSION, {}, makeDeps(fetchFn));
  const sent = state.body as { variables: { customer_id: number; email: string } };
  assertEquals(sent.variables.customer_id, SESSION.customer_id);
  assertEquals(sent.variables.email, SESSION.email);
});

Deno.test("sendCustomerInvitation: ignores user-supplied email/customer_id (ownership)", async () => {
  const { state, fetchFn } = captureFetch({
    data: { SendInvitationCustomer: true },
  });
  await ACTIONS.sendCustomerInvitation(
    SESSION,
    { customer_id: 9999, email: "evil@attacker.com" },
    makeDeps(fetchFn),
  );
  const sent = state.body as { variables: { customer_id: number; email: string } };
  assertEquals(sent.variables.customer_id, SESSION.customer_id);
  assertEquals(sent.variables.email, SESSION.email);
});
