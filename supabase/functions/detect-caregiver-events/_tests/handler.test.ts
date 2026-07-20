import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  type AppStatusEventRow,
  buildCaregiverMetadata,
  type CaregiverNode,
  cleanAboutText,
  germanLevelLabel,
  type DetectSecrets,
  type DetectSupabase,
  type EventRow,
  handleRequest,
  type LeadRow,
  mapHpToBadge,
} from "../index.ts";
import { _resetAgencyTokenCache } from "../../_shared/mamamiaClient.ts";
import type { LeadJobUpsertRow, RawJobOffer } from "../../_shared/leadJobsSync.ts";

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
    germany_skill: "level_3",
    hp_caregiver_id: 9001,
    hp_total_jobs: 7,
    hp_total_days: 800,
    hp_avg_mission_days: 60,
    avatar_retouched: { aws_url: "https://cdn.test/h.jpg" },
    about_de: "Erfahren mit Demenz.",
    ...overrides,
  };
}

type AppFixture = { id: number; caregiver_id: number | null; caregiver: CaregiverNode | null };
type InterestFixture = { id: number; caregiver_id: number | null; rejected_at: string | null; caregiver: CaregiverNode | null };

interface MamamiaPayload {
  apps?: AppFixture[];
  interests?: InterestFixture[];
  // Multi-Job: per-job applications/interests keyed by job_offer_id. When set,
  // DetectListApplications/DetectListInterests return the per-job list (else
  // they fall back to the flat apps/interests for single-job tests).
  appsByJob?: Record<number, AppFixture[]>;
  interestsByJob?: Record<number, InterestFixture[]>;
  // Sammelt application_ids, für die RejectApplication aufgerufen wurde
  // (Auto-Reject-Tests). Im Dry-Run muss dieser Recorder leer bleiben.
  rejectRecorder?: number[];
  // Multi-Job background sync: Customer.job_offers, die GetCustomerJobOffers
  // zurückgibt.
  jobOffers?: RawJobOffer[];
  // Per-job application totals (LeadJobApplicationCount), keyed by job_offer_id.
  jobAppCounts?: Record<number, number>;
}

