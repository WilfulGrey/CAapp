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
