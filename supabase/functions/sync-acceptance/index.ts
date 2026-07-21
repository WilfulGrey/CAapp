// Supabase Edge Function: sync-acceptance
// POST /functions/v1/sync-acceptance  body: { lead_id, application_id, skip_confirm? }
//
// SERVER-TO-SERVER ONLY. Wird von der Kostenrechner-Bridge (route.ts,
// application_accepted_internal) direkt nach dem Acceptance-Upsert getriggert
// und führt die verbindliche Sequenz aus (_shared/acceptanceSync.ts):
//   1. UpdateCustomer (Kontaktdaten) → 2. StoreConfirmation → 3.+4. PDF →
//   Upload (mit final_confirmation-Bramka). Mails macht die Bridge selbst.
// Unvollständige Läufe holt eine HINTERGRUND-RETRY-CHAIN nach: +15s → +30s →
// +60s nach dem Erstversuch (EdgeRuntime.waitUntil — Michał: „zwykły retry,
// nie cron"); nach Ausschöpfung ohne Confirmation ⇒ sofortiger Team-Alarm.
// Der detect-caregiver-events-Cron (15 Min) bleibt NUR als Backstop
// (Prozess-Tod, längere Mamamia-Ausfälle) — gleicher Modul-Code.
//
// Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY> — constant-time
// Vergleich. KEIN Kunden-Session-JWT, KEIN anon key. Der Service-Key liegt
// bereits in beiden Umgebungen (Bridge: Render env, hier: Edge env).

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getOrRefreshAgencyToken } from "../_shared/mamamiaClient.ts";
import {
  type AcceptanceLead,
  type AcceptanceRow,
  type AcceptanceSyncResult,
  type AcceptanceSyncSupabase,
  syncAcceptance,
} from "../_shared/acceptanceSync.ts";

// ─── Secrets / Deps (DI für Tests) ─────────────────────────────────────────

export interface SyncSecrets {
  supabaseUrl: string;
  supabaseServiceKey: string;
  mamamiaEndpoint: string;
  mamamiaAuthEndpoint: string;
  mamamiaAgencyEmail: string;
  mamamiaAgencyPassword: string;
  kostenrechnerUrl: string;
}

export interface SyncStore {
  fetchLead(id: string): Promise<AcceptanceLead | null>;
  fetchAcceptance(leadId: string, applicationId: number): Promise<AcceptanceRow | null>;
  stampConfirmed(leadId: string, applicationId: number, confirmationId: number | null): Promise<void>;
  stampPdfUploaded(leadId: string, applicationId: number, sha256: string | null): Promise<void>;
}

export interface HandlerDeps {
  secrets: SyncSecrets;
  store: SyncStore;
  fetchFn?: typeof fetch;
  getAgencyToken?: () => Promise<string>;
  /** Injectable für Tests — Backoff-Pausen (Confirm-Retries + Retry-Chain). */
  sleepFn?: (ms: number) => Promise<void>;
  /** Injectable für Tests — ersetzt die echte Hintergrund-Retry-Chain. */
  runRetriesFn?: (deps: HandlerDeps, leadId: string, applicationId: number, skipConfirm: boolean) => Promise<void>;
}

// Hintergrund-Ausführung nach der Response — die Supabase Edge Runtime hält
// die Function mit waitUntil() am Leben. Außerhalb (deno test) existiert das
// Global nicht → fire-and-forget (Tests injizieren runRetriesFn).
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

function scheduleBackground(p: Promise<unknown>): void {
  try {
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) {
      EdgeRuntime.waitUntil(p);
      return;
    }
  } catch { /* kein EdgeRuntime-Global */ }
  p.catch((e) => console.error("background retry chain failed:", (e as Error).message));
}