interface BridgeOptions {
  status?: number;
  recorder?: Array<{ event: string; metadata: Record<string, unknown>; notify?: boolean }>;
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
        const apps = mamamia.appsByJob
          ? (mamamia.appsByJob[body.variables.job_offer_id as number] ?? [])
          : (mamamia.apps ?? []);
        return new Response(
          JSON.stringify({
            data: {
              JobOfferApplicationsWithPagination: { total: apps.length, data: apps },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (opName === "DetectListInterests") {
        const interests = mamamia.interestsByJob
          ? (mamamia.interestsByJob[body.variables.id as number] ?? [])
          : (mamamia.interests ?? []);
        return new Response(
          JSON.stringify({
            data: {
              JobOffer: { id: body.variables.id, interests },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (opName === "RejectApplication") {
        if (mamamia.rejectRecorder) mamamia.rejectRecorder.push(body.variables.id as number);
        return new Response(
          JSON.stringify({
            data: { RejectApplication: { id: body.variables.id, rejected_at: "2026-05-25T00:00:00Z", reject_message: body.variables.reject_message } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (opName === "GetCustomerJobOffers") {
        return new Response(
          JSON.stringify({
            data: { Customer: { id: body.variables.id, job_offers: mamamia.jobOffers ?? [] } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (opName === "LeadJobApplicationCount") {
        const total = (mamamia.jobAppCounts ?? {})[body.variables.job_offer_id as number] ?? 0;
        return new Response(
          JSON.stringify({ data: { JobOfferApplicationsWithPagination: { total } } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (url.includes("/api/lead-event")) {
      if (bridge.recorder) bridge.recorder.push({ event: body.event, metadata: body.metadata, notify: body.notify });
      return new Response(JSON.stringify({ ok: true }), { status: bridge.status ?? 200 });
    }

    return new Response("unexpected " + url, { status: 500 });
  };
}

function makeSupabase(
  lead: LeadRow | null,
  events: EventRow[] = [],
  appStatusEvents: AppStatusEventRow[] = [],
): DetectSupabase {
  return {
    fetchLead(_id) {
      return Promise.resolve(lead);
    },
    fetchActiveLeads() {
      return Promise.resolve(lead ? [lead] : []);
    },
    fetchPastEvents(_leadId) {
      return Promise.resolve(events);
    },
    fetchAppStatusEvents(_leadId) {
      return Promise.resolve(appStatusEvents);
    },
    refreshReminderPhotos(_leadId, _photoByCaregiver) {
      return Promise.resolve(0);
    },
  };
}

// Multi-lead supabase fake for batch mode tests.
function makeBatchSupabase(
  leads: LeadRow[],
  eventsByLead: Record<string, EventRow[]> = {},
): DetectSupabase {
  return {
    fetchLead(id) {
      return Promise.resolve(leads.find((l) => l.id === id) ?? null);
    },
    fetchActiveLeads() {
      return Promise.resolve(leads);
    },
    fetchPastEvents(leadId) {
      return Promise.resolve(eventsByLead[leadId] ?? []);
    },
    fetchAppStatusEvents(_leadId) {
      return Promise.resolve([]);
    },
    refreshReminderPhotos(_leadId, _photoByCaregiver) {
      return Promise.resolve(0);
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

Deno.test("non-string lead_id → 400", async () => {
  resetCaches();
  const res = await handleRequest(makeReq({ lead_id: 123 }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch({}),
  });
  assertEquals(res.status, 400);
});

Deno.test("empty body → batch mode (cron path)", async () => {
  resetCaches();
  const res = await handleRequest(
    new Request("https://x/functions/v1/detect-caregiver-events", {
      method: "POST",
    }),
    {
      secrets: SECRETS,
      supabase: makeBatchSupabase([]),
      fetchFn: makeFetch({}),
    },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.mode, "batch");
  assertEquals(body.leads_processed, 0);
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

Deno.test("batch mode: 2 active leads with apps → aggregate counts + per-lead bridge calls", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const leadA: LeadRow = { ...VALID_LEAD, id: "lead-a", token: "tok-a", mamamia_job_offer_id: 1001 };
  const leadB: LeadRow = { ...VALID_LEAD, id: "lead-b", token: "tok-b", mamamia_job_offer_id: 1002 };
  const res = await handleRequest(
    new Request("https://x/functions/v1/detect-caregiver-events", { method: "POST" }),
    {
      secrets: SECRETS,
      supabase: makeBatchSupabase([leadA, leadB]),
      // Both leads see the same fake Mamamia state (1 app each).
      fetchFn: makeFetch(
        { apps: [{ id: 1, caregiver_id: 50001, caregiver: makeCaregiver({ id: 50001 }) }] },
        { recorder },
      ),
    },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.mode, "batch");
  assertEquals(body.leads_processed, 2);
  assertEquals(body.total_new_applications, 2);
  assertEquals(body.per_lead_errors, 0);
  // Each lead → 1 bridge POST, each with its own token.
  assertEquals(recorder.length, 2);
});

Deno.test("batch mode: one lead's job scan throws → isolated as job_scan_error, sweep continues", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const leadA: LeadRow = { ...VALID_LEAD, id: "lead-a", token: "tok-a", mamamia_job_offer_id: 1001 };
  const leadB: LeadRow = { ...VALID_LEAD, id: "lead-b", token: "tok-b", mamamia_job_offer_id: 9999 };

  // Custom fetchFn — lead B's job_offer_id triggers a GraphQL error.
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const rawBody = (init as { body?: BodyInit } | undefined)?.body;
    const reqBody = typeof rawBody === "string" ? JSON.parse(rawBody) : {};
    if (url.includes("/graphql/auth")) {
      return new Response(JSON.stringify({ data: { LoginAgency: { id: 1, name: "A", email: "a", token: "t" } } }), { status: 200 });
    }
    if (url.includes("mamamia.test/graphql")) {
      const opName = (reqBody.query.match(/(?:query|mutation)\s+(\w+)/) || [, ""])[1];
      const jobOfferId = reqBody.variables?.job_offer_id ?? reqBody.variables?.id;
      if (jobOfferId === 9999) {
        return new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 200 });
      }
      if (opName === "DetectListApplications") {
        return new Response(JSON.stringify({ data: { JobOfferApplicationsWithPagination: { total: 1, data: [{ id: 1, caregiver_id: 50001, caregiver: makeCaregiver({ id: 50001 }) }] } } }), { status: 200 });
      }
      if (opName === "DetectListInterests") {
        return new Response(JSON.stringify({ data: { JobOffer: { id: jobOfferId, interests: [] } } }), { status: 200 });
      }
    }
    if (url.includes("/api/lead-event")) {
      recorder.push({ event: reqBody.event, metadata: reqBody.metadata });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  };

  const res = await handleRequest(
    new Request("https://x/functions/v1/detect-caregiver-events", { method: "POST" }),
    {
      secrets: SECRETS,
      supabase: makeBatchSupabase([leadA, leadB]),
      fetchFn,
    },
  );
  const body = await res.json();
  // Per-job isolation: lead B's job 9999 apps query errors, but that's caught
  // inside the per-job loop — the lead is still "processed", no per_lead_error.
  assertEquals(body.leads_processed, 2);
  assertEquals(body.per_lead_errors, 0);
  assertEquals(body.total_job_scan_errors, 1); // lead B's job 9999
  assertEquals(body.total_new_applications, 1); // lead A's app (default job notifies)
});

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
  // germany_skill level_3 (Fixture-Default) → "B1-B2"; year_of_birth 1980 → Alter
  assertEquals(meta.caregiver_german_level, "B1-B2");
  assertEquals(typeof meta.caregiver_age, "number");
});

Deno.test("buildCaregiverMetadata Foto-Queue: avatar_retouched_promo bevorzugt vor retouched", () => {
  const promo = buildCaregiverMetadata(50001, makeCaregiver({
    avatar_retouched_promo: { aws_url: "https://cdn.test/promo.jpg" },
    avatar_retouched: { aws_url: "https://cdn.test/retouched.jpg" },
  }));
  assertEquals(promo.caregiver_photo_url, "https://cdn.test/promo.jpg");
  // promo fehlt / leer → fällt auf retouched zurück
  const fallback = buildCaregiverMetadata(50001, makeCaregiver({
    avatar_retouched_promo: { aws_url: null },
    avatar_retouched: { aws_url: "https://cdn.test/retouched.jpg" },
  }));
  assertEquals(fallback.caregiver_photo_url, "https://cdn.test/retouched.jpg");
});

Deno.test("germanLevelLabel mappt germany_skill auf CEFR", () => {
  assertEquals(germanLevelLabel("level_0"), "A1");
  assertEquals(germanLevelLabel("level_3"), "B1-B2");
  assertEquals(germanLevelLabel("level_4"), "B2-C1");
  assertEquals(germanLevelLabel(null), null);
  assertEquals(germanLevelLabel("weird"), null);
});

Deno.test("buildCaregiverMetadata missing first_name → no name field", () => {
  const meta = buildCaregiverMetadata(50001, makeCaregiver({ first_name: null }));
  assertEquals(meta.caregiver_name, undefined);
});

Deno.test("refreshReminderPhotos: detect übergibt frische Foto-URLs aus apps", async () => {
  resetCaches();
  let captured: Map<number, string> | null = null;
  const supa: DetectSupabase = {
    fetchLead: (_id) => Promise.resolve(VALID_LEAD),
    fetchActiveLeads: () => Promise.resolve([VALID_LEAD]),
    fetchPastEvents: (_l) => Promise.resolve(SEEN_50001), // app schon gesehen → kein neuer Event
    fetchAppStatusEvents: (_l) => Promise.resolve([]),
    refreshReminderPhotos: (_l, m) => {
      captured = m;
      return Promise.resolve(m.size);
    },
  };
  const caregiver = makeCaregiver({ id: 50001, avatar_retouched: { aws_url: "https://cdn.test/fresh-50001.jpg" } });
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: supa,
    fetchFn: makeFetch({ apps: [{ id: 1, caregiver_id: 50001, caregiver }] }),
  });
  assertEquals(res.status, 200);
  assertEquals(captured !== null, true);
  assertEquals(captured!.get(50001), "https://cdn.test/fresh-50001.jpg");
});

Deno.test("cleanAboutText filtert Mamamia-Platzhalter raus", () => {
  assertEquals(cleanAboutText("Bitte geben Sie den Text an, den Sie ins Deutsche übersetzen möchten."), null);
  assertEquals(cleanAboutText("  "), null);
  assertEquals(cleanAboutText(null), null);
  assertEquals(cleanAboutText("Ich betreue mit Herz und Geduld."), "Ich betreue mit Herz und Geduld.");
});

Deno.test("buildCaregiverMetadata: Platzhalter-about_de wird nicht übernommen", () => {
  const meta = buildCaregiverMetadata(50001, makeCaregiver({ about_de: "Bitte geben Sie den Text an, den Sie ins Deutsche übersetzen möchten." }));
  assertEquals(meta.caregiver_about_text, undefined);
});

// ─── 72h Auto-Reject ─────────────────────────────────────────────────────────
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

// Bewerbung schon als application_received "gesehen" (kein neuer Bridge-Event),
// damit der Test nur den Auto-Reject isoliert.
const SEEN_50001: EventRow[] = [{ event_type: "application_received", caregiver_id: 50001 }];

Deno.test("auto-reject DRY-RUN (Kill-Switch AUTO_REJECT_ENABLED=false): stale app → gezählt, KEIN Mamamia-Reject, KEIN bridge event", async () => {
  resetCaches();
  Deno.env.set("AUTO_REJECT_ENABLED", "false"); // Kill-Switch — Default ist sonst scharf
  try {
    const recorder: BridgeOptions["recorder"] = [];
    const rejectRecorder: number[] = [];
    const appStatus: AppStatusEventRow[] = [
      { event_type: "application_received", caregiver_id: 50001, created_at: hoursAgo(73) },
    ];
    const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
      secrets: SECRETS,
      supabase: makeSupabase(VALID_LEAD, SEEN_50001, appStatus),
      fetchFn: makeFetch({ apps: [{ id: 777, caregiver_id: 50001, caregiver: makeCaregiver() }], rejectRecorder }, { recorder }),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.auto_rejected, 1);
    assertEquals(rejectRecorder.length, 0); // Dry-Run: kein echter Reject
    assertEquals(recorder.filter((r) => r.event === "application_rejected").length, 0);
  } finally {
    Deno.env.delete("AUTO_REJECT_ENABLED");
  }
});

Deno.test("auto-reject DEFAULT (kein Env): stale app → SCHARF, Mamamia-Reject + bridge event", async () => {
  resetCaches();
  Deno.env.delete("AUTO_REJECT_ENABLED"); // Default = live
  const recorder: BridgeOptions["recorder"] = [];
  const rejectRecorder: number[] = [];
  const appStatus: AppStatusEventRow[] = [
    { event_type: "application_received", caregiver_id: 50001, created_at: hoursAgo(73) },
  ];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, SEEN_50001, appStatus),
    fetchFn: makeFetch({ apps: [{ id: 777, caregiver_id: 50001, caregiver: makeCaregiver() }], rejectRecorder }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.auto_rejected, 1);
  assertEquals(rejectRecorder, [777]); // Default scharf → echter Reject
  assertEquals(recorder.filter((r) => r.event === "application_rejected").length, 1);
});

Deno.test("auto-reject: app jünger als 72h → nicht abgelehnt", async () => {
  resetCaches();
  const rejectRecorder: number[] = [];
  const appStatus: AppStatusEventRow[] = [
    { event_type: "application_received", caregiver_id: 50001, created_at: hoursAgo(10) },
  ];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, SEEN_50001, appStatus),
    fetchFn: makeFetch({ apps: [{ id: 777, caregiver_id: 50001, caregiver: makeCaregiver() }], rejectRecorder }),
  });
  const body = await res.json();
  assertEquals(body.auto_rejected, 0);
  assertEquals(rejectRecorder.length, 0);
});

Deno.test("auto-reject: Kunde hat bereits reagiert → nicht abgelehnt", async () => {
  resetCaches();
  const rejectRecorder: number[] = [];
  const appStatus: AppStatusEventRow[] = [
    { event_type: "application_received", caregiver_id: 50001, created_at: hoursAgo(73) },
    { event_type: "application_rejected", caregiver_id: 50001, created_at: hoursAgo(10) },
  ];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, SEEN_50001, appStatus),
    fetchFn: makeFetch({ apps: [{ id: 777, caregiver_id: 50001, caregiver: makeCaregiver() }], rejectRecorder }),
  });
  const body = await res.json();
  assertEquals(body.auto_rejected, 0);
  assertEquals(rejectRecorder.length, 0);
});

Deno.test("auto-reject: kein application_received-Event (nie informiert) → nicht abgelehnt", async () => {
  resetCaches();
  const rejectRecorder: number[] = [];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, SEEN_50001, []), // keine Status-Events
    fetchFn: makeFetch({ apps: [{ id: 777, caregiver_id: 50001, caregiver: makeCaregiver() }], rejectRecorder }),
  });
  const body = await res.json();
  assertEquals(body.auto_rejected, 0);
  assertEquals(rejectRecorder.length, 0);
});

Deno.test("auto-reject LIVE (AUTO_REJECT_ENABLED=true): stale app → Mamamia-Reject + bridge event mit reason", async () => {
  resetCaches();
  Deno.env.set("AUTO_REJECT_ENABLED", "true");
  try {
    const recorder: BridgeOptions["recorder"] = [];
    const rejectRecorder: number[] = [];
    const appStatus: AppStatusEventRow[] = [
      { event_type: "application_received", caregiver_id: 50001, created_at: hoursAgo(73) },
    ];
    const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
      secrets: SECRETS,
      supabase: makeSupabase(VALID_LEAD, SEEN_50001, appStatus),
      fetchFn: makeFetch({ apps: [{ id: 777, caregiver_id: 50001, caregiver: makeCaregiver() }], rejectRecorder }, { recorder }),
    });
    const body = await res.json();
    assertEquals(body.auto_rejected, 1);
    assertEquals(rejectRecorder, [777]); // echter Mamamia-Reject
    const rej = recorder.filter((r) => r.event === "application_rejected");
    assertEquals(rej.length, 1);
    assertEquals(rej[0].metadata.application_id, 777);
    assertEquals(rej[0].metadata.reason, "auto_timeout_72h");
  } finally {
    Deno.env.delete("AUTO_REJECT_ENABLED");
  }
});

Deno.test("batch: background-syncs lead_jobs from Customer.job_offers (Multi-Job)", async () => {
  resetCaches();
  const captured: Array<{ leadId: string; jobs: LeadJobUpsertRow[] }> = [];
  const supabase: DetectSupabase = {
    ...makeSupabase(VALID_LEAD),
    upsertLeadJobs(leadId, jobs) {
      captured.push({ leadId, jobs });
      return Promise.resolve();
    },
  };
  const res = await handleRequest(makeReq({}), {
    secrets: SECRETS,
    supabase,
    fetchFn: makeFetch({
      jobOffers: [
        // geplant → bewerbungen from the per-job count query, no pflegekraft
        { id: 16371, status: "search", arrival_at: "2026-06-15 00:00:00", departure_at: null, final_confirmation: null },
        // booked → pflegekraft from final_confirmation.caregiver (not geplant → no count)
        { id: 16356, status: "on_job", arrival_at: "2099-01-01 00:00:00", departure_at: "2099-12-31 00:00:00", final_confirmation: { id: 1, caregiver: { first_name: "Anna", last_name: "T." } } },
        { id: 99999, status: "some_unmapped_state", arrival_at: null, departure_at: null, final_confirmation: null },
      ],
      jobAppCounts: { 16371: 2 },
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  // 2 mapped (search→geplant, on_job→gebucht), 1 unmapped → skipped + logged
  assertEquals(body.total_lead_jobs_synced, 2);
  assertEquals(captured.length, 1);
  assertEquals(captured[0].leadId, VALID_LEAD.id);
  assertEquals(captured[0].jobs, [
    { mamamia_job_offer_id: 16371, status: "geplant", anreise: "2026-06-15", abreise: null, pflegekraft: null, bewerbungen: 2 },
    { mamamia_job_offer_id: 16356, status: "gebucht", anreise: "2099-01-01", abreise: "2099-12-31", pflegekraft: "Anna T.", bewerbungen: null },
  ]);
});

Deno.test("batch: no upsertLeadJobs adapter → job sync skipped, no crash", async () => {
  resetCaches();
  // makeSupabase fake has NO upsertLeadJobs → the sync block is skipped entirely
  // (same shape as production before this feature). total stays 0.
  const res = await handleRequest(makeReq({}), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch({
      jobOffers: [{ id: 1, status: "search", arrival_at: null, departure_at: null, final_confirmation: null }],
    }),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.total_lead_jobs_synced, 0);
});

// ─── Multi-Job per-job detection (Phase 2B) ─────────────────────────────────

const JOB_B = 16371; // a follow-up (non-default) job; default = VALID_LEAD.mamamia_job_offer_id
const searchJob = (id: number): RawJobOffer => ({ id, status: "search", arrival_at: "2099-01-01 00:00:00", departure_at: null, final_confirmation: null });
const appOn = (id: number, cg: number) => ({ id, caregiver_id: cg, caregiver: makeCaregiver({ id: cg }) });

Deno.test("multi-job: first scan of a follow-up job SEEDS silently (notify=false, seeded)", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD), // no past events → JOB_B has no history
    fetchFn: makeFetch({ jobOffers: [searchJob(JOB_B)], appsByJob: { [JOB_B]: [appOn(1, 60001)] } }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.new_applications, 1);
  assertEquals(body.jobs_scanned, 2); // default + JOB_B
  assertEquals(recorder.length, 1);
  assertEquals(recorder[0].event, "application_received");
  assertEquals(recorder[0].notify, false); // seed → silent
  assertEquals(recorder[0].metadata.seeded, true);
  assertEquals(recorder[0].metadata.mamamia_job_offer_id, JOB_B);
});

Deno.test("multi-job: follow-up job WITH history notifies a new application (notify=true)", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const past: EventRow[] = [{ event_type: "caregiver_interest_shown", caregiver_id: 70000, mamamia_job_offer_id: JOB_B }];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, past),
    fetchFn: makeFetch({ jobOffers: [searchJob(JOB_B)], appsByJob: { [JOB_B]: [appOn(1, 60001)] } }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.new_applications, 1);
  const appEvt = recorder.find((r) => r.event === "application_received");
  assertEquals(appEvt?.notify, true);
  assertEquals(appEvt?.metadata.mamamia_job_offer_id, JOB_B);
});

Deno.test("multi-job: same caregiver on default + follow-up → two events (one per job)", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const def = VALID_LEAD.mamamia_job_offer_id as number;
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch({ jobOffers: [searchJob(JOB_B)], appsByJob: { [def]: [appOn(1, 50001)], [JOB_B]: [appOn(2, 50001)] } }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.new_applications, 2);
  assertEquals(recorder.find((r) => r.metadata.mamamia_job_offer_id === def)?.notify, true); // default notifies
  assertEquals(recorder.find((r) => r.metadata.mamamia_job_offer_id === JOB_B)?.notify, false); // follow-up first scan seeds
});

Deno.test("multi-job: per-job dedup — past app on default suppresses default, fires on follow-up", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const def = VALID_LEAD.mamamia_job_offer_id as number;
  const past: EventRow[] = [{ event_type: "application_received", caregiver_id: 50001, mamamia_job_offer_id: def }];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, past),
    fetchFn: makeFetch({ jobOffers: [searchJob(JOB_B)], appsByJob: { [def]: [appOn(1, 50001)], [JOB_B]: [appOn(2, 50001)] } }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.new_applications, 1); // default suppressed, JOB_B fires
  assertEquals(recorder.length, 1);
  assertEquals(recorder[0].metadata.mamamia_job_offer_id, JOB_B);
});

Deno.test("multi-job: legacy NULL-job past event maps onto the default job (dedups default)", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const def = VALID_LEAD.mamamia_job_offer_id as number;
  const past: EventRow[] = [{ event_type: "application_received", caregiver_id: 50001, mamamia_job_offer_id: null }];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, past),
    fetchFn: makeFetch({ appsByJob: { [def]: [appOn(1, 50001)] } }, { recorder }), // no jobOffers → default only
  });
  const body = await res.json();
  assertEquals(body.new_applications, 0); // NULL legacy → default job → caregiver already seen
  assertEquals(recorder.length, 0);
});

