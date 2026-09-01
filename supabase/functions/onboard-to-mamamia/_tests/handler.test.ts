// Set env vars BEFORE importing handler — `loadPrimundusAgencyId()` in
// onboard.ts reads MAMAMIA_AGENCY_ID lazily but still throws if unset
// when called. Use prod value (3) in tests for parity with what onboard
// previously hardcoded; semantically the constant only changes routing,
// not test assertions.
Deno.env.set("MAMAMIA_AGENCY_ID", "3");

import { assertEquals, assertStringIncludes } from "@std/assert";
import { handleRequest } from "../index.ts";
import { _resetRateLimit } from "../../_shared/rateLimit.ts";
import { _resetAgencyTokenCache } from "../../_shared/mamamiaClient.ts";
import type { Lead } from "../types.ts";

// ─── Fakes ─────────────────────────────────────────────────────────────────

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    email: "x@e.de",
    vorname: "a", nachname: "b", anrede: "Frau", anrede_text: "Frau", telefon: null,
    status: "angebot_requested",
    // Far-future expiry — CI runs at any wall clock, so a hardcoded
    // "today + N hours" string flakes once the runner clock moves past it.
    // 2099 is unambiguously in the future for the lifetime of this repo.
    token: "valid", token_expires_at: "2099-01-01T00:00:00.000Z", token_used: false,
    care_start_timing: "sofort",
    kalkulation: { bruttopreis: 3000, eigenanteil: 1500, formularDaten: { pflegegrad: 3, mobilitaet: "rollstuhl", deutschkenntnisse: "kommunikativ" } },
    created_at: "2026-04-23T09:00:00.000Z", updated_at: "2026-04-23T09:00:00.000Z",
    mamamia_customer_id: null, mamamia_job_offer_id: null, mamamia_user_token: null, mamamia_onboarded_at: null,
    ...overrides,
  };
}

function makeFakeSupabase(leads: Lead[] = []) {
  const m = new Map(leads.map((l) => [l.token ?? "", l]));
  return {
    fetchLead(token: string) {
      return m.get(token) ?? null;
    },
    updateLead(id: string, patch: Partial<Lead>) {
      for (const [, lead] of m) if (lead.id === id) Object.assign(lead, patch);
    },
  };
}

const SECRETS = {
  supabaseUrl: "https://test.supabase.co",
  supabaseServiceKey: "srv",
  mamamiaEndpoint: "https://beta/graphql",
  mamamiaAuthEndpoint: "https://beta/graphql/auth",
  mamamiaAgencyEmail: "p@e",
  mamamiaAgencyPassword: "pw",
  sessionJwtSecret: "x".repeat(40),
  mamamiaPanelUrl: "https://beta/backend",
};

function okMamamia(): typeof fetch {
  const responses = [
    { data: { LoginAgency: { id: 8190, name: "P", email: "x", token: "agency-jwt" } } },
    { data: { StoreCustomer: { id: 7566, customer_id: "ts-18-7566", status: "draft" } } },
    { data: { StoreJobOffer: { id: 16225, job_offer_id: "ts-18-7566-1", title: "t", status: "search" } } },
  ];
  let i = 0;
  return async () => new Response(JSON.stringify(responses[i++] ?? {}), { status: 200 });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

Deno.test("OPTIONS preflight returns 204 with CORS headers", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const req = new Request("https://edge/fn/onboard-to-mamamia", {
    method: "OPTIONS",
    headers: { origin: "http://localhost:5173" },
  });
  const res = await handleRequest(req, { secrets: SECRETS, supabase: makeFakeSupabase(), fetchFn: okMamamia() });
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assertEquals(res.headers.get("access-control-allow-credentials"), "true");
});

Deno.test("POST happy path returns 200 + sets session cookie + returns IDs", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const req = new Request("https://edge/fn/onboard-to-mamamia", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5173" },
    body: JSON.stringify({ token: "valid" }),
  });
  const res = await handleRequest(req, {
    secrets: SECRETS,
    supabase: makeFakeSupabase([makeLead()]),
    fetchFn: okMamamia(),
  });
  assertEquals(res.status, 200);

  // Cookie set
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no set-cookie header");
  assertStringIncludes(setCookie, "session=");
  assertStringIncludes(setCookie, "HttpOnly");

  // Body has IDs but NOT agency token
  const body = await res.json();
  assertEquals(body.customer_id, 7566);
  assertEquals(body.job_offer_id, 16225);
  assertEquals(body.user_token, undefined, "agency token must not leak to browser");
});

