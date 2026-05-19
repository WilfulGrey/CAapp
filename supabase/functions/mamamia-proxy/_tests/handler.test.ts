import { assertEquals } from "@std/assert";
import { handleRequest } from "../index.ts";
import { createSessionToken } from "../../_shared/session.ts";
import { _resetRateLimit } from "../../_shared/rateLimit.ts";
import { _resetAgencyTokenCache } from "../../_shared/mamamiaClient.ts";

const SECRETS = {
  mamamiaEndpoint: "https://beta/graphql",
  mamamiaAuthEndpoint: "https://beta/graphql/auth",
  mamamiaAgencyEmail: "p@e",
  mamamiaAgencyPassword: "pw",
  sessionJwtSecret: "x".repeat(40),
  mamamiaPanelUrl: "https://beta.example/backend",
  supabaseUrl: "https://supabase.test",
  supabaseServiceKey: "test-service-key",
};

const SESSION_PAYLOAD = {
  customer_id: 7570,
  job_offer_id: 16226,
  lead_id: "c4286032-9e06-453d-93f2-52779127c8e5",
  email: "test@example.com",
};

function okFetch(response: object): typeof fetch {
  return async () => new Response(JSON.stringify(response), { status: 200 });
}

async function makeCookie(): Promise<string> {
  const jwt = await createSessionToken(SESSION_PAYLOAD, SECRETS.sessionJwtSecret);
  return `session=${jwt}`;
}

function baseReq(body: object, cookie: string | null = null) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "http://localhost:5173",
  };
  if (cookie) headers["cookie"] = cookie;
  return new Request("https://edge/fn/mamamia-proxy", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────

Deno.test("OPTIONS preflight returns 204 with CORS headers", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const req = new Request("https://edge/fn/mamamia-proxy", {
    method: "OPTIONS",
    headers: { origin: "http://localhost:5173" },
  });
  const res = await handleRequest(req, { secrets: SECRETS, fetchFn: okFetch({}) });
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-credentials"), "true");
});

Deno.test("POST without session cookie returns 401", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const res = await handleRequest(
    baseReq({ action: "getJobOffer" }),
    { secrets: SECRETS, fetchFn: okFetch({}) },
  );
  assertEquals(res.status, 401);
});

Deno.test("POST with invalid session cookie returns 401", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const res = await handleRequest(
    baseReq({ action: "getJobOffer" }, "session=not-a-valid-jwt"),
    { secrets: SECRETS, fetchFn: okFetch({}) },
  );
  assertEquals(res.status, 401);
});

Deno.test("POST with valid session + getJobOffer returns 200 + data (no Mamamia token leak)", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();

  // First fetch = LoginAgency (mamamiaClient module cache), second = GET_JOB_OFFER
  let callIdx = 0;
  const fetchFn: typeof fetch = async () => {
    callIdx++;
    if (callIdx === 1) {
      return new Response(
        JSON.stringify({ data: { LoginAgency: { id: 1, name: "P", email: "x", token: "agency-token" } } }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({ data: { JobOffer: { id: 16226, salary_offered: 2750 } } }),
      { status: 200 },
    );
  };

  const cookie = await makeCookie();
  const res = await handleRequest(
    baseReq({ action: "getJobOffer" }, cookie),
    { secrets: SECRETS, fetchFn },
  );
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.data.JobOffer.salary_offered, 2750);
  // No leak of agency token in response
  const bodyStr = JSON.stringify(body);
  assertEquals(bodyStr.includes("agency-token"), false);
});

Deno.test("POST with unknown action returns 400", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  const res = await handleRequest(
    baseReq({ action: "dropAllTables" }, cookie),
    { secrets: SECRETS, fetchFn: okFetch({}) },
  );
  assertEquals(res.status, 400);
});

Deno.test("POST without action field returns 400", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  const res = await handleRequest(
    baseReq({ variables: { id: 1 } }, cookie),
    { secrets: SECRETS, fetchFn: okFetch({}) },
  );
  assertEquals(res.status, 400);
});

Deno.test("POST with action but malformed JSON body returns 400", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  const req = new Request("https://edge/fn/mamamia-proxy", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: "not json",
  });
  const res = await handleRequest(req, { secrets: SECRETS, fetchFn: okFetch({}) });
  assertEquals(res.status, 400);
});

Deno.test("POST with Mamamia error returns 502 (action failed, generic)", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();

  let callIdx = 0;
  const fetchFn: typeof fetch = async () => {
    callIdx++;
    if (callIdx === 1) {
      return new Response(
        JSON.stringify({ data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ errors: [{ message: "Mamamia server fault" }] }), { status: 200 });
  };

  const cookie = await makeCookie();
  const res = await handleRequest(
    baseReq({ action: "getJobOffer" }, cookie),
    { secrets: SECRETS, fetchFn },
  );
  assertEquals(res.status, 502);
  const body = await res.json();
  // Generic — no internals leak
  assertEquals(body.error, "upstream failed");
  // No `cat=` in the agency-flow error message, so category is null. Body still
  // exposes the field for client-side consistency.
  assertEquals(body.category, null);
});

