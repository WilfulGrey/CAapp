// Frontend client for mamamia-proxy + onboard-to-mamamia Edge Functions.
// Never talks directly to Mamamia GraphQL — all traffic goes through Supabase
// Edge Functions which hold the agency token server-side.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export class MamamiaError extends Error {
  constructor(public status: number, public body: string) {
    super(`MamamiaError ${status}: ${body.slice(0, 200)}`);
  }
}

async function postJson<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include', // session cookie HttpOnly
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      // Supabase Gateway requires both `apikey` and `Authorization: Bearer`
      // — without Authorization the gateway returns 401 UNAUTHORIZED_NO_AUTH_HEADER
      // before the request reaches the Edge Function.
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new MamamiaError(res.status, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new MamamiaError(res.status, `invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Onboarding ──────────────────────────────────────────────────────────

export interface OnboardResponse {
  customer_id: number;
  job_offer_id: number;
}

export async function onboardWithLeadToken(leadToken: string): Promise<OnboardResponse> {
  return postJson<OnboardResponse>(
    '/functions/v1/onboard-to-mamamia',
    { token: leadToken },
  );
}

// ─── Proxy actions ────────────────────────────────────────────────────────

export type ProxyAction =
  // reads
  | 'getJobOffer'
  | 'getCustomer'
  | 'listApplications'
  | 'listMatchings'
  | 'getCaregiver'
  | 'searchLocations'
  // writes
  | 'updateCustomer'
  | 'rejectApplication'
  | 'storeConfirmation'
  | 'inviteCaregiver';

export async function callMamamia<T>(
  action: ProxyAction,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await postJson<{ data: T }>(
    '/functions/v1/mamamia-proxy',
    { action, variables },
  );
  return res.data;
}
