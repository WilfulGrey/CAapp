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

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  getOrRefreshAgencyToken,
  mamamiaRequest,
} from "../_shared/mamamiaClient.ts";
import {
  buildLeadJobRows,
  enrichBewerbungen,
  GET_CUSTOMER_JOB_OFFERS,
  GET_JOB_OFFER_APPLICATION_COUNT,
  type LeadJobUpsertRow,
  type RawJobOffer,
  todayISO,
} from "../_shared/leadJobsSync.ts";
import {
  type AcceptanceRow,
  syncAcceptance,
} from "../_shared/acceptanceSync.ts";
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

export type EventType =
  | "caregiver_interest_shown"
  | "application_received"
  // Annahme-Detektor: Agentur akzeptiert im SA-Portal (mamamia setzt
  // final_confirmation am Job) → gleiche Mail-Kette wie eine Portal-Annahme
  // (Mail C + Team-Buchungsmail, beides baut route.ts /api/lead-event).
  | "application_accepted_internal";

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
  // Multi-Job: which job this event was for. NULL/undefined on legacy
  // (pre-migration) rows → treated as the lead's default job by the per-job
  // dedup. Optional so test fixtures can omit it.
  mamamia_job_offer_id?: number | null;
  // Identität DER Bewerbung (Registry #35). Vor der Umstellung stempelten wir
  // sie nicht — solche Zeilen liefern null und werden per (Job, Pflegekraft)
  // behandelt (siehe `seenApps`). Optional, damit Test-Fixtures sie weglassen.
  application_id?: number | null;
}

// Für den 72h-Auto-Reject: application_received (mit created_at als
// Alters-Anker) + Reaktions-Events (accept/reject) pro Pflegekraft.
export type AppStatusEventType =
  | "application_received"
  | "application_accepted_internal"
  | "application_rejected";

export interface AppStatusEventRow {
  event_type: AppStatusEventType;
  caregiver_id: number | null;
  created_at: string;
  // Multi-Job: NULL/undefined legacy → default job (per-job auto-reject anchor).
  mamamia_job_offer_id?: number | null;
  // Seeded events (silent first-scan of a follow-up job) were NEVER mailed to
  // the customer → auto-reject must NOT use them as the "informed" anchor
  // (guard 1). Derived from metadata.seeded. Optional (defaults to not-seeded).
  seeded?: boolean;
}

// Reminder-Mail-Typen in scheduled_emails — geteilt von Photo-Refresh und
// Orphan-Cancel-Sweep.
const REMINDER_TYPES = [
  "interest_reminder",
  "application_reminder",
  "application_reminder_4h",
  "application_reminder_12h",
  "application_last_chance",
];

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
  // Reminder-Stopp (Martin, 2026-07-11 — Kunde Hagedorn): Bewerbungen, die
  // in mamamia nicht mehr aktiv sind (Panel-/SA-Ablehnung LOESCHT die
  // Application, Portal-Reject setzt rejected_at), duerfen keine weiteren
  // Reminder ausloesen. Cancelt pending Reminder-Rows, deren Pflegekraft
  // keine aktive Bewerbung (bzw. Interesse) mehr hat. Optional wie
  // upsertLeadJobs, damit Test-Fakes ohne die Methode kompilieren.
  cancelOrphanedReminders?(
    leadId: string,
    active: { apps: Set<number>; interests: Set<number> },
  ): Promise<number>;
  // Multi-Job (Phase 2A): mirror the customer's Mamamia job_offers into
  // lead_jobs (keyed lead_id + mamamia_job_offer_id). Optional so test fakes
  // that don't exercise the job sync can skip it — and when absent, detect()
  // skips the sync entirely (same shape as mamamia-proxy's ProxySupabase).
  upsertLeadJobs?(
    leadId: string,
    jobs: LeadJobUpsertRow[],
  ): Promise<void>;
  // Acceptance-Sync-Retry (Refactor 2026-07-22): unterschriebene Acceptances,
  // deren Mamamia-Sequenz (UpdateCustomer→StoreConfirmation→PDF-Upload) noch
  // unvollständig ist — die Bridge triggert sync-acceptance synchron, der
  // Cron ist der GARANT (final_confirmation-Bramka fürs PDF braucht oft den
  // zweiten Anlauf). Alle vier optional → bestehende Test-Fakes kompilieren;
  // fehlen sie, wird die Retry-Phase komplett übersprungen.
  selectPendingAcceptanceSyncs?(maxAgeDays: number): Promise<PendingAcceptanceSync[]>;
  stampAcceptanceConfirmed?(leadId: string, applicationId: number, confirmationId: number | null): Promise<void>;
  stampAcceptancePdfUploaded?(leadId: string, applicationId: number, sha256: string | null): Promise<void>;
  stampAcceptanceSyncAlerted?(leadId: string, applicationId: number): Promise<void>;
  // Follow-up Discovery (Bug #25): Leads außerhalb des Active-Sets, deren
  // Mamamia-Customer einen NEU eröffneten geplanten Job haben könnte.
  // Selbst-taktend via leads.mamamia_jobs_checked_at. Alle drei optional —
  // fehlen sie, wird die Discovery-Phase übersprungen (alte Test-Fakes).
  fetchDiscoveryLeads?(recheckHours: number, batchSize: number): Promise<Array<LeadRow & { status?: string | null }>>;
  stampLeadJobsChecked?(leadId: string): Promise<void>;
  markLeadFolgeEinsatz?(leadId: string, mamamiaJobOfferId: number): Promise<void>;
}

// Pending-Row inkl. Lead-Anker (Join) — alles, was syncAcceptance braucht.
export interface PendingAcceptanceSync extends AcceptanceRow {
  accepted_at: string;
  mamamia_sync_alerted_at: string | null;
  lead_token: string | null;
  lead_mamamia_customer_id: number | null;
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
  // Annahme-Detektor: wie viele frische final_confirmations in diesem Lauf
  // als application_accepted_internal an die Bridge gemeldet wurden.
  accepted_detected: number;
  // Multi-Job (Phase 2A): wie viele lead_jobs-Zeilen aus Mamamias
  // Customer.job_offers gespiegelt wurden (0 wenn kein Adapter / kein Sync).
  lead_jobs_synced: number;
  // Multi-Job (Phase 2B): wie viele Jobs des Leads gescannt wurden (>1 für
  // Multi-Job-Kunden) + wie viele davon mit Fehler abbrachen (isoliert).
  jobs_scanned: number;
  job_scan_errors: number;
}

export interface BatchResult {
  mode: "batch";
  leads_processed: number;
  total_new_applications: number;
  total_new_interests: number;
  total_skipped_no_caregiver_data: number;
  total_bridge_errors: number;
  total_auto_rejected: number;
  total_accepted_detected: number;
  total_lead_jobs_synced: number;
  total_jobs_scanned: number;
  total_job_scan_errors: number;
  per_lead_errors: number;
  // Acceptance-Sync-Retry (Refactor 2026-07-22):
  acceptance_syncs_scanned: number;
  acceptance_syncs_completed: number;
  acceptance_sync_errors: number;
  acceptance_sync_alerts: number;
  // Follow-up Discovery (Bug #25): sondierte Leads / neu erkannte
  // Folge-Einsätze (status → folge_einsatz) / Fehler.
  discovery_probed: number;
  discovery_folge_einsatz: number;
  discovery_errors: number;
}

