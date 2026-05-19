// Supabase Edge Function: detect-caregiver-events
// POST /functions/v1/detect-caregiver-events  body: { lead_id: string }
//
// Polls Mamamia for the lead's current Bewerbungen (applications) +
// Interest'y, diffs against past lead_events rows, and POSTs new ones to
// the kostenrechner /api/lead-event bridge (which inserts the event +
// fires the customer mail templates added in PR #114).
//
// Server-to-server: uses agency Mamamia credentials + Supabase service
// role. Customer session JWT is NOT involved (no portal interaction).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  getOrRefreshAgencyToken,
  mamamiaRequest,
} from "../_shared/mamamiaClient.ts";
import {
  type ApplicationNode,
  type CaregiverNode,
  type InterestNode,
  LIST_APPLICATIONS,
  LIST_INTERESTS_FOR_OFFER,
  type ListApplicationsResponse,
  type ListInterestsResponse,
} from "./queries.ts";

// ─── Types ─────────────────────────────────────────────────────────────────

export type EventType = "caregiver_interest_shown" | "application_received";

export interface DetectSecrets {
  supabaseUrl: string;
  supabaseServiceKey: string;
  mamamiaEndpoint: string;
  mamamiaAuthEndpoint: string;
  mamamiaAgencyEmail: string;
  mamamiaAgencyPassword: string;
  kostenrechnerUrl: string;
}

export interface LeadRow {
  id: string;
  token: string | null;
  email: string | null;
  mamamia_customer_id: number | null;
  mamamia_job_offer_id: number | null;
}

export interface EventRow {
  event_type: EventType;
  caregiver_id: number | null;
}

export interface DetectSupabase {
  fetchLead(id: string): Promise<LeadRow | null>;
  fetchPastEvents(leadId: string): Promise<EventRow[]>;
}

export interface DetectResult {
  lead_id: string;
  new_applications: number;
  new_interests: number;
  skipped_no_caregiver_data: number;
  bridge_errors: number;
}

export interface HandlerDeps {
  secrets: DetectSecrets;
  supabase: DetectSupabase;
  fetchFn?: typeof fetch;
}

// ─── Handler ───────────────────────────────────────────────────────────────

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return jsonError(405, "method not allowed");

  let leadId: string | undefined;
  try {
    const body = await req.json();
    leadId = body?.lead_id;
  } catch {
    return jsonError(400, "invalid json body");
  }
  if (!leadId || typeof leadId !== "string") {
    return jsonError(400, "missing lead_id field");
  }

  const lead = await deps.supabase.fetchLead(leadId);
  if (!lead) return jsonError(404, "lead not found");
  if (!lead.mamamia_job_offer_id) {
    return jsonError(400, "lead not onboarded yet (no mamamia_job_offer_id)");
  }
  if (!lead.token) {
    return jsonError(400, "lead has no token");
  }

  const result = await detect(lead as LeadRow & { token: string; mamamia_job_offer_id: number }, deps);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Core detect logic (testable) ──────────────────────────────────────────

