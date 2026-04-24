// Supabase Edge Function: onboard-to-mamamia
// POST /functions/v1/onboard-to-mamamia  body: { token: string }
// → 200 + Set-Cookie: session=... (HttpOnly) + body: { customer_id, job_offer_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { onboardLead, sessionPayloadFromResult, type OnboardSecrets, type SupabaseLike } from "./onboard.ts";
import { createSessionToken, sessionCookieHeader } from "../_shared/session.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { isRateLimited } from "../_shared/rateLimit.ts";

// ─── Handler dependencies (for DI in tests) ────────────────────────────────

export interface HandlerDeps {
  secrets: OnboardSecrets;
  supabase: SupabaseLike;
  fetchFn?: typeof fetch;
}

// ─── Core request handler (testable) ───────────────────────────────────────

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  const origin = req.headers.get("origin");
  const baseHeaders = corsHeaders(origin);

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "method not allowed", baseHeaders);
  }

  // Rate limit — onboard is rare (per-lead first visit), 5/min enough
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip, { bucketKey: "onboard", max: 5 })) {
    return jsonError(429, "too many requests", baseHeaders);
  }

  // Body parsing
  let token: string | undefined;
  try {
    const body = await req.json();
    token = body?.token;
  } catch {
    return jsonError(400, "invalid json body", baseHeaders);
  }

  if (!token || typeof token !== "string") {
    return jsonError(400, "missing token field", baseHeaders);
  }

  // Onboard
  let result;
  try {
    result = await onboardLead({
      leadToken: token,
      secrets: deps.secrets,
      supabase: deps.supabase,
      fetchFn: deps.fetchFn,
    });
  } catch (e) {
    const msg = (e as Error).message;
    // Expected: token errors → 401; everything else → 500
    const isTokenErr = /expired|invalid|nonexistent/i.test(msg);
    console.error("onboard error:", msg, (e as Error).stack); // Edge Function logs
    return jsonError(isTokenErr ? 401 : 500, isTokenErr ? "invalid-token" : "onboarding failed", baseHeaders);
  }

  // Sign session JWT
  const jwt = await createSessionToken(
    sessionPayloadFromResult(result),
    deps.secrets.sessionJwtSecret,
  );

  // Response — body contains ONLY non-sensitive IDs. Agency token stays in cookie/server.
  return new Response(
    JSON.stringify({
      customer_id: result.customer_id,
      job_offer_id: result.job_offer_id,
    }),
    {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookieHeader(jwt),
      },
    },
  );
}

function jsonError(status: number, message: string, extraHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...extraHeaders, "Content-Type": "application/json" },
  });
}

// ─── Real Supabase adapter (used in prod, not in tests) ────────────────────

function makeRealSupabase(url: string, serviceKey: string): SupabaseLike {
  const client = createClient(url, serviceKey);
  return {
    async fetchLead(token: string) {
      const { data, error } = await client
        .from("leads")
        .select("*")
        .eq("token", token)
        .gt("token_expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) throw new Error(`supabase: ${error.message}`);
      return data;
    },
    async updateLead(id: string, patch: Record<string, unknown>) {
      const { error } = await client.from("leads").update(patch).eq("id", id);
      if (error) throw new Error(`supabase update: ${error.message}`);
    },
  };
}

// ─── Deno.serve bootstrap ──────────────────────────────────────────────────

if (import.meta.main) {
  const secrets: OnboardSecrets = {
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    supabaseServiceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    mamamiaEndpoint: Deno.env.get("MAMAMIA_ENDPOINT")!,
    mamamiaAuthEndpoint: Deno.env.get("MAMAMIA_AUTH_ENDPOINT")!,
    mamamiaAgencyEmail: Deno.env.get("MAMAMIA_AGENCY_EMAIL")!,
    mamamiaAgencyPassword: Deno.env.get("MAMAMIA_AGENCY_PASSWORD")!,
    sessionJwtSecret: Deno.env.get("SESSION_JWT_SECRET")!,
  };

  const deps: HandlerDeps = {
    secrets,
    supabase: makeRealSupabase(secrets.supabaseUrl, secrets.supabaseServiceKey),
  };

  Deno.serve((req) => handleRequest(req, deps));
}