// Retry-Kadenz (Michał 2026-07-21: „zwykły retry po 15-30 i 60 sekundach" —
// zamiast czekania na 15-minutowy cron). Mamamia przetwarza confirmation
// zwykle w kilkanaście-kilkadziesiąt sekund → po +15/+30/+60 s całość jest
// domknięta ~2 min po podpisie. Cron zostaje WYŁĄCZNIE jako bezpiecznik
// (śmierć procesu / dłuższa awaria Mamamii).
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000];

// Role-Claim aus einem (vom Gateway bereits signatur-geprüften) JWT lesen.
// KEINE eigene Signaturprüfung — die macht verify_jwt am Gateway; hier nur
// Payload-Decode. Nicht-JWT-Strings → null.
function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

// Constant-time string compare — Timing-Angriffe auf den Service-Key-Vergleich
// sind praktisch irrelevant (interner Endpunkt), aber der Vergleich kostet nichts.
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// ─── Handler ───────────────────────────────────────────────────────────────

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") {
    return json(405, { error: "method not allowed" });
  }

  // Server-to-server Auth, zwei akzeptierte Wege:
  //   a) Bearer == exakt der Service-Role-Key aus dem Env (fast path), ODER
  //   b) Bearer ist ein GÜLTIGES Projekt-JWT mit role='service_role'.
  // Zu (b): das Supabase-Gateway (verify_jwt, default AN) hat die SIGNATUR
  // bereits geprüft, bevor der Request diese Funktion erreicht — hier bleibt
  // nur der Role-Claim zu prüfen. Das ist rotations-sicher: nach einer
  // Key-Rotation unterscheiden sich Render-Env (Bridge) und Edge-Env
  // stringweise, aber beide tragen role='service_role'. anon-JWTs
  // (role='anon') passieren das Gateway ebenfalls → deshalb der Claim-Check.
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!bearer || (!timingSafeEqual(bearer, deps.secrets.supabaseServiceKey) && jwtRole(bearer) !== "service_role")) {
    return json(401, { error: "unauthorized" });
  }

  let leadId: string | undefined;
  let applicationId: number | undefined;
  let skipConfirm = false;
  try {
    const body = await req.json();
    leadId = typeof body?.lead_id === "string" ? body.lead_id : undefined;
    applicationId = typeof body?.application_id === "number" ? body.application_id : undefined;
    skipConfirm = body?.skip_confirm === true;
  } catch {
    return json(400, { error: "invalid json body" });
  }
  if (!leadId || applicationId == null) {
    return json(400, { error: "lead_id + application_id required" });
  }

  const lead = await deps.store.fetchLead(leadId);
  if (!lead) return json(404, { error: "lead not found" });
  const row = await deps.store.fetchAcceptance(leadId, applicationId);
  if (!row) return json(404, { error: "acceptance not found" });

  const runner = deps.runRetriesFn ?? runRetryChain;
  try {
    const result = await runSyncOnce(deps, lead, row, skipConfirm);
    const complete = result.confirmed && result.pdf_uploaded;
    const permanent = result.confirm_error?.permanent === true;
    // Retry-Chain 15/30/60 s IM HINTERGRUND (Michał: „zwykły retry, nie
    // cron") — für alles Unvollständige AUSSER permanenten Confirm-Fehlern
    // (deterministyczna odmowa — Bridge alarmiert T+0, retry nic nie zmienia).
    let retriesScheduled = false;
    if (!complete && !permanent) {
      scheduleBackground(runner(deps, lead.id, row.application_id, skipConfirm));
      retriesScheduled = true;
    }
    return json(200, { ...result, retries_scheduled: retriesScheduled });
  } catch (e) {
    // Fehler hier ist NICHT fatal fürs Business: die Buchung steht (DB-Write
    // in der Bridge). Retry-Chain übernimmt sofort, Cron bleibt Backstop.
    console.error(`sync-acceptance failed (lead=${leadId}, app=${applicationId}):`, (e as Error).message);
    scheduleBackground(runner(deps, lead.id, row.application_id, skipConfirm));
    return json(502, { error: "sync failed", detail: (e as Error).message.slice(0, 300), retries_scheduled: true });
  }
}

