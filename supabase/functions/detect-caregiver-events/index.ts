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

  return new Response(JSON.stringify(batch), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
  // Annahme-Dedupe: lead-weit pro caregiver_id (NICHT pro Job) — Portal-
  // Annahmen tragen keine mamamia_job_offer_id-Spalte, müssen den Detektor
  // aber trotzdem stoppen. Deckt Portal-Annahmen UND frühere Detektor-Läufe
  // ab (beide landen als application_accepted_internal in lead_events).
  const acceptedCg = new Set<number>();
  const jobsWithHistory = new Set<number>();
  for (const e of pastEvents) {
    if (e.caregiver_id == null) continue;
    const job = e.mamamia_job_offer_id ?? lead.mamamia_job_offer_id;
    jobsWithHistory.add(job);
    if (e.event_type === "application_received") seenApps.add(jk(job, e.caregiver_id));
    else if (e.event_type === "caregiver_interest_shown") seenInterests.add(jk(job, e.caregiver_id));
    else if (e.event_type === "application_accepted_internal") acceptedCg.add(e.caregiver_id);
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

  // ── Scan each job. Per-job try/catch isolates one failing job from the rest.
  for (const jobOfferId of scanJobIds) {
    try {
      await detectForJob(lead, jobOfferId, agencyToken, deps, fetcher, {
        seenApps,
        seenInterests,
        // The DEFAULT job always notifies (preserves today's behavior — a new
        // lead's first application still mails). Only NON-default jobs seed
        // silently on their first scan (no prior events).
        notify: jobsWithHistory.has(jobOfferId) || jobOfferId === lead.mamamia_job_offer_id,
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
  //   1. Dedupe lead-weit über acceptedCg (Portal-Annahme ODER früherer
  //      Detektor-Lauf → nie doppelt feuern).
  //   2. final_confirmed_at fehlt oder älter als ACCEPTED_MAX_AGE_MS →
  //      Altbestand, beim ersten Scan KEINE Mails auslösen.
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
      if (acceptedCg.has(cgId)) continue; // Guard 1
      const confirmedMs = parseMamamiaTimestamp(fc.final_confirmed_at);
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
        acceptedCg.add(cgId); // Guard gegen Doppel-Confirmations im selben Sweep
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

  // Multi-Job (Phase 2A): mirror lead_jobs from the SAME Customer.job_offers
  // rows already fetched above (+ per-geplant bewerbungen counts). Best-effort;
  // the on-demand sync in mamamia-proxy/listLeadJobs is a top-up.
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
  const { seenApps, seenInterests, notify, statusEvents, counts, photoByCaregiver, activeCg, jk } = ctx;

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

  for (const app of apps) {
    if (app.caregiver_id == null) continue;
    if (seenApps.has(jk(jobOfferId, app.caregiver_id))) continue;
    const ok = await fireBridgeEvent(
      "application_received",
      lead.token,
      app.caregiver_id,
      app.caregiver,
      jobOfferId,
      notify,
      secrets.kostenrechnerUrl,
      counts,
      fetcher,
      {
        salary: app.salary,
        arrival_at: app.arrival_at,
        departure_at: app.departure_at,
        arrival_fee: app.arrival_fee,
        departure_fee: app.departure_fee,
      },
    );
    if (ok) {
      counts.new_applications += 1;
      seenApps.add(jk(jobOfferId, app.caregiver_id)); // guard against dup apps in one sweep
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
  offer?: Pick<ApplicationNode, "salary" | "arrival_at" | "departure_at" | "arrival_fee" | "departure_fee">,
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
