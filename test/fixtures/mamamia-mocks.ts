// MSW handlers + sample data for Mamamia integration tests.
//
// Test usage:
//   import { server } from '../../test/mocks/server';
//   import { defaultHandlers, proxyHandler, sampleApplication } from '../../test/fixtures/mamamia-mocks';
//   server.use(...defaultHandlers());
//   // override:
//   server.use(proxyHandler({ rejectApplication: () => { called++; return {...} } }));

import { http, HttpResponse } from 'msw';

export const TEST_LEAD_TOKEN = 'integration-test-token';
export const TEST_CUSTOMER_ID = 9001;
export const TEST_JOB_OFFER_ID = 7001;

const SUPABASE_URL = 'https://test.supabase.co';

// ─── Sample data ──────────────────────────────────────────────────────────

export const defaultLead = {
  id: 'integration-lead-uuid-0000',
  email: 'itest@test.local',
  vorname: 'anna',
  nachname: 'testerin',
  anrede: 'Frau',
  anrede_text: 'Frau',
  telefon: '+49 89 0000000',
  status: 'angebot_requested',
  token: TEST_LEAD_TOKEN,
  token_expires_at: '2099-01-01T00:00:00.000Z',
  token_used: false,
  care_start_timing: 'sofort',
  kalkulation: {
    bruttopreis: 2800,
    eigenanteil: 1800,
    'zuschüsse': {
      gesamt: 1000,
      items: [
        {
          name: 'pflegegeld', label: 'Pflegegeld', beschreibung: '',
          betrag_monatlich: 347, betrag_jaehrlich: 4164,
          typ: 'monatlich', hinweis: null, in_kalkulation: true,
        },
      ],
    },
    aufschluesselung: [],
    formularDaten: {
      pflegegrad: 3,
      mobilitaet: 'rollstuhl',
      nachteinsaetze: 'gelegentlich',
      geschlecht: 'weiblich',
      weitere_personen: 'nein',
    },
  },
  created_at: '2026-04-20T09:00:00.000Z',
  updated_at: '2026-04-20T09:00:00.000Z',
  mamamia_customer_id: null,
  mamamia_job_offer_id: null,
  mamamia_user_token: null,
  mamamia_onboarded_at: null,
};

export const sampleJobOffer = {
  id: TEST_JOB_OFFER_ID,
  job_offer_id: 'ts-18-9001-1',
  status: 'search',
  title: 'Primundus — testerin',
  salary_offered: 2800,
  arrival_at: '2026-05-01 00:00:00',
  departure_at: null,
  applications_count: 1,
  confirmations_count: 0,
  created_at: '2026-04-24T10:00:00.000Z',
};

export const sampleCustomer = {
  id: TEST_CUSTOMER_ID,
  customer_id: 'ts-18-9001',
  status: 'draft',
  first_name: 'Anna',
  last_name: 'Testerin',
  email: 'itest@test.local',
  location_id: null,
  location_custom_text: null,
  job_description: null,
  arrival_at: null,
  departure_at: null,
  care_budget: 2800,
  patients: [{ id: 12001 }],
};

export const sampleCaregiver = {
  id: 50001,
  first_name: 'Maria',
  last_name: 'Kowalski',
  gender: 'female' as const,
  year_of_birth: 1985,
  birth_date: null,
  germany_skill: 'level_3',
  care_experience: '5',
  available_from: null,
  last_contact_at: '2026-04-24T09:00:00.000Z',
  last_login_at: '2026-04-24T09:55:00.000Z',
  is_active_user: true,
  hp_total_jobs: 15,
  hp_total_days: 900,
  hp_avg_mission_days: 60,
  avatar_retouched: { aws_url: 'https://example.test/avatar.jpg' },
};

export const sampleApplication = {
  id: 333,
  caregiver_id: sampleCaregiver.id,
  job_offer_id: TEST_JOB_OFFER_ID,
  parent_id: null,
  is_counter_offer: false,
  salary: 2250,
  message: 'Test application message',
  arrival_at: '2026-05-01 00:00:00',
  departure_at: '2026-07-12 00:00:00',
  arrival_fee: 120,
  departure_fee: 120,
  holiday_surcharge: 0,
  active_until_at: '2026-04-30T00:00:00.000Z',
  caregiver: sampleCaregiver,
};