// Eine Sync-Ausführung mit den Deps des Handlers (geteilt: Erstversuch +
// jede Stufe der Retry-Chain — identische Guards, frische Row je Anlauf).
async function runSyncOnce(
  deps: HandlerDeps,
  lead: AcceptanceLead,
  row: AcceptanceRow,
  skipConfirm: boolean,
): Promise<AcceptanceSyncResult> {
  return await syncAcceptance({
    lead,
    row,
    skipConfirm,
    secrets: {
      mamamiaEndpoint: deps.secrets.mamamiaEndpoint,
      kostenrechnerUrl: deps.secrets.kostenrechnerUrl,
      supabaseUrl: deps.secrets.supabaseUrl,
      supabaseServiceKey: deps.secrets.supabaseServiceKey,
    },
    supabase: {
      stampConfirmed: deps.store.stampConfirmed.bind(deps.store),
      stampPdfUploaded: deps.store.stampPdfUploaded.bind(deps.store),
    } satisfies AcceptanceSyncSupabase,
    getAgencyToken: deps.getAgencyToken ?? (() =>
      getOrRefreshAgencyToken({
        authEndpoint: deps.secrets.mamamiaAuthEndpoint,
        email: deps.secrets.mamamiaAgencyEmail,
        password: deps.secrets.mamamiaAgencyPassword,
        fetchFn: deps.fetchFn,
      })),
    fetchFn: deps.fetchFn,
    sleepFn: deps.sleepFn,
  });
}

