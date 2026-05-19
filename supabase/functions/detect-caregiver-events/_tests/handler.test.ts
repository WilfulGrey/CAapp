import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildCaregiverMetadata,
  type CaregiverNode,
  type DetectSecrets,
  type DetectSupabase,
  type EventRow,
  handleRequest,
  type LeadRow,
  mapHpToBadge,
} from "../index.ts";
import { _resetAgencyTokenCache } from "../../_shared/mamamiaClient.ts";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const SECRETS: DetectSecrets = {
  supabaseUrl: "https://supabase.test",
  supabaseServiceKey: "service-key",
  mamamiaEndpoint: "https://mamamia.test/graphql",
  mamamiaAuthEndpoint: "https://mamamia.test/graphql/auth",
  mamamiaAgencyEmail: "agency@test",
  mamamiaAgencyPassword: "secret",
  kostenrechnerUrl: "https://kr.test",
};

const VALID_LEAD: LeadRow = {
  id: "11111111-1111-1111-1111-111111111111",
  token: "tok-abc",
  email: "customer@test",
  mamamia_customer_id: 8569,
  mamamia_job_offer_id: 28156,
};

function makeCaregiver(overrides: Partial<CaregiverNode> = {}): CaregiverNode {
  return {
    id: 50001,
    first_name: "Helena",
    last_name: "Kowalski",
    year_of_birth: 1980,
    care_experience: 5,
    hp_caregiver_id: 9001,
    hp_total_jobs: 7,
    hp_total_days: 800,
    hp_avg_mission_days: 60,
    avatar_retouched: { aws_url: "https://cdn.test/h.jpg" },
    about_de: "Erfahren mit Demenz.",
    ...overrides,
  };
}

interface MamamiaPayload {
  apps?: Array<{ id: number; caregiver_id: number | null; caregiver: CaregiverNode | null }>;
  interests?: Array<{
    id: number;
    caregiver_id: number | null;
    rejected_at: string | null;
    caregiver: CaregiverNode | null;
  }>;
}

interface BridgeOptions {
  status?: number;
  recorder?: Array<{ event: string; metadata: Record<string, unknown> }>;
}

function makeFetch(mamamia: MamamiaPayload, bridge: BridgeOptions = {}): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const rawBody = (init as { body?: BodyInit } | undefined)?.body;
    const body = typeof rawBody === "string" ? JSON.parse(rawBody) : {};

    if (url.includes("/graphql/auth")) {
      return new Response(
        JSON.stringify({
          data: {
            LoginAgency: { id: 1, name: "Agency", email: "a@b", token: "agency-jwt" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("mamamia.test/graphql")) {
      const opName = (body.query.match(/(?:query|mutation)\s+(\w+)/) || [, ""])[1];
      if (opName === "DetectListApplications") {
        return new Response(
          JSON.stringify({
            data: {
              JobOfferApplicationsWithPagination: {
                total: (mamamia.apps ?? []).length,
                data: mamamia.apps ?? [],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (opName === "DetectListInterests") {
        return new Response(
          JSON.stringify({
            data: {
              JobOffer: { id: body.variables.id, interests: mamamia.interests ?? [] },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (url.includes("/api/lead-event")) {
      if (bridge.recorder) bridge.recorder.push({ event: body.event, metadata: body.metadata });
      return new Response(JSON.stringify({ ok: true }), { status: bridge.status ?? 200 });
    }

    return new Response("unexpected " + url, { status: 500 });
  };
}

function makeSupabase(lead: LeadRow | null, events: EventRow[] = []): DetectSupabase {
  return {
    fetchLead(_id) {
      return Promise.resolve(lead);
    },
    fetchPastEvents(_leadId) {
      return Promise.resolve(events);
    },
  };
}

function makeReq(body: unknown): Request {
  return new Request("https://x/functions/v1/detect-caregiver-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function resetCaches() {
  _resetAgencyTokenCache();
}

// ─── Tests ─────────────────────────────────────────────────────────────────

Deno.test("missing lead_id → 400", async () => {
  resetCaches();
  const res = await handleRequest(makeReq({}), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch({}),
  });
  assertEquals(res.status, 400);
});

Deno.test("lead not found → 404", async () => {
  resetCaches();
  const res = await handleRequest(makeReq({ lead_id: "nope" }), {
    secrets: SECRETS,
    supabase: makeSupabase(null),
    fetchFn: makeFetch({}),
  });
  assertEquals(res.status, 404);
});

Deno.test("lead without mamamia_job_offer_id → 400", async () => {
  resetCaches();
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase({ ...VALID_LEAD, mamamia_job_offer_id: null }),
    fetchFn: makeFetch({}),
  });
  assertEquals(res.status, 400);
  assertStringIncludes(await res.text(), "not onboarded");
});

Deno.test("zero apps + zero interests → counts all 0, no bridge POSTs", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch({}, { recorder }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.new_applications, 0);
  assertEquals(body.new_interests, 0);
  assertEquals(body.bridge_errors, 0);
  assertEquals(recorder.length, 0);
});

Deno.test("one app, zero seen → 1 bridge POST with full caregiver metadata", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const caregiver = makeCaregiver({ id: 50001, hp_total_jobs: 12 });
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch(
      { apps: [{ id: 1, caregiver_id: 50001, caregiver }] },
      { recorder },
    ),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.new_applications, 1);
  assertEquals(recorder.length, 1);
  assertEquals(recorder[0].event, "application_received");
  assertEquals(recorder[0].metadata.caregiver_id, 50001);
  assertEquals(recorder[0].metadata.caregiver_name, "Helena K.");
  assertEquals(recorder[0].metadata.caregiver_badge_level, "Gold");
  assertEquals(recorder[0].metadata.caregiver_einsatz_count, 12);
});

Deno.test("app where caregiver already in past application_received events → dedupe", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const seenEvents: EventRow[] = [
    { event_type: "application_received", caregiver_id: 50001 },
  ];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, seenEvents),
    fetchFn: makeFetch(
      { apps: [{ id: 1, caregiver_id: 50001, caregiver: makeCaregiver() }] },
      { recorder },
    ),
  });
  const body = await res.json();
  assertEquals(body.new_applications, 0);
  assertEquals(recorder.length, 0);
});

Deno.test("rejected interest → skipped, not POSTed", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch(
      {
        interests: [
          {
            id: 9,
            caregiver_id: 50002,
            rejected_at: "2026-05-19T10:00:00Z",
            caregiver: makeCaregiver({ id: 50002 }),
          },
        ],
      },
      { recorder },
    ),
  });
  const body = await res.json();
  assertEquals(body.new_interests, 0);
  assertEquals(recorder.length, 0);
});

Deno.test("interest where caregiver already shown as application_received → suppressed (stronger signal wins)", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, [
      { event_type: "application_received", caregiver_id: 50003 },
    ]),
    fetchFn: makeFetch(
      {
        interests: [
          {
            id: 11,
            caregiver_id: 50003,
            rejected_at: null,
            caregiver: makeCaregiver({ id: 50003 }),
          },
        ],
      },
      { recorder },
    ),
  });
  const body = await res.json();
  assertEquals(body.new_interests, 0);
  assertEquals(recorder.length, 0);
});