export async function detect(
  lead: LeadRow & { token: string; mamamia_job_offer_id: number },
  deps: HandlerDeps,
): Promise<DetectResult> {
  const { secrets, supabase, fetchFn } = deps;
  const fetcher = fetchFn ?? globalThis.fetch;

  // Agency token (cached, refreshed on demand)
  const agencyToken = await getOrRefreshAgencyToken({
    authEndpoint: secrets.mamamiaAuthEndpoint,
    email: secrets.mamamiaAgencyEmail,
    password: secrets.mamamiaAgencyPassword,
    fetchFn: fetcher,
  });

  // Pull Mamamia state (applications + interests) in parallel.
  const [appsRes, interestsRes, pastEvents] = await Promise.all([
    mamamiaRequest<ListApplicationsResponse>({
      endpoint: secrets.mamamiaEndpoint,
      token: agencyToken,
      query: LIST_APPLICATIONS,
      variables: { job_offer_id: lead.mamamia_job_offer_id, limit: 100, page: 1 },
      fetchFn: fetcher,
    }),
    mamamiaRequest<ListInterestsResponse>({
      endpoint: secrets.mamamiaEndpoint,
      token: agencyToken,
      query: LIST_INTERESTS_FOR_OFFER,
      variables: { id: lead.mamamia_job_offer_id },
      fetchFn: fetcher,
    }),
    supabase.fetchPastEvents(lead.id),
  ]);

  const apps = appsRes.JobOfferApplicationsWithPagination?.data ?? [];
  const interests = interestsRes.JobOffer?.interests ?? [];

  const seenApps = new Set<number>();
  const seenInterests = new Set<number>();
  for (const e of pastEvents) {
    if (e.caregiver_id == null) continue;
    if (e.event_type === "application_received") seenApps.add(e.caregiver_id);
    else if (e.event_type === "caregiver_interest_shown") seenInterests.add(e.caregiver_id);
  }

  const counts = { new_applications: 0, new_interests: 0, skipped_no_caregiver_data: 0, bridge_errors: 0 };

  for (const app of apps) {
    if (app.caregiver_id == null) continue;
    if (seenApps.has(app.caregiver_id)) continue;
    const ok = await fireBridgeEvent(
      "application_received",
      lead.token,
      app.caregiver_id,
      app.caregiver,
      secrets.kostenrechnerUrl,
      counts,
      fetcher,
    );
    if (ok) {
      counts.new_applications += 1;
      seenApps.add(app.caregiver_id); // guard against duplicate apps from same caregiver in one sweep
    }
  }

  for (const interest of interests) {
    if (interest.rejected_at) continue;
    if (interest.caregiver_id == null) continue;
    if (seenInterests.has(interest.caregiver_id)) continue;
    // Skip if the customer has already been pinged about this caregiver as an
    // application — converting interest→application produces two records on
    // Mamamia's side but the customer only needs one mail (the application
    // version, which is the stronger signal).
    if (seenApps.has(interest.caregiver_id)) continue;
    const ok = await fireBridgeEvent(
      "caregiver_interest_shown",
      lead.token,
      interest.caregiver_id,
      interest.caregiver,
      secrets.kostenrechnerUrl,
      counts,
      fetcher,
    );
    if (ok) {
      counts.new_interests += 1;
      seenInterests.add(interest.caregiver_id);
    }
  }

  return { lead_id: lead.id, ...counts };
}

// ─── Bridge POST + metadata mapper ─────────────────────────────────────────

