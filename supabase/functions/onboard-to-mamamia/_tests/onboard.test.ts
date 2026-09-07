// Required by `loadPrimundusAgencyId()` in onboard.ts (throws if unset).
// Prod value used for parity; routing-only, doesn't affect assertions.
Deno.env.set("MAMAMIA_AGENCY_ID", "3");

import { assertEquals, assertRejects } from "@std/assert";
import { onboardLead } from "../onboard.ts";
import { _resetAgencyTokenCache } from "../../_shared/mamamiaClient.ts";
import type { Lead } from "../types.ts";

// ─── Fakes ───────────────────────────────────────────────────────────────────

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    email: "frau@example.de",
    vorname: "hildegard",
    nachname: "schmidt",
    anrede: "Frau",
    anrede_text: "Frau",
    telefon: "+49 89 1234567",
    status: "angebot_requested",
    token: "valid-token",
    // Far-future expiry — see comment in handler.test.ts:15.
    token_expires_at: "2099-01-01T00:00:00.000Z",
    token_used: false,
    care_start_timing: "sofort",
    kalkulation: {
      bruttopreis: 3200,
      eigenanteil: 1700,
      formularDaten: {
        pflegegrad: 3,
        mobilitaet: "rollstuhl",
        nachteinsaetze: "gelegentlich",
        geschlecht: "weiblich",
        weitere_personen: "nein",
        // mapGermanySkill throws na missing/unknown (Święta zasada nr 1) —
        // fixture musi mieć valid enum żeby happy-path testy przeszły.
        deutschkenntnisse: "kommunikativ",
      },
    },
    patient_anrede: null,
    patient_vorname: null,
    patient_nachname: null,
    patient_street: null,
    patient_zip: null,
    patient_city: null,
    special_requirements: null,
    order_confirmed_at: null,
    created_at: "2026-04-23T09:00:00.000Z",
    updated_at: "2026-04-23T09:00:00.000Z",
    mamamia_customer_id: null,
    mamamia_job_offer_id: null,
    mamamia_user_token: null,
    mamamia_onboarded_at: null,
    ...overrides,
  };
}

interface FakeSupabase {
  leads: Map<string, Lead>;
  updated: Array<{ id: string; patch: Partial<Lead> }>;
  claims: string[];
  // Registry #54 — wynik claimu; undefined = fake bez claimOnboarding (stare zachowanie)
  claimOnboarding?: (leadId: string, staleBefore: string) => Promise<boolean>;
  fetchLead(token: string): Lead | null;
  updateLead(id: string, patch: Partial<Lead>): void;
  fetchLeadJob(jobId: string, leadId: string): Promise<{ mamamia_job_offer_id: number } | null>;
  fetchNewestPlannedJob(leadId: string): Promise<{ mamamia_job_offer_id: number } | null>;
}

interface FakeLeadJob { id: string; lead_id: string; mamamia_job_offer_id: number; status?: string; }

function makeFakeSupabase(
  initialLeads: Lead[] = [],
  leadJobs: FakeLeadJob[] = [],
  opts: { claim?: boolean } = {},
): FakeSupabase {
  const leads = new Map(initialLeads.map((l) => [l.token ?? "", l]));
  const updated: FakeSupabase["updated"] = [];
  const claims: string[] = [];
  return {
    leads,
    updated,
    claims,
    ...(opts.claim === undefined ? {} : {
      claimOnboarding(leadId: string) {
        claims.push(leadId);
        return Promise.resolve(opts.claim as boolean);
      },
    }),
    fetchLead(token) {
      return leads.get(token) ?? null;
    },
    updateLead(id, patch) {
      updated.push({ id, patch });
      for (const [, lead] of leads) {
        if (lead.id === id) Object.assign(lead, patch);
      }
    },
    // Lead-scoped: only matches when BOTH job id and lead id match, mirroring
    // the real `.eq("id").eq("lead_id")` ownership filter.
    fetchLeadJob(jobId, leadId) {
      const j = leadJobs.find((x) => x.id === jobId && x.lead_id === leadId);
      return Promise.resolve(j ? { mamamia_job_offer_id: j.mamamia_job_offer_id } : null);
    },
    // Neuester 'geplant'-Job des Leads (Opcja B) — spiegelt die reale Query
    // `.eq("status","geplant").order("mamamia_job_offer_id", desc).limit(1)`.
    fetchNewestPlannedJob(leadId) {
      const planned = leadJobs
        .filter((x) => x.lead_id === leadId && x.status === "geplant")
        .sort((a, b) => b.mamamia_job_offer_id - a.mamamia_job_offer_id);
      return Promise.resolve(planned[0] ? { mamamia_job_offer_id: planned[0].mamamia_job_offer_id } : null);
    },
  };
}

// fetch fake for Mamamia GraphQL — also captures request bodies so tests
// can assert the StoreCustomer payload shape.
interface FakeMamamia {
  fetch: typeof fetch;
  // request bodies parsed from outgoing fetch() calls, in order
  requests: Array<{ query: string; variables: Record<string, unknown> }>;
}