Deno.test("app caregiver missing name → skipped_no_caregiver_data, no POST", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch(
      {
        apps: [{
          id: 1,
          caregiver_id: 50004,
          caregiver: makeCaregiver({ id: 50004, first_name: null }),
        }],
      },
      { recorder },
    ),
  });
  const body = await res.json();
  assertEquals(body.new_applications, 0);
  assertEquals(body.skipped_no_caregiver_data, 1);
  assertEquals(recorder.length, 0);
});

Deno.test("bridge returns 500 → bridge_errors increments, sweep continues", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch(
      {
        apps: [
          { id: 1, caregiver_id: 50001, caregiver: makeCaregiver({ id: 50001 }) },
          { id: 2, caregiver_id: 50002, caregiver: makeCaregiver({ id: 50002 }) },
        ],
      },
      { status: 500, recorder },
    ),
  });
  const body = await res.json();
  assertEquals(body.new_applications, 0); // both failed
  assertEquals(body.bridge_errors, 2);
  assertEquals(recorder.length, 2); // both attempts recorded
});

Deno.test("mixed batch: 1 new app + 1 new interest + 1 dedupe → counts split correctly", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, [
      { event_type: "caregiver_interest_shown", caregiver_id: 50010 },
    ]),
    fetchFn: makeFetch(
      {
        apps: [
          { id: 1, caregiver_id: 50020, caregiver: makeCaregiver({ id: 50020, hp_total_jobs: 1 }) },
        ],
        interests: [
          { id: 9, caregiver_id: 50010, rejected_at: null, caregiver: makeCaregiver({ id: 50010 }) },
          { id: 11, caregiver_id: 50030, rejected_at: null, caregiver: makeCaregiver({ id: 50030, hp_total_jobs: 0 }) },
        ],
      },
      { recorder },
    ),
  });
  const body = await res.json();
  assertEquals(body.new_applications, 1);
  assertEquals(body.new_interests, 1);
  assertEquals(recorder.length, 2);
  const events = recorder.map((r) => r.event).sort();
  assertEquals(events, ["application_received", "caregiver_interest_shown"]);
});

// ─── Helper unit tests ─────────────────────────────────────────────────────

Deno.test("mapHpToBadge thresholds", () => {
  assertEquals(mapHpToBadge(null), null);
  assertEquals(mapHpToBadge(0), "Starter");
  assertEquals(mapHpToBadge(1), "Bronze");
  assertEquals(mapHpToBadge(5), "Silber");
  assertEquals(mapHpToBadge(10), "Gold");
  assertEquals(mapHpToBadge(20), "Platin");
  assertEquals(mapHpToBadge(100), "Platin");
});

Deno.test("buildCaregiverMetadata initials + optional fields", () => {
  const meta = buildCaregiverMetadata(50001, makeCaregiver({
    first_name: "Helena",
    last_name: "Kowalski",
    care_experience: 0,         // 0 → omitted
    hp_total_jobs: null,         // null → no einsatz_count
    avatar_retouched: null,
    about_de: null,
  }));
  assertEquals(meta.caregiver_id, 50001);
  assertEquals(meta.caregiver_name, "Helena K.");
  assertEquals(meta.caregiver_badge_level, undefined);
  assertEquals(meta.caregiver_years_experience, undefined);
  assertEquals(meta.caregiver_einsatz_count, undefined);
  assertEquals(meta.caregiver_photo_url, undefined);
  assertEquals(meta.caregiver_about_text, undefined);
});

Deno.test("buildCaregiverMetadata missing first_name → no name field", () => {
  const meta = buildCaregiverMetadata(50001, makeCaregiver({ first_name: null }));
  assertEquals(meta.caregiver_name, undefined);
});