Deno.test("POST inviteCaregiver with cat=authorization surfaces category in 502 body", async () => {
  // Frontend uses body.category === 'authorization' to silently retry around
  // Mamamia's transient "Unauthorized" on StoreRequest right after customer
  // save (server-side state warm-up). This test pins the wire-shape contract:
  // a panel-client error containing cat=authorization must produce
  // {error, category: "authorization"} in the body.
  _resetRateLimit(); _resetAgencyTokenCache();

  let i = 0;
  const responses: Array<{ status: number; json?: unknown; setCookie?: string[] }> = [
    // 1. /sanctum/csrf-cookie
    { status: 204, setCookie: ["XSRF-TOKEN=t1; path=/", "mamamia_beta_session=s1; httponly"] },
    // 2. LoginAgency
    {
      status: 200,
      json: { data: { LoginAgency: { id: 1, email: "x" } } },
      setCookie: ["XSRF-TOKEN=t2; path=/", "mamamia_beta_session=s2; httponly"],
    },
    // 3. StoreRequest — fails with Unauthorized (transient race shape)
    {
      status: 200,
      json: {
        errors: [
          {
            message: "Unauthorized",
            extensions: { category: "authorization" },
          },
        ],
      },
    },
  ];
  const fetchFn: typeof fetch = async () => {
    const r = responses[i++];
    const headers = new Headers();
    for (const sc of r.setCookie ?? []) headers.append("set-cookie", sc);
    const bodyAllowed = r.status !== 204 && r.status !== 304;
    return new Response(
      bodyAllowed && r.json !== undefined ? JSON.stringify(r.json) : null,
      { status: r.status, headers },
    );
  };

  const cookie = await makeCookie();
  const res = await handleRequest(
    baseReq({ action: "inviteCaregiver", variables: { caregiver_id: 10061 } }, cookie),
    { secrets: SECRETS, fetchFn },
  );
  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.error, "upstream failed");
  assertEquals(body.category, "authorization");
});

Deno.test("GET method returns 405", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const req = new Request("https://edge/fn/mamamia-proxy", { method: "GET" });
  const res = await handleRequest(req, { secrets: SECRETS, fetchFn: okFetch({}) });
  assertEquals(res.status, 405);
});

Deno.test("Rate limit: 61st request from same IP returns 429", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  let loginDone = false;
  const fetchFn: typeof fetch = async () => {
    if (!loginDone) {
      loginDone = true;
      return new Response(
        JSON.stringify({ data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({ data: { JobOffer: { id: 1 } } }),
      { status: 200 },
    );
  };

  const makeReq = () => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      cookie,
      "x-forwarded-for": "1.2.3.4",
    };
    return new Request("https://edge/fn/mamamia-proxy", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "getJobOffer" }),
    });
  };

  // 60 OK calls within limit (mamamia-proxy higher budget than onboard)
  for (let i = 0; i < 60; i++) {
    const res = await handleRequest(makeReq(), { secrets: SECRETS, fetchFn });
    assertEquals(res.status, 200, `call ${i + 1} should succeed`);
  }

  const res61 = await handleRequest(makeReq(), { secrets: SECRETS, fetchFn });
  assertEquals(res61.status, 429);
});

// ─── Interest actions ─────────────────────────────────────────────────────

Deno.test("listInterests returns JobOffer.interests scoped to session.job_offer_id", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  let capturedVars: Record<string, unknown> | null = null;
  let loginDone = false;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (!loginDone && url.includes("/graphql/auth")) {
      loginDone = true;
      return new Response(
        JSON.stringify({ data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } }),
        { status: 200 },
      );
    }
    const raw = (init as { body?: BodyInit } | undefined)?.body;
    const body = typeof raw === "string" ? JSON.parse(raw) : {};
    capturedVars = body.variables ?? null;
    return new Response(
      JSON.stringify({
        data: { JobOffer: { id: 16226, interests: [{ id: 99, caregiver_id: 50001, rejected_at: null }] } },
      }),
      { status: 200 },
    );
  };

  const res = await handleRequest(
    baseReq({ action: "listInterests" }, cookie),
    { secrets: SECRETS, fetchFn },
  );
  assertEquals(res.status, 200);
  // Variable comes from session, not client — session.job_offer_id = 16226.
  assertEquals(capturedVars, { id: 16226 });
  const body = await res.json();
  assertEquals(body.data.JobOffer.interests.length, 1);
});