function fakeMamamia(responses: Array<object>, opts: { panelFails?: boolean } = {}): FakeMamamia {
  let i = 0;
  const requests: FakeMamamia["requests"] = [];
  return {
    requests,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

      // Panel (Sanctum) calls — routed by URL (`/backend/…`), NOT by ordered
      // responses. Mirrors the real flow: csrf-cookie → LoginAgency →
      // UpdateCustomerToken (the best-effort token push at the end of onboard).
      if (url.includes("/backend/")) {
        if (opts.panelFails) return new Response("panel down", { status: 500 });
        if (url.includes("/sanctum/csrf-cookie")) {
          return new Response("", { status: 200, headers: { "set-cookie": "XSRF-TOKEN=testxsrf; Path=/" } });
        }
        let parsed: { query?: string; variables?: Record<string, unknown> } = {};
        try { parsed = JSON.parse((init?.body ?? "{}") as string); } catch (_) { /* swallow */ }
        requests.push({ query: parsed.query ?? "", variables: parsed.variables ?? {} });
        const data = url.endsWith("/graphql/auth")
          ? { data: { LoginAgency: { id: 1, email: "x" } } }
          : { data: { UpdateCustomerToken: { id: parsed.variables?.id ?? null, token: parsed.variables?.token ?? null } } };
        return new Response(JSON.stringify(data), { status: 200, headers: { "set-cookie": "mamamia_beta_session=sess; Path=/" } });
      }

      // Regular agency API calls — ordered responses (existing behaviour).
      const body = responses[i++];
      if (!body) throw new Error(`fakeMamamia: unexpected call #${i}`);
      // capture outgoing body for assertion
      try {
        const parsed = JSON.parse((init?.body ?? "{}") as string);
        requests.push({ query: parsed.query ?? "", variables: parsed.variables ?? {} });
      } catch (_) { /* swallow — non-JSON body */ }
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch,
  };
}

const SECRETS = {
  supabaseUrl: "https://test.supabase.co",
  supabaseServiceKey: "service-role",
  mamamiaEndpoint: "https://beta.mamamia.app/graphql",
  mamamiaAuthEndpoint: "https://beta.mamamia.app/graphql/auth",
  mamamiaAgencyEmail: "primundus+portal@example.com",
  mamamiaAgencyPassword: "pw",
  sessionJwtSecret: "a".repeat(40),
  mamamiaPanelUrl: "https://beta.mamamia.app/backend",
};

const NOW = () => new Date("2026-04-23T10:00:00.000Z");

// ─── Tests ────────────────────────────────────────────────────────────────

Deno.test("onboardLead: happy path — registers customer + joboffer, caches IDs", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead();
  const supa = makeFakeSupabase([lead]);

  const mm = fakeMamamia([
    // LoginAgency
    { data: { LoginAgency: { id: 8190, name: "Primundus", email: "x", token: "agency-jwt-xyz" } } },
    // StoreCustomer
    { data: { StoreCustomer: { id: 7566, customer_id: "ts-18-7566", status: "draft" } } },
    // StoreJobOffer
    { data: { StoreJobOffer: { id: 16225, job_offer_id: "ts-18-7566-1", title: "Primundus — schmidt", status: "search" } } },
  ]);

  const result = await onboardLead({
    leadToken: "valid-token",
    secrets: SECRETS,
    supabase: supa,
    fetchFn: mm.fetch,
    now: NOW,
  });

  assertEquals(result.customer_id, 7566);
  assertEquals(result.job_offer_id, 16225);
  assertEquals(result.lead_id, lead.id);

  // Supabase was updated with cached IDs
  assertEquals(supa.updated.length, 1);
  assertEquals(supa.updated[0].id, lead.id);
  assertEquals(supa.updated[0].patch.mamamia_customer_id, 7566);
  assertEquals(supa.updated[0].patch.mamamia_job_offer_id, 16225);
  assertEquals(supa.updated[0].patch.mamamia_user_token, "agency-jwt-xyz");
});