export interface HandlerDeps {
  secrets: DetectSecrets;
  supabase: DetectSupabase;
  fetchFn?: typeof fetch;
  /** Injectable für Tests — Backoff-Pausen der Confirm-Retries in acceptanceSync. */
  sleepFn?: (ms: number) => Promise<void>;
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
    total_accepted_detected: 0,
    total_lead_jobs_synced: 0,
    total_jobs_scanned: 0,
    total_job_scan_errors: 0,
    per_lead_errors: 0,
    acceptance_syncs_scanned: 0,
    acceptance_syncs_completed: 0,
    acceptance_sync_errors: 0,
    acceptance_sync_alerts: 0,
    discovery_probed: 0,
    discovery_folge_einsatz: 0,
    discovery_errors: 0,
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
      batch.total_accepted_detected += r.accepted_detected;
      batch.total_lead_jobs_synced += r.lead_jobs_synced;
      batch.total_jobs_scanned += r.jobs_scanned;
      batch.total_job_scan_errors += r.job_scan_errors;
    } catch (e) {
      console.error(`detect lead ${lead.id} threw:`, (e as Error).message);
      batch.per_lead_errors += 1;
    }
  }

  // ── Acceptance-Sync-Retry (Refactor 2026-07-22) ──
  const rr = await retryAcceptanceSyncs(deps);
  batch.acceptance_syncs_scanned = rr.scanned;
  batch.acceptance_syncs_completed = rr.completed;
  batch.acceptance_sync_errors = rr.errors;
  batch.acceptance_sync_alerts = rr.alerts;

  // ── Follow-up Discovery (Bug #25) ──
  const disc = await discoverFolgeEinsaetze(deps);
  batch.discovery_probed = disc.probed;
  batch.discovery_folge_einsatz = disc.folgeEinsatz;
  batch.discovery_errors = disc.errors;

  return new Response(JSON.stringify(batch), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Follow-up Discovery (Bug #25) ─────────────────────────────────────────
// „Sprawdzamy czy nie został otwarty nowy job w Mamamii i stamtąd
// dziedziczymy stan" (Michał 2026-08-04). Leady POZA active-setem (status
// zamknięty LUB wygasły token), które mają Mamamia-Customer: jeden tani
// GET_CUSTOMER_JOB_OFFERS → jest job 'geplant' ⇒ mirror lead_jobs +
// leads.status='folge_einsatz' + audit-event. Discovery NIC nie mailuje —
// maile robi normalny scan-pfad, gdy lead (od następnego runa) jest w
// active-secie. Selbst-taktend: re-probe per Lead frühestens alle
// DISCOVERY_RECHECK_HOURS, höchstens DISCOVERY_BATCH_SIZE Leads pro Run —
// gleichmäßige Mamamia-API-Last (Rate-Limit ~60 req/min, gotcha #9).
const DISCOVERY_RECHECK_HOURS = 6;
const DISCOVERY_BATCH_SIZE = 50;

export async function discoverFolgeEinsaetze(
  deps: HandlerDeps,
): Promise<{ probed: number; folgeEinsatz: number; errors: number }> {
  const out = { probed: 0, folgeEinsatz: 0, errors: 0 };
  const supa = deps.supabase;
  if (!supa.fetchDiscoveryLeads || !supa.stampLeadJobsChecked || !supa.markLeadFolgeEinsatz || !supa.upsertLeadJobs) {
    return out; // Adapter ohne Discovery-Support (alte Test-Fakes) → no-op
  }

  let candidates: Array<LeadRow & { status?: string | null }>;
  try {
    candidates = await supa.fetchDiscoveryLeads(DISCOVERY_RECHECK_HOURS, DISCOVERY_BATCH_SIZE);
  } catch (e) {
    console.error("discovery scan failed:", (e as Error).message);
    out.errors += 1;
    return out;
  }
  if (candidates.length === 0) return out;

  const fetcher = deps.fetchFn ?? globalThis.fetch;
  let agencyToken: string;
  try {
    agencyToken = await getOrRefreshAgencyToken({
      authEndpoint: deps.secrets.mamamiaAuthEndpoint,
      email: deps.secrets.mamamiaAgencyEmail,
      password: deps.secrets.mamamiaAgencyPassword,
      fetchFn: fetcher,
    });
  } catch (e) {
    console.error("discovery agency login failed:", (e as Error).message);
    out.errors += 1;
    return out;
  }

  for (const lead of candidates) {
    try {
      if (!lead.mamamia_customer_id) continue;
      const jr = await mamamiaRequest<{ Customer: { job_offers?: RawJobOffer[] | null } | null }>({
        endpoint: deps.secrets.mamamiaEndpoint,
        token: agencyToken,
        query: GET_CUSTOMER_JOB_OFFERS,
        variables: { id: lead.mamamia_customer_id },
        fetchFn: fetcher,
      });
      out.probed += 1;
      const built = buildLeadJobRows(jr.Customer?.job_offers ?? [], todayISO());
      // Mirror IMMER aktualisieren (Admin-Card zeigt frische Job-Stände,
      // auch wenn kein geplanter dabei ist).
      await supa.upsertLeadJobs(lead.id, built.rows);
      const planned = built.rows.find((r) => r.status === "geplant");
      if (planned) {
        await supa.markLeadFolgeEinsatz(lead.id, planned.mamamia_job_offer_id);
        out.folgeEinsatz += 1;
        console.log(
          `[discovery] lead=${lead.id} (status=${lead.status ?? "?"}) → folge_einsatz (neuer geplanter Job ${planned.mamamia_job_offer_id})`,
        );
      }
      await supa.stampLeadJobsChecked(lead.id);
    } catch (e) {
      out.errors += 1;
      console.error(`[discovery] lead=${lead.id} probe failed:`, (e as Error).message);
      // Stempel trotzdem setzen? NEIN — ohne Stempel probiert der nächste Run
      // erneut (transienter Mamamia-Fehler soll den Lead nicht 6h blocken)…
      // aber ein PERMANENT kaputter Customer würde dann jeden Run belegen.
      // Kompromiss: Stempel setzen, Fehler bleibt geloggt (Re-Probe in 6h).
      try {
        await supa.stampLeadJobsChecked(lead.id);
      } catch { /* bereits geloggt */ }
    }
  }
  return out;
}

// ─── Acceptance-Sync-Retry ─────────────────────────────────────────────────
// Dopycha niedokończone sekwencje (UpdateCustomer→Confirm→PDF-Upload) przez
// wspólny moduł _shared/acceptanceSync — te same guardy co ścieżka
// synchroniczna (sync-acceptance Edge Fn). Skanuje ≤30 dni wstecz.
//
// Alarm-Policy (Michał 2026-07-21: "retry przez 5 minut i potem od razu
// alarm"): der Kunde darf NIE glauben, eine Buchung stehe, wenn Mamamia sie
// nicht bestätigt hat (z.B. Bewerbung von der Agentur zurückgezogen).
//   - Confirm fehlt NACH dem Retry dieses Laufs und Row älter als 5 Min —
//     oder Confirm-Fehler ist PERMANENT (deterministisch abgelehnt), dann
//     altersunabhängig ⇒ ALARM: Team-Mail über die Bridge (Event
//     acceptance_sync_alarm) + console.error + einmaliger Stempel
//     mamamia_sync_alerted_at. Gestempelt wird NUR, wenn die Bridge-Mail
//     durchging — sonst re-alarmiert der nächste Lauf (15 Min).
//   - Confirm ok, nur PDF-Upload offen ⇒ Archiv-Thema ohne Kundenrisiko:
//     Alarm erst nach 24h (gleicher Kanal).
// Ein Row, den der Retry dieses Laufs gerade REPARIERT hat, ist kein
// Alarmfall. Der T+0-Pfad (Bridge nach synchronem sync-acceptance)
// alarmiert bei permanent SOFORT selbst — der Cron ist der Garant dahinter.

const ACCEPTANCE_SYNC_MAX_AGE_DAYS = 30;
const ACCEPTANCE_CONFIRM_ALERT_AFTER_MS = 5 * 60 * 1000;
const ACCEPTANCE_PDF_ALERT_AFTER_MS = 24 * 60 * 60 * 1000;

// Team-Alarm über die Bridge — sie besitzt den SMTP-Transport. Das Event
// acceptance_sync_alarm ist in route.ts team-mail-only (nicht in
// GET_PUBLIC_EVENT_TYPES, keine Kundenmail) → erreicht NIE den Kunden.
async function postAcceptanceAlarm(
  deps: HandlerDeps,
  row: PendingAcceptanceSync,
  info: {
    confirmed: boolean;
    pdf_uploaded: boolean;
    permanent: boolean;
    error: string | null;
    age_minutes: number | null;
  },
): Promise<boolean> {
  if (!row.lead_token) return false;
  const fetcher = deps.fetchFn ?? globalThis.fetch;
  try {
    const res = await fetcher(`${deps.secrets.kostenrechnerUrl.replace(/\/$/, "")}/api/lead-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: row.lead_token,
        event: "acceptance_sync_alarm",
        metadata: {
          application_id: row.application_id,
          caregiver_id: row.caregiver_id,
          confirmed: info.confirmed,
          pdf_uploaded: info.pdf_uploaded,
          permanent: info.permanent,
          error: info.error,
          age_minutes: info.age_minutes,
          source: "cron",
        },
      }),
    });
    if (!res.ok) {
      console.error(
        `acceptance alarm bridge POST failed: HTTP ${res.status} (lead=${row.lead_id}, app=${row.application_id})`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error("acceptance alarm bridge POST threw:", (e as Error).message);
    return false;
  }
}

export async function retryAcceptanceSyncs(
  deps: HandlerDeps,
): Promise<{ scanned: number; completed: number; errors: number; alerts: number }> {
  const out = { scanned: 0, completed: 0, errors: 0, alerts: 0 };
  const supa = deps.supabase;
  if (
    !supa.selectPendingAcceptanceSyncs || !supa.stampAcceptanceConfirmed ||
    !supa.stampAcceptancePdfUploaded
  ) {
    return out; // Adapter ohne Retry-Support (z.B. alte Test-Fakes) → no-op
  }

  let pending: PendingAcceptanceSync[];
  try {
    pending = await supa.selectPendingAcceptanceSyncs(ACCEPTANCE_SYNC_MAX_AGE_DAYS);
  } catch (e) {
    console.error("acceptance-sync scan failed:", (e as Error).message);
    out.errors += 1;
    return out;
  }

  for (const row of pending) {
    out.scanned += 1;
    // Frischer Zustand NACH dem Retry dieses Laufs — Alarm nur auf das,
    // was danach noch offen ist (Row-Spalten sind der Stand vor dem Retry).
    let confirmedNow = !!row.mamamia_confirmed_at;
    let pdfNow = !!row.mamamia_pdf_uploaded_at;
    let permanentConfirmError = false;
    let lastError: string | null = null;
    try {
      const result = await syncAcceptance({
        lead: {
          id: row.lead_id,
          token: row.lead_token,
          mamamia_customer_id: row.lead_mamamia_customer_id,
        },
        row,
        secrets: {
          mamamiaEndpoint: deps.secrets.mamamiaEndpoint,
          kostenrechnerUrl: deps.secrets.kostenrechnerUrl,
          supabaseUrl: deps.secrets.supabaseUrl,
          supabaseServiceKey: deps.secrets.supabaseServiceKey,
        },
        supabase: {
          stampConfirmed: supa.stampAcceptanceConfirmed.bind(supa),
          stampPdfUploaded: supa.stampAcceptancePdfUploaded.bind(supa),
        },
        getAgencyToken: () =>
          getOrRefreshAgencyToken({
            authEndpoint: deps.secrets.mamamiaAuthEndpoint,
            email: deps.secrets.mamamiaAgencyEmail,
            password: deps.secrets.mamamiaAgencyPassword,
            fetchFn: deps.fetchFn,
          }),
        fetchFn: deps.fetchFn,
        sleepFn: deps.sleepFn,
      });
      confirmedNow = result.confirmed;
      pdfNow = result.pdf_uploaded;
      permanentConfirmError = result.confirm_error?.permanent === true;
      lastError = result.confirm_error?.message ?? null;
      if (result.confirmed && result.pdf_uploaded) out.completed += 1;
    } catch (e) {
      console.error(
        `acceptance-sync retry failed (lead=${row.lead_id}, app=${row.application_id}):`,
        (e as Error).message,
      );
      lastError = (e as Error).message;
      out.errors += 1;
    }

    const ageMs = Date.now() - Date.parse(row.accepted_at);
    const confirmOverdue = !confirmedNow &&
      (permanentConfirmError ||
        (Number.isFinite(ageMs) && ageMs > ACCEPTANCE_CONFIRM_ALERT_AFTER_MS));
    const pdfOverdue = confirmedNow && !pdfNow &&
      Number.isFinite(ageMs) && ageMs > ACCEPTANCE_PDF_ALERT_AFTER_MS;
    if ((confirmOverdue || pdfOverdue) && !row.mamamia_sync_alerted_at && supa.stampAcceptanceSyncAlerted) {
      const ageMin = Number.isFinite(ageMs) ? Math.round(ageMs / 60000) : null;
      console.error(
        `🚨 ACCEPTANCE-SYNC ALARM: lead=${row.lead_id} app=${row.application_id} ` +
          (confirmOverdue
            ? `Buchung OHNE Mamamia-Bestätigung (permanent=${permanentConfirmError}, ` +
              `alter=${ageMin ?? "?"}min, error=${lastError ?? "—"})`
            : "Vertrags-PDF fehlt seit >24h") +
          " — Team-Mail via Bridge + SA-Portal prüfen.",
      );
      const mailed = await postAcceptanceAlarm(deps, row, {
        confirmed: confirmedNow,
        pdf_uploaded: pdfNow,
        permanent: permanentConfirmError,
        error: lastError,
        age_minutes: ageMin,
      });
      // Ohne lead_token ist die Mail für immer unmöglich → trotzdem stempeln,
      // damit der Lauf nicht endlos spammt (console.error bleibt der Kanal).
      if (mailed || !row.lead_token) {
        try {
          await supa.stampAcceptanceSyncAlerted(row.lead_id, row.application_id);
          out.alerts += 1;
        } catch (e) {
          console.error("stampAcceptanceSyncAlerted failed:", (e as Error).message);
        }
      }
    }
  }

  return out;
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

  // ── Build the scan set: all of the lead's jobs (geplant/gebucht), plus the
  // default job as a guaranteed fallback. The Customer.job_offers fetch happens
  // ONCE here; its rows are reused for the lead_jobs sync at the end (no
  // double-fetch). Single-job leads — or any Customer-fetch failure — degrade to
  // scanning only the default job, identical to the pre-multi-job behavior.
  let jobRows: LeadJobUpsertRow[] = [];
  // Raw job_offers (inkl. final_confirmation) für den Annahme-Detektor unten.
  let rawOffers: RawJobOffer[] = [];
  const scanJobIds = new Set<number>([lead.mamamia_job_offer_id]);
  // Live-Status je Job aus Mamamia (geplant/gebucht/…). Fetch-Fehler ⇒ Map
  // bleibt leer ⇒ notify degradiert exakt aufs heutige Verhalten.
  const liveStatusByJob = new Map<number, string>();
  if (lead.mamamia_customer_id) {
    try {
      const jr = await mamamiaRequest<{ Customer: { job_offers?: RawJobOffer[] | null } | null }>({
        endpoint: secrets.mamamiaEndpoint,
        token: agencyToken,
        query: GET_CUSTOMER_JOB_OFFERS,
        variables: { id: lead.mamamia_customer_id },
        fetchFn: fetcher,
      });
      rawOffers = jr.Customer?.job_offers ?? [];
      const built = buildLeadJobRows(rawOffers, todayISO());
      jobRows = built.rows;
      for (const s of built.skipped) {
        console.warn(`[detect][leadJobs] lead=${lead.id} jo=${s.id} unmapped status=${s.raw} — skipped`);
      }
      for (const r of jobRows) {
        // Only scan jobs that can still receive applications worth mailing.
        // abgeschlossen (departure past) is excluded; storniert/unmapped were
        // already dropped by buildLeadJobRows.
        if (r.status === "geplant" || r.status === "gebucht") scanJobIds.add(r.mamamia_job_offer_id);
        // Live-Status pro Job — Grundlage der notify-Entscheidung (Bug #25:
        // geplante Follow-up-Jobs mailen IMMER, auch die erste Bewerbung).
        liveStatusByJob.set(r.mamamia_job_offer_id, r.status);
      }
    } catch (e) {
      console.warn(`[detect][leadJobs] lead=${lead.id} job_offers fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      // degrade to scanning the default job only (already in scanJobIds)
    }
  }

  // ── Past events (lead-scoped) → per-(job, caregiver) dedup sets + per-job
  // history flags. Legacy events with NULL job map onto the lead's default job,
  // so default-job dedup is preserved while non-default jobs (no prior events)
  // start fresh. pastEvents failure fails the lead (caught by handleBatch);
  // statusEvents failure only disables auto-reject (best-effort, as before).
  const pastEvents = await supabase.fetchPastEvents(lead.id);
  let statusEvents: AppStatusEventRow[] = [];
  try {
    statusEvents = await supabase.fetchAppStatusEvents(lead.id);
  } catch (e) {
    console.error(`auto-reject: fetchAppStatusEvents failed (lead ${lead.id}):`, e instanceof Error ? e.message : String(e));
  }

  const jk = (job: number, cg: number) => `${job}:${cg}`;
  const seenApps = new Set<string>();
  const seenInterests = new Set<string>();
  // Annahme-Dedupe: pro (Job, Caregiver) — NICHT mehr lead-weit (Bug #25:
  // Folge-Einsätze buchen oft DIESELBE Pflegekraft erneut; lead-weites Set
  // hätte den Annahme-Detektor für jede weitere Buchung stumm geschaltet).
  // Legacy-Events ohne mamamia_job_offer_id mappen auf den Default-Job —
  // alte Buchungen blocken also weiterhin nur den ursprünglichen Job.
  const acceptedJk = new Set<string>();
  const jobsWithHistory = new Set<number>();
  // Bewerbungs-Dedupe: pro APPLICATION (Registry #35). `seenApps` (Paar
  // Job:Pflegekraft) bleibt daneben bestehen — aber nur noch als Marker
  // "für dieses Paar existiert Historie OHNE application_id", also für
  // Zeilen von vor der Umstellung. Erklärung der Auswertung: `freshApps`.
  const seenAppIds = new Set<number>();
  const pairsWithAppId = new Set<string>();
  for (const e of pastEvents) {
    if (e.caregiver_id == null) continue;
    const job = e.mamamia_job_offer_id ?? lead.mamamia_job_offer_id;
    jobsWithHistory.add(job);
    if (e.event_type === "application_received") seenApps.add(jk(job, e.caregiver_id));
    else if (e.event_type === "caregiver_interest_shown") seenInterests.add(jk(job, e.caregiver_id));
    else if (e.event_type === "application_accepted_internal") acceptedJk.add(jk(job, e.caregiver_id));
    if (e.event_type === "application_received" && e.application_id != null) {
      seenAppIds.add(e.application_id);
      pairsWithAppId.add(jk(job, e.caregiver_id));
    }
  }

  const counts = {
    new_applications: 0,
    new_interests: 0,
    skipped_no_caregiver_data: 0,
    bridge_errors: 0,
    auto_rejected: 0,
    accepted_detected: 0,
    jobs_scanned: 0,
    job_scan_errors: 0,
    reminders_cancelled: 0,
  };
  const photoByCaregiver = new Map<number, string>();
  // Aktive Engagements (lead-weit, ueber alle gescannten Jobs) fuer den
  // Orphan-Cancel-Sweep: nur wer hier drinsteht, darf weiter Reminder
  // bekommen.
  const activeCg = { apps: new Set<number>(), interests: new Set<number>() };

  // Multi-Job (Phase 2A): mirror lead_jobs — BEWUSST VOR der Scan-Schleife
  // (Bug #25): die Bridge mappt mamamia_job_offer_id → lead_jobs.id für den
  // &job=-Deeplink in Kundenmails; der Wiersz muss also existieren, BEVOR der
  // erste Mail-POST dieses Jobs rausgeht. Best-effort; the on-demand sync in
  // mamamia-proxy/listLeadJobs is a top-up.
  let lead_jobs_synced = 0;
  if (supabase.upsertLeadJobs && jobRows.length > 0) {
    try {
      await enrichBewerbungen(jobRows, async (jobOfferId) => {
        const c = await mamamiaRequest<{ JobOfferApplicationsWithPagination?: { total?: number | null } | null }>({
          endpoint: secrets.mamamiaEndpoint,
          token: agencyToken,
          query: GET_JOB_OFFER_APPLICATION_COUNT,
          variables: { job_offer_id: jobOfferId },
          fetchFn: fetcher,
        });
        return c.JobOfferApplicationsWithPagination?.total ?? null;
      });
      await supabase.upsertLeadJobs(lead.id, jobRows);
      lead_jobs_synced = jobRows.length;
    } catch (e) {
      console.warn(`[detect][leadJobs] lead=${lead.id} upsert failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Scan each job. Per-job try/catch isolates one failing job from the rest.
  for (const jobOfferId of scanJobIds) {
    try {
      await detectForJob(lead, jobOfferId, agencyToken, deps, fetcher, {
        seenApps,
        seenAppIds,
        pairsWithAppId,
        seenInterests,
        // Notify-Regel (Bug #25, Fall 9239 „Elke Zwolan"):
        //   - DEFAULT-Job: immer (heutiges Verhalten — erste Bewerbung mailt).
        //   - Job mit Event-Historie: immer (auch geseedete Events zählen).
        //   - Job LIVE 'geplant': IMMER — ein geplanter Folge-Einsatz ist
        //     aktive Rekrutierung, seine erste Bewerbung MUSS mailen. Vorher
        //     wurde genau sie still geseedet (Kundin erfuhr nichts).
        //   Silent-Seed bleibt nur für den ersten Scan eines 'gebucht'-Jobs
        //   (Legacy-Eintritt in den Mirror — Altbestand nicht nachspammen).
        notify: jobsWithHistory.has(jobOfferId)
          || jobOfferId === lead.mamamia_job_offer_id
          || liveStatusByJob.get(jobOfferId) === "geplant",
        statusEvents,
        counts,
        photoByCaregiver,
        activeCg,
        jk,
      });
      counts.jobs_scanned += 1;
    } catch (e) {
      console.error(`[detect] lead=${lead.id} job=${jobOfferId} scan failed: ${e instanceof Error ? e.message : String(e)}`);
      counts.job_scan_errors += 1;
    }
  }

  // ── Annahme-Detektor: Agentur akzeptiert eine Bewerbung im SA-Portal →
  // mamamia setzt final_confirmation am Job. Frische Confirmations werden als
  // application_accepted_internal an die Bridge gemeldet — dieselbe Kette wie
  // eine Portal-Annahme (Mail C + Team-Buchungsmail baut route.ts komplett).
  // Guards:
  //   1. Dedupe per (Job, Caregiver) über acceptedJk (Portal-Annahme ODER
  //      früherer Detektor-Lauf → nie doppelt feuern; Folge-Buchung derselben
  //      Pflegekraft auf NEUEM Job feuert wieder — Bug #25).
  //   2. Buchung älter als ACCEPTED_MAX_AGE_MS (oder ohne Zeitstempel) →
  //      Altbestand, beim ersten Scan KEINE Mails auslösen. Anker ist
  //      final_confirmation.created_at (= Buchungsmoment; live-verifiziert
  //      2026-08-05 auf beta UND prod). final_confirmed_at ist auf beiden
  //      Tenants IMMER null (Panel-Buchung wie Portal-Akzept) — deshalb hat
  //      der Detektor seit #379 nie gefeuert (Bug #26); es bleibt nur als
  //      Fallback, falls mamamia das Feld je zu stempeln beginnt.
  //   3. Job ohne Event-Historie (silent-seed, notify=false) → Event GAR NICHT
  //      feuern: application_accepted_internal ist in route.ts lead-weit
  //      deduped, ein seeded Event würde spätere echte Buchungsmails blocken.
  // Fail-soft: Fehler pro Job loggen, Scan nie brechen.
  for (const jo of rawOffers) {
    try {
      if (typeof jo.id !== "number" || !scanJobIds.has(jo.id)) continue;
      const fc = jo.final_confirmation;
      if (!fc) continue;
      const notify = jobsWithHistory.has(jo.id) || jo.id === lead.mamamia_job_offer_id;
      if (!notify) continue; // Guard 3 — Verhalten von application_received gespiegelt, nur ohne Seed-Event
      const cg = fc.caregiver ?? null;
      const cgId = typeof cg?.id === "number" ? cg.id : null;
      if (cgId == null) continue; // ohne caregiver_id kein Dedupe möglich → nicht feuern
      if (acceptedJk.has(jk(jo.id, cgId))) continue; // Guard 1 — per (Job, Caregiver), Bug #25
      const confirmedMs = parseMamamiaTimestamp(fc.created_at ?? fc.final_confirmed_at);
      if (confirmedMs == null || Date.now() - confirmedMs > ACCEPTED_MAX_AGE_MS) continue; // Guard 2
      const caregiverNode: CaregiverNode = {
        id: cgId,
        first_name: cg?.first_name ?? null,
        last_name: cg?.last_name ?? null,
        year_of_birth: null,
        care_experience: null,
        germany_skill: null,
        hp_caregiver_id: null,
        hp_total_jobs: null,
        hp_total_days: null,
        hp_avg_mission_days: null,
        avatar_retouched: null,
        about_de: null,
      };
      const ok = await fireBridgeEvent(
        "application_accepted_internal",
        lead.token,
        cgId,
        caregiverNode,
        jo.id,
        true,
        secrets.kostenrechnerUrl,
        counts,
        fetcher,
        // Konditionen des Jobs, sofern vorhanden (salary_offered wird in
        // GET_CUSTOMER_JOB_OFFERS bewusst NICHT selektiert — ungetestetes
        // Feld, Lehre vom 11.07.).
        {
          salary: null,
          arrival_at: jo.arrival_at ?? null,
          departure_at: jo.departure_at ?? null,
          arrival_fee: null,
          departure_fee: null,
        },
      );
      if (ok) {
        counts.accepted_detected += 1;
        acceptedJk.add(jk(jo.id, cgId)); // Guard gegen Doppel-Confirmations im selben Sweep
      }
    } catch (e) {
      console.error(`[detect][accepted] lead=${lead.id} jo=${jo.id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Reminder photo refresh — once, aggregated across all jobs.
  try {
    await supabase.refreshReminderPhotos(lead.id, photoByCaregiver);
  } catch (e) {
    console.error(`refreshReminderPhotos failed (lead ${lead.id}):`, e instanceof Error ? e.message : String(e));
  }

  // Reminder-Stopp fuer abgelehnte/verschwundene Bewerbungen — NUR wenn alle
  // Jobs fehlerfrei gescannt wurden: ein API-Schluckauf (leere App-Liste)
  // darf nicht faelschlich alle Reminder canceln.
  if (supabase.cancelOrphanedReminders && counts.job_scan_errors === 0 && counts.jobs_scanned > 0) {
    try {
      counts.reminders_cancelled += await supabase.cancelOrphanedReminders(lead.id, activeCg);
    } catch (e) {
      console.error(`cancelOrphanedReminders failed (lead ${lead.id}):`, e instanceof Error ? e.message : String(e));
    }
  }

  return { lead_id: lead.id, ...counts, lead_jobs_synced };
}

// ─── Annahme-Detektor: Konstanten + Zeitstempel-Parser ─────────────────────
// final_confirmed_at älter als 7 Tage = Altbestand: beim allerersten Scan
// eines Leads/Jobs dürfen historische Buchungen KEINE Mail-Kette auslösen.
const ACCEPTED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Mamamia liefert Timestamps teils als "YYYY-MM-DD HH:MM:SS" (kein ISO-T).
// Date.parse versteht das in V8, der Ersatz mit "T" ist der Fallback.
export function parseMamamiaTimestamp(raw: string | null | undefined): number | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  let ms = Date.parse(t);
  if (!Number.isFinite(ms)) ms = Date.parse(t.replace(" ", "T"));
  return Number.isFinite(ms) ? ms : null;
}

// Scan ONE of the lead's jobs: fetch its applications + interests, fire bridge
// events for new ones (per-(job,caregiver) dedup via the shared seen-sets), and
// run the 72h auto-reject for that job. On the FIRST scan of a job with no event
// history, events are SEEDED silently (notify=false) so the customer isn't
// burst-mailed about pre-existing applications.
async function detectForJob(
  lead: LeadRow & { token: string; mamamia_job_offer_id: number },
  jobOfferId: number,
  agencyToken: string,
  deps: HandlerDeps,
  fetcher: typeof fetch,
  ctx: {
    seenApps: Set<string>;
    seenAppIds: Set<number>;
    pairsWithAppId: Set<string>;
    seenInterests: Set<string>;
    notify: boolean;
    statusEvents: AppStatusEventRow[];
    counts: {
      new_applications: number;
      new_interests: number;
      skipped_no_caregiver_data: number;
      bridge_errors: number;
      auto_rejected: number;
      reminders_cancelled?: number;
    };
    photoByCaregiver: Map<number, string>;
    activeCg: { apps: Set<number>; interests: Set<number> };
    jk: (job: number, cg: number) => string;
  },
): Promise<void> {
  const { secrets } = deps;
  const { seenApps, seenAppIds, pairsWithAppId, seenInterests, notify, statusEvents, counts, photoByCaregiver, activeCg, jk } = ctx;

  const [appsRes, interestsRes] = await Promise.all([
    mamamiaRequest<ListApplicationsResponse>({
      endpoint: secrets.mamamiaEndpoint,
      token: agencyToken,
      query: LIST_APPLICATIONS,
      variables: { job_offer_id: jobOfferId, limit: 100, page: 1 },
      fetchFn: fetcher,
    }),
    mamamiaRequest<ListInterestsResponse>({
      endpoint: secrets.mamamiaEndpoint,
      token: agencyToken,
      query: LIST_INTERESTS_FOR_OFFER,
      variables: { id: jobOfferId },
      fetchFn: fetcher,
    }),
  ]);
  const apps = appsRes.JobOfferApplicationsWithPagination?.data ?? [];
  const interests = interestsRes.JobOffer?.interests ?? [];

  // Mail-Burst-Cap (Bug #25): pro Job & Run maximal NOTIFY_CAP_PER_JOB_RUN
  // Kunden-Mails — schützt vor Fluten, wenn ein Job mit vielen aufgelaufenen
  // Bewerbungen in den Scan kommt (Discovery reaktivierter Leads, manueller
  // handleSingle, Cron-Downtime). Bewerbungen zuerst (höchste application.id
  // = neueste), Interests teilen sich das Budget. Bei notify=true werden
  // Überzählige in diesem Run GAR NICHT gepostet (kein Event ⇒ kein Dedup)
  // und tropfen in den Folge-Runs nach — nichts wird dauerhaft verschluckt.
  // Bei notify=false (Silent-Seed eines gebucht-Jobs) greift kein Cap:
  // Seeds sind mail-los und sollen die Historie VOLLSTÄNDIG registrieren.
  let notifyBudget = NOTIFY_CAP_PER_JOB_RUN;

  // Dedupe-Schlüssel ist die APPLICATION, nicht das Paar (Job, Pflegekraft)
  // (Registry #35). Vorher galt: eine Pflegekraft, die auf denselben Job schon
  // einmal beworben war, konnte NIE wieder eine Mail auslösen — die zweite
  // Einstellung derselben Pflegekraft (neue Bewerbung, typischerweise mit
  // anderem Satz und anderen Terminen) war für den Kunden unsichtbar.
  //
  // Drei Fälle, in dieser Reihenfolge:
  //   a) id ist bekannt          → still (Idempotenz des 15-Minuten-Scans;
  //                                DAS ist der eigentliche Zweck des Dedupe)
  //   b) Paar hat NUR Historie ohne application_id UND die Bewerbung ist selbst
  //      älter als die Umstellung (id <= PRE_SWITCH_MAX_APP_ID) → "dieselbe oder
  //      neu?" ist nicht entscheidbar. Deshalb EINMAL still registrieren (seed,
  //      keine Mail) statt zu raten; ab dann greift (a)/(c) exakt.
  //   c) alles andere            → neue Bewerbung ⇒ Mail (auch bei derselben
  //                                Pflegekraft auf demselben Job)
  const seedOnly = new Set<number>();
  const freshApps = apps
    .filter((a) => {
      if (a.caregiver_id == null) return false;
      if (a.id != null && seenAppIds.has(a.id)) return false; // (a)
      const pair = jk(jobOfferId, a.caregiver_id);
      if (
        seenApps.has(pair) && !pairsWithAppId.has(pair) &&
        a.id != null && a.id <= PRE_SWITCH_MAX_APP_ID
      ) {
        seedOnly.add(a.id); // (b)
      }
      return true; // (c)
    })
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));

  for (const app of freshApps) {
    // Seed-Zeilen (Fall b) verbrauchen kein Notify-Budget und mailen nicht.
    const notifyThis = notify && !(app.id != null && seedOnly.has(app.id));
    if (notifyThis && notifyBudget <= 0) {
      console.warn(
        `[detect][cap] lead=${lead.id} job=${jobOfferId}: Notify-Budget (${NOTIFY_CAP_PER_JOB_RUN}) erschöpft — Bewerbung cg=${app.caregiver_id} wartet auf den nächsten Run`,
      );
      continue; // kein Event ⇒ nächster Run holt sie mit frischem Budget nach
    }
    if (notifyThis) notifyBudget -= 1;
    const ok = await fireBridgeEvent(
      "application_received",
      lead.token,
      app.caregiver_id as number,
      app.caregiver,
      jobOfferId,
      notifyThis,
      secrets.kostenrechnerUrl,
      counts,
      fetcher,
      {
        id: app.id,
        salary: app.salary,
        arrival_at: app.arrival_at,
        departure_at: app.departure_at,
        arrival_fee: app.arrival_fee,
        departure_fee: app.departure_fee,
      },
    );
    if (ok) {
      counts.new_applications += 1;
      const pair = jk(jobOfferId, app.caregiver_id as number);
      seenApps.add(pair); // guard against dup apps in one sweep
      // Ab jetzt trägt dieses Paar eine application_id — die Legacy-Regel (b)
      // greift nicht mehr, die nächste ANDERE Bewerbung derselben Pflegekraft
      // mailt also.
      if (app.id != null) {
        seenAppIds.add(app.id);
        pairsWithAppId.add(pair);
      }
    }
  }

  for (const interest of interests) {
    if (interest.rejected_at) continue;
    if (interest.caregiver_id == null) continue;
    if (seenInterests.has(jk(jobOfferId, interest.caregiver_id))) continue;
    // Per-job interest→application suppression: if the customer was already
    // pinged about this caregiver AS AN APPLICATION on THIS job, skip the
    // weaker interest signal.
    if (seenApps.has(jk(jobOfferId, interest.caregiver_id))) continue;
    if (notify && notifyBudget <= 0) {
      console.warn(
        `[detect][cap] lead=${lead.id} job=${jobOfferId}: Notify-Budget erschöpft — Interest cg=${interest.caregiver_id} wartet auf den nächsten Run`,
      );
      continue;
    }
    if (notify) notifyBudget -= 1;
    const ok = await fireBridgeEvent(
      "caregiver_interest_shown",
      lead.token,
      interest.caregiver_id,
      interest.caregiver,
      jobOfferId,
      notify,
      secrets.kostenrechnerUrl,
      counts,
      fetcher,
    );
    if (ok) {
      counts.new_interests += 1;
      seenInterests.add(jk(jobOfferId, interest.caregiver_id));
    }
  }

  // Collect fresh presigned photo URLs (lead-scoped, keyed by caregiver) for the
  // reminder-photo refresh the caller runs once after all jobs.
  for (const a of apps) {
    const url = a.caregiver?.avatar_retouched_promo?.aws_url ?? a.caregiver?.avatar_retouched?.aws_url;
    if (a.caregiver_id != null && url) photoByCaregiver.set(a.caregiver_id, url);
    // Aktiv = vorhanden und nicht abgelehnt. Panel-/SA-Ablehnungen LOESCHEN
    // die Application (siehe Dashboard-Feed-Fix 2026-07-11) — die fehlt hier
    // dann einfach und faellt aus dem Set.
    if (a.caregiver_id != null && !a.rejected_at) activeCg.apps.add(a.caregiver_id);
  }
  for (const i of interests) {
    const url = i.caregiver?.avatar_retouched_promo?.aws_url ?? i.caregiver?.avatar_retouched?.aws_url;
    if (i.caregiver_id != null && url && !photoByCaregiver.has(i.caregiver_id)) {
      photoByCaregiver.set(i.caregiver_id, url);
    }
    if (i.caregiver_id != null && !i.rejected_at) activeCg.interests.add(i.caregiver_id);
  }

  // 72h auto-reject for THIS job's stale applications.
  counts.auto_rejected += await autoRejectStaleApplications(lead, jobOfferId, apps, statusEvents, agencyToken, deps, fetcher, jk);
}

// ─── 72h Auto-Reject ───────────────────────────────────────────────────────
// Lehnt Bewerbungen automatisch ab, auf die der Kunde 72h nach der
// Bewerbungs-Mail (application_received) nicht reagiert hat. Die 70h-
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
const AUTO_REJECT_AFTER_HOURS = 72;

// Mail-Burst-Cap (Bug #25): maximale Kunden-Notifications pro Job & Run.
// Schützt reaktivierte Leads (Discovery/handleSingle/Cron-Downtime) vor
// einer Flut aufgelaufener Bewerbungen. Überzählige werden in DIESEM Run
// GAR NICHT gepostet (kein Event ⇒ kein Dedup-Eintrag) und tropfen in den
// Folge-Runs nach — 3 pro 15 Minuten, bis alles gemailt ist. Nichts wird
// dauerhaft verschluckt (Fall 9239).
const NOTIFY_CAP_PER_JOB_RUN = 3;

// Höchste application_id, die es zum Umstellungszeitpunkt auf application_id-
// Dedupe gab (Registry #35, prod 17.08.2026, live aus den Scan-Logs abgelesen).
// Mamamias application_id ist auto-increment, also gilt: alles DARÜBER ist nach
// der Umstellung entstanden und damit zweifelsfrei eine NEUE Bewerbung — die
// muss mailen, auch wenn das Paar (Job, Pflegekraft) nur id-lose Alt-Historie
// hat. Ohne diese Grenze hätte jedes Alt-Paar genau eine echte, neue Bewerbung
// still verschluckt (aufgefallen an app11664/Robert S., 2450 €).
// Die Konstante ist ein historischer Stempel und muss NICHT gepflegt werden:
// jede neue Bewerbung stempelt ihre id ins Event, damit läuft Fall (b) aus.
const PRE_SWITCH_MAX_APP_ID = 11652;
const AUTO_REJECT_MESSAGE =
  "Automatische Absage — keine Rückmeldung des Kunden innerhalb 72 Stunden.";
const AUTO_REJECT_DEFAULT_LIVE = true;

function autoRejectIsLive(): boolean {
  const v = (Deno.env.get("AUTO_REJECT_ENABLED") ?? "").trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return AUTO_REJECT_DEFAULT_LIVE;
}

async function autoRejectStaleApplications(
  lead: LeadRow & { token: string; mamamia_job_offer_id: number },
  jobOfferId: number,
  apps: ApplicationNode[],
  statusEvents: AppStatusEventRow[],
  agencyToken: string,
  deps: HandlerDeps,
  fetcher: typeof fetch,
  jk: (job: number, cg: number) => string,
): Promise<number> {
  const { secrets } = deps;
  const live = autoRejectIsLive();

  // Per-(job, caregiver) age anchor + reaction set. Legacy NULL-job events map
  // onto the lead's default job. SEEDED application_received events (silent
  // first-scan, never mailed) are NOT anchors — guard 1: never auto-reject what
  // the customer was never told about.
  const receivedAt = new Map<string, number>(); // `${job}:${cg}` → ms
  const reacted = new Set<string>();
  for (const ev of statusEvents) {
    if (ev.caregiver_id == null) continue;
    const job = ev.mamamia_job_offer_id ?? lead.mamamia_job_offer_id;
    const k = jk(job, ev.caregiver_id);
    if (ev.event_type === "application_received") {
      if (ev.seeded) continue; // seeded == never mailed → not a reject anchor
      const ms = Date.parse(ev.created_at);
      if (!Number.isFinite(ms)) continue;
      const prev = receivedAt.get(k);
      if (prev == null || ms < prev) receivedAt.set(k, ms);
    } else {
      // application_accepted_internal | application_rejected
      reacted.add(k);
    }
  }

  const cutoffMs = AUTO_REJECT_AFTER_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  let rejected = 0;

  for (const app of apps) {
    if (app.caregiver_id == null) continue;
    const k = jk(jobOfferId, app.caregiver_id);
    if (reacted.has(k)) continue;                        // Guard 2
    const received = receivedAt.get(k);
    if (received == null) continue;                      // Guard 1
    const ageMs = now - received;
    if (ageMs < cutoffMs) continue;                      // Guard 3

    const ageH = Math.round(ageMs / 3_600_000);
    if (!live) {
      console.log(`auto-reject [DRY-RUN] would reject application ${app.id} (caregiver ${app.caregiver_id}, lead ${lead.id}, job ${jobOfferId}, age ${ageH}h)`);
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
            mamamia_job_offer_id: jobOfferId,
            reject_message: AUTO_REJECT_MESSAGE,
            reason: "auto_timeout_72h",
            source: "detect-caregiver-events",
          },
        }),
      });
    } catch (e) {
      // Mamamia-Reject ist schon durch — Bridge-Event-Fehler nur loggen.
      console.error(`auto-reject: bridge event failed (app ${app.id}, lead ${lead.id}):`, e instanceof Error ? e.message : String(e));
    }
    console.log(`auto-reject [LIVE] rejected application ${app.id} (caregiver ${app.caregiver_id}, lead ${lead.id}, job ${jobOfferId}, age ${ageH}h)`);
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
  jobOfferId: number,
  notify: boolean,
  kostenrechnerUrl: string,
  counts: { skipped_no_caregiver_data: number; bridge_errors: number },
  fetchFn: typeof fetch,
  // `id` = application_id; optional, weil der Annahme-Detektor (Buchung im
  // Panel) keine Bewerbung in der Hand hat, nur den Job.
  offer?: Pick<ApplicationNode, "salary" | "arrival_at" | "departure_at" | "arrival_fee" | "departure_fee"> & { id?: number | null },
): Promise<boolean> {
  const metadata = buildCaregiverMetadata(caregiverId, caregiver);
  if (!metadata.caregiver_name) {
    counts.skipped_no_caregiver_data += 1;
    return false;
  }

  // Multi-Job: stamp the job; mark seeded (silent first-scan) events so the
  // bridge stores them but auto-reject never uses them as a "customer informed"
  // anchor.
  metadata.mamamia_job_offer_id = jobOfferId;
  if (!notify) metadata.seeded = true;

  // Konditionen der Bewerbung mitschicken (nur application_received) — Mail B
  // rendert daraus die Konditionen-Bühne (Tagessatz/Datum/Reisekosten).
  if (offer) {
    // Identität DER Bewerbung (Registry #35) — Grundlage des Dedupe im nächsten
    // Lauf. Ohne dieses Feld fällt das Paar zurück auf die Legacy-Regel.
    if (offer.id != null) metadata.application_id = offer.id;
    if (offer.salary != null) metadata.offer_salary = offer.salary;
    if (offer.arrival_at != null) metadata.offer_arrival_at = offer.arrival_at;
    if (offer.departure_at != null) metadata.offer_departure_at = offer.departure_at;
    if (offer.arrival_fee != null) metadata.offer_arrival_fee = offer.arrival_fee;
    if (offer.departure_fee != null) metadata.offer_departure_fee = offer.departure_fee;
  }

  try {
    // notify=false → bridge records the event but sends NO customer/team mail +
    // schedules NO reminder (seed pass).
    const res = await fetchFn(`${kostenrechnerUrl}/api/lead-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, event, notify, metadata }),
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
  // Alter (aus year_of_birth) + Deutsch-Level (aus germany_skill) für die
  // einheitliche Pflegekraft-Box in den Kundenmails.
  if (typeof caregiver.year_of_birth === "number" && caregiver.year_of_birth > 1900) {
    const age = new Date().getFullYear() - caregiver.year_of_birth;
    if (age > 0 && age < 120) meta.caregiver_age = age;
  }
  const germanLevel = germanLevelLabel(caregiver.germany_skill);
  if (germanLevel) meta.caregiver_german_level = germanLevel;
  // Foto-Queue: promo → retouched (raw avatar wird in detect nicht abgefragt).
  const photoUrl = caregiver.avatar_retouched_promo?.aws_url ?? caregiver.avatar_retouched?.aws_url;
  if (photoUrl) {
    meta.caregiver_photo_url = photoUrl;
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
// Caregiver-Deutsch-Level aus germany_skill (level_0..level_4) → CEFR-Label,
// identisch zur Portal-Anzeige (src/lib/mamamia/mappers.ts GERMANY_SKILL_LEVELS).
// So steht in der Mail dasselbe wie im Pflegekraft-Profil.
export function germanLevelLabel(skill: string | null | undefined): string | null {
  const map: Record<string, string> = {
    level_0: "A1",
    level_1: "A1-A2",
    level_2: "A2-B1",
    level_3: "B1-B2",
    level_4: "B2-C1",
  };
  return (skill && map[skill]) || null;
}

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

// Schwellen-Spiegel von src/lib/mamamia/badge.ts (`badgeTier`) und
// mamamia-sadash `lib/caregiverBadge.js`. Basis überall: hp_total_jobs
// (abgeschlossene Einsätze über uns), Starter = keine Historie.
//
// 12.08.2026: Schwellen von 20/10/5/1 auf 12/6/2/1 korrigiert. Der Kommentar
// behauptete schon vorher „Mirror of frontend badge thresholds", die Zahlen
// waren aber eine dritte, eigene Reihe — dieselbe Pflegekraft konnte in der
// Mail Silber und im Portal eine Stufe höher sein.
//
// Die Namen bleiben vorerst metallisch, weil die Kundenmails sie mit
// Farbverlauf rendern (send-scheduled-emails `reminderBadgeStyle`); das
// Portal UND SA-Portal zeigen seit 12.08. Klartext (Bekannt / Bewährt /
// Stammkraft / Elite). Angleichen der Mail-Wortwahl ist eine eigene Entscheidung.
export function mapHpToBadge(
  hpTotalJobs: number | null | undefined,
): "Starter" | "Bronze" | "Silber" | "Gold" | "Platin" | null {
  if (hpTotalJobs == null) return null;
  if (hpTotalJobs >= 12) return "Platin";
  if (hpTotalJobs >= 6) return "Gold";
  if (hpTotalJobs >= 2) return "Silber";
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
      //
      // Multi-Job/Folge-Einsatz (Bug #25): Leads mit status='folge_einsatz'
      // sind IMMER aktiv — auch mit abgelaufenem Token (Michał: kein Auto-
      // Verlängern; Mails gehen mit dem alten Link, toter Link ⇒
      // ExpiredLinkScreen ⇒ Self-Service „Neuen Link senden" — funktioniert,
      // weil folge_einsatz kein CLOSED_STATUS ist).
      const { data, error } = await client
        .from("leads")
        .select("id, token, email, mamamia_customer_id, mamamia_job_offer_id")
        .not("mamamia_job_offer_id", "is", null)
        .not("token", "is", null)
        .or(`and(token_expires_at.gt.${new Date().toISOString()},status.not.in.(vertrag_abgeschlossen,betreuung_beauftragt,nicht_interessiert)),status.eq.folge_einsatz`);
      if (error) throw new Error(`supabase fetchActiveLeads: ${error.message}`);
      return (data ?? []) as LeadRow[];
    },
    // ── Follow-up Discovery (Bug #25) ──
    // Leads AUSSERHALB des Active-Sets (geschlossene Status ODER abgelaufener
    // Token), die einen Mamamia-Customer haben: Kandidaten für „hat Mamamia
    // einen neuen Job eröffnet?". Selbst-taktend über mamamia_jobs_checked_at
    // (Re-Probe frühestens nach DISCOVERY_RECHECK_HOURS, max BATCH pro Run) —
    // gleichmäßige API-Last statt Stoßbetrieb.
    async fetchDiscoveryLeads(recheckHours: number, batchSize: number) {
      const cutoff = new Date(Date.now() - recheckHours * 3600_000).toISOString();
      const { data, error } = await client
        .from("leads")
        .select("id, token, email, mamamia_customer_id, mamamia_job_offer_id, status")
        .not("mamamia_customer_id", "is", null)
        .not("mamamia_job_offer_id", "is", null)
        .not("token", "is", null)
        .neq("status", "nicht_interessiert")
        .neq("status", "folge_einsatz")
        .or(`status.in.(vertrag_abgeschlossen,betreuung_beauftragt),token_expires_at.lte.${new Date().toISOString()}`)
        .or(`mamamia_jobs_checked_at.is.null,mamamia_jobs_checked_at.lt.${cutoff}`)
        .order("mamamia_jobs_checked_at", { ascending: true, nullsFirst: true })
        .limit(batchSize);
      if (error) throw new Error(`supabase fetchDiscoveryLeads: ${error.message}`);
      return (data ?? []) as Array<LeadRow & { status?: string | null }>;
    },
    async stampLeadJobsChecked(leadId: string) {
      const { error } = await client
        .from("leads")
        .update({ mamamia_jobs_checked_at: new Date().toISOString() })
        .eq("id", leadId);
      if (error) throw new Error(`supabase stampLeadJobsChecked: ${error.message}`);
    },
    // Stan odziedziczony z Mamamii: neuer geplanter Job ⇒ Lead wird
    // 'folge_einsatz' + Audit-Event für die Admin-Timeline. KEINE Mails hier —
    // die schickt der normale Scan-Pfad, sobald der Lead (nächster Run) im
    // Active-Set ist.
    async markLeadFolgeEinsatz(leadId: string, mamamiaJobOfferId: number) {
      const { error } = await client
        .from("leads")
        .update({ status: "folge_einsatz" })
        .eq("id", leadId);
      if (error) throw new Error(`supabase markLeadFolgeEinsatz: ${error.message}`);
      const { error: evErr } = await client.from("lead_events").insert({
        lead_id: leadId,
        event_type: "folge_einsatz_detected",
        mamamia_job_offer_id: mamamiaJobOfferId,
        metadata: { source: "detect-discovery", mamamia_job_offer_id: mamamiaJobOfferId },
      });
      if (evErr) console.error(`folge_einsatz_detected event insert failed (lead ${leadId}):`, evErr.message);
    },
    // ── Acceptance-Sync-Retry (Refactor 2026-07-22) ──
    async selectPendingAcceptanceSyncs(maxAgeDays: number) {
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
      // Join auf leads über den FK lead_id — liefert token + customer_id,
      // die syncAcceptance braucht. Partial-Index
      // idx_acceptances_mamamia_sync_pending deckt genau dieses WHERE.
      const { data, error } = await client
        .from("lead_application_acceptances")
        .select("lead_id, application_id, caregiver_id, signatur, contract_patient, contract_contact, contract_snapshot, mamamia_confirmed_at, mamamia_confirmation_id, mamamia_pdf_uploaded_at, pdf_sha256, accepted_at, mamamia_sync_alerted_at, leads!inner(token, mamamia_customer_id)")
        .not("signatur", "is", null)
        .gt("accepted_at", cutoff)
        .or("mamamia_confirmed_at.is.null,mamamia_pdf_uploaded_at.is.null");
      if (error) throw new Error(`supabase selectPendingAcceptanceSyncs: ${error.message}`);
      return (data ?? []).map((r: Record<string, unknown>) => {
        const lead = r.leads as { token?: string | null; mamamia_customer_id?: number | null } | null;
        return {
          lead_id: r.lead_id,
          application_id: r.application_id,
          caregiver_id: r.caregiver_id ?? null,
          signatur: r.signatur ?? null,
          contract_patient: r.contract_patient ?? null,
          contract_contact: r.contract_contact ?? null,
          contract_snapshot: r.contract_snapshot ?? null,
          mamamia_confirmed_at: r.mamamia_confirmed_at ?? null,
          mamamia_confirmation_id: r.mamamia_confirmation_id ?? null,
          mamamia_pdf_uploaded_at: r.mamamia_pdf_uploaded_at ?? null,
          pdf_sha256: r.pdf_sha256 ?? null,
          accepted_at: r.accepted_at,
          mamamia_sync_alerted_at: r.mamamia_sync_alerted_at ?? null,
          lead_token: lead?.token ?? null,
          lead_mamamia_customer_id: lead?.mamamia_customer_id ?? null,
        } as PendingAcceptanceSync;
      });
    },
    async stampAcceptanceConfirmed(leadId: string, applicationId: number, confirmationId: number | null) {
      const { error } = await client
        .from("lead_application_acceptances")
        .update({ mamamia_confirmed_at: new Date().toISOString(), mamamia_confirmation_id: confirmationId })
        .eq("lead_id", leadId)
        .eq("application_id", applicationId);
      if (error) throw new Error(`supabase stampAcceptanceConfirmed: ${error.message}`);
    },
    async stampAcceptancePdfUploaded(leadId: string, applicationId: number, sha256: string | null) {
      const { error } = await client
        .from("lead_application_acceptances")
        .update({ mamamia_pdf_uploaded_at: new Date().toISOString(), pdf_sha256: sha256 })
        .eq("lead_id", leadId)
        .eq("application_id", applicationId);
      if (error) throw new Error(`supabase stampAcceptancePdfUploaded: ${error.message}`);
    },
    async stampAcceptanceSyncAlerted(leadId: string, applicationId: number) {
      const { error } = await client
        .from("lead_application_acceptances")
        .update({ mamamia_sync_alerted_at: new Date().toISOString() })
        .eq("lead_id", leadId)
        .eq("application_id", applicationId);
      if (error) throw new Error(`supabase stampAcceptanceSyncAlerted: ${error.message}`);
    },
    async fetchPastEvents(leadId: string) {
      // application_accepted_internal ist Dedupe-Quelle des Annahme-Detektors:
      // Portal-Annahmen UND frühere Detektor-Läufe landen hier — beide
      // verhindern ein erneutes Feuern.
      const { data, error } = await client
        .from("lead_events")
        .select("event_type, metadata, mamamia_job_offer_id")
        .eq("lead_id", leadId)
        .in("event_type", ["caregiver_interest_shown", "application_received", "application_accepted_internal"]);
      if (error) throw new Error(`supabase fetchPastEvents: ${error.message}`);
      return (data ?? []).map((row: { event_type: string; metadata: unknown; mamamia_job_offer_id: number | null }) => ({
        event_type: row.event_type as EventType,
        caregiver_id: extractCaregiverId(row.metadata),
        mamamia_job_offer_id: row.mamamia_job_offer_id ?? null,
        application_id: extractMetadataInt(row.metadata, "application_id"),
      }));
    },
    async fetchAppStatusEvents(leadId: string) {
      const { data, error } = await client
        .from("lead_events")
        .select("event_type, metadata, created_at, mamamia_job_offer_id")
        .eq("lead_id", leadId)
        .in("event_type", [
          "application_received",
          "application_accepted_internal",
          "application_rejected",
        ]);
      if (error) throw new Error(`supabase fetchAppStatusEvents: ${error.message}`);
      return (data ?? []).map((row: { event_type: string; metadata: unknown; created_at: string; mamamia_job_offer_id: number | null }) => ({
        event_type: row.event_type as AppStatusEventType,
        caregiver_id: extractCaregiverId(row.metadata),
        created_at: row.created_at,
        mamamia_job_offer_id: row.mamamia_job_offer_id ?? null,
        seeded: !!(row.metadata && typeof row.metadata === "object" && (row.metadata as Record<string, unknown>).seeded === true),
      }));
    },
    async refreshReminderPhotos(leadId: string, photoByCaregiver: Map<number, string>) {
      if (photoByCaregiver.size === 0) return 0;
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
    async cancelOrphanedReminders(leadId: string, active: { apps: Set<number>; interests: Set<number> }) {
      const { data, error } = await client
        .from("scheduled_emails")
        .select("id, email_type, metadata")
        .eq("lead_id", leadId)
        .eq("status", "pending")
        .in("email_type", REMINDER_TYPES);
      if (error) throw new Error(`supabase cancelOrphanedReminders select: ${error.message}`);
      let cancelled = 0;
      for (const row of (data ?? []) as { id: string; email_type: string; metadata: unknown }[]) {
        const cgId = extractCaregiverId(row.metadata);
        if (cgId == null) continue;
        // Interest-Reminder bleiben auch am Leben, wenn aus dem Interesse
        // inzwischen eine aktive Bewerbung wurde.
        const stillActive = row.email_type === "interest_reminder"
          ? active.interests.has(cgId) || active.apps.has(cgId)
          : active.apps.has(cgId);
        if (stillActive) continue;
        const { error: uErr } = await client
          .from("scheduled_emails")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("status", "pending");
        if (uErr) {
          console.error(`cancelOrphanedReminders update row ${row.id} failed:`, uErr.message);
          continue;
        }
        await client.from("lead_events").insert({
          lead_id: leadId,
          event_type: `email_${row.email_type}_cancelled`,
          metadata: { caregiver_id: cgId, reason: "application_no_longer_active" },
        });
        cancelled += 1;
      }
      return cancelled;
    },
    async upsertLeadJobs(leadId, jobs) {
      if (jobs.length === 0) return;
      const { error } = await client
        .from("lead_jobs")
        .upsert(
          jobs.map((j) => ({ lead_id: leadId, ...j })),
          { onConflict: "lead_id,mamamia_job_offer_id" },
        );
      if (error) throw new Error(`supabase upsertLeadJobs: ${error.message}`);
    },
  };
}

function extractMetadataInt(metadata: unknown, key: string): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>)[key];
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractCaregiverId(metadata: unknown): number | null {
  return extractMetadataInt(metadata, "caregiver_id");
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
