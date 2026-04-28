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

// fetch fake for Mamamia GraphQL — also captures request bodies so tests
// can assert the StoreCustomer payload shape.
interface FakeMamamia {
  fetch: typeof fetch;
  // request bodies parsed from outgoing fetch() calls, in order
  requests: Array<{ query: string; variables: Record<string, unknown> }>;
}

function fakeMamamia(responses: Array<object>): FakeMamamia {
  let i = 0;
  const requests: FakeMamamia["requests"] = [];
  return {
    requests,
    fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
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

Deno.test("onboardLead: StoreCustomer payload carries every must-fill field", async () => {
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

  // Identity
  assertEquals(v.first_name, "hildegard");
  assertEquals(v.last_name, "schmidt");
  assertEquals(v.email, "frau@example.de");
  assertEquals(v.phone, "+49 89 1234567");

  // Customer-level enums (every 100%-fill column from active customers)
  assertEquals(v.urbanization_id, 2);
  assertEquals(v.language_id, 1);
  assertEquals(v.visibility, "public");
  assertEquals(v.accommodation, "single_family_house");
  assertEquals(v.caregiver_accommodated, "room_premises");
  assertEquals(v.has_family_near_by, "not_important");
  assertEquals(v.internet, "yes");
  assertEquals(v.pets, "no_information");
  assertEquals(v.other_people_in_house, "no");
  assertEquals(v.smoking_household, "no");
  assertEquals(v.gender, "female"); // formularDaten.geschlecht=weiblich

  // Panel form must-fill (verified vs customer 7580 screenshots) — never
  // include Others (id 8) which triggers a required free-text field.
  assertEquals(v.equipment_ids, [1, 2]);
  assertEquals(v.day_care_facility, "no");

  // Care budget mirrored + commission default
  assertEquals(v.care_budget, 3200);
  assertEquals(v.monthly_salary, 3200);
  assertEquals(v.commission_agent_salary, 300);
  // arrival_at on Customer (separate gate from JobOffer)
  // NOW=2026-04-23 + 7 days (sofort) → 2026-04-30
  assertEquals(v.arrival_at, "2026-04-30");

  // Job description i18n — non-empty in all 4 locales
  for (const k of ["job_description", "job_description_de", "job_description_en", "job_description_pl"]) {
    const s = v[k];
    if (typeof s !== "string" || s.length === 0) {
      throw new Error(`expected ${k} to be non-empty string`);
    }
  }

  // Nested input objects — each is sent as a real object, not a string.
  const wish = v.customer_caregiver_wish as Record<string, unknown>;
  if (!wish || typeof wish !== "object") throw new Error("wish must be an object");
  assertEquals(wish.gender, "female");
  assertEquals(wish.germany_skill, "level_3");

  const contract = v.customer_contract as Record<string, unknown>;
  assertEquals(contract.salutation, "Mrs.");
  assertEquals(contract.first_name, "hildegard");
  assertEquals(contract.is_same_as_first_patient, true);

  const invoice = v.invoice_contract as Record<string, unknown>;
  assertEquals(invoice.email, "frau@example.de");

  const contacts = v.customer_contacts as Array<Record<string, unknown>>;
  assertEquals(contacts.length, 1);
  assertEquals(contacts[0].is_same_as_first_patient, true);

  // Patients — first patient has all 100%-fill fields set
  const patients = v.patients as Array<Record<string, unknown>>;
  assertEquals(patients.length, 1);
  assertEquals(patients[0].mobility_id, 4);   // rollstuhl
  assertEquals(patients[0].care_level, 3);    // pflegegrad
  assertEquals(patients[0].lift_id, 1);          // wheelchair → lift required
  assertEquals(patients[0].tool_ids, [3]);       // wheelchair only — Others triggers required free-text
  assertEquals(patients[0].weight, "61-70");
  assertEquals(patients[0].height, "161-170");

  // StoreJobOffer (third request — after LoginAgency + StoreCustomer) must
  // also carry commission + visibility (panel rejects 0/missing).
  const sjoReq = mm.requests[2];
  assertEquals(sjoReq.variables.salary_commission, 300);
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

  // Third was StoreCustomer with location_id resolved on contract
  const sc = mm.requests[2];
  const contract = sc.variables.customer_contract as Record<string, unknown>;
  assertEquals(contract.location_id, 1148);
  assertEquals(contract.location_custom_text, undefined);
});

Deno.test("onboardLead: null kalkulation lead still works (default patient)", async () => {
  _resetAgencyTokenCache();
  const lead = makeLead({ kalkulation: null });
  const supa = makeFakeSupabase([lead]);

  const mm = fakeMamamia([
    { data: { LoginAgency: { id: 1, name: "P", email: "x", token: "t" } } },
    { data: { StoreCustomer: { id: 1, customer_id: "ts-18-1", status: "draft" } } },
    { data: { StoreJobOffer: { id: 2, job_offer_id: "ts-18-1-1", title: "t", status: "search" } } },
  ]);

  const result = await onboardLead({
    leadToken: "valid-token",
    secrets: SECRETS,
    supabase: supa,
    fetchFn: mm.fetch,
    now: NOW,
  });

  assertEquals(result.customer_id, 1);
  assertEquals(result.job_offer_id, 2);
});