Deno.test("onboardLead: StoreCustomer payload (Bug #13: minimal — only real data + business defaults)", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead();
  const supa = makeFakeSupabase([lead]);

  const mm = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
    { data: { StoreCustomer: { id: 7566, customer_id: "ts-18-7566", status: "draft" } } },
    { data: { StoreJobOffer: { id: 16225, job_offer_id: "ts-18-7566-1", title: "t", status: "search" } } },
  ]);

  await onboardLead({
    leadToken: "valid-token",
    secrets: SECRETS,
    supabase: supa,
    fetchFn: mm.fetch,
    now: NOW,
  });

  // Second outgoing request is StoreCustomer (after LoginAgency)
  const storeCustomerReq = mm.requests[1];
  if (!storeCustomerReq) throw new Error("StoreCustomer request not captured");
  const v = storeCustomerReq.variables;

  // ── REAL DATA — what user actually provided ──
  // Identity (lead.* — orderer from kostenrechner, MVP fallback)
  assertEquals(v.first_name, "hildegard");
  assertEquals(v.last_name, "schmidt");
  assertEquals(v.email, "frau@example.de");
  assertEquals(v.phone, "+49 89 1234567");

  // Real from formularDaten
  assertEquals(v.other_people_in_house, "no");      // weitere_personen=nein
  assertEquals(v.gender, "female");                 // geschlecht=weiblich

  // Real from kalkulation
  assertEquals(v.care_budget, 3200);
  assertEquals(v.monthly_salary, 3200);

  // Derived from real care_start_timing (sofort = +7 days from NOW=2026-04-23)
  assertEquals(v.arrival_at, "2026-04-30");

  // ── BUSINESS DEFAULTS — NOT pytania do klienta ──
  assertEquals(v.language_id, 1);                   // Primundus = German market
  assertEquals(v.visibility, "public");
  assertEquals(v.commission_agent_salary, 10);      // Primundus baseline (panel rejects 0; 300 → 10 wg decyzji 2026-05-11)

  // ── NESTED — real care attrs only ──
  const wish = v.customer_caregiver_wish as Record<string, unknown>;
  if (!wish || typeof wish !== "object") throw new Error("wish must be an object");
  assertEquals(wish.gender, "female");
  assertEquals(wish.germany_skill, "level_2");  // kommunikativ → level_2 (refactor 2026-05-12)
  assertEquals(wish.driving_license, "not_important");
  // No auto-strings or enum defaults for fields kalkulator nie pyta
  assertEquals(wish.smoking, undefined);
  assertEquals(wish.shopping, undefined);
  assertEquals(wish.tasks, undefined);

  const patients = v.patients as Array<Record<string, unknown>>;
  assertEquals(patients.length, 1);
  assertEquals(patients[0].mobility_id, 4);    // rollstuhl
  assertEquals(patients[0].care_level, 3);     // pflegegrad
  assertEquals(patients[0].lift_id, 1);        // derived (mobility>=4 → Yes)
  assertEquals(patients[0].tool_ids, [3]);     // derived (wheelchair only)
  assertEquals(patients[0].night_operations, "up_to_1_time"); // gelegentlich → up_to_1_time (not occasionally — Mamamia panel can't render it)
  // No injected defaults for fields kalkulator nie pyta — patient form fills.
  assertEquals(patients[0].weight, undefined);
  assertEquals(patients[0].height, undefined);
  assertEquals(patients[0].gender, undefined);
  assertEquals(patients[0].dementia, undefined);
  assertEquals(patients[0].incontinence, undefined);
  assertEquals(patients[0].smoking, undefined);

  // ── CUT FROM PAYLOAD (Bug #13) ──
  // Customer-level — Mamamia accepts as null/omitted (verified
  // 2026-05-07 via /tmp/test-minimal-storecustomer.mjs, Customer 7651).
  assertEquals(v.urbanization_id, undefined);
  assertEquals(v.equipment_ids, undefined);
  assertEquals(v.day_care_facility, undefined);
  assertEquals(v.accommodation, undefined);
  assertEquals(v.caregiver_accommodated, undefined);
  assertEquals(v.has_family_near_by, undefined);
  assertEquals(v.internet, undefined);
  assertEquals(v.pets, undefined);
  assertEquals(v.is_pet_dog, undefined);
  assertEquals(v.smoking_household, undefined);
  assertEquals(v.job_description, undefined);
  assertEquals(v.job_description_de, undefined);

  // Contracts — moved to acceptance flow (StoreConfirmation).
  assertEquals(v.customer_contract, undefined);
  assertEquals(v.invoice_contract, undefined);
  assertEquals(v.customer_contacts, undefined);

  // ── StoreJobOffer (third request after LoginAgency + StoreCustomer) ──
  const sjoReq = mm.requests[2];
  assertEquals(sjoReq.variables.salary_commission, 10);
  assertEquals(sjoReq.variables.visibility, "public");
});

Deno.test("onboardLead: cache hit — returns cached IDs without Mamamia calls", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead({
    mamamia_customer_id: 7566,
    mamamia_job_offer_id: 16225,
    mamamia_user_token: "cached-jwt",
    mamamia_onboarded_at: "2026-04-20T00:00:00.000Z",
  });
  const supa = makeFakeSupabase([lead]);

  // No fetch calls expected — if onboard tries to call, fake throws
  const fetchFn: typeof fetch = async () => {
    throw new Error("Mamamia should not be called on cache hit!");
  };

  const result = await onboardLead({
    leadToken: "valid-token",
    secrets: SECRETS,
    supabase: supa,
    fetchFn,
    now: NOW,
  });

  assertEquals(result.customer_id, 7566);
  assertEquals(result.job_offer_id, 16225);
  assertEquals(supa.updated.length, 0); // no write needed
});

// The counterpart of the test above: lead-regenerate-token rotated the token,
// so the mirror on the Mamamia customer MUST be refreshed even though the
// customer already exists. Without this the MM team keeps the token from the
// first portal visit and their "open the customer's portal" link is dead.
Deno.test("onboardLead: cache hit + mirrorToken → pushes the ROTATED token via UpdateCustomerToken", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead({
    token: "rotated-token",
    mamamia_customer_id: 7566,
    mamamia_job_offer_id: 16225,
    mamamia_onboarded_at: "2026-04-20T00:00:00.000Z",
  });
  const supa = makeFakeSupabase([lead]);
  // Empty ordered responses: any call to the agency API (= a second onboarding)
  // would throw. Only the panel path may be used.
  const mm = fakeMamamia([]);

  const result = await onboardLead({
    leadToken: "rotated-token",
    mirrorToken: true,
    secrets: SECRETS,
    supabase: supa,
    fetchFn: mm.fetch,
    now: NOW,
  });

  const tokenReq = mm.requests.find((r) => r.query.includes("UpdateCustomerToken"));
  if (!tokenReq) throw new Error("UpdateCustomerToken request not captured");
  assertEquals(tokenReq.variables.id, 7566);
  assertEquals(tokenReq.variables.token, "rotated-token");

  // Cache hit stays a cache hit: same IDs, no customer re-created, no DB write.
  assertEquals(result.customer_id, 7566);
  assertEquals(result.job_offer_id, 16225);
  assertEquals(supa.updated.length, 0);
});

