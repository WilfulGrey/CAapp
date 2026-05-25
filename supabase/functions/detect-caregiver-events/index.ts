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
  REJECT_APPLICATION,
  type RejectApplicationResponse,
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

// Für den 48h-Auto-Reject: application_received (mit created_at als
// Alters-Anker) + Reaktions-Events (accept/reject) pro Pflegekraft.
export type AppStatusEventType =
  | "application_received"
  | "application_accepted_internal"
  | "application_rejected";

export interface AppStatusEventRow {
  event_type: AppStatusEventType;
  caregiver_id: number | null;
  created_at: string;
}

export interface DetectSupabase {
  fetchLead(id: string): Promise<LeadRow | null>;
  fetchActiveLeads(): Promise<LeadRow[]>;
  fetchPastEvents(leadId: string): Promise<EventRow[]>;
  fetchAppStatusEvents(leadId: string): Promise<AppStatusEventRow[]>;
  // Aktualisiert caregiver_photo_url in den noch offenen Reminder-Rows
  // (scheduled_emails) mit frischen presigned URLs. Mamamia-Foto-URLs
  // laufen nach ~30 Min ab; da der Reminder erst 1h+ später feuert wäre
  // die beim Bewerbungseingang gespeicherte URL tot → Initialen-Fallback.
  // detect läuft alle 15 Min, der Versand-Cron alle 5 Min — refreshte URL
  // ist beim Versand also ≤15 Min alt und damit gültig. Liefert Anzahl
  // aktualisierter Rows.
  refreshReminderPhotos(leadId: string, photoByCaregiver: Map<number, string>): Promise<number>;
}

export interface DetectResult {
  lead_id: string;
  new_applications: number;
  new_interests: number;
  skipped_no_caregiver_data: number;
  bridge_errors: number;
  // 48h-Auto-Reject (PR: feat/auto-reject-48h-dryrun). auto_rejected zählt
  // tatsächlich (oder im Dry-Run: hypothetisch) abgelehnte Bewerbungen.
  auto_rejected: number;
}

export interface BatchResult {
  mode: "batch";
  leads_processed: number;
  total_new_applications: number;
  total_new_interests: number;
  total_skipped_no_caregiver_data: number;
  total_bridge_errors: number;
  total_auto_rejected: number;
  per_lead_errors: number;
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

  // Empty/{} body = batch mode (cron path). { lead_id } = single-lead path
  // (manual curl, useful for testing or one-off triggers).
  let body: { lead_id?: unknown } = {};
  try {
    const raw = await req.text();
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    return jsonError(400, "invalid json body");
  }

  if (body.lead_id != null) {
    if (typeof body.lead_id !== "string") {
      return jsonError(400, "lead_id must be a string");
    }
    return await handleSingle(body.lead_id, deps);
  }

  return await handleBatch(deps);
}