// Hintergrund-Retry-Chain: +15s → +30s → +60s nach dem Erstversuch. Jede
// Stufe liest die Row FRISCH (Stempel eines parallelen Laufs beenden die
// Chain), führt die volle Sequenz erneut aus und stoppt bei Komplettierung.
// Nach Ausschöpfung: fehlt die CONFIRMATION noch ⇒ SOFORT Team-Alarm über
// die Bridge (Kunde glaubt an eine Buchung, die Mamamia nicht hat — Mail +
// Stempel macht raiseAcceptanceSyncAlarm bridge-seitig). Fehlt nur der PDF
// ⇒ kein Alarm (Archiv-Thema, Cron-Backstop lädt nach, Alarm erst >24h).
export async function runRetryChain(
  deps: HandlerDeps,
  leadId: string,
  applicationId: number,
  skipConfirm: boolean,
  delays: number[] = RETRY_DELAYS_MS,
): Promise<void> {
  const sleep = deps.sleepFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastResult: AcceptanceSyncResult | null = null;
  for (const d of delays) {
    await sleep(d);
    try {
      const lead = await deps.store.fetchLead(leadId);
      const row = await deps.store.fetchAcceptance(leadId, applicationId);
      if (!lead || !row) return;
      if (row.mamamia_confirmed_at && row.mamamia_pdf_uploaded_at) return; // anderweitig komplett
      lastResult = await runSyncOnce(deps, lead, row, skipConfirm);
      if (lastResult.confirmed && lastResult.pdf_uploaded) {
        console.log(`[retry-chain] complete (lead=${leadId}, app=${applicationId})`);
        return;
      }
      if (lastResult.confirm_error?.permanent) break; // weitere Versuche sinnlos
    } catch (e) {
      console.error(`[retry-chain] attempt failed (lead=${leadId}, app=${applicationId}):`, (e as Error).message);
    }
  }

  try {
    const lead = await deps.store.fetchLead(leadId);
    const row = await deps.store.fetchAcceptance(leadId, applicationId);
    if (!lead || !row) return;
    if (row.mamamia_confirmed_at) {
      console.log(`[retry-chain] exhausted — confirm OK, PDF pending, Cron-Backstop übernimmt (lead=${leadId}, app=${applicationId})`);
      return;
    }
    if (row.mamamia_sync_alerted_at || !lead.token) return; // schon alarmiert / kein Bridge-Zugang
    const fetcher = deps.fetchFn ?? globalThis.fetch;
    const res = await fetcher(`${deps.secrets.kostenrechnerUrl.replace(/\/$/, "")}/api/lead-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: lead.token,
        event: "acceptance_sync_alarm",
        metadata: {
          application_id: applicationId,
          caregiver_id: row.caregiver_id,
          confirmed: false,
          pdf_uploaded: !!row.mamamia_pdf_uploaded_at,
          permanent: lastResult?.confirm_error?.permanent === true,
          error: lastResult?.confirm_error?.message
            ?? "confirm still missing after 15/30/60s retry chain",
          age_minutes: 2,
          source: "sync-retry",
        },
      }),
    });
    if (!res.ok) {
      console.error(`[retry-chain] alarm POST failed HTTP ${res.status} — Cron re-alarmiert (lead=${leadId}, app=${applicationId})`);
    }
  } catch (e) {
    console.error(`[retry-chain] alarm phase failed (lead=${leadId}, app=${applicationId}):`, (e as Error).message);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Real Supabase adapter + bootstrap ─────────────────────────────────────

export function makeRealStore(url: string, serviceKey: string): SyncStore {
  const client = createClient(url, serviceKey);
  return {
    async fetchLead(id: string) {
      const { data, error } = await client
        .from("leads")
        .select("id, token, mamamia_customer_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`supabase fetchLead: ${error.message}`);
      return data as AcceptanceLead | null;
    },
    async fetchAcceptance(leadId: string, applicationId: number) {
      const { data, error } = await client
        .from("lead_application_acceptances")
        .select("lead_id, application_id, caregiver_id, signatur, contract_patient, contract_contact, contract_snapshot, mamamia_confirmed_at, mamamia_confirmation_id, mamamia_pdf_uploaded_at, pdf_sha256, mamamia_sync_alerted_at")
        .eq("lead_id", leadId)
        .eq("application_id", applicationId)
        .maybeSingle();
      if (error) throw new Error(`supabase fetchAcceptance: ${error.message}`);
      return data as AcceptanceRow | null;
    },
    async stampConfirmed(leadId, applicationId, confirmationId) {
      const { error } = await client
        .from("lead_application_acceptances")
        .update({
          mamamia_confirmed_at: new Date().toISOString(),
          mamamia_confirmation_id: confirmationId,
        })
        .eq("lead_id", leadId)
        .eq("application_id", applicationId);
      if (error) throw new Error(`supabase stampConfirmed: ${error.message}`);
    },
    async stampPdfUploaded(leadId, applicationId, sha256) {
      const { error } = await client
        .from("lead_application_acceptances")
        .update({
          mamamia_pdf_uploaded_at: new Date().toISOString(),
          pdf_sha256: sha256,
        })
        .eq("lead_id", leadId)
        .eq("application_id", applicationId);
      if (error) throw new Error(`supabase stampPdfUploaded: ${error.message}`);
    },
  };
}

if (import.meta.main) {
  const secrets: SyncSecrets = {
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    supabaseServiceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    mamamiaEndpoint: Deno.env.get("MAMAMIA_ENDPOINT")!,
    mamamiaAuthEndpoint: Deno.env.get("MAMAMIA_AUTH_ENDPOINT")!,
    mamamiaAgencyEmail: Deno.env.get("MAMAMIA_AGENCY_EMAIL")!,
    mamamiaAgencyPassword: Deno.env.get("MAMAMIA_AGENCY_PASSWORD")!,
    kostenrechnerUrl: Deno.env.get("KOSTENRECHNER_URL")!,
  };
  const deps: HandlerDeps = {
    secrets,
    store: makeRealStore(secrets.supabaseUrl, secrets.supabaseServiceKey),
  };
  Deno.serve((req) => handleRequest(req, deps));
}
