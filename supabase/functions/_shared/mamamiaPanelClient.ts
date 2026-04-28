// Mamamia panel-style auth client. Mimics what the SPA at beta.mamamia.app
// does internally: cookie-based session via Laravel Sanctum + GraphQL on
// /backend/graphql{,/auth}.
//
// We fall back to this flow for ImpersonateCustomer + SendInvitationCaregiver
// because:
//   - The "public" /graphql/auth endpoint accepts our LoginAgency Bearer token
//     but ImpersonateCustomer there returns Unauthorized (gating reserved for
//     internal Vitanas staff with personal_access_tokens.name='impersonate').
//   - The "panel" /backend/graphql/auth endpoint is what the actual UI uses;
//     gating there checks roleService->isServiceAgency() + ownership and
//     accepts any service-agency-admin user — exactly our case.
//
// Live-verified on beta 2026-04-27 with session-mode flow:
//   csrf-cookie → LoginAgency → ImpersonateCustomer(7576) → returned User.id=8204.

export interface PanelSession {
  /** Serialized cookie header value, e.g. "XSRF-TOKEN=...; mamamia_beta_session=..." */
  cookies: string;
  /** URL-decoded XSRF-TOKEN value, used in the X-XSRF-TOKEN request header. */
  xsrf: string;
}

export interface PanelClientOptions {
  /** Base URL of the panel — typically https://beta.mamamia.app/backend */
  baseUrl: string;
  fetchFn?: typeof fetch;
}

interface SetCookieEntry {
  name: string;
  value: string;
  attrs: string[]; // raw remaining segments (path/expires/httponly/etc.)
}

// ─── Cookie parsing ─────────────────────────────────────────────────────────

function parseSetCookieHeader(setCookie: string): SetCookieEntry {
  const parts = setCookie.split(";").map(p => p.trim());
  const [namePair, ...attrs] = parts;
  const eq = namePair.indexOf("=");
  return {
    name: namePair.slice(0, eq),
    value: namePair.slice(eq + 1),
    attrs,
  };
}

/** Merges new Set-Cookie entries into an existing jar; later wins. */
function mergeCookies(existing: Map<string, string>, response: Response): Map<string, string> {
  const merged = new Map(existing);
  // Deno headers expose getSetCookie() — falls back to .get() with split.
  // deno-lint-ignore no-explicit-any
  const raw = (response.headers as any).getSetCookie?.() as string[] | undefined;
  const lines = raw ?? (response.headers.get("set-cookie")?.split(/,(?=[^;]+=)/g) ?? []);
  for (const line of lines) {
    if (!line) continue;
    const entry = parseSetCookieHeader(line);
    if (!entry.name) continue;
    merged.set(entry.name, entry.value);
  }
  return merged;
}

function jarToCookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function decodeXsrf(jar: Map<string, string>): string {
  const raw = jar.get("XSRF-TOKEN") ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Step 1: hit Sanctum's csrf-cookie endpoint to seed XSRF-TOKEN +
 * mamamia_beta_session cookies. No auth, no body — Laravel just sets cookies.
 */
async function fetchCsrfCookie(opts: PanelClientOptions): Promise<Map<string, string>> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const res = await fetchFn(`${opts.baseUrl}/sanctum/csrf-cookie`, {
    method: "GET",
    headers: {
      "Origin": originOf(opts.baseUrl),
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`csrf-cookie failed: HTTP ${res.status}`);
  }
  return mergeCookies(new Map(), res);
}

function originOf(baseUrl: string): string {
  const u = new URL(baseUrl);
  return `${u.protocol}//${u.host}`;
}

/**
 * Posts a GraphQL operation to the panel endpoint with the supplied jar +
 * X-XSRF-TOKEN. Updates the jar with any Set-Cookie response (Laravel
 * rotates session/XSRF on each write).
 */
async function panelGraphQL<T>(
  opts: PanelClientOptions,
  jar: Map<string, string>,
  endpoint: string,
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data: T; jar: Map<string, string> }> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const xsrf = decodeXsrf(jar);
  if (!xsrf) {
    throw new Error("panel session has no XSRF-TOKEN — call fetchCsrfCookie first");
  }
  const res = await fetchFn(`${opts.baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Origin": originOf(opts.baseUrl),
      "Referer": `${originOf(opts.baseUrl)}/`,
      "X-XSRF-TOKEN": xsrf,
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": jarToCookieHeader(jar),
    },
    body: JSON.stringify({ operationName, query, variables }),
  });

  const text = await res.text();
  let json: { data?: T; errors?: Array<{ message?: string }> };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`panel ${operationName}: non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (json.errors && json.errors.length > 0) {
    const msg = json.errors[0]?.message ?? "unknown";
    throw new Error(`panel ${operationName}: ${msg}`);
  }
  if (!json.data) {
    throw new Error(`panel ${operationName}: empty data field (${res.status})`);
  }

  return { data: json.data, jar: mergeCookies(jar, res) };
}

const LOGIN_AGENCY = /* GraphQL */ `
  mutation LoginAgency($email: String!, $password: String!, $remember: Boolean!) {
    LoginAgency(email: $email, password: $password, remember: $remember) {
      id
      email
    }
  }
`;

/**
 * Login as service-agency admin and return the panel session.
 *
 * Used by mamamia-proxy actions that fire panel-side mutations the public
 * /graphql endpoint refuses under agency Bearer auth (e.g. StoreRequest).
 * Verified live on beta 2026-04-28: this agency-only session is enough,
 * ImpersonateCustomer is NOT required when customer.status='active'.
 */
export async function loginAsAgency(
  opts: PanelClientOptions,
  email: string,
  password: string,
): Promise<PanelSession> {
  let jar = await fetchCsrfCookie(opts);

  const login = await panelGraphQL<{ LoginAgency: { id: number } }>(
    opts,
    jar,
    "/graphql/auth",
    "LoginAgency",
    LOGIN_AGENCY,
    { email, password, remember: true },
  );
  jar = login.jar;

  return { cookies: jarToCookieHeader(jar), xsrf: decodeXsrf(jar) };
}

/**
 * Posts a GraphQL mutation/query to the panel /graphql endpoint using a
 * persisted session cookie jar. The jar may carry an agency-only session
 * (loginAsAgency) OR a customer-impersonated one (loginAndImpersonate) —
 * the function does not care; the caller picks whichever auth context
 * the target mutation requires.
 *
 * The "AsCustomer" suffix in the function name is historical (the first
 * action that landed used impersonate). Kept as the export name to avoid
 * a churn-only rename across tests.
 */
export async function panelMutateAsCustomer<T>(
  opts: PanelClientOptions,
  session: PanelSession,
  query: string,
  variables: Record<string, unknown>,
  operationName = "Anonymous",
): Promise<T> {
  const jar = new Map<string, string>();
  // Re-hydrate jar from serialized cookie string.
  for (const part of session.cookies.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq > 0) jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  // Some Set-Cookie values are URL-encoded by curl; XSRF-TOKEN typically isn't
  // re-encoded in our serialized header but keep `session.xsrf` as the
  // pre-decoded source of truth.
  if (!jar.has("XSRF-TOKEN") && session.xsrf) {
    jar.set("XSRF-TOKEN", encodeURIComponent(session.xsrf));
  }

  const result = await panelGraphQL<T>(
    opts,
    jar,
    "/graphql",
    operationName,
    query,
    variables,
  );
  return result.data;
}

// Exposed for tests — internal fns reachable for unit assertions.
export const __testing = {
  parseSetCookieHeader,
  mergeCookies,
  jarToCookieHeader,
  decodeXsrf,
};
