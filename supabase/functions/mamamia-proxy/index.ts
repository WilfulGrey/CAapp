// Supabase Edge Function: mamamia-proxy
// POST /functions/v1/mamamia-proxy  body: { action, variables? }
// Cookie: session=<JWT from onboard-to-mamamia>
// → 200 { data: <GraphQL result> } or 401/400/502 { error: "..." }
//
// Design: full BFF. Agency Mamamia token stays server-side. Browser
// identifies itself only via session cookie signed by SESSION_JWT_SECRET.
// Each action validates ownership (queries constrained by session.customer_id
// or session.job_offer_id; mutations same + allowlist of mutable fields).

import { corsHeaders } from "../_shared/cors.ts";
import { isRateLimited } from "../_shared/rateLimit.ts";
import { parseCookie, verifySessionToken } from "../_shared/session.ts";
import { getOrRefreshAgencyToken } from "../_shared/mamamiaClient.ts";
import { ACTIONS, isKnownAction } from "./actions.ts";

// ─── Secrets + DI ──────────────────────────────────────────────────────────

export interface ProxySecrets {
  mamamiaEndpoint: string;
  mamamiaAuthEndpoint: string;
  mamamiaAgencyEmail: string;
  mamamiaAgencyPassword: string;
  sessionJwtSecret: string;
}

export interface ProxyDeps {
  secrets: ProxySecrets;
  fetchFn?: typeof fetch;
}

// ─── Core handler (testable) ───────────────────────────────────────────────

export async function handleRequest(req: Request, deps: ProxyDeps): Promise<Response> {
  const origin = req.headers.get("origin");
  const baseHeaders = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "method not allowed", baseHeaders);
  }

  // Rate limit — proxy handles more traffic (per-query), 60/min per IP.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip, { bucketKey: "proxy", max: 60 })) {
    return jsonError(429, "too many requests", baseHeaders);
  }

  // Verify session token — header preferred, cookie fallback.
  // Header path (X-Session-Token) added 2026-05-07 after Bug #13j: iOS
  // Chrome/Safari incognito drops the cross-site session cookie even with
  // Partitioned attribute. Frontend stores onboard's session_token in
  // sessionStorage and re-sends here. Cookie path retained as transparent
  // fallback for desktop / non-incognito flows.
  const headerToken = req.headers.get("x-session-token");
  const cookieHeader = req.headers.get("cookie");
  const cookieToken = parseCookie(cookieHeader, "session");
  const jwt = headerToken || cookieToken;
  if (!jwt) {
    return jsonError(401, "no session", baseHeaders);
  }
  const session = await verifySessionToken(jwt, deps.secrets.sessionJwtSecret);
  if (!session) {
    return jsonError(401, "invalid session", baseHeaders);
  }

  // Parse body
  let action: unknown;
  let variables: Record<string, unknown> = {};
  try {
    const body = await req.json();
    action = body?.action;
    variables = (body?.variables as Record<string, unknown> | undefined) ?? {};
  } catch {
    return jsonError(400, "invalid json body", baseHeaders);
  }

  if (typeof action !== "string" || !action) {
    return jsonError(400, "missing action", baseHeaders);
  }
  if (!isKnownAction(action)) {
    return jsonError(400, "unknown action", baseHeaders);
  }

  // Dispatch action
  try {
    // Panel base URL = same host as Mamamia GraphQL but rooted at /backend.
    // E.g. https://backend.beta.mamamia.app/graphql → derive panel as
    // https://beta.mamamia.app/backend (the SPA's actual API origin).
    const panelBaseUrl = derivePanelBaseUrl(deps.secrets.mamamiaEndpoint);
    const data = await ACTIONS[action](session, variables, {
      endpoint: deps.secrets.mamamiaEndpoint,
      getAgencyToken: () =>
        getOrRefreshAgencyToken({
          authEndpoint: deps.secrets.mamamiaAuthEndpoint,
          email: deps.secrets.mamamiaAgencyEmail,
          password: deps.secrets.mamamiaAgencyPassword,
          fetchFn: deps.fetchFn,
        }),
      panelBaseUrl,
      agencyEmail: deps.secrets.mamamiaAgencyEmail,
      agencyPassword: deps.secrets.mamamiaAgencyPassword,
      fetchFn: deps.fetchFn,
    });

    return new Response(
      JSON.stringify({ data }),
      {
        status: 200,
        headers: { ...baseHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const errMsg = (e as Error).message;
    console.error(`proxy[${action}] error:`, errMsg, (e as Error).stack);
    // DEBUG_PROXY=1 — leak the underlying message to ease diagnostics on
    // beta. Remove before going to prod (or guard on a non-prod project ref).
    if (Deno.env.get("DEBUG_PROXY") === "1") {
      return jsonError(502, `upstream failed: ${errMsg}`, baseHeaders);
    }
    return jsonError(502, "upstream failed", baseHeaders);
  }
}

function jsonError(status: number, message: string, extraHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...extraHeaders, "Content-Type": "application/json" },
  });
}

// Backend GraphQL → SPA panel base URL. Mamamia hosts the panel at the
// non-subdomain (beta.mamamia.app) under /backend, but its public GraphQL
// API at backend.beta.mamamia.app. We strip the leading "backend." host
// part and append /backend to the path.
function derivePanelBaseUrl(graphqlEndpoint: string): string {
  try {
    const u = new URL(graphqlEndpoint);
    const host = u.host.replace(/^backend\./, "");
    return `${u.protocol}//${host}/backend`;
  } catch {
    return graphqlEndpoint;
  }
}

// ─── Bootstrap (prod only) ─────────────────────────────────────────────────

if (import.meta.main) {
  const secrets: ProxySecrets = {
    mamamiaEndpoint: Deno.env.get("MAMAMIA_ENDPOINT")!,
    mamamiaAuthEndpoint: Deno.env.get("MAMAMIA_AUTH_ENDPOINT")!,
    mamamiaAgencyEmail: Deno.env.get("MAMAMIA_AGENCY_EMAIL")!,
    mamamiaAgencyPassword: Deno.env.get("MAMAMIA_AGENCY_PASSWORD")!,
    sessionJwtSecret: Deno.env.get("SESSION_JWT_SECRET")!,
  };

  Deno.serve((req) => handleRequest(req, { secrets }));
}
