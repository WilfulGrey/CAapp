// Supabase Edge Function: mamamia-proxy
// POST /functions/v1/mamamia-proxy  body: { action, variables? }
// Cookie: session=<JWT from onboard-to-mamamia>
// → 200 { data: <GraphQL result> } or 401/400/502 { error: "..." }
//
// Design: full BFF. Agency Mamamia token stays server-side. Browser
// identifies itself only via session cookie signed by SESSION_JWT_SECRET.
// Each action validates ownership (queries constrained by session.customer_id
// or session.job_offer_id; mutations same + allowlist of mutable fields).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { isRateLimited } from "../_shared/rateLimit.ts";
import { parseCookie, verifySessionToken } from "../_shared/session.ts";
import { getOrRefreshAgencyToken } from "../_shared/mamamiaClient.ts";
import { ACTIONS, isKnownAction } from "./actions.ts";
import type { LeadJobRow, ProxySupabase } from "./types.ts";

// ─── Secrets + DI ──────────────────────────────────────────────────────────

export interface ProxySecrets {
  mamamiaEndpoint: string;
  mamamiaAuthEndpoint: string;
  mamamiaAgencyEmail: string;
  mamamiaAgencyPassword: string;
  sessionJwtSecret: string;
  /** Anthropic API key — optional. When missing, generateJobDescription
   *  returns null and the frontend falls back to the mechanical summary. */
  anthropicApiKey?: string;
  // Panel SPA base URL — different host than GraphQL API. Mamamia
  // hostuje panel UI na osobnym subdomain z `/backend` path:
  //   - beta tenant:    https://beta.mamamia.app/backend
  //   - preprod tenant: https://portal.mamamia.app/backend
  // GraphQL API (MAMAMIA_ENDPOINT) jest na innym hoście
  // (`backend.{env}.mamamia.app`). Panel = miejsce gdzie csrf-cookie +
  // LoginAgency + StoreRequest faktycznie żyją. Bez panel URL panel-side
  // mutations (inviteCaregiver) wpadają w niewłaściwy endpoint i policy
  // je rejectuje pomimo ustawionych cookies.
  // REQUIRED secret. Bootstrap throws gdy brak — no soft fallback
  // (Święta zasada nr 1). Wartość ustalana per-tenant przez inspekcję
  // DevTools Network w żywym panelu Mamamii.
  mamamiaPanelUrl: string;
  /** Used by dismissCaregiver / listDismissedCaregivers actions which
   *  write to `lead_dismissed_caregivers`. Service-role bypasses RLS;
   *  ownership is enforced at the proxy layer via session.lead_id. */
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export interface ProxyDeps {
  secrets: ProxySecrets;
  fetchFn?: typeof fetch;
  /** Optional override for tests. Real impl built from secrets in
   *  bootstrap below. */
  supabase?: ProxySupabase;
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
    const panelBaseUrl = deps.secrets.mamamiaPanelUrl;
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
      anthropicApiKey: deps.secrets.anthropicApiKey,
      // Bootstrap constructs the real Supabase adapter once (module-level
      // singleton) and passes it through `deps.supabase`. We do NOT
      // auto-construct here because `createClient` schedules a token
      // auto-refresh timer that Deno test runner flags as a leak.
      supabase: deps.supabase,
    });

    return new Response(
      JSON.stringify({ data }),
      {
        status: 200,
        headers: { ...baseHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const err = e as Error & {
      rateLimited?: boolean;
      retry_after_seconds?: number;
      limit?: number;
      window_minutes?: number;
      used?: number;
    };
    const errMsg = err.message;
    console.error(`proxy[${action}] error:`, errMsg, err.stack);

    // Rate-limit errors thrown by inviteCaregiver carry structured data
    // (retry_after_seconds, limit, used). Surface as HTTP 429 with the
    // metadata so the frontend modal can show "Bitte warten Sie noch X
    // Min." without depending on DEBUG_PROXY leakage. Distinct from a
    // 502 upstream failure — retry vs wait have different UX.
    if (err.rateLimited) {
      return jsonError(429, "rate-limited", baseHeaders, {
        retry_after_seconds: err.retry_after_seconds,
        limit: err.limit,
        window_minutes: err.window_minutes,
        used: err.used,
      });
    }

    // Surface the GraphQL error category to the client so it can make retry
    // decisions without depending on DEBUG_PROXY leakage. Panel-client errors
    // carry `cat=<category>` per mamamiaPanelClient.ts (e.g. cat=validation
    // when Mamamia's translator transiently wipes patient description fields
    // mid-invite — frontend retries those for ~30s).
    const catMatch = errMsg.match(/\bcat=([a-z?]+)/);
    const category = catMatch ? catMatch[1] : null;
    // DEBUG_PROXY=1 — leak the underlying message to ease diagnostics on
    // beta. Remove before going to prod (or guard on a non-prod project ref).
    if (Deno.env.get("DEBUG_PROXY") === "1") {
      return jsonError(502, `upstream failed: ${errMsg}`, baseHeaders, { category });
    }
    return jsonError(502, "upstream failed", baseHeaders, { category });
  }
}

function jsonError(
  status: number,
  message: string,
  extraHeaders: Record<string, string>,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { ...extraHeaders, "Content-Type": "application/json" },
  });
}