Deno.test("multi-job: interest→application suppression is per-job", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const def = VALID_LEAD.mamamia_job_offer_id as number;
  // App on the DEFAULT job for cg 50001 must NOT suppress that caregiver's
  // interest on the follow-up job.
  const past: EventRow[] = [{ event_type: "application_received", caregiver_id: 50001, mamamia_job_offer_id: def }];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, past),
    fetchFn: makeFetch({
      jobOffers: [searchJob(JOB_B)],
      interestsByJob: { [JOB_B]: [{ id: 5, caregiver_id: 50001, rejected_at: null, caregiver: makeCaregiver({ id: 50001 }) }] },
    }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.new_interests, 1);
  assertEquals(recorder.find((r) => r.event === "caregiver_interest_shown")?.metadata.mamamia_job_offer_id, JOB_B);
});

Deno.test("multi-job: backward compat — no mamamia_customer_id scans only the default job", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const lead: LeadRow = { ...VALID_LEAD, mamamia_customer_id: null };
  const res = await handleRequest(makeReq({ lead_id: lead.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(lead),
    fetchFn: makeFetch({ apps: [appOn(1, 50001)] }, { recorder }), // flat fallback
  });
  const body = await res.json();
  assertEquals(body.jobs_scanned, 1);
  assertEquals(body.lead_jobs_synced, 0);
  assertEquals(body.new_applications, 1);
  assertEquals(recorder[0].notify, true); // default job always notifies
  assertEquals(recorder[0].metadata.mamamia_job_offer_id, lead.mamamia_job_offer_id);
});