// The `mirror_token` flag has to survive the whole way from the request body
// into onboardLead — parsing it and forgetting to pass it on would ship a
// feature that silently does nothing (lead-regenerate-token calls this).
Deno.test("POST mirror_token=true reaches onboardLead (cache hit → panel push)", async () => {
  _resetRateLimit();
  _resetAgencyTokenCache();
  const supa = makeFakeSupabase([makeLead({
    token: "rotated",
    mamamia_customer_id: 7566,
    mamamia_job_offer_id: 16225,
  })]);

  const panelCalls: string[] = [];
  const fetchFn: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!url.includes("/backend/")) throw new Error(`agency API must not be called on cache hit: ${url}`);
    panelCalls.push(url);
    if (url.includes("/sanctum/csrf-cookie")) {
      return new Response("", { status: 200, headers: { "set-cookie": "XSRF-TOKEN=t; Path=/" } });
    }
    const parsed = JSON.parse((init?.body ?? "{}") as string);
    const data = url.endsWith("/graphql/auth")
      ? { data: { LoginAgency: { id: 1, email: "x" } } }
      : { data: { UpdateCustomerToken: { id: parsed.variables?.id, token: parsed.variables?.token } } };
    return new Response(JSON.stringify(data), { status: 200, headers: { "set-cookie": "sess=1; Path=/" } });
  }) as typeof fetch;

  const res = await handleRequest(
    new Request("https://fn/", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
      body: JSON.stringify({ token: "rotated", mirror_token: true }),
    }),
    { secrets: SECRETS, supabase: supa, fetchFn },
  );

  assertEquals(res.status, 200);
  assertEquals(panelCalls.length, 3); // csrf-cookie → LoginAgency → UpdateCustomerToken
});

Deno.test("POST without mirror_token: cache hit costs zero Mamamia calls", async () => {
  _resetRateLimit();
  _resetAgencyTokenCache();
  const supa = makeFakeSupabase([makeLead({
    token: "plain",
    mamamia_customer_id: 7566,
    mamamia_job_offer_id: 16225,
  })]);
  const fetchFn: typeof fetch = (async () => {
    throw new Error("no Mamamia call expected on a plain portal open");
  }) as typeof fetch;

  const res = await handleRequest(
    new Request("https://fn/", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.8" },
      body: JSON.stringify({ token: "plain" }),
    }),
    { secrets: SECRETS, supabase: supa, fetchFn },
  );

  assertEquals(res.status, 200);
});

Deno.test("POST with invalid token returns 401 + no cookie", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const req = new Request("https://edge/fn/onboard-to-mamamia", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "nonexistent" }),
  });
  const res = await handleRequest(req, { secrets: SECRETS, supabase: makeFakeSupabase(), fetchFn: okMamamia() });
  assertEquals(res.status, 401);
  assertEquals(res.headers.get("set-cookie"), null);
});

Deno.test("POST without body returns 400", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const req = new Request("https://edge/fn/onboard-to-mamamia", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  const res = await handleRequest(req, { secrets: SECRETS, supabase: makeFakeSupabase(), fetchFn: okMamamia() });
  assertEquals(res.status, 400);
});

Deno.test("POST with missing token field returns 400", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const req = new Request("https://edge/fn/onboard-to-mamamia", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ other: "field" }),
  });
  const res = await handleRequest(req, { secrets: SECRETS, supabase: makeFakeSupabase(), fetchFn: okMamamia() });
  assertEquals(res.status, 400);
});

Deno.test("GET method not allowed returns 405", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const req = new Request("https://edge/fn/onboard-to-mamamia", { method: "GET" });
  const res = await handleRequest(req, { secrets: SECRETS, supabase: makeFakeSupabase(), fetchFn: okMamamia() });
  assertEquals(res.status, 405);
});

Deno.test("Rate limit: 6th request from same IP returns 429", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const deps = { secrets: SECRETS, supabase: makeFakeSupabase([makeLead()]), fetchFn: okMamamia() };
  const makeReq = () =>
    new Request("https://edge/fn/onboard-to-mamamia", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify({ token: "valid" }),
    });

  // 5 OK calls (bo okMamamia responses bounded — we reset per call via fresh fetchFn)
  // żeby nie mapać limitów na te same IP, ustawimy fresh deps każdy call
  for (let i = 0; i < 5; i++) {
    _resetAgencyTokenCache();
    deps.supabase = makeFakeSupabase([makeLead()]);
    deps.fetchFn = okMamamia();
    const res = await handleRequest(makeReq(), deps);
    assertEquals(res.status, 200, `call ${i + 1} should succeed`);
  }

  // 6th should be rate-limited
  const res6 = await handleRequest(makeReq(), deps);
  assertEquals(res6.status, 429);
});