Deno.test("onboardLead: cache hit + mirrorToken — panel down does not break portal entry", async () => {
  _resetAgencyTokenCache();
  const supa = makeFakeSupabase([makeLead({
    mamamia_customer_id: 7566,
    mamamia_job_offer_id: 16225,
    mamamia_onboarded_at: "2026-04-20T00:00:00.000Z",
  })]);
  const mm = fakeMamamia([], { panelFails: true });

  const result = await onboardLead({
    leadToken: "valid-token",
    mirrorToken: true,
    secrets: SECRETS,
    supabase: supa,
    fetchFn: mm.fetch,
    now: NOW,
  });

  assertEquals(result.customer_id, 7566);
});

// ─── Multi-Job (Variant A): job_id session scoping ───────────────────────

const ONBOARDED = {
  id: "lead-x",
  mamamia_customer_id: 7566,
  mamamia_job_offer_id: 16225, // the lead's DEFAULT job
  mamamia_user_token: "cached-jwt",
  mamamia_onboarded_at: "2026-04-20T00:00:00.000Z",
} as const;
const NO_MAMAMIA: typeof fetch = () => {
  throw new Error("Mamamia should not be called on cache hit!");
};

Deno.test("onboardLead: NO job_id + kein geplanter Job → lead's default job (Single-Job nach Buchung)", async () => {
  _resetAgencyTokenCache();
  const supa = makeFakeSupabase([makeLead({ ...ONBOARDED })], [
    { id: "job-a", lead_id: "lead-x", mamamia_job_offer_id: 16225, status: "gebucht" },
    { id: "job-b", lead_id: "lead-x", mamamia_job_offer_id: 99999, status: "beendet" },
  ]);
  const result = await onboardLead({
    leadToken: "valid-token", secrets: SECRETS, supabase: supa, fetchFn: NO_MAMAMIA, now: NOW,
  });
  assertEquals(result.job_offer_id, 16225);
});

Deno.test("onboardLead: NO job_id → AKTIVER Job = neuester 'geplant' (Opcja B, Dachs 8899)", async () => {
  _resetAgencyTokenCache();
  // Alter gebuchter Job (Default des Leads) + neuer geplanter Folge-Job:
  // Einstieg ohne Deeplink landet auf dem NEUEN Job mit seinen Bewerbungen.
  const supa = makeFakeSupabase([makeLead({ ...ONBOARDED })], [
    { id: "job-a", lead_id: "lead-x", mamamia_job_offer_id: 16225, status: "gebucht" },
    { id: "job-b", lead_id: "lead-x", mamamia_job_offer_id: 99999, status: "geplant" },
  ]);
  const result = await onboardLead({
    leadToken: "valid-token", secrets: SECRETS, supabase: supa, fetchFn: NO_MAMAMIA, now: NOW,
  });
  assertEquals(result.job_offer_id, 99999);
  assertEquals(result.customer_id, 7566); // gleicher Kunde, nur anderer Job-Scope
});

Deno.test("onboardLead: NO job_id + zwei geplante Jobs → der NEUESTE gewinnt", async () => {
  _resetAgencyTokenCache();
  const supa = makeFakeSupabase([makeLead({ ...ONBOARDED })], [
    { id: "job-a", lead_id: "lead-x", mamamia_job_offer_id: 16225, status: "geplant" },
    { id: "job-b", lead_id: "lead-x", mamamia_job_offer_id: 99999, status: "geplant" },
  ]);
  const result = await onboardLead({
    leadToken: "valid-token", secrets: SECRETS, supabase: supa, fetchFn: NO_MAMAMIA, now: NOW,
  });
  assertEquals(result.job_offer_id, 99999);
});

Deno.test("onboardLead: explizites job_id hat Vorrang vor der Aktiv-Job-Wahl", async () => {
  _resetAgencyTokenCache();
  const supa = makeFakeSupabase([makeLead({ ...ONBOARDED })], [
    { id: "job-a", lead_id: "lead-x", mamamia_job_offer_id: 16225, status: "gebucht" },
    { id: "job-b", lead_id: "lead-x", mamamia_job_offer_id: 99999, status: "geplant" },
  ]);
  const result = await onboardLead({
    leadToken: "valid-token", jobId: "job-a", secrets: SECRETS, supabase: supa, fetchFn: NO_MAMAMIA, now: NOW,
  });
  // ?job=<alter Einsatz> aus der Übersicht → genau der, kein Auto-Umschwenk.
  assertEquals(result.job_offer_id, 16225);
});

Deno.test("onboardLead: fetchNewestPlannedJob-Fehler → Default-Job (Portal-Eintritt bricht nie)", async () => {
  _resetAgencyTokenCache();
  const base = makeFakeSupabase([makeLead({ ...ONBOARDED })]);
  const supa = { ...base, fetchNewestPlannedJob: () => Promise.reject(new Error("db down")) };
  const result = await onboardLead({
    leadToken: "valid-token", secrets: SECRETS, supabase: supa, fetchFn: NO_MAMAMIA, now: NOW,
  });
  assertEquals(result.job_offer_id, 16225);
});

