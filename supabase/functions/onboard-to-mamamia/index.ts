// Supabase Edge Function: onboard-to-mamamia
// POST /functions/v1/onboard-to-mamamia  body: { token: string }
// → 200 + Set-Cookie: session=... (HttpOnly) + body: { customer_id, job_offer_id }
//
// Server-to-server (Bearer = service_role) zusätzlich:
//   { token, mirror_token: true }            → Token-Spiegel auf den MM-Kunden (Registry #44)
//   { lead_id, resync: { felder, budget? } } → Admin-Korrektur nach Mamamia (Registry #55),
//                                              kein Session-JWT, kein Cookie.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  onboardLead,
  RESYNC_FELDER,
  ResyncConflictError,
  resyncCustomerFromLead,
  sessionPayloadFromResult,
  type OnboardSecrets,
  type SupabaseLike,
} from "./onboard.ts";
import { createSessionToken, sessionCookieHeader } from "../_shared/session.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { isRateLimited } from "../_shared/rateLimit.ts";
import { isServiceRoleBearer } from "../_shared/serviceRoleAuth.ts";

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

  // Service-role-Caller (Kostenrechner-Server: regen-Route, Admin-Resync,
  // Empfehlungs-Cron) kommen alle vom selben Render-Egress-IP und würden sich
  // den 5/min-Bucket mit dem Portal-Abholer teilen ⇒ für sie kein Rate-Limit.
  // Aus dem HEADER berechnet, bevor der Body geparst ist.
  const isServiceRole = isServiceRoleBearer(req.headers.get("authorization"), deps.secrets.supabaseServiceKey);

  // Rate limit — onboard is rare (per-lead first visit), 5/min enough
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!isServiceRole && isRateLimited(ip, { bucketKey: "onboard", max: 5 })) {
    return jsonError(429, "too many requests", baseHeaders);
  }

  // Body parsing
  let token: string | undefined;
  let jobId: string | undefined;
  let mirrorToken = false;
  let leadId: string | undefined;
  let resync: unknown;
  let privileged = false;
  try {
    const body = await req.json();
    token = body?.token;
    // Multi-Job (Variant A): optional lead_jobs.id from ?job=... deep links.
    // Omitted (every old token / link without &job) → the lead's default job.
    jobId = typeof body?.job_id === "string" ? body.job_id : undefined;
    // Set only by lead-regenerate-token after a rotation (server-to-server):
    // re-push the portal token onto the Mamamia customer even on a cache hit.
    // The browser omits it, so a normal portal open costs no panel calls.
    mirrorToken = body?.mirror_token === true;
    // Registry #55 — Admin-Resync adressiert per lead_id (nie per Token).
    leadId = typeof body?.lead_id === "string" ? body.lead_id : undefined;
    resync = body?.resync;
    privileged = mirrorToken || body?.lead_id !== undefined || body?.resync !== undefined;
  } catch {
    return jsonError(400, "invalid json body", baseHeaders);
  }

  // Privilegierte Flags nur hinter service_role — VOR jedem Mamamia-Call.
  // Der Browser (Anon-Key) kann weder den Spiegel noch den Resync auslösen.
  if (privileged && !isServiceRole) {
    return jsonError(401, "service role required", baseHeaders);
  }

  if (leadId !== undefined) {
    return handleResync(leadId, resync, deps, baseHeaders);
  }

  if (!token || typeof token !== "string") {
    return jsonError(400, "missing token field", baseHeaders);
  }

  // Onboard
  let result;
  try {
    result = await onboardLead({
      leadToken: token,
      jobId,
      mirrorToken,
      secrets: deps.secrets,
      supabase: deps.supabase,
      fetchFn: deps.fetchFn,
    });
  } catch (e) {
    const msg = (e as Error).message;
    // Expected: token errors → 401; everything else → 500
    const isTokenErr = /expired|invalid|nonexistent/i.test(msg);
    console.error("onboard error:", msg, (e as Error).stack); // Edge Function logs
    // DEBUG_ONBOARD=1 — leak underlying error to ease diagnosis during
    // env switches. Analog do DEBUG_PROXY w mamamia-proxy. Unset secret
    // (`npx supabase secrets unset DEBUG_ONBOARD --project-ref ...`)
    // gdy nie potrzebujesz; prod nie powinien tego mieć włączonego.
    if (Deno.env.get("DEBUG_ONBOARD") === "1" && !isTokenErr) {
      return jsonError(500, `onboarding failed: ${msg}`, baseHeaders);
    }
    return jsonError(isTokenErr ? 401 : 500, isTokenErr ? "invalid-token" : "onboarding failed", baseHeaders);
  }

  // Sign session JWT
  const jwt = await createSessionToken(
    sessionPayloadFromResult(result),
    deps.secrets.sessionJwtSecret,
  );

  // Response carries:
  //   - customer_id / job_offer_id (non-sensitive identifiers)
  //   - session_token: signed session JWT (NOT the agency token — only
  //     authenticates this browser to mamamia-proxy ownership scope).
  //     Body return added 2026-05-07 after Bug #13j: iOS Chrome/Safari
  //     incognito drops cross-site session cookie even with Partitioned;
  //     frontend stores token in sessionStorage and sends as
  //     `X-Session-Token` header on subsequent proxy calls. Cookie still
  //     emitted for desktop / non-incognito flows (transparent fallback).
  return new Response(
    JSON.stringify({
      customer_id: result.customer_id,
      job_offer_id: result.job_offer_id,
      session_token: jwt,
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

function json(status: number, body: unknown, extraHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...extraHeaders, "Content-Type": "application/json" },
  });
}

