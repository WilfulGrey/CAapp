// Frontend client for mamamia-proxy + onboard-to-mamamia Edge Functions.
// Never talks directly to Mamamia GraphQL — all traffic goes through Supabase
// Edge Functions which hold the agency token server-side.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Session token storage (Bug #13j fallback for iOS WebKit incognito):
// onboard returns a `session_token` JWT in the response body — we stash
// it in sessionStorage and forward as `X-Session-Token` on every proxy
// call. mamamia-proxy reads header first, falls back to cookie. Stays
// available across SPA navigations within the tab; cleared on tab close.
//
// Why sessionStorage (not localStorage): we want the token gone when the
// tab closes — it's session-scoped just like the original cookie was.
const SESSION_TOKEN_KEY = 'mamamia_session_token';

function readSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeSessionToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    else sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // ignore quota / private mode that throws on setItem
  }
}

export class MamamiaError extends Error {
  constructor(public status: number, public body: string) {
    super(`MamamiaError ${status}: ${body.slice(0, 200)}`);
  }

  // mamamia-proxy includes `category` in the error body for GraphQL panel-flow
  // errors (e.g. "validation" / "authorization"). Returns null when body isn't
  // JSON or carries no category — graceful for HTTP-only errors (network,
  // gateway, non-proxy sources).
  get category(): string | null {
    try {
      const parsed = JSON.parse(this.body) as { category?: unknown };
      return typeof parsed.category === 'string' ? parsed.category : null;
    } catch {
      return null;
    }
  }
}

async function postJson<T>(path: string, body: object): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    // Supabase Gateway requires both `apikey` and `Authorization: Bearer`
    // — without Authorization the gateway returns 401 UNAUTHORIZED_NO_AUTH_HEADER
    // before the request reaches the Edge Function.
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  // Forward session token as header for browsers that drop the cookie.
  // No-op if no token stashed yet (e.g. onboard call itself).
  const sessionToken = readSessionToken();
  if (sessionToken) headers['X-Session-Token'] = sessionToken;

  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include', // session cookie HttpOnly (desktop / non-incognito)
    headers,
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
  // Bug #13j: edge function also returns the session JWT in body so the
  // frontend can stash it for header-based auth on browsers that drop
  // the cookie (iOS WebKit incognito, etc.).
  session_token: string;
}

export async function onboardWithLeadToken(leadToken: string): Promise<OnboardResponse> {
  const result = await postJson<OnboardResponse>(
    '/functions/v1/onboard-to-mamamia',
    { token: leadToken },
  );
  if (result.session_token) writeSessionToken(result.session_token);
  return result;
}

// ─── Proxy actions ────────────────────────────────────────────────────────

export type ProxyAction =
  // reads
  | 'getJobOffer'
  | 'getCustomer'
  | 'listApplications'
  | 'listMatchings'
  | 'listInvitedCaregiverIds'
  | 'getCaregiver'
  | 'searchLocations'
  // writes
  | 'updateCustomer'
  | 'updateJobDescription'
  | 'rejectApplication'
  | 'storeConfirmation'
  | 'inviteCaregiver'
  // AI
  | 'generateJobDescription'
  | 'generateCaregiverAbout';

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