Deno.test("onboardLead: job_id scopes the session to that lead_job (customer unchanged)", async () => {
  _resetAgencyTokenCache();
  const supa = makeFakeSupabase([makeLead({ ...ONBOARDED })], [
    { id: "job-b", lead_id: "lead-x", mamamia_job_offer_id: 99999 },
  ]);
  const result = await onboardLead({
    leadToken: "valid-token", jobId: "job-b", secrets: SECRETS, supabase: supa, fetchFn: NO_MAMAMIA, now: NOW,
  });
  assertEquals(result.job_offer_id, 99999); // scoped to job-b
  assertEquals(result.customer_id, 7566); // same resident (customer)
});

Deno.test("onboardLead: foreign/unknown job_id → falls back to default (no cross-lead)", async () => {
  _resetAgencyTokenCache();
  // job-c belongs to a DIFFERENT lead → lead-scoped lookup returns null.
  const supa = makeFakeSupabase([makeLead({ ...ONBOARDED })], [
    { id: "job-c", lead_id: "other-lead", mamamia_job_offer_id: 77777 },
  ]);
  const result = await onboardLead({
    leadToken: "valid-token", jobId: "job-c", secrets: SECRETS, supabase: supa, fetchFn: NO_MAMAMIA, now: NOW,
  });
  assertEquals(result.job_offer_id, 16225); // default — NOT the foreign 77777
});

Deno.test("onboardLead: fetchLeadJob error → falls back to default (onboard never 500s on job lookup)", async () => {
  _resetAgencyTokenCache();
  const base = makeFakeSupabase([makeLead({ ...ONBOARDED })]);
  // Simulate a DB failure (e.g. lead_jobs not migrated on this env / transient).
  const supa = { ...base, fetchLeadJob: () => Promise.reject(new Error("lead_jobs table missing")) };
  const result = await onboardLead({
    leadToken: "valid-token", jobId: "job-x", secrets: SECRETS, supabase: supa, fetchFn: NO_MAMAMIA, now: NOW,
  });
  // Lookup blew up, but onboard still resolved to the lead's default job.
  assertEquals(result.job_offer_id, 16225);
});

Deno.test("onboardLead: expired lead token throws", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead({
    token_expires_at: "2026-04-01T00:00:00.000Z", // already expired vs NOW=2026-04-23
  });
  const supa = makeFakeSupabase([lead]);

  await assertRejects(
    () =>
      onboardLead({
        leadToken: "valid-token",
        secrets: SECRETS,
        supabase: supa,
        fetchFn: fakeMamamia([]).fetch,
        now: NOW,
      }),
    Error,
    "lead token expired or invalid",
  );
});

Deno.test("onboardLead: missing token in Supabase throws", async () => {
  _resetAgencyTokenCache();
  const supa = makeFakeSupabase([]);

  await assertRejects(
    () =>
      onboardLead({
        leadToken: "nonexistent",
        secrets: SECRETS,
        supabase: supa,
        fetchFn: fakeMamamia([]).fetch,
        now: NOW,
      }),
    Error,
    "lead token expired or invalid",
  );
});

Deno.test("onboardLead: Mamamia StoreCustomer error propagates", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead();
  const supa = makeFakeSupabase([lead]);

  const mm = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
    { errors: [{ message: "validation" }] }, // StoreCustomer fails
  ]);

  await assertRejects(
    () =>
      onboardLead({
        leadToken: "valid-token",
        secrets: SECRETS,
        supabase: supa,
        fetchFn: mm.fetch,
        now: NOW,
      }),
    Error,
    "validation",
  );

  // Supabase NOT updated on error
  assertEquals(supa.updated.length, 0);
});

Deno.test("onboardLead: lead with patient_zip → Locations(search) → location_id on contract", async () => {
  _resetAgencyTokenCache();
  // patient_zip is the Primundus stage-B field — populated after the
  // customer fills the Betreuung-beauftragen form. Our onboard prefers
  // it over any formularDaten fallback.
  const lead = makeLead({ patient_zip: "10115" });
  const supa = makeFakeSupabase([lead]);

  const mm = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
    // Locations(search: "10115") → Berlin
    { data: { Locations: [{ id: 1148, zip_code: "10115", location: "Berlin", country_code: "DE" }] } },
    { data: { StoreCustomer: { id: 9001, customer_id: "ts-18-9001", status: "draft" } } },
    { data: { StoreJobOffer: { id: 9002, job_offer_id: "ts-18-9001-1", title: "t", status: "search" } } },
  ]);

  await onboardLead({
    leadToken: "valid-token",
    secrets: SECRETS,
    supabase: supa,
    fetchFn: mm.fetch,
    now: NOW,
  });

  // Second outgoing request was the Locations query
  const locReq = mm.requests[1];
  if (!locReq) throw new Error("Locations request not captured");
  assertEquals(locReq.variables.search, "10115");

  // Third was StoreCustomer with location_id at top-level (Bug #13:
  // contracts no longer in onboard payload — they're set at acceptance
  // time via StoreConfirmation; location lives only on Customer top-level
  // and gets re-set by patient form save once user types PLZ + Ort).
  const sc = mm.requests[2];
  assertEquals(sc.variables.location_id, 1148);
  assertEquals(sc.variables.customer_contract, undefined);
});

