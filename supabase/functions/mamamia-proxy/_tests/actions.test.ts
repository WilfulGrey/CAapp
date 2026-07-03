import { assertEquals, assertRejects } from "@std/assert";
import { ACTIONS, deriveLeadJobStatus } from "../actions.ts";
import type { SessionPayload, ActionDeps, LeadJobRow } from "../types.ts";

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

// Bare fake of ProxySupabase — covers all 6 methods, in-memory, mutable.
// Each test that needs to assert / preload state grabs this and tweaks
// the maps. Functions that don't touch supabase get an inert instance.
type FakeSupa = {
  invites: Array<{ leadId: string; caregiverId: number; attemptedAt: Date; jobOfferId?: number | null }>;
  failOnRecord?: boolean;
  jobs?: LeadJobRow[];
  lastLeadJobsLeadId?: string;
  upsertedLeadJobs?: Array<{ leadId: string; jobs: Array<{ mamamia_job_offer_id: number; status: string; anreise: string | null; abreise: string | null }> }>;
};
function makeFakeSupabase(state: FakeSupa = { invites: [] }) {
  return {
    state,
    adapter: {
      // dismiss / accept fakes not used by invite tests but required by
      // the interface — keep them inert.
      async selectLeadJobs(leadId: string) {
        state.lastLeadJobsLeadId = leadId;
        return state.jobs ?? [];
      },
      async upsertLeadJobs(
        leadId: string,
        jobs: Array<{ mamamia_job_offer_id: number; status: string; anreise: string | null; abreise: string | null }>,
      ) {
        (state.upsertedLeadJobs ??= []).push({ leadId, jobs });
      },
      async selectDismissedCaregivers() { return []; },
      async upsertDismissedCaregiver() { /* no-op */ },
      async selectAcceptedApplications() { return []; },
      async countRecentInviteAttempts(leadId: string, windowMinutes: number, jobOfferId: number) {
        const cutoff = Date.now() - windowMinutes * 60_000;
        return state.invites.filter(
          (r) => r.leadId === leadId && r.attemptedAt.getTime() >= cutoff &&
            (r.jobOfferId === jobOfferId || r.jobOfferId == null),
        ).length;
      },
      async oldestInviteAttemptWithin(leadId: string, windowMinutes: number, jobOfferId: number) {
        const cutoff = Date.now() - windowMinutes * 60_000;
        const within = state.invites
          .filter((r) => r.leadId === leadId && r.attemptedAt.getTime() >= cutoff &&
            (r.jobOfferId === jobOfferId || r.jobOfferId == null))
          .sort((a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime());
        return within[0]?.attemptedAt ?? null;
      },
      async recordInviteAttempt(leadId: string, caregiverId: number, jobOfferId: number) {
        if (state.failOnRecord) throw new Error("simulated record failure");
        state.invites.push({ leadId, caregiverId, jobOfferId, attemptedAt: new Date() });
      },
    },
  };
}

function makeDeps(fetchFn: typeof fetch, supabase?: ActionDeps["supabase"]): ActionDeps {
  return {
    endpoint: "https://beta.example/graphql",
    getAgencyToken: async () => "agency-token",
    panelBaseUrl: "https://beta.example/backend",
    agencyEmail: "primundus+portal@example.com",
    agencyPassword: "secret-pass",
    fetchFn,
    supabase: supabase ?? makeFakeSupabase().adapter,
  };
}

const NOOP_FETCH = (async () => new Response("{}")) as typeof fetch;

// ─── listLeadJobs (Multi-Job overview) ───────────────────────────────────

Deno.test("listLeadJobs: returns the lead's jobs, queried by session.lead_id", async () => {
  const jobs: LeadJobRow[] = [
    { id: "j1", mamamia_job_offer_id: 100, status: "geplant", anreise: null, abreise: null, position: 0, pflegekraft: null, bewerbungen: 2 },
    { id: "j2", mamamia_job_offer_id: 200, status: "gebucht", anreise: "2026-07-01", abreise: "2026-09-01", position: 0, pflegekraft: "Anna T.", bewerbungen: null },
  ];
  const { state, adapter } = makeFakeSupabase({ invites: [], jobs });
  const result = await ACTIONS.listLeadJobs(SESSION, {}, makeDeps(NOOP_FETCH, adapter));
  // Ownership: the lead_id comes from the signed session, never from the client.
  assertEquals(state.lastLeadJobsLeadId, SESSION.lead_id);
  assertEquals((result as { jobs: LeadJobRow[] }).jobs, jobs);
});

Deno.test("listLeadJobs: throws when the supabase adapter is missing", async () => {
  const deps: ActionDeps = { ...makeDeps(NOOP_FETCH), supabase: undefined };
  await assertRejects(
    () => ACTIONS.listLeadJobs(SESSION, {}, deps),
    Error,
    "supabase adapter required",
  );
});

// ─── Multi-Job sync (Phase 2A) ───────────────────────────────────────────

Deno.test("deriveLeadJobStatus: known cases + unmapped → null (skip) with raw preserved", () => {
  const today = "2026-06-15";
  assertEquals(deriveLeadJobStatus({ status: "search" }, today).status, "geplant");
  assertEquals(deriveLeadJobStatus({ status: "on_job" }, today).status, "gebucht");
  assertEquals(deriveLeadJobStatus({ status: "search", final_confirmation: { id: 1 } }, today).status, "gebucht");
  assertEquals(deriveLeadJobStatus({ status: "search", departure_at: "2020-01-01" }, today).status, "abgeschlossen");
  // Past departure wins even over a confirmation.
  assertEquals(deriveLeadJobStatus({ status: "on_job", departure_at: "2020-01-01", final_confirmation: { id: 1 } }, today).status, "abgeschlossen");
  // Unmapped status → null (skip) + raw kept for logging/tuning.
  const u = deriveLeadJobStatus({ status: "some_new_state" }, today);
  assertEquals(u.status, null);
  assertEquals(u.raw, "some_new_state");
});

Deno.test("listLeadJobs: syncs Customer.job_offers → upsert with derived statuses, skips unmapped", async () => {
  const { fetchFn } = captureFetch({ data: { Customer: { id: 7570, job_offers: [
    { id: 100, status: "search", arrival_at: null, departure_at: null, final_confirmation: null },
    { id: 200, status: "on_job", arrival_at: "2020-01-01", departure_at: "2099-01-01", final_confirmation: { id: 9 } },
    { id: 300, status: "search", arrival_at: "2019-01-01", departure_at: "2020-01-01", final_confirmation: null },
    { id: 400, status: "cancelled_weird", arrival_at: null, departure_at: null, final_confirmation: null },
  ] } } });
  const { state, adapter } = makeFakeSupabase({ invites: [], jobs: [
    { id: "x", mamamia_job_offer_id: 100, status: "geplant", anreise: null, abreise: null, position: 0, pflegekraft: null, bewerbungen: null },
  ] });
  const result = await ACTIONS.listLeadJobs(SESSION, {}, makeDeps(fetchFn, adapter));
  const ups = (state.upsertedLeadJobs ?? [])[0];
  assertEquals(ups.leadId, SESSION.lead_id);
  // 100→geplant, 200→gebucht, 300→abgeschlossen; 400 unmapped → skipped.
  assertEquals(ups.jobs.map((j) => [j.mamamia_job_offer_id, j.status]), [[100, "geplant"], [200, "gebucht"], [300, "abgeschlossen"]]);
  assertEquals((result as { jobs: LeadJobRow[] }).jobs.length, 1); // then read existing rows
});

Deno.test("listLeadJobs: sync failure is best-effort — still returns existing rows", async () => {
  const fetchFn: typeof fetch = () => { throw new Error("Mamamia down"); };
  const { adapter } = makeFakeSupabase({ invites: [], jobs: [
    { id: "x", mamamia_job_offer_id: 100, status: "geplant", anreise: null, abreise: null, position: 0, pflegekraft: null, bewerbungen: null },
  ] });
  const result = await ACTIONS.listLeadJobs(SESSION, {}, makeDeps(fetchFn, adapter));
  assertEquals((result as { jobs: LeadJobRow[] }).jobs.length, 1); // read succeeded despite sync throw
});

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

// ─── Reference-certificate merge (Referenz_*.pdf via CaregiverCertificates) ──

Deno.test("listMatchings: merges Referenz certs onto caregiver.certificates (filters non-Referenz)", async () => {
  const { fetchFn } = multiFetch(
    // 1: matchings
    { body: { data: { JobOfferMatchingsWithPagination: { total: 1, data: [{ id: 1, caregiver: { id: 10099 } }] } } } },
    // 2: batched CaregiverCertificates(c10099) — 2 Referenz + 1 non-Referenz
    { body: { data: { c10099: [
      { file: { original_name: "Referenz_Alt_2025-01-01.pdf", aws_url: "https://s3/old.pdf", created_at: "2025-01-01T00:00:00Z", mime_type: "application/pdf" } },
      { file: { original_name: "Referenz_Neu_2026-06-08.pdf", aws_url: "https://s3/new.pdf", created_at: "2026-06-08T00:00:00Z", mime_type: "application/pdf" } },
      { file: { original_name: "Zertifikat_Kurs.pdf", aws_url: "https://s3/z.pdf", created_at: "2026-07-01T00:00:00Z", mime_type: "application/pdf" } },
    ] } } },
  );
  const r = await ACTIONS.listMatchings(SESSION, { limit: 20 }, makeDeps(fetchFn)) as {
    JobOfferMatchingsWithPagination: { data: Array<{ caregiver: { certificates?: Array<{ original_name: string }> } }> };
  };
  const certs = r.JobOfferMatchingsWithPagination.data[0].caregiver.certificates ?? [];
  // Only Referenz_*.pdf cross the proxy (Zertifikat_Kurs dropped).
  assertEquals(certs.length, 2);
  assertEquals(certs.every((c) => c.original_name.startsWith("Referenz_")), true);
});

Deno.test("listMatchings: caregiver with only non-Referenz files → no certificates field", async () => {
  const { fetchFn } = multiFetch(
    { body: { data: { JobOfferMatchingsWithPagination: { total: 1, data: [{ id: 1, caregiver: { id: 9857 } }] } } } },
    { body: { data: { c9857: [
      { file: { original_name: "sample2.doc", aws_url: "https://s3/s.doc", created_at: "2026-01-01T00:00:00Z" } },
      { file: { original_name: "table.pdf", aws_url: "https://s3/t.pdf", created_at: "2026-01-01T00:00:00Z" } },
    ] } } },
  );
  const r = await ACTIONS.listMatchings(SESSION, {}, makeDeps(fetchFn)) as {
    JobOfferMatchingsWithPagination: { data: Array<{ caregiver: Record<string, unknown> }> };
  };
  assertEquals(r.JobOfferMatchingsWithPagination.data[0].caregiver.certificates, undefined);
});

Deno.test("listMatchings: cert batch failure does NOT fail the list (best-effort)", async () => {
  const { fetchFn } = multiFetch(
    { body: { data: { JobOfferMatchingsWithPagination: { total: 1, data: [{ id: 1, caregiver: { id: 10099 } }] } } } },
    { body: { errors: [{ message: "boom" }] } }, // cert batch errors
  );
  const r = await ACTIONS.listMatchings(SESSION, {}, makeDeps(fetchFn)) as {
    JobOfferMatchingsWithPagination: { data: Array<{ caregiver: Record<string, unknown> }> };
  };
  // List still returns; caregiver simply has no certificates.
  assertEquals(r.JobOfferMatchingsWithPagination.data.length, 1);
  assertEquals(r.JobOfferMatchingsWithPagination.data[0].caregiver.certificates, undefined);
});

Deno.test("listApplications: merges Referenz certs onto caregiver.certificates", async () => {
  const { fetchFn } = multiFetch(
    { body: { data: { JobOfferApplicationsWithPagination: { total: 1, data: [{ id: 7997, caregiver: { id: 10099 } }] } } } },
    { body: { data: { c10099: [
      { file: { original_name: "Referenz_S_Wadysaw_2026-06-08.pdf", aws_url: "https://s3/ref.pdf", created_at: "2026-06-08T12:13:37Z", mime_type: "application/pdf" } },
    ] } } },
  );
  const r = await ACTIONS.listApplications(SESSION, { limit: 20 }, makeDeps(fetchFn)) as {
    JobOfferApplicationsWithPagination: { data: Array<{ caregiver: { certificates?: Array<{ original_name: string }> } }> };
  };
  const certs = r.JobOfferApplicationsWithPagination.data[0].caregiver.certificates ?? [];
  assertEquals(certs.length, 1);
  assertEquals(certs[0].original_name, "Referenz_S_Wadysaw_2026-06-08.pdf");
});

Deno.test("getCaregiver: merges CaregiverCertificates (Referenz only) onto Caregiver.certificates + drops sibling", async () => {
  const { fetchFn } = captureFetch({
    data: {
      Caregiver: { id: 10099, first_name: "Jolanta", last_name: "S." },
      CaregiverCertificates: [
        { file: { original_name: "Referenz_X.pdf", aws_url: "https://s3/r.pdf", created_at: "2026-06-08T00:00:00Z", mime_type: "application/pdf" } },
        { file: { original_name: "verification_scan.pdf", aws_url: "https://s3/v.pdf", created_at: "2026-06-09T00:00:00Z", mime_type: "application/pdf" } },
      ],
    },
  });
  const r = await ACTIONS.getCaregiver(SESSION, { id: 10099 }, makeDeps(fetchFn)) as {
    Caregiver: { certificates: Array<{ original_name: string }> };
  };
  assertEquals(r.Caregiver.certificates.length, 1); // verification_scan dropped
  assertEquals(r.Caregiver.certificates[0].original_name, "Referenz_X.pdf");
  assertEquals("CaregiverCertificates" in r, false); // sibling not leaked to client
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

// ─── generateCaregiverGermanDescription (Mamamia regenerates about_de) ─────

Deno.test("generateCaregiverGermanDescription: regenerates + returns flattened about_de/motivation", async () => {
  const { state, fetchFn } = captureFetch({
    data: {
      GenerateCaregiverGermanDescription: {
        id: 10053,
        about_de: "x".repeat(300),
        motivation: "meine Worte",
      },
    },
  });

  const r = await ACTIONS.generateCaregiverGermanDescription(SESSION, { id: 10053 }, makeDeps(fetchFn)) as {
    about_de: string | null;
    motivation: string | null;
  };

  assertEquals(r.about_de, "x".repeat(300));
  assertEquals(r.motivation, "meine Worte");

  // Mutation carries the caregiver id + translate_to_pl=false (German-only).
  const sent = state.body as { variables: { id: number; translate_to_pl: boolean } };
  assertEquals(sent.variables.id, 10053);
  assertEquals(sent.variables.translate_to_pl, false);
});

Deno.test("generateCaregiverGermanDescription: rejects missing id", async () => {
  const { fetchFn } = captureFetch({ data: {} });
  await assertRejects(
    () => ACTIONS.generateCaregiverGermanDescription(SESSION, {}, makeDeps(fetchFn)),
    Error,
    "id required",
  );
});

Deno.test("generateCaregiverGermanDescription: null result → throws", async () => {
  const { fetchFn } = captureFetch({ data: { GenerateCaregiverGermanDescription: null } });
  await assertRejects(
    () => ACTIONS.generateCaregiverGermanDescription(SESSION, { id: 10053 }, makeDeps(fetchFn)),
    Error,
    "returned null",
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

// ─── updateJobOfferDates ────────────────────────────────────────────────

Deno.test("updateJobOfferDates: forces session.job_offer_id + session.customer_id, ignores user override", async () => {
  const { state, fetchFn } = captureFetch({
    data: { UpdateJobOfferDates: { id: 16226, job_offer_id: "ts-18-16226", arrival_at: "2026-06-10", departure_at: null } },
  });

  await ACTIONS.updateJobOfferDates(SESSION, {
    arrival_at: "2026-06-10",
    // malicious attempts — must be ignored
    id: 99999,
    customer_id: 88888,
  }, makeDeps(fetchFn));

  const sent = state.body as { variables: Record<string, unknown> };
  assertEquals(sent.variables.id, 16226);         // session.job_offer_id, not 99999
  assertEquals(sent.variables.customer_id, 7570); // session.customer_id, not 88888
  assertEquals(sent.variables.arrival_at, "2026-06-10");
});

Deno.test("updateJobOfferDates: empty string arrival_at → null (Mamamia clear semantics)", async () => {
  const { state, fetchFn } = captureFetch({
    data: { UpdateJobOfferDates: { id: 16226, arrival_at: null } },
  });

  await ACTIONS.updateJobOfferDates(SESSION, { arrival_at: "   " }, makeDeps(fetchFn));

  const sent = state.body as { variables: Record<string, unknown> };
  assertEquals(sent.variables.arrival_at, null);
});

Deno.test("updateJobOfferDates: omitted arrival_at → field not sent (preserve current Mamamia value)", async () => {
  const { state, fetchFn } = captureFetch({
    data: { UpdateJobOfferDates: { id: 16226, arrival_at: "2026-06-01" } },
  });

  // Caller wants to update ONLY departure_at — arrival_at must NOT be
  // overwritten with null.
  await ACTIONS.updateJobOfferDates(SESSION, { departure_at: "2026-12-15" }, makeDeps(fetchFn));

  const sent = state.body as { variables: Record<string, unknown> };
  assertEquals(sent.variables.departure_at, "2026-12-15");
  assertEquals("arrival_at" in sent.variables, false);
});

Deno.test("updateJobOfferDates: no date fields supplied → no-op (does not call Mamamia)", async () => {
  let called = false;
  const fetchFn: typeof fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };

  const result = await ACTIONS.updateJobOfferDates(SESSION, {}, makeDeps(fetchFn));

  assertEquals(called, false);
  assertEquals((result as { skipped: string }).skipped, "no date fields supplied");
});

Deno.test("updateJobOfferDates: non-string arrival_at throws", async () => {
  const { fetchFn } = captureFetch({ data: {} });

  await assertRejects(
    () => ACTIONS.updateJobOfferDates(SESSION, { arrival_at: 12345 }, makeDeps(fetchFn)),
    Error,
    "must be string",
  );
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

// ─── inviteCaregiver (K7) ──────────────────────────────────────────────

Deno.test("inviteCaregiver: agency-only panel flow — csrf → LoginAgency → StoreRequest", async () => {
  // 3 sequential calls into the panel API. NO ImpersonateCustomer —
  // verified live on beta 2026-04-28: StoreRequest works under
  // agency-only session when customer.status='active'.
  const calls: { url: string; body?: string }[] = [];
  let i = 0;
  const responses: Array<{ status: number; json?: unknown; setCookie?: string[] }> = [
    // 1. /sanctum/csrf-cookie
    { status: 204, setCookie: ["XSRF-TOKEN=t1; path=/", "mamamia_beta_session=s1; httponly"] },
    // 2. LoginAgency
    {
      status: 200,
      json: { data: { LoginAgency: { id: 8190, email: "primundus+portal@example.com" } } },
      setCookie: ["XSRF-TOKEN=t2; path=/", "mamamia_beta_session=s2; httponly"],
    },
    // 3. StoreRequest — final, on /graphql (not /graphql/auth)
    {
      status: 200,
      json: {
        data: {
          StoreRequest: {
            id: 893,
            caregiver_id: 10061,
            job_offer_id: 16235,
            message: null,
            created_at: "2026-04-28T09:43:44.000000Z",
          },
        },
      },
    },
  ];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const body = typeof (init as RequestInit | undefined)?.body === "string"
      ? (init as RequestInit).body as string : undefined;
    calls.push({ url, body });
    const r = responses[i++];
    const headers = new Headers();
    for (const sc of r.setCookie ?? []) headers.append("set-cookie", sc);
    const status = r.status;
    const bodyAllowed = status !== 204 && status !== 304;
    return new Response(
      bodyAllowed && r.json !== undefined ? JSON.stringify(r.json) : null,
      { status, headers },
    );
  };

  const result = await ACTIONS.inviteCaregiver(
    { ...SESSION, job_offer_id: 16235 },
    { caregiver_id: 10061 },
    makeDeps(fetchFn),
  );
  const sr = (result as { StoreRequest: { id: number; caregiver_id: number } }).StoreRequest;
  assertEquals(sr.id, 893);
  assertEquals(sr.caregiver_id, 10061);

  // Call chain: csrf → LoginAgency → StoreRequest. NO ImpersonateCustomer.
  assertEquals(calls.length, 3);
  assertEquals(calls[0].url, "https://beta.example/backend/sanctum/csrf-cookie");
  assertEquals(calls[1].url, "https://beta.example/backend/graphql/auth");
  assertEquals(calls[2].url, "https://beta.example/backend/graphql");

  // LoginAgency carries credentials
  const loginBody = JSON.parse(calls[1].body!);
  assertEquals(loginBody.operationName, "LoginAgency");

  // StoreRequest carries caregiver_id + job_offer_id from session, plus null message
  const inviteBody = JSON.parse(calls[2].body!);
  assertEquals(inviteBody.operationName, "StoreRequest");
  assertEquals(inviteBody.variables.caregiver_id, 10061);
  assertEquals(inviteBody.variables.job_offer_id, 16235);
  assertEquals(inviteBody.variables.message, null);
});

Deno.test("inviteCaregiver: optional message string passes through to StoreRequest", async () => {
  const calls: { body?: string }[] = [];
  let i = 0;
  const responses = [
    { status: 204, setCookie: ["XSRF-TOKEN=t; path=/"] },
    { status: 200, json: { data: { LoginAgency: { id: 1, email: "x" } } }, setCookie: ["XSRF-TOKEN=t; path=/"] },
    { status: 200, json: { data: { StoreRequest: { id: 1, caregiver_id: 1, job_offer_id: 1, message: "hi", created_at: "x" } } } },
  ];
  const fetchFn: typeof fetch = async (_input, init) => {
    const body = typeof (init as RequestInit | undefined)?.body === "string"
      ? (init as RequestInit).body as string : undefined;
    calls.push({ body });
    const r = responses[i++] as { status: number; json?: unknown; setCookie?: string[] };
    const headers = new Headers();
    for (const sc of r.setCookie ?? []) headers.append("set-cookie", sc);
    const bodyAllowed = r.status !== 204 && r.status !== 304;
    return new Response(bodyAllowed && r.json !== undefined ? JSON.stringify(r.json) : null, { status: r.status, headers });
  };

  await ACTIONS.inviteCaregiver(
    SESSION,
    { caregiver_id: 10, message: "Bitte melden" },
    makeDeps(fetchFn),
  );
  const inviteBody = JSON.parse(calls[2].body!);
  assertEquals(inviteBody.variables.message, "Bitte melden");
});

Deno.test("inviteCaregiver: caregiver_id required", async () => {
  const { fetchFn } = captureFetch({ data: {} });
  await assertRejects(
    () => ACTIONS.inviteCaregiver(SESSION, {}, makeDeps(fetchFn)),
    Error,
    "caregiver_id required",
  );
});

Deno.test("inviteCaregiver: missing panel config aborts before panel calls", async () => {
  const { fetchFn } = captureFetch({ data: {} });
  const deps = { ...makeDeps(fetchFn), panelBaseUrl: undefined };
  await assertRejects(
    () => ACTIONS.inviteCaregiver(SESSION, { caregiver_id: 10053 }, deps),
    Error,
    "panel auth not configured",
  );
});

// ─── inviteCaregiver: rate limit gate ──────────────────────────────────

// Helper: mock panel flow (csrf → LoginAgency → StoreRequest) so we can
// focus rate-limit tests on the gate logic without re-asserting Mamamia
// shape per case.
function panelFlowFetchFn(state: { calls: number; lastBody?: string }, opts: {
  storeRequestId?: number;
  failAt?: "store-request";
} = {}): typeof fetch {
  return async (_input, init) => {
    state.calls++;
    const body = typeof (init as RequestInit | undefined)?.body === "string"
      ? (init as RequestInit).body as string : undefined;
    state.lastBody = body;
    // calls 1 (csrf), 2 (LoginAgency), 3 (StoreRequest)
    if (state.calls === 1) {
      const h = new Headers(); h.append("set-cookie", "XSRF-TOKEN=t; path=/");
      return new Response(null, { status: 204, headers: h });
    }
    if (state.calls === 2) {
      const h = new Headers(); h.append("set-cookie", "XSRF-TOKEN=t; path=/");
      return new Response(JSON.stringify({ data: { LoginAgency: { id: 1, email: "x" } } }), { status: 200, headers: h });
    }
    if (state.calls === 3) {
      if (opts.failAt === "store-request") {
        return new Response(
          JSON.stringify({ errors: [{ message: "Panel rejected", extensions: { category: "authorization" } }] }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ data: { StoreRequest: {
          id: opts.storeRequestId ?? 100,
          caregiver_id: 10061,
          job_offer_id: 16235,
          message: null,
          created_at: "2026-04-28T09:43:44.000000Z",
        } } }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch call #${state.calls}`);
  };
}

Deno.test("inviteCaregiver[rate-limit]: 1st invite passes through + records attempt", async () => {
  const supa = makeFakeSupabase();
  const callState = { calls: 0 };
  const fetchFn = panelFlowFetchFn(callState);

  await ACTIONS.inviteCaregiver(
    SESSION,
    { caregiver_id: 10061 },
    makeDeps(fetchFn, supa.adapter),
  );

  assertEquals(callState.calls, 3); // csrf + LoginAgency + StoreRequest
  assertEquals(supa.state.invites.length, 1);
  assertEquals(supa.state.invites[0].leadId, SESSION.lead_id);
  assertEquals(supa.state.invites[0].caregiverId, 10061);
});

Deno.test("inviteCaregiver[rate-limit]: 6th invite within 60min → rate-limited error, NO Mamamia call", async () => {
  // Pre-load 5 attempts within last 30 min — oldest 30 min ago means
  // retry_after ≈ 30 min remaining in the rolling hour window.
  const now = Date.now();
  const supa = makeFakeSupabase({
    invites: [
      { leadId: SESSION.lead_id, caregiverId: 1, attemptedAt: new Date(now - 30 * 60_000) }, // 30min ago (oldest)
      { leadId: SESSION.lead_id, caregiverId: 2, attemptedAt: new Date(now - 20 * 60_000) },
      { leadId: SESSION.lead_id, caregiverId: 3, attemptedAt: new Date(now - 10 * 60_000) },
      { leadId: SESSION.lead_id, caregiverId: 4, attemptedAt: new Date(now - 5 * 60_000) },
      { leadId: SESSION.lead_id, caregiverId: 5, attemptedAt: new Date(now - 1 * 60_000) },
    ],
  });
  const callState = { calls: 0 };
  const fetchFn = panelFlowFetchFn(callState);

  const err = await assertRejects(
    () => ACTIONS.inviteCaregiver(
      SESSION,
      { caregiver_id: 10061 },
      makeDeps(fetchFn, supa.adapter),
    ),
    Error,
    "rate-limited",
  ) as Error & { rateLimited?: boolean; retry_after_seconds?: number; limit?: number; used?: number };

  // NO Mamamia call — gate fired before panel flow
  assertEquals(callState.calls, 0);
  // No 6th attempt recorded
  assertEquals(supa.state.invites.length, 5);
  // Structured rate-limit payload
  assertEquals(err.rateLimited, true);
  assertEquals(err.limit, 5);
  assertEquals(err.used, 5);
  // Retry ≈ 60 - 30 = 30 min ≈ 1800s (allow some scheduling slop)
  if (err.retry_after_seconds! < 1700 || err.retry_after_seconds! > 1900) {
    throw new Error(`retry_after_seconds expected ~1800, got ${err.retry_after_seconds}`);
  }
});

Deno.test("inviteCaregiver[rate-limit]: Mamamia StoreRequest failure does NOT consume quota", async () => {
  const supa = makeFakeSupabase();
  const callState = { calls: 0 };
  const fetchFn = panelFlowFetchFn(callState, { failAt: "store-request" });

  await assertRejects(
    () => ACTIONS.inviteCaregiver(
      SESSION,
      { caregiver_id: 10061 },
      makeDeps(fetchFn, supa.adapter),
    ),
    Error,
  );

  // No row recorded — user can retry without penalty
  assertEquals(supa.state.invites.length, 0);
});

Deno.test("inviteCaregiver[rate-limit]: recordInviteAttempt failure still returns success (best-effort ledger)", async () => {
  const supa = makeFakeSupabase({ invites: [], failOnRecord: true });
  const callState = { calls: 0 };
  const fetchFn = panelFlowFetchFn(callState);

  // Mamamia call succeeds, ledger write fails → returns OK (don't punish
  // user for a ledger blip; worst case next quota check sees old count)
  const result = await ACTIONS.inviteCaregiver(
    SESSION,
    { caregiver_id: 10061 },
    makeDeps(fetchFn, supa.adapter),
  );
  const sr = (result as { StoreRequest: { id: number } }).StoreRequest;
  assertEquals(sr.id, 100);
  // No row landed
  assertEquals(supa.state.invites.length, 0);
});

Deno.test("inviteCaregiver[rate-limit]: aborts with structured error if supabase adapter missing", async () => {
  const { fetchFn } = captureFetch({ data: {} });
  // Strip supabase from deps explicitly
  const deps = { ...makeDeps(fetchFn), supabase: undefined };
  await assertRejects(
    () => ACTIONS.inviteCaregiver(SESSION, { caregiver_id: 10053 }, deps),
    Error,
    "supabase adapter required",
  );
});

// ─── getInviteRateState ───────────────────────────────────────────────

Deno.test("getInviteRateState: empty ledger → used=0, blocked=false, retry_after=0", async () => {
  const supa = makeFakeSupabase();
  const { fetchFn } = captureFetch({ data: {} });

  const result = await ACTIONS.getInviteRateState(
    SESSION, {}, makeDeps(fetchFn, supa.adapter),
  ) as {
    used: number; limit: number; window_minutes: number;
    oldest_at: string | null; retry_after_seconds: number; blocked: boolean;
  };

  assertEquals(result.used, 0);
  assertEquals(result.limit, 5);
  assertEquals(result.window_minutes, 60);
  assertEquals(result.oldest_at, null);
  assertEquals(result.retry_after_seconds, 0);
  assertEquals(result.blocked, false);
});

Deno.test("getInviteRateState: at limit → blocked=true, retry_after derived from oldest attempt", async () => {
  const now = Date.now();
  const supa = makeFakeSupabase({
    invites: [
      { leadId: SESSION.lead_id, caregiverId: 1, attemptedAt: new Date(now - 45 * 60_000) }, // oldest, 45min ago
      { leadId: SESSION.lead_id, caregiverId: 2, attemptedAt: new Date(now - 30 * 60_000) },
      { leadId: SESSION.lead_id, caregiverId: 3, attemptedAt: new Date(now - 20 * 60_000) },
      { leadId: SESSION.lead_id, caregiverId: 4, attemptedAt: new Date(now - 10 * 60_000) },
      { leadId: SESSION.lead_id, caregiverId: 5, attemptedAt: new Date(now - 5 * 60_000) },
    ],
  });
  const { fetchFn } = captureFetch({ data: {} });

  const result = await ACTIONS.getInviteRateState(
    SESSION, {}, makeDeps(fetchFn, supa.adapter),
  ) as { used: number; blocked: boolean; retry_after_seconds: number };

  assertEquals(result.used, 5);
  assertEquals(result.blocked, true);
  // Retry ≈ 60 - 45 = 15 min ≈ 900s
  if (result.retry_after_seconds < 800 || result.retry_after_seconds > 1000) {
    throw new Error(`retry_after_seconds expected ~900, got ${result.retry_after_seconds}`);
  }
});

Deno.test("getInviteRateState: rate limit is PER-JOB — job A's 5 invites do NOT block job B (#2a)", async () => {
  const now = Date.now();
  const supa = makeFakeSupabase({
    invites: Array.from({ length: 5 }, (_, i) => ({
      leadId: SESSION.lead_id, caregiverId: i + 1, jobOfferId: 16226, attemptedAt: new Date(now - i * 60_000),
    })),
  });
  // Job A (16226 = SESSION's job): blocked at 5/5.
  const a = await ACTIONS.getInviteRateState(
    { ...SESSION, job_offer_id: 16226 }, {}, makeDeps(NOOP_FETCH, supa.adapter),
  ) as { used: number; blocked: boolean };
  assertEquals(a.used, 5);
  assertEquals(a.blocked, true);
  // Job B (99999): a fresh quota — none of job A's invites count.
  const b = await ACTIONS.getInviteRateState(
    { ...SESSION, job_offer_id: 99999 }, {}, makeDeps(NOOP_FETCH, supa.adapter),
  ) as { used: number; blocked: boolean };
  assertEquals(b.used, 0);
  assertEquals(b.blocked, false);
});

Deno.test("getInviteRateState: legacy NULL-job attempts count toward every job (transition)", async () => {
  const supa = makeFakeSupabase({
    invites: Array.from({ length: 5 }, (_, i) => ({
      leadId: SESSION.lead_id, caregiverId: i + 1, jobOfferId: null, attemptedAt: new Date(),
    })),
  });
  const b = await ACTIONS.getInviteRateState(
    { ...SESSION, job_offer_id: 99999 }, {}, makeDeps(NOOP_FETCH, supa.adapter),
  ) as { used: number; blocked: boolean };
  assertEquals(b.used, 5); // legacy NULL counts for any job
  assertEquals(b.blocked, true);
});

Deno.test("listDismissedCaregivers: per-job — job A's dismissals do NOT show in job B (#2b)", async () => {
  const store = [
    { leadId: SESSION.lead_id, caregiverId: 100, kind: "interest", jobOfferId: 16226 },
    { leadId: SESSION.lead_id, caregiverId: 200, kind: "interest", jobOfferId: 99999 },
  ];
  const adapter = {
    ...makeFakeSupabase().adapter,
    selectDismissedCaregivers(leadId: string, jobOfferId: number) {
      return Promise.resolve(
        store.filter((r) => r.leadId === leadId && r.jobOfferId === jobOfferId)
          .map((r) => ({ caregiver_id: r.caregiverId, kind: r.kind })),
      );
    },
  };
  const a = await ACTIONS.listDismissedCaregivers({ ...SESSION, job_offer_id: 16226 }, {}, makeDeps(NOOP_FETCH, adapter));
  const b = await ACTIONS.listDismissedCaregivers({ ...SESSION, job_offer_id: 99999 }, {}, makeDeps(NOOP_FETCH, adapter));
  assertEquals((a as { caregiver_ids: number[] }).caregiver_ids, [100]);
  assertEquals((b as { caregiver_ids: number[] }).caregiver_ids, [200]);
});

Deno.test("dismissCaregiver: stamps the current job on the dismiss row (#2b)", async () => {
  const captured: Array<{ leadId: string; caregiverId: number; kind: string; jobOfferId: number }> = [];
  const adapter = {
    ...makeFakeSupabase().adapter,
    upsertDismissedCaregiver(leadId: string, caregiverId: number, kind: string, jobOfferId: number) {
      captured.push({ leadId, caregiverId, kind, jobOfferId });
      return Promise.resolve();
    },
  };
  await ACTIONS.dismissCaregiver(
    { ...SESSION, job_offer_id: 77777 }, { caregiver_id: 500, kind: "interest" }, makeDeps(NOOP_FETCH, adapter),
  );
  assertEquals(captured, [{ leadId: SESSION.lead_id, caregiverId: 500, kind: "interest", jobOfferId: 77777 }]);
});

Deno.test("getInviteRateState: scoped to session.lead_id (ignores other leads)", async () => {
  const supa = makeFakeSupabase({
    invites: [
      // Same caregiver but a different lead's invites — must NOT count
      { leadId: "other-lead-uuid", caregiverId: 1, attemptedAt: new Date() },
      { leadId: "other-lead-uuid", caregiverId: 2, attemptedAt: new Date() },
      { leadId: "other-lead-uuid", caregiverId: 3, attemptedAt: new Date() },
      { leadId: "other-lead-uuid", caregiverId: 4, attemptedAt: new Date() },
      { leadId: "other-lead-uuid", caregiverId: 5, attemptedAt: new Date() },
    ],
  });
  const { fetchFn } = captureFetch({ data: {} });

  const result = await ACTIONS.getInviteRateState(
    SESSION, {}, makeDeps(fetchFn, supa.adapter),
  ) as { used: number; blocked: boolean };

  assertEquals(result.used, 0);
  assertEquals(result.blocked, false);
});