// ─── Annahme-Detektor (SA-Portal-Annahme → final_confirmation → Mail C) ─────
// Erkennt frische final_confirmations der gescannten Jobs und feuert das
// Bridge-Event application_accepted_internal (Mail C + Team-Buchungsmail baut
// route.ts). Dedupe lead-weit über lead_events (fetchPastEvents), 7-Tage-
// Cutoff gegen Altbestand, kein Feuern ohne notify (silent-seed Jobs).

const daysAgoISO = (d: number) => new Date(Date.now() - d * 24 * 3_600_000).toISOString();

function bookedJob(
  id: number,
  confirmedAt: string | null,
  cg: { id?: number | null; first_name?: string | null; last_name?: string | null } | null = { id: 50001, first_name: "Helena", last_name: "Kowalski" },
): RawJobOffer {
  return {
    id,
    status: "on_job",
    arrival_at: "2099-01-01 00:00:00",
    departure_at: "2099-12-31 00:00:00",
    final_confirmation: { id: 900, final_confirmed_at: confirmedAt, caregiver: cg },
  };
}

Deno.test("annahme: frische final_confirmation ohne vorhandenes Event → application_accepted_internal mit Caregiver + Job-Konditionen", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const def = VALID_LEAD.mamamia_job_offer_id as number;
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch({ jobOffers: [bookedJob(def, daysAgoISO(1))] }, { recorder }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.accepted_detected, 1);
  assertEquals(recorder.length, 1);
  assertEquals(recorder[0].event, "application_accepted_internal");
  assertEquals(recorder[0].notify, true);
  assertEquals(recorder[0].metadata.caregiver_id, 50001);
  assertEquals(recorder[0].metadata.caregiver_name, "Helena K.");
  assertEquals(recorder[0].metadata.mamamia_job_offer_id, def);
  assertEquals(recorder[0].metadata.offer_arrival_at, "2099-01-01 00:00:00");
  assertEquals(recorder[0].metadata.offer_departure_at, "2099-12-31 00:00:00");
  assertEquals(recorder[0].metadata.seeded, undefined); // echte Annahme, kein Seed
});

