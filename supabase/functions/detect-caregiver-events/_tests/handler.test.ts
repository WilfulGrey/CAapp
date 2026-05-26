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

interface MamamiaPayload {
  apps?: Array<{ id: number; caregiver_id: number | null; caregiver: CaregiverNode | null }>;
  interests?: Array<{
    id: number;
    caregiver_id: number | null;
    rejected_at: string | null;
    caregiver: CaregiverNode | null;
  }>;
  // Sammelt application_ids, für die RejectApplication aufgerufen wurde
  // (Auto-Reject-Tests). Im Dry-Run muss dieser Recorder leer bleiben.
  rejectRecorder?: number[];
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
      if (opName === "RejectApplication") {
        if (mamamia.rejectRecorder) mamamia.rejectRecorder.push(body.variables.id as number);
        return new Response(
          JSON.stringify({
            data: { RejectApplication: { id: body.variables.id, rejected_at: "2026-05-25T00:00:00Z", reject_message: body.variables.reject_message } },
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

Deno.test("batch mode: one lead's Mamamia call throws → per_lead_errors increments, sweep continues", async () => {
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
  assertEquals(body.leads_processed, 1); // only lead A succeeded
  assertEquals(body.per_lead_errors, 1);
  assertEquals(body.total_new_applications, 1);
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

// ─── 48h Auto-Reject ─────────────────────────────────────────────────────────
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
      { event_type: "application_received", caregiver_id: 50001, created_at: hoursAgo(49) },
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
    { event_type: "application_received", caregiver_id: 50001, created_at: hoursAgo(49) },
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

Deno.test("auto-reject: app jünger als 48h → nicht abgelehnt", async () => {
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
    { event_type: "application_received", caregiver_id: 50001, created_at: hoursAgo(49) },
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
      { event_type: "application_received", caregiver_id: 50001, created_at: hoursAgo(49) },
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
    assertEquals(rej[0].metadata.reason, "auto_timeout_48h");
  } finally {
    Deno.env.delete("AUTO_REJECT_ENABLED");
  }
});