Deno.test("onboardLead: null kalkulation lead throws (no soft default — Święta zasada nr 1)", async () => {
  // Pre-2026-05-12: ten test asser'ował że onboard "still works" z
  // null kalkulation, używając defaultów (germany_skill=level_3 etc.).
  // Po refactor mapGermanySkill (2026-05-12, decyzja biznesowa Michała):
  // brak deutschkenntnisse w formularDaten → throw. Onboard fail loud
  // zamiast wstawiać dumb wartość udając "wybór klienta". Legacy data
  // (lead bez kalkulacji = anomalia) wymaga manual fix w Supabase.
  _resetAgencyTokenCache();
  const lead = makeLead({ kalkulation: null });
  const supa = makeFakeSupabase([lead]);

  const mm = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
  ]);

  let threw = false;
  try {
    await onboardLead({
      leadToken: "valid-token",
      secrets: SECRETS,
      supabase: supa,
      fetchFn: mm.fetch,
      now: NOW,
    });
  } catch (e) {
    threw = true;
    if (!(e as Error).message.includes("unknown deutschkenntnisse value")) {
      throw new Error(`unexpected error: ${(e as Error).message}`);
    }
  }
  if (!threw) throw new Error("expected throw on null kalkulation");
});

// ─── UpdateCustomerToken push (mirror portal token onto Mamamia customer) ────

Deno.test("onboardLead: pushes portal token to Mamamia via UpdateCustomerToken (id + lead.token)", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead(); // token: "valid-token"
  const supa = makeFakeSupabase([lead]);

  const mm = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
    { data: { StoreCustomer: { id: 7566, customer_id: "ts-18-7566", status: "draft" } } },
    { data: { StoreJobOffer: { id: 16225, job_offer_id: "ts-18-7566-1", title: "t", status: "search" } } },
  ]);

  await onboardLead({
    leadToken: "valid-token", secrets: SECRETS, supabase: supa, fetchFn: mm.fetch, now: NOW,
  });

  // The panel UpdateCustomerToken mutation carries the NEW customer id + the
  // portal magic-link token (what MM staff use to open ?token=… and help).
  const tokenReq = mm.requests.find((r) => r.query.includes("UpdateCustomerToken"));
  if (!tokenReq) throw new Error("UpdateCustomerToken request not captured");
  assertEquals(tokenReq.variables.id, 7566);
  assertEquals(tokenReq.variables.token, "valid-token");
});

Deno.test("onboardLead: panel token push failure is best-effort — onboard still succeeds + caches IDs", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead();
  const supa = makeFakeSupabase([lead]);

  // Every panel call 500s → pushCustomerToken swallows; onboard must not throw.
  const mm = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
    { data: { StoreCustomer: { id: 7566, customer_id: "ts-18-7566", status: "draft" } } },
    { data: { StoreJobOffer: { id: 16225, job_offer_id: "ts-18-7566-1", title: "t", status: "search" } } },
  ], { panelFails: true });

  const result = await onboardLead({
    leadToken: "valid-token", secrets: SECRETS, supabase: supa, fetchFn: mm.fetch, now: NOW,
  });

  // Onboard succeeded despite the panel being down.
  assertEquals(result.customer_id, 7566);
  assertEquals(result.job_offer_id, 16225);
  // Cache written (the push runs AFTER updateLead) — portal entry unaffected.
  assertEquals(supa.updated.length, 1);
  assertEquals(supa.updated[0].patch.mamamia_customer_id, 7566);
  // No token mutation reached Mamamia (panel was down).
  assertEquals(mm.requests.some((r) => r.query.includes("UpdateCustomerToken")), false);
});

// ─── Registry #54: claim onboardingu (wyścig przeglądarka ↔ Empfehlungs-Mail) ─

Deno.test("onboardLead (#54): claim granted → normal onboard, claim called once for the lead", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead();
  const supa = makeFakeSupabase([lead], [], { claim: true });
  const mm = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
    { data: { StoreCustomer: { id: 7566, customer_id: "ts-18-7566", status: "draft" } } },
    { data: { StoreJobOffer: { id: 16225, job_offer_id: "ts-18-7566-1", title: "t", status: "search" } } },
  ]);
  const result = await onboardLead({ leadToken: "valid-token", secrets: SECRETS, supabase: supa, fetchFn: mm.fetch, now: NOW });
  assertEquals(result.customer_id, 7566);
  assertEquals(supa.claims, [lead.id]);
});

Deno.test("onboardLead (#54): claim denied → waits for the concurrent onboard, returns ITS ids, zero Mamamia calls", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead();
  const supa = makeFakeSupabase([lead], [], { claim: false });
  const mm = fakeMamamia([]); // any call would throw "unexpected call"
  let polls = 0;
  const result = await onboardLead({
    leadToken: "valid-token", secrets: SECRETS, supabase: supa, fetchFn: mm.fetch, now: NOW,
    sleep: () => {
      // Zwycięzca (druga instancja) kończy po 3 s — symulujemy zapis do leads.
      if (++polls === 3) Object.assign(lead, { mamamia_customer_id: 9001, mamamia_job_offer_id: 9002 });
      return Promise.resolve();
    },
  });
  assertEquals(result.customer_id, 9001);
  assertEquals(result.job_offer_id, 9002);
  assertEquals(mm.requests.length, 0);
  assertEquals(supa.updated.length, 0); // nie zapisuje nic — cudzy wynik
});

Deno.test("onboardLead (#54): claim denied + winner never finishes → 'onboarding in progress' (no second customer)", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead();
  const supa = makeFakeSupabase([lead], [], { claim: false });
  const mm = fakeMamamia([]);
  await assertRejects(
    () => onboardLead({ leadToken: "valid-token", secrets: SECRETS, supabase: supa, fetchFn: mm.fetch, now: NOW, sleep: () => Promise.resolve() }),
    Error,
    "onboarding in progress",
  );
  assertEquals(mm.requests.length, 0);
});