Deno.test("annahme: Event existiert bereits (Portal-Annahme, NULL-Job) → kein Bridge-Call", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const def = VALID_LEAD.mamamia_job_offer_id as number;
  // Portal-Annahmen tragen keine mamamia_job_offer_id-Spalte → Dedupe muss
  // lead-weit über die caregiver_id greifen.
  const past: EventRow[] = [
    { event_type: "application_accepted_internal", caregiver_id: 50001 },
  ];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, past),
    fetchFn: makeFetch({ jobOffers: [bookedJob(def, daysAgoISO(1))] }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.accepted_detected, 0);
  assertEquals(recorder.length, 0);
});

Deno.test("annahme: final_confirmed_at älter als 7 Tage (Altbestand) → kein Bridge-Call", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const def = VALID_LEAD.mamamia_job_offer_id as number;
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch({ jobOffers: [bookedJob(def, daysAgoISO(8))] }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.accepted_detected, 0);
  assertEquals(recorder.length, 0);
});

Deno.test("annahme: fehlendes final_confirmed_at → kein Bridge-Call (kein Frische-Anker)", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const def = VALID_LEAD.mamamia_job_offer_id as number;
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch({ jobOffers: [bookedJob(def, null)] }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.accepted_detected, 0);
  assertEquals(recorder.length, 0);
});