// ─── Real Supabase adapter ─────────────────────────────────────────────────

function makeRealSupabase(url: string, serviceKey: string): ProxySupabase {
  const client: SupabaseClient = createClient(url, serviceKey);
  return {
    async selectLeadJobs(leadId: string) {
      // Manual `position` pin first (1 = oben), then chronological by anreise
      // (nulls last — geplant jobs without a date). The frontend re-sorts by
      // status for display; this is just a stable default order.
      const { data, error } = await client
        .from("lead_jobs")
        .select("id, mamamia_job_offer_id, status, anreise, abreise, position, pflegekraft, bewerbungen")
        .eq("lead_id", leadId)
        .order("position", { ascending: false })
        .order("anreise", { ascending: true, nullsFirst: false });
      if (error) throw new Error(`supabase selectLeadJobs: ${error.message}`);
      return (data ?? []) as LeadJobRow[];
    },
    async upsertLeadJobs(leadId, jobs) {
      if (jobs.length === 0) return;
      // onConflict (lead_id, mamamia_job_offer_id): inserts new jobs, updates
      // status/anreise/abreise on existing. position/created_at/id untouched;
      // updated_at maintained by trigger.
      const rows = jobs.map((j) => ({ lead_id: leadId, ...j }));
      const { error } = await client
        .from("lead_jobs")
        .upsert(rows, { onConflict: "lead_id,mamamia_job_offer_id" });
      if (error) throw new Error(`supabase upsertLeadJobs: ${error.message}`);
    },
    async selectDismissedCaregivers(leadId: string, jobOfferId: number) {
      // Per-job (Multi-Job #2b): only this job's dismissals. Legacy rows were
      // backfilled to the lead's then-only job, so no NULL handling needed.
      const { data, error } = await client
        .from("lead_dismissed_caregivers")
        .select("caregiver_id, kind")
        .eq("lead_id", leadId)
        .eq("mamamia_job_offer_id", jobOfferId);
      if (error) throw new Error(`supabase selectDismissedCaregivers: ${error.message}`);
      return (data ?? []) as Array<{ caregiver_id: number; kind: string }>;
    },
    async upsertDismissedCaregiver(leadId, caregiverId, kind, jobOfferId) {
      const { error } = await client
        .from("lead_dismissed_caregivers")
        .upsert(
          { lead_id: leadId, caregiver_id: caregiverId, kind, mamamia_job_offer_id: jobOfferId },
          { onConflict: "lead_id,caregiver_id,kind,mamamia_job_offer_id" },
        );
      if (error) throw new Error(`supabase upsertDismissedCaregiver: ${error.message}`);
    },
    async selectAcceptedApplications(leadId) {
      // contract_snapshot mitgeliefert, damit der Portal-Frontend eine
      // synthetische Application bauen kann, falls Mamamia die akzeptierte
      // Application nicht mehr in `listApplications` zurückgibt (kommt vor
      // ab dem Moment, in dem die Bewerbung im Mamamia-Backend als
      // abgeschlossen markiert wird). Ohne den Snapshot wäre der
      // BookedScreen leer + die UI würde "X offene Bewerbungen" zeigen,
      // obwohl die Annahme längst gemacht ist (Bug Michael Dachs / lead
      // 39def7b2 vom 11.06.2026).
      const { data, error } = await client
        .from("lead_application_acceptances")
        .select("application_id, caregiver_id, accepted_at, contract_snapshot")
        .eq("lead_id", leadId);
      if (error) throw new Error(`supabase selectAcceptedApplications: ${error.message}`);
      return (data ?? []) as Array<{
        application_id: number;
        caregiver_id: number | null;
        accepted_at: string;
        contract_snapshot: Record<string, unknown> | null;
      }>;
    },
    async countRecentInviteAttempts(leadId, windowMinutes, jobOfferId) {
      const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();
      // Per-job (Multi-Job #2a): count this job's attempts + legacy NULL-job rows.
      const { count, error } = await client
        .from("caregiver_invite_attempts")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId)
        .gte("attempted_at", cutoff)
        .or(`mamamia_job_offer_id.eq.${jobOfferId},mamamia_job_offer_id.is.null`);
      if (error) throw new Error(`supabase countRecentInviteAttempts: ${error.message}`);
      return count ?? 0;
    },
    async oldestInviteAttemptWithin(leadId, windowMinutes, jobOfferId) {
      const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();
      const { data, error } = await client
        .from("caregiver_invite_attempts")
        .select("attempted_at")
        .eq("lead_id", leadId)
        .gte("attempted_at", cutoff)
        .or(`mamamia_job_offer_id.eq.${jobOfferId},mamamia_job_offer_id.is.null`)
        .order("attempted_at", { ascending: true })
        .limit(1);
      if (error) throw new Error(`supabase oldestInviteAttemptWithin: ${error.message}`);
      const row = (data ?? [])[0] as { attempted_at: string } | undefined;
      return row ? new Date(row.attempted_at) : null;
    },
    async recordInviteAttempt(leadId, caregiverId, jobOfferId) {
      const { error } = await client
        .from("caregiver_invite_attempts")
        .insert({ lead_id: leadId, caregiver_id: caregiverId, mamamia_job_offer_id: jobOfferId });
      if (error) throw new Error(`supabase recordInviteAttempt: ${error.message}`);
    },
  };
}

// ─── Bootstrap (prod only) ─────────────────────────────────────────────────

if (import.meta.main) {
  const panelUrl = Deno.env.get("MAMAMIA_PANEL_URL");
  if (!panelUrl) {
    throw new Error("MAMAMIA_PANEL_URL secret missing — required for panel-side actions (inviteCaregiver). Set to panel SPA base, e.g. https://portal.mamamia.app/backend");
  }
  const secrets: ProxySecrets = {
    mamamiaEndpoint: Deno.env.get("MAMAMIA_ENDPOINT")!,
    mamamiaAuthEndpoint: Deno.env.get("MAMAMIA_AUTH_ENDPOINT")!,
    mamamiaAgencyEmail: Deno.env.get("MAMAMIA_AGENCY_EMAIL")!,
    mamamiaAgencyPassword: Deno.env.get("MAMAMIA_AGENCY_PASSWORD")!,
    sessionJwtSecret: Deno.env.get("SESSION_JWT_SECRET")!,
    mamamiaPanelUrl: panelUrl,
    anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY"),
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    supabaseServiceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  };

  const supabase = makeRealSupabase(secrets.supabaseUrl, secrets.supabaseServiceKey);
  Deno.serve((req) => handleRequest(req, { secrets, supabase }));
}
