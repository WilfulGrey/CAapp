// Mamamia GraphQL client — minimalny wrapper nad fetch.
// Używany server-side (Deno Edge Function), NIE w browserze.

export interface GraphQLError {
  message: string;
  extensions?: Record<string, unknown>;
  locations?: unknown;
  path?: unknown;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export interface MamamiaRequestOptions {
  endpoint: string;
  token: string;
  query: string;
  variables?: Record<string, unknown>;
  fetchFn?: typeof fetch;
}

export async function mamamiaRequest<T>(opts: MamamiaRequestOptions): Promise<T> {
  const { endpoint, token, query, variables, fetchFn = globalThis.fetch } = opts;

  const res = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    const first = json.errors[0];
    const validation = (first.extensions as Record<string, unknown> | undefined)?.validation;
    const detail = validation ? ` [${JSON.stringify(validation)}]` : "";
    const msg = `${first.message}${detail}`;
    const err = new Error(msg);
    (err as Error & { graphqlErrors?: GraphQLError[] }).graphqlErrors = json.errors;
    throw err;
  }

  if (!json.data) {
    throw new Error("GraphQL response missing data field");
  }

  return json.data;
}

// ─── LoginAgency ─────────────────────────────────────────────────────────────

export interface LoginAgencyOptions {
  authEndpoint: string;        // /graphql/auth
  email: string;
  password: string;
  fetchFn?: typeof fetch;
}

export interface LoginAgencyResult {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

const LOGIN_AGENCY_MUTATION = /* GraphQL */ `
  mutation LoginAgency($email: String!, $password: String!) {
    LoginAgency(email: $email, password: $password, remember: true) {
      id
      name
      email
      token
    }
  }
`;

export async function loginAgency(opts: LoginAgencyOptions): Promise<LoginAgencyResult> {
  const { authEndpoint, email, password, fetchFn = globalThis.fetch } = opts;

  const res = await fetchFn(authEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: LOGIN_AGENCY_MUTATION,
      variables: { email, password },
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<{
    LoginAgency: { id: number; name: string; email: string; token: string };
  }>;

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message);
  }

  const login = json.data?.LoginAgency;
  if (!login?.token) {
    throw new Error("LoginAgency: no token returned");
  }

  return {
    token: login.token,
    user: { id: login.id, name: login.name, email: login.email },
  };
}

// ─── Cached agency token (singleton for Edge Function instance) ──────────────
// Edge Functions nie mają persistent state między wywołaniami (cold start każdy),
// ale w obrębie tego samego warm handlera trzymamy token jako module singleton.
// Real persistent cache byłby w Supabase edge_cache table; tu trzymamy proste.

let cachedToken: { token: string; obtainedAt: number } | null = null;
const AGENCY_TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23h (less than Mamamia JWT ~24h)

export async function getOrRefreshAgencyToken(
  loginOpts: LoginAgencyOptions,
): Promise<string> {
  if (cachedToken && (Date.now() - cachedToken.obtainedAt) < AGENCY_TOKEN_TTL_MS) {
    return cachedToken.token;
  }
  const { token } = await loginAgency(loginOpts);
  cachedToken = { token, obtainedAt: Date.now() };
  return token;
}

// Exposed for tests — reset cache between tests
export function _resetAgencyTokenCache() {
  cachedToken = null;
}