Deno.test("annahme: zweiter Scan-Lauf (Event aus Lauf 1 in lead_events) → kein Doppel-Call", async () => {
  resetCaches();
  const def = VALID_LEAD.mamamia_job_offer_id as number;
  const offers = { jobOffers: [bookedJob(def, daysAgoISO(1))] };

  // Lauf 1: keine Events → feuert.
  const rec1: BridgeOptions["recorder"] = [];
  const res1 = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch(offers, { recorder: rec1 }),
  });
  assertEquals((await res1.json()).accepted_detected, 1);
  assertEquals(rec1.filter((r) => r.event === "application_accepted_internal").length, 1);

  // Lauf 2: die Bridge hat das Event inzwischen persistiert → Dedupe greift.
  const rec2: BridgeOptions["recorder"] = [];
  const past: EventRow[] = [
    { event_type: "application_accepted_internal", caregiver_id: 50001, mamamia_job_offer_id: def },
  ];
  const res2 = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, past),
    fetchFn: makeFetch(offers, { recorder: rec2 }),
  });
  assertEquals((await res2.json()).accepted_detected, 0);
  assertEquals(rec2.length, 0);
});

Deno.test("annahme: Follow-up-Job ohne Historie (notify=false) → Event wird GAR NICHT gefeuert", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  // Gebuchter Nicht-Default-Job ohne jede Event-Historie → silent-seed-Modus.
  // Ein seeded Accepted-Event würde route.ts' Lead-Dedupe für spätere echte
  // Buchungen blockieren → hier darf überhaupt nichts gefeuert werden.
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch({ jobOffers: [bookedJob(JOB_B, daysAgoISO(1))] }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.jobs_scanned, 2); // default + JOB_B wurden gescannt
  assertEquals(body.accepted_detected, 0);
  assertEquals(recorder.length, 0); // weder Annahme- noch Seed-Event
});