Deno.test("onboardLead (#54): StoreCustomer error → claim released (mamamia_onboarding_started_at=null) so a refresh can retry", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead();
  const supa = makeFakeSupabase([lead], [], { claim: true });
  const mm = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
    { errors: [{ message: "validation" }] },
  ]);
  await assertRejects(
    () => onboardLead({ leadToken: "valid-token", secrets: SECRETS, supabase: supa, fetchFn: mm.fetch, now: NOW }),
    Error,
    "validation",
  );
  assertEquals(supa.updated, [{ id: lead.id, patch: { mamamia_onboarding_started_at: null } }]);
});

// ─── Admin-Resync (Registry #55) ─────────────────────────────────────────────
// Sequenz des Fake: LoginAgency → ResyncCustomer(read) → UpdateCustomer
// [→ read → UpdateCustomer beim 1→2]. requests[] fängt die variables.

import { resyncCustomerFromLead, ResyncConflictError } from "../onboard.ts";

const LOGIN = { data: { LoginAgency: { id: 8190, name: "Primundus", email: "x", token: "agency-jwt" } } };
const UPDATED = { data: { UpdateCustomer: { id: 10670, customer_id: "pr-10670" } } };
const P1 = { id: 75420, care_level: 1, mobility_id: 3, lift_id: 2, night_operations: "up_to_1_time", tools: [{ id: 2 }] };
const P2 = { id: 75421, care_level: 1, mobility_id: 3, lift_id: 2, night_operations: "up_to_1_time", tools: [] as Array<{ id: number }> };
const WISH_FULL = {
  is_open_for_all: false, gender: "female", germany_skill: "level_4", alternative_germany_skill: null,
  driving_license: "not_important", driving_license_gearbox: "manual", smoking: null, shopping: "yes",
  shopping_be_done: null, tasks: null, other_wishes: "Katze im Haus", night_operations: null,
};
const readOf = (patients: unknown[], wish: unknown = WISH_FULL) =>
  ({ data: { Customer: { id: 10670, equipments: [{ id: 1 }, { id: 2 }], patients, customer_caregiver_wish: wish } } });

function resyncLead(fd: Record<string, unknown>) {
  return makeLead({
    id: "lead-rapp",
    mamamia_customer_id: 10670,
    mamamia_job_offer_id: 36297,
    kalkulation: { bruttopreis: 3350, eigenanteil: 3016, formularDaten: fd },
  });
}

Deno.test("resync (#55, a): 2→1 — Patient mit kleinster id bleibt als Stub, tools/equipments zurück, kein Wish/Budget", async () => {
  _resetAgencyTokenCache();
  // Read liefert absichtlich in falscher Reihenfolge — sortiert wird nach id.
  const mm = fakeMamamia([LOGIN, readOf([P2, P1]), UPDATED]);
  const r = await resyncCustomerFromLead({
    lead: resyncLead({ betreuung_fuer: "1-person", pflegegrad: 1 }),
    felder: ["betreuung_fuer"], secrets: SECRETS, fetchFn: mm.fetch,
  });
  assertEquals(r, { patients_before: 2, patients_after: 1, removed_ids: [75421], felder: ["betreuung_fuer"] });
  assertEquals(mm.requests.length, 3);
  const v = mm.requests[2].variables;
  assertEquals(v.id, 10670);
  assertEquals(v.patients, [{ id: 75420, tool_ids: [2] }]);
  assertEquals(v.equipment_ids, [1, 2]);
  assertEquals("customer_caregiver_wish" in v, false);
  assertEquals("care_budget" in v, false);
  assertEquals("other_people_in_house" in v, false);
});

Deno.test("resync (#55, d2): pflegegrad 0 ⇒ care_level null („Keine“) auf jedem Stub", async () => {
  _resetAgencyTokenCache();
  const mm = fakeMamamia([LOGIN, readOf([P1, P2]), UPDATED]);
  await resyncCustomerFromLead({
    lead: resyncLead({ betreuung_fuer: "ehepaar", pflegegrad: 0 }),
    felder: ["pflegegrad"], secrets: SECRETS, fetchFn: mm.fetch,
  });
  const v = mm.requests[2].variables;
  assertEquals(v.patients, [{ id: 75420, tool_ids: [2], care_level: null }, { id: 75421, tool_ids: [], care_level: null }]);
});

Deno.test("resync (#55, b): 1→2 — Klon des GELESENEN p1 ohne id, dann zweiter Pass mit neuer id", async () => {
  _resetAgencyTokenCache();
  const NEW = { id: 75499, care_level: 1, mobility_id: 3, lift_id: 2, night_operations: null, tools: [{ id: 2 }] };
  const mm = fakeMamamia([LOGIN, readOf([P1]), UPDATED, readOf([P1, NEW]), UPDATED]);
  const r = await resyncCustomerFromLead({
    // fd absichtlich mit anderem Pflegegrad — der Klon kommt aus MM, nicht aus fd
    lead: resyncLead({ betreuung_fuer: "ehepaar", pflegegrad: 4 }),
    felder: ["betreuung_fuer"], secrets: SECRETS, fetchFn: mm.fetch,
  });
  assertEquals(r.patients_before, 1);
  assertEquals(r.patients_after, 2);
  assertEquals(mm.requests.length, 5);
  const pass1 = mm.requests[2].variables.patients as unknown[];
  assertEquals(pass1, [
    { id: 75420, tool_ids: [2] },
    { tool_ids: [2], care_level: 1, mobility_id: 3, lift_id: 2, night_operations: "up_to_1_time" },
  ]);
  const pass2 = mm.requests[4].variables;
  assertEquals(pass2.patients, [
    { id: 75420, tool_ids: [2] },
    { tool_ids: [2], care_level: 1, mobility_id: 3, lift_id: 2, night_operations: "up_to_1_time", id: 75499 },
  ]);
  assertEquals(pass2.equipment_ids, [1, 2]);
});