export const sampleMatching = {
  id: 10001,
  percentage_match: 95,
  is_show: true,
  is_best_matching: true,
  caregiver: { ...sampleCaregiver, id: 50002, first_name: 'Helena' },
};

// ─── Proxy action handlers ────────────────────────────────────────────────

export interface ProxyActionHandlers {
  getJobOffer?: () => unknown;
  getCustomer?: () => unknown;
  listApplications?: () => unknown;
  listMatchings?: () => unknown;
  getCaregiver?: () => unknown;
  searchLocations?: () => unknown;
  updateCustomer?: (vars: Record<string, unknown>) => unknown;
  rejectApplication?: (vars: Record<string, unknown>) => unknown;
  storeConfirmation?: (vars: Record<string, unknown>) => unknown;
  inviteCaregiver?: (vars: Record<string, unknown>) => unknown;
}

export function proxyHandler(overrides: ProxyActionHandlers = {}) {
  const defaults: Required<ProxyActionHandlers> = {
    getJobOffer: () => ({ JobOffer: sampleJobOffer }),
    getCustomer: () => ({ Customer: sampleCustomer }),
    listApplications: () => ({
      JobOfferApplicationsWithPagination: { total: 1, data: [sampleApplication] },
    }),
    listMatchings: () => ({
      JobOfferMatchingsWithPagination: { total: 1, data: [sampleMatching] },
    }),
    getCaregiver: () => ({ Caregiver: sampleCaregiver }),
    searchLocations: () => ({ LocationsWithPagination: { data: [] } }),
    updateCustomer: () => ({ UpdateCustomer: { id: TEST_CUSTOMER_ID, customer_id: 'ts-18-9001' } }),
    rejectApplication: () => ({ RejectApplication: { id: 333, rejected_at: '2026-04-24T11:00Z', reject_message: null } }),
    storeConfirmation: () => ({ StoreConfirmation: { id: 77, application_id: 333, is_confirm_binding: true } }),
    inviteCaregiver: () => ({ SendInvitationCaregiver: true }),
    ...overrides,
  };

  return http.post(`${SUPABASE_URL}/functions/v1/mamamia-proxy`, async ({ request }) => {
    const body = await request.json() as { action: keyof ProxyActionHandlers; variables?: Record<string, unknown> };
    const handler = defaults[body.action];
    if (!handler) {
      return HttpResponse.json({ error: `unknown action: ${body.action}` }, { status: 400 });
    }
    return HttpResponse.json({ data: handler(body.variables ?? {}) });
  });
}

// ─── Supabase leads + onboard handlers ────────────────────────────────────

export function leadHandler(lead = defaultLead) {
  return http.get(`${SUPABASE_URL}/rest/v1/leads`, ({ request }) => {
    const url = new URL(request.url);
    const tokenParam = url.searchParams.get('token');
    const accept = request.headers.get('accept') ?? '';

    // Supabase .maybeSingle() sends Accept: application/vnd.pgrst.object+json
    // and expects a single object (or empty object when not found).
    const wantsSingle = accept.includes('application/vnd.pgrst.object+json');

    // PostgREST filter format: token=eq.xxx
    if (tokenParam && tokenParam.startsWith('eq.')) {
      const tok = tokenParam.slice(3);
      if (tok === lead.token) {
        return wantsSingle ? HttpResponse.json(lead) : HttpResponse.json([lead]);
      }
      // Not found
      if (wantsSingle) {
        return HttpResponse.json(null, { status: 406 });
      }
      return HttpResponse.json([]);
    }

    return wantsSingle ? HttpResponse.json(lead) : HttpResponse.json([lead]);
  });
}

export function onboardHandler(body = { customer_id: TEST_CUSTOMER_ID, job_offer_id: TEST_JOB_OFFER_ID }) {
  return http.post(`${SUPABASE_URL}/functions/v1/onboard-to-mamamia`, () => {
    return HttpResponse.json(body, {
      headers: { 'Set-Cookie': 'session=mock-jwt; HttpOnly; Path=/' },
    });
  });
}

// ─── Bundle: default handlers for a "happy" integration test ─────────────

export function defaultHandlers(
  overrides: { lead?: typeof defaultLead; proxy?: ProxyActionHandlers } = {},
) {
  return [
    leadHandler(overrides.lead),
    onboardHandler(),
    proxyHandler(overrides.proxy),
  ];
}