Deno.test("annahme: Follow-up-Job MIT Historie → feuert (notify=true)", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  // Historie: die Bewerbung wurde dem Kunden früher gemailt (application_received).
  const past: EventRow[] = [
    { event_type: "application_received", caregiver_id: 50001, mamamia_job_offer_id: JOB_B },
  ];
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD, past),
    fetchFn: makeFetch({ jobOffers: [bookedJob(JOB_B, daysAgoISO(1))] }, { recorder }),
  });
  const body = await res.json();
  assertEquals(body.accepted_detected, 1);
  const evt = recorder.find((r) => r.event === "application_accepted_internal");
  assertEquals(evt?.notify, true);
  assertEquals(evt?.metadata.mamamia_job_offer_id, JOB_B);
});

Deno.test("annahme: Confirmation ohne caregiver.id → kein Call, Scan läuft weiter", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const def = VALID_LEAD.mamamia_job_offer_id as number;
  const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
    secrets: SECRETS,
    supabase: makeSupabase(VALID_LEAD),
    fetchFn: makeFetch({ jobOffers: [bookedJob(def, daysAgoISO(1), { first_name: "Helena", last_name: "Kowalski" })] }, { recorder }),
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.accepted_detected, 0);
  assertEquals(recorder.length, 0);
});

Deno.test("multi-job: auto-reject is per-job; a seeded-only anchor is never rejected", async () => {
  resetCaches();
  const recorder: BridgeOptions["recorder"] = [];
  const rejectRecorder: number[] = [];
  const old = new Date(Date.now() - 73 * 3600 * 1000).toISOString();
  const statusEvents: AppStatusEventRow[] = [
    // real (mailed) anchor → reject-eligible
    { event_type: "application_received", caregiver_id: 50001, created_at: old, mamamia_job_offer_id: JOB_B },
    // seeded anchor (never mailed) → must NOT be rejected (guard 1)
    { event_type: "application_received", caregiver_id: 80002, created_at: old, mamamia_job_offer_id: JOB_B, seeded: true },
  ];
  // past events mark both caregivers as already seen so the scan doesn't re-fire.
  const past: EventRow[] = [
    { event_type: "application_received", caregiver_id: 50001, mamamia_job_offer_id: JOB_B },
    { event_type: "application_received", caregiver_id: 80002, mamamia_job_offer_id: JOB_B },
  ];
  Deno.env.set("AUTO_REJECT_ENABLED", "true");
  try {
    const res = await handleRequest(makeReq({ lead_id: VALID_LEAD.id }), {
      secrets: SECRETS,
      supabase: makeSupabase(VALID_LEAD, past, statusEvents),
      fetchFn: makeFetch({
        jobOffers: [searchJob(JOB_B)],
        appsByJob: { [JOB_B]: [appOn(777, 50001), appOn(888, 80002)] },
        rejectRecorder,
      }, { recorder }),
    });
    const body = await res.json();
    assertEquals(body.auto_rejected, 1); // only 777 (real anchor); 888 seeded → spared
    assertEquals(rejectRecorder, [777]);
    const rej = recorder.find((r) => r.event === "application_rejected");
    assertEquals(rej?.metadata.mamamia_job_offer_id, JOB_B);
    assertEquals(rej?.metadata.application_id, 777);
  } finally {
    Deno.env.delete("AUTO_REJECT_ENABLED");
  }
});
