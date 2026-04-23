import { assertEquals, assertRejects } from "@std/assert";
import { onboardLead } from "../onboard.ts";
import { _resetAgencyTokenCache } from "../mamamiaClient.ts";
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
    token_expires_at: "2026-05-07T12:00:00.000Z",
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
      },
    },
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
  fetchLead(token: string): Lead | null;
  updateLead(id: string, patch: Partial<Lead>): void;
}

function makeFakeSupabase(initialLeads: Lead[] = []): FakeSupabase {
  const leads = new Map(initialLeads.map((l) => [l.token ?? "", l]));
  const updated: FakeSupabase["updated"] = [];
  return {
    leads,
    updated,
    fetchLead(token) {
      return leads.get(token) ?? null;
    },
    updateLead(id, patch) {
      updated.push({ id, patch });
      for (const [, lead] of leads) {
        if (lead.id === id) Object.assign(lead, patch);
      }
    },
  };
}

// fetch fake for Mamamia GraphQL
function fakeMamamia(responses: Array<object>): typeof fetch {
  let i = 0;
  return async () => {
    const body = responses[i++];
    if (!body) throw new Error(`fakeMamamia: unexpected call #${i}`);
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

const SECRETS = {
  supabaseUrl: "https://test.supabase.co",
  supabaseServiceKey: "service-role",
  mamamiaEndpoint: "https://beta.mamamia.app/graphql",
  mamamiaAuthEndpoint: "https://beta.mamamia.app/graphql/auth",
  mamamiaAgencyEmail: "primundus+portal@mamamia.app",
  mamamiaAgencyPassword: "pw",
  sessionJwtSecret: "a".repeat(40),
};

const NOW = () => new Date("2026-04-23T10:00:00.000Z");

// ─── Tests ────────────────────────────────────────────────────────────────

Deno.test("onboardLead: happy path — registers customer + joboffer, caches IDs", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead();
  const supa = makeFakeSupabase([lead]);

  const fetchFn = fakeMamamia([
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
    fetchFn,
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
        fetchFn: fakeMamamia([]),
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
        fetchFn: fakeMamamia([]),
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

  const fetchFn = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
    { errors: [{ message: "validation" }] }, // StoreCustomer fails
  ]);

  await assertRejects(
    () =>
      onboardLead({
        leadToken: "valid-token",
        secrets: SECRETS,
        supabase: supa,
        fetchFn,
        now: NOW,
      }),
    Error,
    "validation",
  );

  // Supabase NOT updated on error
  assertEquals(supa.updated.length, 0);
});

Deno.test("onboardLead: null kalkulation lead still works (default patient)", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead({ kalkulation: null });
  const supa = makeFakeSupabase([lead]);

  const fetchFn = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
    { data: { StoreCustomer: { id: 1, customer_id: "ts-18-1", status: "draft" } } },
    { data: { StoreJobOffer: { id: 2, job_offer_id: "ts-18-1-1", title: "t", status: "search" } } },
  ]);

  const result = await onboardLead({
    leadToken: "valid-token",
    secrets: SECRETS,
    supabase: supa,
    fetchFn,
    now: NOW,
  });

  assertEquals(result.customer_id, 1);
  assertEquals(result.job_offer_id, 2);
});