Deno.test("resync (#55, c): deutschkenntnisse — Wish komplett zurück (ohne nulls/id), nur germany_skill überlagert; Patienten nur Stubs", async () => {
  _resetAgencyTokenCache();
  const mm = fakeMamamia([LOGIN, readOf([P1], { id: 10542, customer_id: 10670, ...WISH_FULL }), UPDATED]);
  await resyncCustomerFromLead({
    lead: resyncLead({ deutschkenntnisse: "kommunikativ" }),
    felder: ["deutschkenntnisse"], secrets: SECRETS, fetchFn: mm.fetch,
  });
  const v = mm.requests[2].variables;
  assertEquals(v.customer_caregiver_wish, {
    is_open_for_all: false, gender: "female", germany_skill: "level_2",
    driving_license: "not_important", driving_license_gearbox: "manual", shopping: "yes", other_wishes: "Katze im Haus",
  });
  assertEquals(v.patients, [{ id: 75420, tool_ids: [2] }]);
});

Deno.test("resync (#55, d): angefordertes Feld ohne fd-Wert ⇒ throw VOR jedem Mamamia-Call", async () => {
  _resetAgencyTokenCache();
  const mm = fakeMamamia([]);
  await assertRejects(
    () => resyncCustomerFromLead({ lead: resyncLead({ betreuung_fuer: "1-person" }), felder: ["pflegegrad"], secrets: SECRETS, fetchFn: mm.fetch }),
    Error, "pflegegrad",
  );
  await assertRejects(
    () => resyncCustomerFromLead({ lead: resyncLead({ mobilitaet: "" }), felder: ["mobilitaet"], secrets: SECRETS, fetchFn: mm.fetch }),
    Error, "mobilitaet fehlt",
  );
  await assertRejects(
    () => resyncCustomerFromLead({ lead: resyncLead({ deutschkenntnisse: "sehr-gut-sa" }), felder: ["deutschkenntnisse"], secrets: SECRETS, fetchFn: mm.fetch }),
    Error, "mapGermanySkill",
  );
  assertEquals(mm.requests.length, 0);
});

Deno.test("resync (#55, g): 3 Patienten in MM + Per-Patient-Feld ⇒ ResyncConflictError mit ids; Wish-Feld passiert", async () => {
  _resetAgencyTokenCache();
  const P3 = { ...P2, id: 75422 };
  const mm = fakeMamamia([LOGIN, readOf([P1, P2, P3])]);
  await assertRejects(
    () => resyncCustomerFromLead({ lead: resyncLead({ pflegegrad: 2 }), felder: ["pflegegrad"], secrets: SECRETS, fetchFn: mm.fetch }),
    ResyncConflictError, "75420, 75421, 75422",
  );
  _resetAgencyTokenCache();
  const mm2 = fakeMamamia([LOGIN, readOf([P1, P2, P3]), UPDATED]);
  await resyncCustomerFromLead({ lead: resyncLead({ geschlecht: "egal" }), felder: ["geschlecht"], secrets: SECRETS, fetchFn: mm2.fetch });
  const v = mm2.requests[2].variables;
  assertEquals((v.patients as unknown[]).length, 3);
  assertEquals((v.customer_caregiver_wish as Record<string, unknown>).gender, "not_important");
});

Deno.test("resync (#55, i): felder=[] + budget — Stubs + equipments + care_budget/monthly_salary, sonst nichts", async () => {
  _resetAgencyTokenCache();
  const mm = fakeMamamia([LOGIN, readOf([P1, P2]), UPDATED]);
  await resyncCustomerFromLead({ lead: resyncLead({}), felder: [], budget: 2900, secrets: SECRETS, fetchFn: mm.fetch });
  const v = mm.requests[2].variables;
  assertEquals(v, {
    id: 10670,
    patients: [{ id: 75420, tool_ids: [2] }, { id: 75421, tool_ids: [] }],
    equipment_ids: [1, 2],
    care_budget: 2900,
    monthly_salary: 2900,
  });
});

Deno.test("resync (#55): mobilitaet + weitere_personen — tool_ids frisch aus mobility (#13b), other_people_in_house", async () => {
  _resetAgencyTokenCache();
  const mm = fakeMamamia([LOGIN, readOf([P1]), UPDATED]);
  await resyncCustomerFromLead({
    lead: resyncLead({ mobilitaet: "bettlaegerig", weitere_personen: "ja" }),
    felder: ["mobilitaet", "weitere_personen"], secrets: SECRETS, fetchFn: mm.fetch,
  });
  const v = mm.requests[2].variables;
  assertEquals(v.patients, [{ id: 75420, tool_ids: [4, 6], mobility_id: 5, lift_id: 1 }]);
  assertEquals(v.other_people_in_house, "yes");
});