Deno.test("dismissCaregiver: writes via Supabase adapter, idempotent", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  const upsertCalls: Array<{ leadId: string; caregiverId: number; kind: string }> = [];
  const supabase = {
    selectDismissedCaregivers: async () => [],
    upsertDismissedCaregiver: async (leadId: string, caregiverId: number, kind: "interest" | "application") => {
      upsertCalls.push({ leadId, caregiverId, kind });
    },
    selectAcceptedApplications: async () => [],
  };

  const res = await handleRequest(
    baseReq({ action: "dismissCaregiver", variables: { caregiver_id: 50001, kind: "interest" } }, cookie),
    { secrets: SECRETS, supabase, fetchFn: okFetch({}) },
  );
  assertEquals(res.status, 200);
  assertEquals(upsertCalls.length, 1);
  assertEquals(upsertCalls[0].leadId, SESSION_PAYLOAD.lead_id);
  assertEquals(upsertCalls[0].caregiverId, 50001);
  assertEquals(upsertCalls[0].kind, "interest");
});

Deno.test("dismissCaregiver: rejects missing caregiver_id", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  const supabase = {
    selectDismissedCaregivers: async () => [],
    upsertDismissedCaregiver: async () => {},
    selectAcceptedApplications: async () => [],
  };
  const res = await handleRequest(
    baseReq({ action: "dismissCaregiver", variables: { kind: "interest" } }, cookie),
    { secrets: SECRETS, supabase, fetchFn: okFetch({}) },
  );
  assertEquals(res.status, 502); // proxy maps action errors to 502
});

Deno.test("dismissCaregiver: rejects bad kind", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  const supabase = {
    selectDismissedCaregivers: async () => [],
    upsertDismissedCaregiver: async () => {},
    selectAcceptedApplications: async () => [],
  };
  const res = await handleRequest(
    baseReq({ action: "dismissCaregiver", variables: { caregiver_id: 50001, kind: "garbage" } }, cookie),
    { secrets: SECRETS, supabase, fetchFn: okFetch({}) },
  );
  assertEquals(res.status, 502);
});

Deno.test("listDismissedCaregivers: reads via session.lead_id, returns caregiver_ids[]", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  let selectArg: string | null = null;
  const supabase = {
    selectDismissedCaregivers: async (leadId: string) => {
      selectArg = leadId;
      return [
        { caregiver_id: 50001, kind: "interest" },
        { caregiver_id: 50002, kind: "interest" },
      ];
    },
    upsertDismissedCaregiver: async () => {},
    selectAcceptedApplications: async () => [],
  };

  const res = await handleRequest(
    baseReq({ action: "listDismissedCaregivers" }, cookie),
    { secrets: SECRETS, supabase, fetchFn: okFetch({}) },
  );
  assertEquals(res.status, 200);
  assertEquals(selectArg, SESSION_PAYLOAD.lead_id);
  const body = await res.json();
  assertEquals(body.data.caregiver_ids, [50001, 50002]);
});

// ─── Acceptance actions ────────────────────────────────────────────────────

Deno.test("listAcceptedApplications: reads via session.lead_id, returns application_ids[]", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  let selectArg: string | null = null;
  const supabase = {
    selectDismissedCaregivers: async () => [],
    upsertDismissedCaregiver: async () => {},
    selectAcceptedApplications: async (leadId: string) => {
      selectArg = leadId;
      return [
        { application_id: 7997, caregiver_id: 26960, accepted_at: "2026-05-19T12:00:00Z" },
        { application_id: 8001, caregiver_id: 27001, accepted_at: "2026-05-19T13:00:00Z" },
      ];
    },
  };

  const res = await handleRequest(
    baseReq({ action: "listAcceptedApplications" }, cookie),
    { secrets: SECRETS, supabase, fetchFn: okFetch({}) },
  );
  assertEquals(res.status, 200);
  assertEquals(selectArg, SESSION_PAYLOAD.lead_id);
  const body = await res.json();
  assertEquals(body.data.application_ids, [7997, 8001]);
  assertEquals(body.data.rows.length, 2);
  assertEquals(body.data.rows[0].application_id, 7997);
  assertEquals(body.data.rows[0].caregiver_id, 26960);
});

Deno.test("listAcceptedApplications: empty returns application_ids=[]", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const cookie = await makeCookie();
  const supabase = {
    selectDismissedCaregivers: async () => [],
    upsertDismissedCaregiver: async () => {},
    selectAcceptedApplications: async () => [],
  };

  const res = await handleRequest(
    baseReq({ action: "listAcceptedApplications" }, cookie),
    { secrets: SECRETS, supabase, fetchFn: okFetch({}) },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.application_ids, []);
});