async function fireBridgeEvent(
  event: EventType,
  token: string,
  caregiverId: number,
  caregiver: CaregiverNode | null,
  kostenrechnerUrl: string,
  counts: { skipped_no_caregiver_data: number; bridge_errors: number },
  fetchFn: typeof fetch,
): Promise<boolean> {
  const metadata = buildCaregiverMetadata(caregiverId, caregiver);
  if (!metadata.caregiver_name) {
    counts.skipped_no_caregiver_data += 1;
    return false;
  }

  try {
    const res = await fetchFn(`${kostenrechnerUrl}/api/lead-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, event, metadata }),
    });
    if (!res.ok) {
      console.error(`bridge ${event} HTTP ${res.status}`);
      counts.bridge_errors += 1;
      return false;
    }
    return true;
  } catch (e) {
    console.error(`bridge ${event} threw:`, (e as Error).message);
    counts.bridge_errors += 1;
    return false;
  }
}

export function buildCaregiverMetadata(
  caregiverId: number,
  caregiver: CaregiverNode | null,
): Record<string, unknown> {
  const meta: Record<string, unknown> = { caregiver_id: caregiverId };
  if (!caregiver) return meta;

  const first = (caregiver.first_name ?? "").trim();
  const last = (caregiver.last_name ?? "").trim();
  if (first) {
    const initial = last ? ` ${last[0]}.` : "";
    meta.caregiver_name = `${first}${initial}`;
  }

  const badge = mapHpToBadge(caregiver.hp_total_jobs);
  if (badge) meta.caregiver_badge_level = badge;

  if (typeof caregiver.care_experience === "number" && caregiver.care_experience > 0) {
    meta.caregiver_years_experience = caregiver.care_experience;
  }
  if (typeof caregiver.hp_total_jobs === "number" && caregiver.hp_total_jobs > 0) {
    meta.caregiver_einsatz_count = caregiver.hp_total_jobs;
  }
  if (caregiver.avatar_retouched?.aws_url) {
    meta.caregiver_photo_url = caregiver.avatar_retouched.aws_url;
  }
  if (caregiver.about_de) {
    meta.caregiver_about_text = caregiver.about_de;
  }

  return meta;
}

// Mirror of frontend src/lib/mamamia/mappers.ts badge thresholds. Mamamia
// Bronze/Silber/Gold/Platin badges are derived from hp_total_jobs (cumulative
// completed assignments). Starter = zero history.
export function mapHpToBadge(
  hpTotalJobs: number | null | undefined,
): "Starter" | "Bronze" | "Silber" | "Gold" | "Platin" | null {
  if (hpTotalJobs == null) return null;
  if (hpTotalJobs >= 20) return "Platin";
  if (hpTotalJobs >= 10) return "Gold";
  if (hpTotalJobs >= 5) return "Silber";
  if (hpTotalJobs >= 1) return "Bronze";
  return "Starter";
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Real Supabase adapter ─────────────────────────────────────────────────

function makeRealSupabase(url: string, serviceKey: string): DetectSupabase {
  const client: SupabaseClient = createClient(url, serviceKey);
  return {
    async fetchLead(id: string) {
      const { data, error } = await client
        .from("leads")
        .select("id, token, email, mamamia_customer_id, mamamia_job_offer_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`supabase fetchLead: ${error.message}`);
      return (data ?? null) as LeadRow | null;
    },
    async fetchPastEvents(leadId: string) {
      const { data, error } = await client
        .from("lead_events")
        .select("event_type, metadata")
        .eq("lead_id", leadId)
        .in("event_type", ["caregiver_interest_shown", "application_received"]);
      if (error) throw new Error(`supabase fetchPastEvents: ${error.message}`);
      return (data ?? []).map((row: { event_type: string; metadata: unknown }) => ({
        event_type: row.event_type as EventType,
        caregiver_id: extractCaregiverId(row.metadata),
      }));
    },
  };
}

function extractCaregiverId(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).caregiver_id;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ─── Deno.serve bootstrap ──────────────────────────────────────────────────

if (import.meta.main) {
  const secrets: DetectSecrets = {
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    supabaseServiceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    mamamiaEndpoint: Deno.env.get("MAMAMIA_ENDPOINT")!,
    mamamiaAuthEndpoint: Deno.env.get("MAMAMIA_AUTH_ENDPOINT")!,
    mamamiaAgencyEmail: Deno.env.get("MAMAMIA_AGENCY_EMAIL")!,
    mamamiaAgencyPassword: Deno.env.get("MAMAMIA_AGENCY_PASSWORD")!,
    kostenrechnerUrl: Deno.env.get("KOSTENRECHNER_URL") ?? "https://kostenrechner.primundus.de",
  };

  const deps: HandlerDeps = {
    secrets,
    supabase: makeRealSupabase(secrets.supabaseUrl, secrets.supabaseServiceKey),
  };

  Deno.serve((req) => handleRequest(req, deps));
}

// Re-export internal helpers for tests.
export { extractCaregiverId };
// Re-export node types so tests can construct them without re-importing from queries.ts.
export type { ApplicationNode, CaregiverNode, InterestNode };