async function handleSingle(leadId: string, deps: HandlerDeps): Promise<Response> {
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

async function handleBatch(deps: HandlerDeps): Promise<Response> {
  const leads = await deps.supabase.fetchActiveLeads();
  const batch: BatchResult = {
    mode: "batch",
    leads_processed: 0,
    total_new_applications: 0,
    total_new_interests: 0,
    total_skipped_no_caregiver_data: 0,
    total_bridge_errors: 0,
    total_auto_rejected: 0,
    per_lead_errors: 0,
  };

  for (const lead of leads) {
    // fetchActiveLeads filter already enforces token + mamamia_job_offer_id non-null,
    // so the type cast is safe.
    if (!lead.token || !lead.mamamia_job_offer_id) continue;
    try {
      const r = await detect(lead as LeadRow & { token: string; mamamia_job_offer_id: number }, deps);
      batch.leads_processed += 1;
      batch.total_new_applications += r.new_applications;
      batch.total_new_interests += r.new_interests;
      batch.total_skipped_no_caregiver_data += r.skipped_no_caregiver_data;
      batch.total_bridge_errors += r.bridge_errors;
      batch.total_auto_rejected += r.auto_rejected;
    } catch (e) {
      console.error(`detect lead ${lead.id} threw:`, (e as Error).message);
      batch.per_lead_errors += 1;
    }
  }

  return new Response(JSON.stringify(batch), {
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

  const counts = { new_applications: 0, new_interests: 0, skipped_no_caregiver_data: 0, bridge_errors: 0, auto_rejected: 0 };

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

  // 48h-Auto-Reject: unbeantwortete Bewerbungen (≥48h seit der
  // application_received-Mail, keine Reaktion) automatisch ablehnen.
  // apps + agencyToken sind hier bereits geladen — wiederverwenden.
  counts.auto_rejected += await autoRejectStaleApplications(lead, apps, agencyToken, deps, fetcher);

  // Reminder-Foto-Refresh: frische presigned URLs aus apps + interests in
  // die offenen Reminder-Rows schreiben, damit das Foto beim (späteren)
  // Versand nicht abgelaufen ist (siehe refreshReminderPhotos-Doc).
  const photoByCaregiver = new Map<number, string>();
  for (const a of apps) {
    const url = a.caregiver?.avatar_retouched?.aws_url;
    if (a.caregiver_id != null && url) photoByCaregiver.set(a.caregiver_id, url);
  }
  for (const i of interests) {
    const url = i.caregiver?.avatar_retouched?.aws_url;
    if (i.caregiver_id != null && url && !photoByCaregiver.has(i.caregiver_id)) {
      photoByCaregiver.set(i.caregiver_id, url);
    }
  }
  try {
    await supabase.refreshReminderPhotos(lead.id, photoByCaregiver);
  } catch (e) {
    // Best-effort — Foto-Refresh darf den Sweep nicht scheitern lassen.
    console.error(`refreshReminderPhotos failed (lead ${lead.id}):`, e instanceof Error ? e.message : String(e));
  }

  return { lead_id: lead.id, ...counts };
}

// ─── 48h Auto-Reject ───────────────────────────────────────────────────────
// Lehnt Bewerbungen automatisch ab, auf die der Kunde 48h nach der
// Bewerbungs-Mail (application_received) nicht reagiert hat. Die 46h-
// "Letzte Chance"-Mail (send-scheduled-emails) warnt ~2h vorher.
//
// Sicherheits-Guards:
//   1. Nur Bewerbungen mit bestätigtem application_received-Event ablehnen
//      (kein created_at ⇒ kein Reject) — wir lehnen nie etwas ab, worüber
//      der Kunde nie informiert wurde.
//   2. Nie ablehnen, wenn der Kunde für diese Pflegekraft bereits reagiert
//      hat (application_accepted_internal ODER application_rejected).
//   3. Erst ab Alter ≥ AUTO_REJECT_AFTER_HOURS.
//
// SCHARF per Default (Default-Live). Kill-Switch: Edge-Function-Secret
// AUTO_REJECT_ENABLED="false"|"0" → zurück in den Dry-Run (loggt nur
// "would reject", schreibt NICHTS). Alternativ AUTO_REJECT_DEFAULT_LIVE
// hier auf false + Deploy. Explizites Env überschreibt den Default in
// beide Richtungen.
const AUTO_REJECT_AFTER_HOURS = 48;
const AUTO_REJECT_MESSAGE =
  "Automatische Absage — keine Rückmeldung des Kunden innerhalb 48 Stunden.";
const AUTO_REJECT_DEFAULT_LIVE = true;

function autoRejectIsLive(): boolean {
  const v = (Deno.env.get("AUTO_REJECT_ENABLED") ?? "").trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return AUTO_REJECT_DEFAULT_LIVE;
}

async function autoRejectStaleApplications(
  lead: LeadRow & { token: string; mamamia_job_offer_id: number },
  apps: ApplicationNode[],
  agencyToken: string,
  deps: HandlerDeps,
  fetcher: typeof fetch,
): Promise<number> {
  const { secrets, supabase } = deps;
  const live = autoRejectIsLive();

  let statusEvents: AppStatusEventRow[];
  try {
    statusEvents = await supabase.fetchAppStatusEvents(lead.id);
  } catch (e) {
    console.error(`auto-reject: fetchAppStatusEvents failed (lead ${lead.id}):`, e instanceof Error ? e.message : String(e));
    return 0;
  }

  // Frühestes application_received pro Pflegekraft (Alters-Anker) +
  // Reaktions-Set (accept/reject).
  const receivedAt = new Map<number, number>(); // caregiver_id → ms timestamp
  const reacted = new Set<number>();
  for (const ev of statusEvents) {
    if (ev.caregiver_id == null) continue;
    if (ev.event_type === "application_received") {
      const ms = Date.parse(ev.created_at);
      if (!Number.isFinite(ms)) continue;
      const prev = receivedAt.get(ev.caregiver_id);
      if (prev == null || ms < prev) receivedAt.set(ev.caregiver_id, ms);
    } else {
      // application_accepted_internal | application_rejected
      reacted.add(ev.caregiver_id);
    }
  }

  const cutoffMs = AUTO_REJECT_AFTER_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  let rejected = 0;

  for (const app of apps) {
    if (app.caregiver_id == null) continue;
    if (reacted.has(app.caregiver_id)) continue;        // Guard 2
    const received = receivedAt.get(app.caregiver_id);
    if (received == null) continue;                      // Guard 1
    const ageMs = now - received;
    if (ageMs < cutoffMs) continue;                      // Guard 3

    const ageH = Math.round(ageMs / 3_600_000);
    if (!live) {
      console.log(`auto-reject [DRY-RUN] would reject application ${app.id} (caregiver ${app.caregiver_id}, lead ${lead.id}, age ${ageH}h)`);
      rejected += 1;
      continue;
    }

    // Scharf: Mamamia RejectApplication + Bridge-Event application_rejected
    // (Letzteres lässt kostenrechner das Event aufzeichnen und cancelt die
    // noch offenen Reminder).
    try {
      await mamamiaRequest<RejectApplicationResponse>({
        endpoint: secrets.mamamiaEndpoint,
        token: agencyToken,
        query: REJECT_APPLICATION,
        variables: { id: app.id, reject_message: AUTO_REJECT_MESSAGE },
        fetchFn: fetcher,
      });
    } catch (e) {
      console.error(`auto-reject: RejectApplication failed (app ${app.id}, lead ${lead.id}):`, e instanceof Error ? e.message : String(e));
      continue;
    }

    try {
      await fetcher(`${secrets.kostenrechnerUrl.replace(/\/$/, "")}/api/lead-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: lead.token,
          event: "application_rejected",
          metadata: {
            application_id: app.id,
            caregiver_id: app.caregiver_id,
            reject_message: AUTO_REJECT_MESSAGE,
            reason: "auto_timeout_48h",
            source: "detect-caregiver-events",
          },
        }),
      });
    } catch (e) {
      // Mamamia-Reject ist schon durch — Bridge-Event-Fehler nur loggen.
      // Beim nächsten Sweep verhindert die Mamamia-Seite (Bewerbung ist
      // rejected) bzw. das fehlende Event ein Doppel-Reject ist unkritisch
      // (RejectApplication auf bereits abgelehnte App ist idempotent/no-op).
      console.error(`auto-reject: bridge event failed (app ${app.id}, lead ${lead.id}):`, e instanceof Error ? e.message : String(e));
    }
    console.log(`auto-reject [LIVE] rejected application ${app.id} (caregiver ${app.caregiver_id}, lead ${lead.id}, age ${ageH}h)`);
    rejected += 1;
  }

  return rejected;
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
  const about = cleanAboutText(caregiver.about_de);
  if (about) {
    meta.caregiver_about_text = about;
  }

  return meta;
}

// Mamamia liefert in about_de teils unübersetzte Platzhalter / Übersetzungs-
// Prompts statt einer echten Beschreibung (z.B. "Bitte geben Sie den Text an,
// den Sie ins Deutsche übersetzen möchten."). Solche Werte dürfen NIE als
// Pflegekraft-Zitat in einer Kundenmail landen → rausfiltern.
export function cleanAboutText(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const placeholderMarkers = [
    "übersetzen möchten",
    "bitte geben sie den text",
    "ins deutsche übersetzen",
    "lorem ipsum",
  ];
  if (placeholderMarkers.some((m) => lower.includes(m))) return null;
  return t;
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
    async fetchActiveLeads() {
      // Active = onboarded to Mamamia (has job_offer_id + token) AND token still
      // valid AND status not in terminal-converted/declined states. Same set of
      // exclusions as `send-scheduled-emails` uses for Nachfass cancellation.
      const { data, error } = await client
        .from("leads")
        .select("id, token, email, mamamia_customer_id, mamamia_job_offer_id")
        .not("mamamia_job_offer_id", "is", null)
        .not("token", "is", null)
        .gt("token_expires_at", new Date().toISOString())
        .not("status", "in", "(vertrag_abgeschlossen,betreuung_beauftragt,nicht_interessiert)");
      if (error) throw new Error(`supabase fetchActiveLeads: ${error.message}`);
      return (data ?? []) as LeadRow[];
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
    async fetchAppStatusEvents(leadId: string) {
      const { data, error } = await client
        .from("lead_events")
        .select("event_type, metadata, created_at")
        .eq("lead_id", leadId)
        .in("event_type", [
          "application_received",
          "application_accepted_internal",
          "application_rejected",
        ]);
      if (error) throw new Error(`supabase fetchAppStatusEvents: ${error.message}`);
      return (data ?? []).map((row: { event_type: string; metadata: unknown; created_at: string }) => ({
        event_type: row.event_type as AppStatusEventType,
        caregiver_id: extractCaregiverId(row.metadata),
        created_at: row.created_at,
      }));
    },
    async refreshReminderPhotos(leadId: string, photoByCaregiver: Map<number, string>) {
      if (photoByCaregiver.size === 0) return 0;
      const REMINDER_TYPES = [
        "interest_reminder",
        "application_reminder",
        "application_reminder_4h",
        "application_reminder_12h",
        "application_last_chance",
      ];
      const { data, error } = await client
        .from("scheduled_emails")
        .select("id, metadata")
        .eq("lead_id", leadId)
        .eq("status", "pending")
        .in("email_type", REMINDER_TYPES);
      if (error) throw new Error(`supabase refreshReminderPhotos select: ${error.message}`);
      let updated = 0;
      for (const row of (data ?? []) as { id: string; metadata: unknown }[]) {
        const md = (row.metadata ?? {}) as Record<string, unknown>;
        const cgId = extractCaregiverId(md);
        if (cgId == null) continue;
        const fresh = photoByCaregiver.get(cgId);
        if (!fresh || md.caregiver_photo_url === fresh) continue;
        const { error: uErr } = await client
          .from("scheduled_emails")
          .update({ metadata: { ...md, caregiver_photo_url: fresh } })
          .eq("id", row.id);
        if (uErr) {
          console.error(`refreshReminderPhotos update row ${row.id} failed:`, uErr.message);
          continue;
        }
        updated += 1;
      }
      return updated;
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