// ─── Admin-Resync (Registry #55) ───────────────────────────────────────────
// Body { lead_id, resync: { felder: RESYNC_FELD[], budget?: number } } — nur
// service_role (Gate oben). Antworten: 200 { customer_id, job_offer_id, resync }
// · 400 Kontrakt/nicht onboarded · 404 Lead unbekannt · 409 >2 Patienten
// (patient_ids) · 500 Adapter ohne fetchLeadById · 502 Mamamia-Klartext (der
// Aufrufer ist der Admin-Server, der Fehler soll dort rot stehen).
async function handleResync(
  leadId: string,
  resyncRaw: unknown,
  deps: HandlerDeps,
  baseHeaders: Record<string, string>,
): Promise<Response> {
  const r = (resyncRaw && typeof resyncRaw === "object" ? resyncRaw : {}) as { felder?: unknown; budget?: unknown };
  const felder = Array.isArray(r.felder) ? r.felder : null;
  const allowed = new Set<string>(RESYNC_FELDER);
  if (!felder || !felder.every((f) => typeof f === "string" && allowed.has(f))) {
    return jsonError(400, `resync.felder must be a subset of ${RESYNC_FELDER.join("|")}`, baseHeaders);
  }
  const budget = r.budget;
  if (budget !== undefined && !(typeof budget === "number" && Number.isFinite(budget) && budget > 0)) {
    return jsonError(400, "resync.budget must be a positive number", baseHeaders);
  }
  if (felder.length === 0 && budget === undefined) {
    return jsonError(400, "resync: nothing to sync (felder empty, no budget)", baseHeaders);
  }
  if (!deps.supabase.fetchLeadById) {
    return jsonError(500, "fetchLeadById not available in this adapter", baseHeaders);
  }
  const lead = await deps.supabase.fetchLeadById(leadId);
  if (!lead) return jsonError(404, "lead not found", baseHeaders);
  if (!lead.mamamia_customer_id || !lead.mamamia_job_offer_id) {
    return jsonError(400, "not-onboarded", baseHeaders);
  }
  try {
    const result = await resyncCustomerFromLead({
      lead,
      felder: felder as string[],
      budget: budget as number | undefined,
      secrets: deps.secrets,
      fetchFn: deps.fetchFn,
    });
    return json(200, {
      customer_id: lead.mamamia_customer_id,
      job_offer_id: lead.mamamia_job_offer_id,
      resync: result,
    }, baseHeaders);
  } catch (e) {
    if (e instanceof ResyncConflictError) {
      return json(409, { error: e.message, patient_ids: e.patientIds }, baseHeaders);
    }
    const msg = (e as Error).message;
    console.error(`[onboard] resync failed lead=${leadId}:`, msg, (e as Error).stack);
    return jsonError(502, `resync failed: ${msg}`, baseHeaders);
  }
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
    // Registry #55 — per id, bewusst OHNE Expiry-Filter (Admin-Korrektur
    // alter Leads; nur hinter der service_role-Bramka erreichbar).
    async fetchLeadById(id: string) {
      const { data, error } = await client.from("leads").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`supabase fetchLeadById: ${error.message}`);
      return data;
    },
    // Registry #54 — jeden UPDATE z warunkiem = atomowy claim (Postgres
    // re-ewaluuje WHERE po zwolnieniu row-locka; drugi równoległy UPDATE
    // trafia 0 wierszy). `.select("id")` zwraca zaktualizowane wiersze.
    async claimOnboarding(leadId: string, staleBefore: string) {
      const { data, error } = await client
        .from("leads")
        .update({ mamamia_onboarding_started_at: new Date().toISOString() })
        .eq("id", leadId)
        .is("mamamia_customer_id", null)
        .or(`mamamia_onboarding_started_at.is.null,mamamia_onboarding_started_at.lt.${staleBefore}`)
        .select("id");
      if (error) throw new Error(`supabase claimOnboarding: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },
    async fetchLeadJob(jobId: string, leadId: string) {
      // The lead_id filter IS the ownership check — a job_id belonging to
      // another lead returns null (→ caller falls back to the lead's default).
      const { data, error } = await client
        .from("lead_jobs")
        .select("mamamia_job_offer_id")
        .eq("id", jobId)
        .eq("lead_id", leadId)
        .maybeSingle();
      if (error) throw new Error(`supabase fetchLeadJob: ${error.message}`);
      return data;
    },
    async fetchNewestPlannedJob(leadId: string) {
      // Neuester 'geplant'-Job (Mamamia-IDs sind monoton wachsend). Kein
      // geplanter Job (typisch: Single-Job-Kunde nach der Buchung) → null
      // → Caller bleibt beim Default-Job des Leads.
      const { data, error } = await client
        .from("lead_jobs")
        .select("mamamia_job_offer_id")
        .eq("lead_id", leadId)
        .eq("status", "geplant")
        .order("mamamia_job_offer_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`supabase fetchNewestPlannedJob: ${error.message}`);
      return data;
    },
  };
}

// ─── Deno.serve bootstrap ──────────────────────────────────────────────────

if (import.meta.main) {
  // MAMAMIA_PANEL_URL — panel SPA base (per-tenant, e.g. beta.mamamia.app/backend
  // vs portal.mamamia.app/backend). Required for the UpdateCustomerToken push;
  // throw loudly if missing (Święta zasada nr 1 — NO SOFT FALLBACKS). Already a
  // project-wide secret (mamamia-proxy requires it too).
  const panelUrl = Deno.env.get("MAMAMIA_PANEL_URL");
  if (!panelUrl) {
    throw new Error(
      "MAMAMIA_PANEL_URL secret missing — required to push the portal token to Mamamia (UpdateCustomerToken, panel-side).",
    );
  }
  const secrets: OnboardSecrets = {
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    supabaseServiceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    mamamiaEndpoint: Deno.env.get("MAMAMIA_ENDPOINT")!,
    mamamiaAuthEndpoint: Deno.env.get("MAMAMIA_AUTH_ENDPOINT")!,
    mamamiaAgencyEmail: Deno.env.get("MAMAMIA_AGENCY_EMAIL")!,
    mamamiaAgencyPassword: Deno.env.get("MAMAMIA_AGENCY_PASSWORD")!,
    sessionJwtSecret: Deno.env.get("SESSION_JWT_SECRET")!,
    mamamiaPanelUrl: panelUrl,
  };

  const deps: HandlerDeps = {
    secrets,
    supabase: makeRealSupabase(secrets.supabaseUrl, secrets.supabaseServiceKey),
  };

  Deno.serve((req) => handleRequest(req, deps));
}
