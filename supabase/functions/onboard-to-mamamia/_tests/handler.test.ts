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
    // Registry #55 — per id, ohne Expiry-Filter (wie der echte Adapter).
    fetchLeadById(id: string) {
      for (const [, lead] of m) if (lead.id === id) return Promise.resolve(lead);
      return Promise.resolve(null);
    },
  };
}

// JWT-Form des service_role-Bearers (zweiter Gate-Zweig): Payload-Decode
// ohne Signatur — die prüft in prod das Gateway (verify_jwt).
const SERVICE_JWT = `x.${btoa(JSON.stringify({ role: "service_role" })).replace(/=+$/, "")}.y`;

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
      // mirror_token ist ein privilegiertes Flag — nur mit service_role (Registry #55)
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9", authorization: "Bearer srv" },
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

// ─── Admin-Resync (Registry #55) — Gate + Gałąź lead_id ─────────────────────

const ONBOARDED_LEAD = () => makeLead({
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  token: "t1",
  mamamia_customer_id: 10670,
  mamamia_job_offer_id: 36297,
  kalkulation: { bruttopreis: 3350, eigenanteil: 3016, formularDaten: { betreuung_fuer: "1-person", pflegegrad: 1, mobilitaet: "rollator", nachteinsaetze: "gelegentlich", deutschkenntnisse: "sehr-gut" } },
});

const NO_MM: typeof fetch = (() => { throw new Error("Mamamia must not be called"); }) as typeof fetch;

function resyncReq(body: unknown, authorization?: string) {
  return new Request("https://fn/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "7.7.7.7", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify(body),
  });
}

Deno.test("resync (#55): Anon-Bearer ⇒ 401 und NULL Mamamia-Calls", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const res = await handleRequest(
    resyncReq({ lead_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", resync: { felder: ["betreuung_fuer"] } }, "Bearer anon-key"),
    { secrets: SECRETS, supabase: makeFakeSupabase([ONBOARDED_LEAD()]), fetchFn: NO_MM },
  );
  assertEquals(res.status, 401);
});

Deno.test("resync (#55): mirror_token ohne service_role ⇒ 401 (Browser kann den Spiegel nicht auslösen)", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const res = await handleRequest(
    resyncReq({ token: "t1", mirror_token: true }),
    { secrets: SECRETS, supabase: makeFakeSupabase([ONBOARDED_LEAD()]), fetchFn: NO_MM },
  );
  assertEquals(res.status, 401);
});

Deno.test("resync (#55): Lead ohne mamamia_customer_id ⇒ 400 not-onboarded (kein Onboard, kein MM-Call)", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const res = await handleRequest(
    resyncReq({ lead_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", resync: { felder: ["pflegegrad"] } }, "Bearer srv"),
    { secrets: SECRETS, supabase: makeFakeSupabase([makeLead()]), fetchFn: NO_MM },
  );
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "not-onboarded");
});

Deno.test("resync (#55): felder leer ohne budget ⇒ 400; unbekanntes Feld ⇒ 400", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const deps = { secrets: SECRETS, supabase: makeFakeSupabase([ONBOARDED_LEAD()]), fetchFn: NO_MM };
  const r1 = await handleRequest(resyncReq({ lead_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", resync: { felder: [] } }, "Bearer srv"), deps);
  assertEquals(r1.status, 400);
  const r2 = await handleRequest(resyncReq({ lead_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", resync: { felder: ["erfahrung"] } }, "Bearer srv"), deps);
  assertEquals(r2.status, 400);
});

Deno.test("resync (#55): service_role als JWT-Claim passiert das Gate; Rate-Limit wird übersprungen", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  // 5 Anon-Calls vom selben IP füllen den Bucket …
  for (let i = 0; i < 5; i++) {
    await handleRequest(resyncReq({ token: "nonexistent" }), { secrets: SECRETS, supabase: makeFakeSupabase(), fetchFn: okMamamia() });
  }
  // … der service_role-Caller (JWT-Form) kommt trotzdem durch — bis zur
  // Kontraktprüfung (Lead unbekannt ⇒ 404), nicht 429 und nicht 401.
  const res = await handleRequest(
    resyncReq({ lead_id: "unknown", resync: { felder: ["pflegegrad"] } }, `Bearer ${SERVICE_JWT}`),
    { secrets: SECRETS, supabase: makeFakeSupabase([]), fetchFn: NO_MM },
  );
  assertEquals(res.status, 404);
});

Deno.test("resync (#55): happy path 2→1 — 200 mit resync-Ergebnis, KEIN Session-Cookie", async () => {
  _resetRateLimit(); _resetAgencyTokenCache();
  const responses = [
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "agency-jwt" } } },
    { data: { Customer: { id: 10670, equipments: [{ id: 1 }], patients: [
      { id: 75421, care_level: 1, mobility_id: 3, lift_id: 2, night_operations: "up_to_1_time", tools: [] },
      { id: 75420, care_level: 1, mobility_id: 3, lift_id: 2, night_operations: "up_to_1_time", tools: [{ id: 2 }] },
    ], customer_caregiver_wish: { gender: "female" } } } },
    { data: { UpdateCustomer: { id: 10670, customer_id: "pr-10670" } } },
  ];
  let i = 0;
  const bodies: Array<Record<string, unknown>> = [];
  const fetchFn: typeof fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse((init?.body ?? "{}") as string));
    return new Response(JSON.stringify(responses[i++] ?? {}), { status: 200 });
  }) as typeof fetch;
  const res = await handleRequest(
    resyncReq({ lead_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", resync: { felder: ["betreuung_fuer"] } }, "Bearer srv"),
    { secrets: SECRETS, supabase: makeFakeSupabase([ONBOARDED_LEAD()]), fetchFn },
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("set-cookie"), null);
  const body = await res.json();
  assertEquals(body.customer_id, 10670);
  assertEquals(body.resync.patients_before, 2);
  assertEquals(body.resync.patients_after, 1);
  assertEquals(body.resync.removed_ids, [75421]);
  // Mutation: nur der Patient mit der KLEINSTEN id bleibt, tools preserved
  const mut = bodies[2].variables as Record<string, unknown>;
  assertEquals(mut.patients, [{ id: 75420, tool_ids: [2] }]);
  assertEquals(mut.equipment_ids, [1]);
});
