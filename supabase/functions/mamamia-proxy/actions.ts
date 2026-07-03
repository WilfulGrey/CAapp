import { mamamiaRequest } from "../_shared/mamamiaClient.ts";
import { loginAsAgency, panelMutateAsCustomer } from "../_shared/mamamiaPanelClient.ts";
import type { ActionDeps, ActionHandler, ProxyAction, SessionPayload } from "./types.ts";
import {
  buildLeadJobRows,
  deriveLeadJobStatus,
  enrichBewerbungen,
  GET_CUSTOMER_JOB_OFFERS,
  GET_JOB_OFFER_APPLICATION_COUNT,
  type RawJobOffer,
  todayISO,
} from "../_shared/leadJobsSync.ts";
// Re-export so existing importers (e.g. _tests/actions.test.ts) keep working
// after the derivation moved to _shared.
export { deriveLeadJobStatus };
import {
  GENERATE_CAREGIVER_GERMAN_DESCRIPTION,
  GET_CAREGIVER,
  GET_CUSTOMER,
  GET_JOB_OFFER,
  LIST_APPLICATIONS,
  LIST_INTERESTS,
  LIST_INVITED_CAREGIVER_IDS,
  LIST_MATCHINGS,
  REJECT_APPLICATION,
  SEARCH_LOCATIONS,
  STORE_CONFIRMATION,
  STORE_REQUEST,
  UPDATE_CUSTOMER,
  UPDATE_JOB_OFFER_DATES,
} from "./operations.ts";

// ─── Helper — run GraphQL with agency token ─────────────────────────────────

async function runGraphQL<T>(
  deps: ActionDeps,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  // Resilienz gegen VORÜBERGEHENDE Mamamia-Ausfälle (2026-06-26: Matchings
  // 500'ten für ein paar Minuten → Kunden sahen 0 Pflegekräfte). Nur
  // Lese-Queries (`query ...`) werden wiederholt — Mutationen NICHT (könnten
  // sonst doppelt anwenden). Validierungs-/Auth-Fehler tragen `cat=` und
  // werden NICHT wiederholt (kein Selbstheilen durch Retry). Max 3 Versuche,
  // kurzer Backoff.
  const isRead = /^\s*query\b/.test(query);
  const maxAttempts = isRead ? 3 : 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await mamamiaRequest<T>({
        endpoint: deps.endpoint,
        token: await deps.getAgencyToken(),
        query,
        variables,
        fetchFn: deps.fetchFn,
      });
    } catch (e) {
      lastErr = e;
      const msg = (e as Error)?.message ?? "";
      // letzter Versuch ODER nicht-vorübergehender Fehler (cat=) → durchreichen
      if (attempt === maxAttempts - 1 || /\bcat=/.test(msg)) break;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}


// ─── Reference certificates (Referenz_*.pdf) ───────────────────────────────
//
// The `Caregiver.certificates` RELATION 500s the Mamamia backend ("Internal
// server error") — verified live on prod CG 12082 + beta CG 10099. The
// top-level `CaregiverCertificates(caregiver_id:)` query is the working path
// (same source the Mamamia UI uses; see reference-builder
// docs/mamamia-integration.md §4.1). We fetch it here and merge the File
// objects back onto each caregiver as `.certificates`, so the frontend
// mapper (mapCaregiverToNurse → pickNewestReferenceUrl) sees the reference
// uploads without any client change. Batched via GraphQL aliases so a whole
// matchings/applications list costs one extra round-trip.
type CertFile = { original_name?: string | null; aws_url?: string | null; created_at?: string | null; mime_type?: string | null };

// Only reference uploads cross the proxy boundary to the customer's browser.
// A caregiver's certificates relation can hold unrelated/sensitive docs
// (verification scans, internal samples) — we surface ONLY files named
// `Referenz_*.pdf` (the reference PDFs), and only those with a usable
// aws_url. Filtering server-side keeps non-reference filenames off the wire
// (privacy — cf. Bug #123 caregiver-PII leak to customer).
const REFERENCE_FILE_RE = /^Referenz_.*\.pdf$/i;
function referenceFilesOnly(files: Array<{ file?: CertFile | null } | CertFile | null | undefined>): CertFile[] {
  return files
    .map((x) => (x && "file" in (x as object) ? (x as { file?: CertFile | null }).file : (x as CertFile | null)))
    .filter((f): f is CertFile =>
      !!f && !!f.aws_url && REFERENCE_FILE_RE.test(f.original_name ?? "")
    );
}

async function fetchCertificatesByCaregiver(
  deps: ActionDeps,
  ids: number[],
): Promise<Map<number, CertFile[]>> {
  const out = new Map<number, CertFile[]>();
  const unique = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
  if (unique.length === 0) return out;
  // Cap batch size defensively — portal lists are limit=20, but guard
  // against an unexpectedly large set blowing Mamamia's query complexity.
  const capped = unique.slice(0, 50);
  const aliases = capped
    .map((id) => `c${id}: CaregiverCertificates(caregiver_id: ${id}) { file { original_name aws_url created_at mime_type } }`)
    .join("\n");
  const query = `query BatchCerts {\n${aliases}\n}`;
  let data: Record<string, Array<{ file?: CertFile | null }> | null>;
  try {
    data = await runGraphQL(deps, query, {});
  } catch (e) {
    // References are a best-effort trust signal — NEVER fail the list/profile
    // load because the cert batch errored. Log + return empty (no badges).
    console.warn(`[certs] batch fetch failed: ${(e as Error).message}`);
    return out;
  }
  for (const id of capped) {
    const files = referenceFilesOnly(data[`c${id}`] ?? []);
    if (files.length > 0) out.set(id, files);
  }
  return out;
}

// ─── Ownership-bound actions (session overrides client variables) ───────────

const getJobOffer: ActionHandler = (session, _variables, deps) =>
  runGraphQL(deps, GET_JOB_OFFER, { id: session.job_offer_id });

const getCustomer: ActionHandler = (session, _variables, deps) =>
  runGraphQL(deps, GET_CUSTOMER, { id: session.customer_id });

const listApplications: ActionHandler = async (session, variables, deps) => {
  const { limit, page } = variables as { limit?: number; page?: number };
  const r = await runGraphQL<{
    JobOfferApplicationsWithPagination: { data: Array<{ caregiver: Record<string, unknown> | null }> };
  }>(deps, LIST_APPLICATIONS, {
    job_offer_id: session.job_offer_id,
    limit: limit ?? 20,
    page: page ?? 1,
  });
  const rows = r.JobOfferApplicationsWithPagination?.data ?? [];
  const certMap = await fetchCertificatesByCaregiver(
    deps,
    rows.map((a) => a.caregiver?.id as number).filter((n): n is number => typeof n === "number"),
  );
  for (const a of rows) {
    const id = a.caregiver?.id as number | undefined;
    if (a.caregiver && typeof id === "number" && certMap.has(id)) {
      a.caregiver.certificates = certMap.get(id);
    }
  }
  return r;
};

const listMatchings: ActionHandler = async (session, variables, deps) => {
  const { limit, page, filters, order_by } = variables as {
    limit?: number;
    page?: number;
    filters?: Record<string, unknown>;
    order_by?: string;
  };
  // Only pass non-empty filters/order_by — Mamamia default if undefined.
  const payload: Record<string, unknown> = {
    job_offer_id: session.job_offer_id,
    limit: limit ?? 20,
    page: page ?? 1,
  };
  if (filters && Object.keys(filters).length > 0) payload.filters = filters;
  if (typeof order_by === "string" && order_by.length > 0) payload.order_by = order_by;
  const r = await runGraphQL<{
    JobOfferMatchingsWithPagination: { data: Array<{ caregiver: Record<string, unknown> | null }> };
  }>(deps, LIST_MATCHINGS, payload);
  const rows = r.JobOfferMatchingsWithPagination?.data ?? [];
  const certMap = await fetchCertificatesByCaregiver(
    deps,
    rows.map((m) => m.caregiver?.id as number).filter((n): n is number => typeof n === "number"),
  );
  for (const m of rows) {
    const id = m.caregiver?.id as number | undefined;
    if (m.caregiver && typeof id === "number" && certMap.has(id)) {
      m.caregiver.certificates = certMap.get(id);
    }
  }
  return r;
};

// Returns the set of caregiver IDs that already have an invite Request
// against this customer's job offer. Frontend uses it to render
// status='invited' on first load — without this the portal can't tell
// invited cgs apart from un-invited ones across page refreshes.
//
// We unwrap the GraphQL pagination shape into a flat { caregiver_ids }
// payload so the client doesn't have to relearn it.
const listInvitedCaregiverIds: ActionHandler = async (session, _variables, deps) => {
  const r = await runGraphQL<{
    JobOfferMatchingsWithPagination: {
      total: number;
      data: Array<{ caregiver: { id: number } }>;
    };
  }>(deps, LIST_INVITED_CAREGIVER_IDS, { job_offer_id: session.job_offer_id });
  const ids = r.JobOfferMatchingsWithPagination.data.map(m => m.caregiver.id);
  return { caregiver_ids: ids };
};

// ─── Public/open actions (id from variables) ────────────────────────────────

const getCaregiver: ActionHandler = async (_session, variables, deps) => {
  const id = (variables as { id?: unknown }).id;
  if (typeof id !== "number") throw new Error("id required");
  // GET_CAREGIVER fetches Caregiver(id) + the top-level CaregiverCertificates
  // (the relation 500s — see fetchCertificatesByCaregiver). Merge the cert
  // File objects onto Caregiver.certificates so the frontend mapper sees them
  // identically to the list path.
  const r = await runGraphQL<{
    Caregiver: Record<string, unknown> | null;
    CaregiverCertificates?: Array<{ file?: CertFile | null }> | null;
  }>(deps, GET_CAREGIVER, { id });
  if (r.Caregiver) {
    r.Caregiver.certificates = referenceFilesOnly(r.CaregiverCertificates ?? []);
  }
  // Return only Caregiver — frontend reads data.Caregiver; the sibling
  // CaregiverCertificates is now merged in.
  return { Caregiver: r.Caregiver };
};

const searchLocations: ActionHandler = (_session, variables, deps) => {
  const { search, limit, page } = variables as {
    search?: string;
    limit?: number;
    page?: number;
  };
  return runGraphQL(deps, SEARCH_LOCATIONS, {
    search: search ?? "",
    limit: limit ?? 10,
    page: page ?? 1,
  });
};

// ─── Ownership check for application-bound mutations ───────────────────────
// Any mutation that targets an Application must first verify the application
// belongs to session.job_offer_id — otherwise a malicious client could reject
// arbitrary applications across tenants.

const ASSERT_APP_BELONGS = /* GraphQL */ `
  query AssertAppBelongs($job_offer_id: Int!) {
    JobOfferApplicationsWithPagination(job_offer_id: $job_offer_id, limit: 100, page: 1) {
      data { id }
    }
  }
`;

async function assertApplicationBelongsToSession(
  deps: ActionDeps,
  session: SessionPayload,
  applicationId: number,
): Promise<void> {
  const res = await mamamiaRequest<{
    JobOfferApplicationsWithPagination: { data: Array<{ id: number }> };
  }>({
    endpoint: deps.endpoint,
    token: await deps.getAgencyToken(),
    query: ASSERT_APP_BELONGS,
    variables: { job_offer_id: session.job_offer_id },
    fetchFn: deps.fetchFn,
  });
  const ids = new Set(res.JobOfferApplicationsWithPagination.data.map((a) => a.id));
  if (!ids.has(applicationId)) {
    throw new Error("forbidden: application not owned by session");
  }
}

const rejectApplication: ActionHandler = async (session, variables, deps) => {
  const v = variables as { application_id?: unknown; reject_message?: unknown };
  const appId = v.application_id;
  if (typeof appId !== "number") throw new Error("application_id required");
  await assertApplicationBelongsToSession(deps, session, appId);
  return await runGraphQL(deps, REJECT_APPLICATION, {
    id: appId,
    reject_message: typeof v.reject_message === "string" ? v.reject_message : null,
  });
};

// ─── Accept: StoreConfirmation ─────────────────────────────────────────────
// Creates binding Confirmation with contract_patient/contract_contact taken
// 1:1 from AngebotPruefenModal step-2 form. Ownership via prefetch of
// JobOfferApplicationsWithPagination(session.job_offer_id) — we verify
// application belongs before we call StoreConfirmation.

const CONTRACT_PATIENT_ALLOWED = new Set([
  "contact_type",
  "is_same_as_first_patient",
  "is_same_as_contact",
  "location_id",
  "location_custom_text",
  "salutation",
  "title",
  "first_name",
  "last_name",
  "phone",
  "email",
  "street_number",
  "zip_code",
  "city",
]);

const CONTRACT_CONTACT_ALLOWED = new Set([
  "is_same_as_first_patient",
  "location_id",
  "location_custom_text",
  "salutation",
  "title",
  "first_name",
  "last_name",
  "phone",
  "email",
  "street_number",
  "zip_code",
  "city",
]);

function pickAllowed(input: unknown, allowed: Set<string>): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

const storeConfirmation: ActionHandler = async (session, variables, deps) => {
  const v = variables as {
    application_id?: unknown;
    message?: unknown;
    is_confirm_binding?: unknown;
    contract_patient?: unknown;
    contract_contact?: unknown;
    patient_contracts?: unknown;
    contract_contacts?: unknown;
    update_customer?: unknown;
    file_tokens?: unknown;
  };
  const appId = v.application_id;
  if (typeof appId !== "number") throw new Error("application_id required");
  await assertApplicationBelongsToSession(deps, session, appId);

  const payload: Record<string, unknown> = {
    application_id: appId,
    message: typeof v.message === "string" ? v.message : null,
    is_confirm_binding: v.is_confirm_binding === true,
    update_customer: v.update_customer === true,
    contract_patient: pickAllowed(v.contract_patient, CONTRACT_PATIENT_ALLOWED),
    contract_contact: pickAllowed(v.contract_contact, CONTRACT_CONTACT_ALLOWED),
    patient_contracts: Array.isArray(v.patient_contracts)
      ? v.patient_contracts.map((p) => pickAllowed(p, CONTRACT_PATIENT_ALLOWED)).filter(Boolean)
      : null,
    contract_contacts: Array.isArray(v.contract_contacts)
      ? v.contract_contacts.map((c) => pickAllowed(c, CONTRACT_CONTACT_ALLOWED)).filter(Boolean)
      : null,
    file_tokens: Array.isArray(v.file_tokens) ? v.file_tokens.filter((t) => typeof t === "string") : null,
  };

  return await runGraphQL(deps, STORE_CONFIRMATION, payload);
};

// ─── Invite caregiver ──────────────────────────────────────────────────────
// Mutation: StoreRequest(caregiver_id, job_offer_id, message).
//
// This is the mutation Mamamia's own panel UI fires when an agency admin
// clicks "wyślij zaproszenie" on a customer's matching list. Verified live
// on beta 2026-04-28 by inspecting DevTools network log on a real panel
// session — operationName="StoreRequest", returns Request{id, ...}.
//
// Auth model: panel /graphql + agency-only session cookie. Mamamia's
// panel-side policy accepts a service-agency admin owning the customer
// directly, provided customer.status='active' (which our onboard payload
// achieves by setting Customer.arrival_at — see onboard-to-mamamia/mappers.ts).
//
// **Known limitation on preprod (Bug #17, 2026-05-12)**: the agency-admin
// account hardcoded behind MAMAMIA_AGENCY_EMAIL/PASSWORD on preprod tenant
// does NOT have permission to invoke StoreRequest. Live diagnosis showed
// Mamamia returns HTTP 200 + GraphQL `Unauthorized` (extensions.category=
// "authorization") for both `StoreRequest` (Bearer + panel-session) and
// `ImpersonateCustomer(customer_id)` — same policy gate. The same
// credentials work on beta. Resolution requires Mamamia ops to grant the
// preprod agency user matching permissions, OR a different agency cred
// with elevated role.
//
// Why not SendInvitationCaregiver: that mutation is customer-side
// (auth.user must be the customer), used by Mamamia's customer portal.
// It is unrelated to the agency-side invite flow we need.
// ─── Rate limit constants ───────────────────────────────────────────────────
//
// Cap how many caregivers a customer can invite per rolling time window.
// Goal: prevent buyer's-remorse spam — customer invites 20 caregivers in
// 30 seconds because the UI lets them, then complains about getting 20
// uncoordinated replies. The wait forces deliberation + gives the first
// invitees a chance to respond before the customer adds more.
//
// Ledger lives in `caregiver_invite_attempts` (Supabase). Source of truth
// is OUR table, not Mamamia.Request entity — because the portal renders
// invite as "wysłano" optimistically and a 6-click burst would race
// Mamamia's persistence (~1-2s). Our row is written server-side INSIDE
// the proxy after StoreRequest succeeds, so the count is authoritative.
const INVITE_LIMIT = 5;
const INVITE_WINDOW_MINUTES = 60;

type RateLimitError = Error & {
  rateLimited: true;
  retry_after_seconds: number;
  limit: number;
  window_minutes: number;
  used: number;
};

function makeRateLimitError(retryAfterSeconds: number, used: number): RateLimitError {
  const err = new Error("rate-limited") as RateLimitError;
  err.rateLimited = true;
  err.retry_after_seconds = retryAfterSeconds;
  err.limit = INVITE_LIMIT;
  err.window_minutes = INVITE_WINDOW_MINUTES;
  err.used = used;
  return err;
}

const inviteCaregiver: ActionHandler = async (session, variables, deps) => {
  const id = (variables as { caregiver_id?: unknown }).caregiver_id;
  if (typeof id !== "number") throw new Error("caregiver_id required");
  const message = (variables as { message?: unknown }).message;
  if (!deps.panelBaseUrl || !deps.agencyEmail || !deps.agencyPassword) {
    throw new Error("panel auth not configured");
  }
  if (!deps.supabase) {
    throw new Error("supabase adapter required for invite rate limiting");
  }

  // ── Rate-limit gate ──────────────────────────────────────────────────
  // Check BEFORE Mamamia call so 6th attempt is rejected without polluting
  // Mamamia (no orphan StoreRequest that we'd never count). Concurrency
  // race: two near-simultaneous 5th-and-6th can both pass the count==4
  // check and both proceed. Acceptable — drift of 1 invite over rolling
  // hour is harmless vs the engineering cost of distributed lock.
  const used = await deps.supabase.countRecentInviteAttempts(
    session.lead_id,
    INVITE_WINDOW_MINUTES,
    session.job_offer_id,
  );
  if (used >= INVITE_LIMIT) {
    const oldest = await deps.supabase.oldestInviteAttemptWithin(
      session.lead_id,
      INVITE_WINDOW_MINUTES,
      session.job_offer_id,
    );
    // oldest + window = the moment the oldest row "ages out" of the
    // window, freeing one slot. Anything sooner is undefined-precision.
    const retryAt = oldest
      ? oldest.getTime() + INVITE_WINDOW_MINUTES * 60_000
      : Date.now() + INVITE_WINDOW_MINUTES * 60_000;
    const retryAfterSeconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
    console.log(
      `[inviteCaregiver][rate-limited] lead=${session.lead_id} used=${used}/${INVITE_LIMIT} retry_after=${retryAfterSeconds}s`,
    );
    throw makeRateLimitError(retryAfterSeconds, used);
  }

  const panelSession = await loginAsAgency(
    { baseUrl: deps.panelBaseUrl, fetchFn: deps.fetchFn },
    deps.agencyEmail,
    deps.agencyPassword,
  );
  const result = await panelMutateAsCustomer(
    { baseUrl: deps.panelBaseUrl, fetchFn: deps.fetchFn },
    panelSession,
    STORE_REQUEST,
    {
      caregiver_id: id,
      job_offer_id: session.job_offer_id,
      message: typeof message === "string" ? message : null,
    },
    "StoreRequest",
  );

  // Record AFTER Mamamia success — failed panel calls (Bug #17 race,
  // network glitch) must NOT consume the user's quota. Best-effort: if
  // the ledger write itself fails, log and surface the Mamamia result
  // anyway. Worst case the next attempt re-counts and gets a free slot
  // we already used — drift of 1, same magnitude as the race above.
  try {
    await deps.supabase.recordInviteAttempt(session.lead_id, id, session.job_offer_id);
  } catch (e) {
    console.warn(
      `[inviteCaregiver][record-failed] lead=${session.lead_id} cg=${id} err=${(e as Error).message}`,
    );
  }

  // "Neue Pflegekräfte verfügbar"-Mail auf +24h planen (reschedule bei jeder
  // Einladung → 24h ab der letzten). Best-effort — darf die Einladung nie kippen.
  try {
    await deps.supabase.scheduleNeuePflegekraefteMail?.(session.lead_id);
  } catch (e) {
    console.warn(
      `[inviteCaregiver][schedule-mail-failed] lead=${session.lead_id} err=${(e as Error).message}`,
    );
  }

  return result;
};

// ─── getInviteRateState — read-only quota snapshot for the UI ──────────────
//
// Lets the portal pre-emptively decide: "this is the user's 5th click,
// I should warn them next click won't go through" or "they're at 5 of 5
// already, disable the button + show a modal with the wait time".
//
// Distinct from inviteCaregiver: this NEVER calls Mamamia, never records
// anything — just reads the ledger. Cheap to refetch after any action
// the UI takes (after a successful invite, periodically as countdown).
const getInviteRateState: ActionHandler = async (session, _variables, deps) => {
  if (!deps.supabase) {
    throw new Error("supabase adapter required for getInviteRateState");
  }
  const used = await deps.supabase.countRecentInviteAttempts(
    session.lead_id,
    INVITE_WINDOW_MINUTES,
    session.job_offer_id,
  );
  // 24h-Fenster für die Portal-Reveal-Logik: so viele Pflegekraft-Slots sind
  // aktuell "gehalten" (eingeladen, wartet auf Antwort). Sichtbarer Pool =
  // 5 − used_24h; nach 24h fällt jede Einladung aus dem Fenster → Pool füllt
  // sich wieder auf. Unabhängig vom 60-Min-Rate-Limit oben.
  const used24h = await deps.supabase.countRecentInviteAttempts(
    session.lead_id,
    24 * 60,
    session.job_offer_id,
  );
  const oldest = used > 0
    ? await deps.supabase.oldestInviteAttemptWithin(session.lead_id, INVITE_WINDOW_MINUTES, session.job_offer_id)
    : null;
  const retryAfterSeconds = used >= INVITE_LIMIT && oldest
    ? Math.max(
      1,
      Math.ceil(
        (oldest.getTime() + INVITE_WINDOW_MINUTES * 60_000 - Date.now()) / 1000,
      ),
    )
    : 0;
  return {
    used,
    used_24h: used24h,
    limit: INVITE_LIMIT,
    window_minutes: INVITE_WINDOW_MINUTES,
    oldest_at: oldest ? oldest.toISOString() : null,
    retry_after_seconds: retryAfterSeconds,
    blocked: used >= INVITE_LIMIT,
  };
};

// ─── listLeadJobs — Multi-Job overview ("Alle meine Einsätze") ──────────────
//
// Lists every job of the lead behind the session. LEAD-scoped via
// session.lead_id (the "domownik mieszkania" residency in the signed JWT) —
// NOT job-scoped, so even a job-scoped session (Variant A: session carries a
// current job_offer_id) can still step back to the full overview. Read-only;
// rows come from lead_jobs (mirror of Mamamia JobOffers, populated by the
// Phase-2 sync). The 'laufend' status is derived in the frontend.
// ─── Multi-Job sync (Phase 2A): lead_jobs ← Mamamia Customer.job_offers ─────

// Pull the customer's job offers from Mamamia and mirror them into lead_jobs.
// Derivation + row-building live in _shared/leadJobsSync.ts (shared with the
// detect-caregiver-events background cron). Best-effort — callers wrap this; a
// sync failure must never break the read.
async function syncLeadJobsFromMamamia(deps: ActionDeps, session: SessionPayload): Promise<void> {
  if (!deps.supabase?.upsertLeadJobs) return;
  const r = await runGraphQL<{ Customer: { job_offers?: RawJobOffer[] | null } | null }>(
    deps, GET_CUSTOMER_JOB_OFFERS, { id: session.customer_id },
  );
  const { rows, skipped } = buildLeadJobRows(r.Customer?.job_offers ?? [], todayISO());
  for (const s of skipped) {
    console.warn(`[syncLeadJobs] lead=${session.lead_id} jo=${s.id} unmapped status=${s.raw} — skipped`);
  }
  await enrichBewerbungen(rows, async (jobOfferId) => {
    const c = await runGraphQL<{ JobOfferApplicationsWithPagination?: { total?: number | null } | null }>(
      deps, GET_JOB_OFFER_APPLICATION_COUNT, { job_offer_id: jobOfferId },
    );
    return c.JobOfferApplicationsWithPagination?.total ?? null;
  });
  if (rows.length > 0) await deps.supabase.upsertLeadJobs(session.lead_id, rows);
}

const listLeadJobs: ActionHandler = async (session, _variables, deps) => {
  if (!deps.supabase) {
    throw new Error("supabase adapter required for listLeadJobs");
  }
  // Best-effort refresh from Mamamia before reading — the overview is exactly
  // when fresh job data matters. A sync failure must NOT break the read.
  try {
    await syncLeadJobsFromMamamia(deps, session);
  } catch (e) {
    console.warn(`[listLeadJobs] sync failed for lead ${session.lead_id}: ${(e as Error).message}`);
  }
  const jobs = await deps.supabase.selectLeadJobs(session.lead_id);
  return { jobs };
};


// ─── Mutations — strict allowlist + ownership ───────────────────────────────

const UPDATE_CUSTOMER_ALLOWED = new Set([
  "first_name",
  "last_name",
  "email",
  "phone",
  "location_id",
  "location_custom_text",
  "urbanization_id",
  // job_description: base + _de mirror the Mamamia panel's manual-save
  // payload (verified live on customer 8528, 2026-05-15). Backend AI
  // translator handles _en/_pl from the German source automatically.
  "job_description",
  "job_description_de",
  "accommodation",
  "caregiver_accommodated",
  "other_people_in_house",
  "has_family_near_by",
  "smoking_household",
  "internet",
  "day_care_facility",
  // day_care_facility_description: base + _de only.
  "day_care_facility_description",
  "day_care_facility_description_de",
  "caregiver_time_off",
  "pets",
  "is_pet_dog",
  "is_pet_cat",
  "is_pet_other",
  "equipment_ids",
  "patients",
  "customer_caregiver_wish",
  // Bug #13l (2026-05-07, beta Mamamia): mamamia panel "Lokalizacja opieki"
  // reads from customer_contract.location_id (NOT just Customer.location_id
  // top level). Patient form save propaguje resolved location_id na
  // customer_contract żeby panel renderował.
  //
  // Bug #16 (2026-05-12, prod Mamamia switch): pierwotnie pisaliśmy
  // `patient_contracts: [...]` + `invoice_contract: {...}` (beta-only
  // schema extension z N contracts per customer + contact_type discriminator).
  // Prod ma legacy singular schema: `customer_contract` 1:1 z customer.
  // Refactor na singular — universal, działa na obu środowiskach.
  "customer_contract",
]);

// Whitelist for the nested customer_caregiver_wish object — keep tight
// so we never leak unintended wish fields from a malicious client body.
const WISH_ALLOWED = new Set([
  "gender",
  "germany_skill",
  "driving_license",
  "driving_license_gearbox",
  "smoking",
  "shopping",
  "tasks",
  "tasks_de",
  "other_wishes",
  "other_wishes_de",
]);

function pickAllowedWish(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (WISH_ALLOWED.has(k)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Mamamia gotcha: UpdateCustomer treats omitted association inputs as
// "wipe to empty". We learned this the hard way after the in-portal
// patient form save (proxy.updateCustomer) silently zeroed out:
//   • Customer.equipments  (TV / bathroom / kitchen / others)
//   • Patient.tools        (rollator / walking stick / hoist)
//   • customer_caregiver_wish.germany_skill  (desired language level)
//   • customer_caregiver_wish.driving_license (license requirement)
// — all populated by the onboard mapper, all wiped on first
// UpdateCustomer call because the client doesn't carry them in its
// patch. Fix: re-fetch current values and re-pass them whenever the
// caller didn't explicitly provide their own.
const PRESERVE_QUERY = /* GraphQL */ `
  query PreserveAssociations($id: Int!) {
    Customer(id: $id) {
      equipments { id }
      patients { id tools { id } }
      customer_caregiver_wish {
        germany_skill
        driving_license
      }
    }
  }
`;

interface PreserveData {
  Customer: {
    equipments: Array<{ id: number }>;
    patients: Array<{ id: number; tools: Array<{ id: number }> }>;
    customer_caregiver_wish: {
      germany_skill: string | null;
      driving_license: string | null;
    } | null;
  };
}

const updateCustomer: ActionHandler = async (session, variables, deps) => {
  // ───── DEBUG TRACE — TEMP, revert via PR after diagnosis ─────
  console.log(`[DBG][updateCustomer][1-IN] cid=${session.customer_id} keys=${JSON.stringify(Object.keys(variables as Record<string, unknown>).sort())}`);
  console.log(`[DBG][updateCustomer][1-IN-FULL] cid=${session.customer_id} ${JSON.stringify(variables).slice(0, 12000)}`);
  // ─────────────────────────────────────────────────────────────
  const patch: Record<string, unknown> = { id: session.customer_id };
  for (const [k, v] of Object.entries(variables)) {
    if (k === "customer_caregiver_wish") {
      const wish = pickAllowedWish(v);
      if (wish) patch.customer_caregiver_wish = wish;
    } else if (UPDATE_CUSTOMER_ALLOWED.has(k)) {
      patch[k] = v;
    }
  }
  console.log(`[DBG][updateCustomer][2-POSTFILTER] cid=${session.customer_id} ${JSON.stringify(patch).slice(0, 12000)}`);

  // Mamamia preprod backend regression (verified 2026-05-14 via bisection):
  // UpdateCustomer resolver NPE's when `patients` is null or omitted. An
  // empty array passes through fine. Always default to [] so partial saves
  // that don't touch patients (e.g. customer-only changes) still go through.
  if (!("patients" in patch)) {
    patch.patients = [];
  }

  // ── Preserve associations + wish scalars the caller didn't touch ──
  // Always re-fetch current Customer.equipments, per-patient tools, and
  // customer_caregiver_wish scalars (germany_skill, driving_license) and
  // pass them back unless the caller explicitly supplied their own.
  const needsEquipmentPreserve = !("equipment_ids" in patch);
  const patientPatches = Array.isArray(patch.patients) ? patch.patients : null;
  const needsToolPreserve = !!patientPatches && patientPatches.some((p) =>
    p && typeof p === "object" && !("tool_ids" in (p as Record<string, unknown>))
  );
  const wishPatch = patch.customer_caregiver_wish as Record<string, unknown> | undefined;
  const needsWishPreserve = !!wishPatch && (
    !("germany_skill" in wishPatch) || !("driving_license" in wishPatch)
  );

  if (needsEquipmentPreserve || needsToolPreserve || needsWishPreserve) {
    try {
      const current = await runGraphQL<PreserveData>(deps, PRESERVE_QUERY, {
        id: session.customer_id,
      });

      if (needsEquipmentPreserve) {
        patch.equipment_ids = current.Customer.equipments.map((e) => e.id);
      }

      if (needsToolPreserve && patientPatches) {
        const toolsByPatientId = new Map<number, number[]>();
        for (const p of current.Customer.patients) {
          toolsByPatientId.set(p.id, p.tools.map((t) => t.id));
        }
        patch.patients = patientPatches.map((p) => {
          if (!p || typeof p !== "object") return p;
          const pp = p as Record<string, unknown>;
          if ("tool_ids" in pp) return pp;
          const id = typeof pp.id === "number" ? pp.id : null;
          if (id == null) return pp;
          const existing = toolsByPatientId.get(id);
          if (!existing) return pp;
          return { ...pp, tool_ids: existing };
        });
      }

      if (needsWishPreserve && wishPatch) {
        const cw = current.Customer.customer_caregiver_wish;
        if (cw) {
          if (!("germany_skill" in wishPatch) && cw.germany_skill) {
            wishPatch.germany_skill = cw.germany_skill;
          }
          if (!("driving_license" in wishPatch) && cw.driving_license) {
            wishPatch.driving_license = cw.driving_license;
          }
        }
      }
    } catch (e) {
      // Preserve fetch failed — log but proceed; better to apply the
      // user's update than to block the save on a defensive read.
      console.warn("updateCustomer preserve fetch failed:", (e as Error).message);
    }
  }

  console.log(`[DBG][updateCustomer][3-BEFORE-GQL] cid=${session.customer_id} ${JSON.stringify(patch).slice(0, 12000)}`);
  return runGraphQL(deps, UPDATE_CUSTOMER, patch);
};

// ─── updateJobDescription — narrow write for the AI overlay ────────────────
//
// Writes ONLY customer.job_description. The patient-form save flow on the
// portal first lands a complete mechanical patch via `updateCustomer`
// (above) — every association reaches Mamamia in that single write, and the
// invite gate opens as soon as it succeeds. AI Sonnet then runs in the
// background and the polished summary lands via this action, without
// touching any other field.
//
// Why a dedicated action instead of reusing `updateCustomer` with a thin
// `{ job_description }` payload:
//   • Mamamia treats omitted associations as "wipe to empty" — a thin
//     payload would null out patients, equipments, wish scalars.
//   • `updateCustomer`'s defensive `patches = []` default (workaround for a
//     Mamamia preprod NPE on null patients) means a thin payload would even
//     ACTIVELY wipe patients. Verified live on customer 8506.
//
// Fix: re-fetch current patients[].id and equipments[].id and re-pass them
// as bare-id stubs. Mamamia merges by id on the patients relation, so a
// stub `{ id: X }` is a no-op for that patient's scalar fields. Same for
// equipment_ids — re-passing the current ids is idempotent. The rest of
// the customer state (wish, contract, location, accommodation, ...) stays
// untouched because Mamamia merges the customer scalar fields, only
// associations follow the "omitted = wipe" rule.
const updateJobDescription: ActionHandler = async (session, variables, deps) => {
  const text = (variables as { text?: unknown }).text;
  console.log(`[DBG][updateJobDescription][1-IN] cid=${session.customer_id} text=${JSON.stringify(text).slice(0, 2000)}`);
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("text required (non-empty string)");
  }

  const current = await runGraphQL<{
    Customer: {
      patients: Array<{ id: number }>;
      equipments: Array<{ id: number }>;
    };
  }>(deps, /* GraphQL */ `
    query PreservePatientsAndEquipments($id: Int!) {
      Customer(id: $id) {
        patients { id }
        equipments { id }
      }
    }
  `, { id: session.customer_id });

  const payload = {
    id: session.customer_id,
    // base + _de mirror Mamamia panel manual-save (verified live
    // customer 8528, 2026-05-15). Backend AI translator handles
    // _en/_pl from the German source automatically.
    job_description: text,
    job_description_de: text,
    patients: current.Customer.patients.map((p) => ({ id: p.id })),
    equipment_ids: current.Customer.equipments.map((e) => e.id),
  };
  console.log(`[DBG][updateJobDescription][2-BEFORE-GQL] ${JSON.stringify(payload).slice(0, 4000)}`);
  return runGraphQL(deps, UPDATE_CUSTOMER, payload);
};

// ─── updateJobOfferDates — set JobOffer.arrival_at + .departure_at ─────────
//
// Initial arrival_at is computed at onboard time as a fuzzy offset from
// lead.care_start_timing (`computeArrivalDate` in onboard.ts). After PR
// #207 (2026-05-26) the patient form Step 5 has a concrete "Voraussichtliches
// Startdatum" picker — the customer's explicit pick wins over the onboard
// heuristic. Frontend fires this action right after `updateCustomer`
// succeeds when the picked date differs from the JobOffer's current
// arrival_at.
//
// Ownership: `id` (JobOffer id) and `customer_id` are forced from the
// session JWT, NOT from the request body. Caller cannot alter another
// customer's JobOffer even if they swap IDs in the payload.
//
// Inputs (from request body):
//   arrival_at?:  string ISO YYYY-MM-DD or null  — only field the portal currently writes
//   departure_at?: string                         — schema-supported, not yet surfaced in UI
//
// Both args are optional from the API's perspective; in practice the
// frontend always sends arrival_at when the user picked a date. Empty
// strings are coerced to null (Mamamia distinguishes "" from null — null
// means "clear", "" can be rejected as invalid format).
const updateJobOfferDates: ActionHandler = async (session, variables, deps) => {
  const v = variables as { arrival_at?: unknown; departure_at?: unknown };

  const sanitize = (x: unknown): string | null | undefined => {
    if (x === undefined) return undefined;
    if (x === null) return null;
    if (typeof x !== "string") {
      throw new Error("arrival_at / departure_at must be string (ISO YYYY-MM-DD) or null");
    }
    const trimmed = x.trim();
    return trimmed === "" ? null : trimmed;
  };

  const payload: Record<string, unknown> = {
    id: session.job_offer_id,
    customer_id: session.customer_id,
  };

  const arrival = sanitize(v.arrival_at);
  if (arrival !== undefined) payload.arrival_at = arrival;

  const departure = sanitize(v.departure_at);
  if (departure !== undefined) payload.departure_at = departure;

  // Nothing to update → no-op. (Frontend shouldn't call us with empty
  // payload, but be defensive.)
  if (!("arrival_at" in payload) && !("departure_at" in payload)) {
    return { id: session.job_offer_id, skipped: "no date fields supplied" };
  }

  console.log(`[DBG][updateJobOfferDates] cid=${session.customer_id} jid=${session.job_offer_id} arrival_at=${payload.arrival_at ?? "(unchanged)"} departure_at=${payload.departure_at ?? "(unchanged)"}`);

  return runGraphQL(deps, UPDATE_JOB_OFFER_DATES, payload);
};

// ─── generateJobDescription — AI-generated care situation summary ──────────
//
// Calls Anthropic Messages API (claude-haiku-3-5) to produce a 2–3 sentence
// human-readable summary of the care situation. Used as `job_description` on
// the Mamamia customer record, replacing the mechanical auto-summary.
//
// Requires ANTHROPIC_API_KEY secret. When missing, returns { description: null }
// so the frontend falls back to the mechanical summary without breaking the
// save flow. Errors are swallowed for the same reason.

interface JobDescriptionInput {
  // Patient 1
  geschlecht?: string;
  geburtsjahr?: string;
  pflegegrad?: string;
  mobilitaet?: string;
  heben?: string;
  demenz?: string;
  inkontinenz?: string;
  nacht?: string;
  diagnosen?: string;
  // Patient 2 (couple flow)
  anzahl?: string;
  p2_geschlecht?: string;
  p2_geburtsjahr?: string;
  p2_pflegegrad?: string;
  p2_mobilitaet?: string;
  p2_demenz?: string;
  // Situation
  ort?: string;
  wohnungstyp?: string;
  urbanisierung?: string;
  familieNahe?: string;
  pflegedienst?: string;
  haushalt?: string;
  aufgaben?: string;
  sonstigeWuensche?: string;
}

function buildPatientDataText(v: JobDescriptionInput): string {
  const lines: string[] = [];
  const couple = v.anzahl === '2';

  // --- Person 1 ---
  const label1 = couple ? 'Person 1' : 'Patient/in';
  if (v.geschlecht) lines.push(`${label1} – Geschlecht: ${v.geschlecht}`);
  if (v.geburtsjahr) {
    const alter = new Date().getFullYear() - Number(v.geburtsjahr);
    if (alter > 0 && alter < 120) lines.push(`${label1} – Alter: ca. ${alter} Jahre`);
  }
  if (v.pflegegrad) lines.push(`${label1} – Pflegegrad: ${v.pflegegrad}`);
  if (v.mobilitaet) lines.push(`${label1} – Mobilität: ${v.mobilitaet}`);
  if (v.heben && v.heben !== 'Nein') lines.push(`${label1} – Heben/Transfer erforderlich`);
  if (v.demenz && v.demenz !== 'Nein') lines.push(`${label1} – Demenz: ${v.demenz}`);
  if (v.inkontinenz && v.inkontinenz !== 'Nein') lines.push(`${label1} – Inkontinenz: ${v.inkontinenz}`);
  if (v.nacht && v.nacht !== 'Nein') lines.push(`${label1} – Nachteinsätze: ${v.nacht}`);
  if (v.diagnosen) lines.push(`${label1} – Diagnosen: ${v.diagnosen}`);

  // --- Person 2 ---
  if (couple) {
    if (v.p2_geschlecht) lines.push(`Person 2 – Geschlecht: ${v.p2_geschlecht}`);
    if (v.p2_geburtsjahr) {
      const alter2 = new Date().getFullYear() - Number(v.p2_geburtsjahr);
      if (alter2 > 0 && alter2 < 120) lines.push(`Person 2 – Alter: ca. ${alter2} Jahre`);
    }
    if (v.p2_pflegegrad) lines.push(`Person 2 – Pflegegrad: ${v.p2_pflegegrad}`);
    if (v.p2_mobilitaet) lines.push(`Person 2 – Mobilität: ${v.p2_mobilitaet}`);
    if (v.p2_demenz && v.p2_demenz !== 'Nein') lines.push(`Person 2 – Demenz: ${v.p2_demenz}`);
  }

  // --- Wohnsituation ---
  if (v.ort) lines.push(`Wohnort: ${v.ort}${v.urbanisierung ? ` (${v.urbanisierung})` : ''}`);
  if (v.wohnungstyp) lines.push(`Wohnsituation: ${v.wohnungstyp}`);
  if (v.familieNahe === 'Ja') lines.push(`Familie in der Nähe: Ja`);
  if (v.haushalt === 'Ja') lines.push(`Weitere Personen im Haushalt: Ja`);
  if (v.pflegedienst && v.pflegedienst !== 'Nein') lines.push(`Pflegedienst: ${v.pflegedienst}`);

  // --- Aufgaben / Wünsche ---
  if (v.aufgaben) lines.push(`Gewünschte Aufgaben: ${v.aufgaben}`);
  if (v.sonstigeWuensche) lines.push(`Sonstige Wünsche: ${v.sonstigeWuensche}`);

  return lines.join('\n');
}

const SYSTEM_PROMPT = `Du fasst Pflegesituationen für Pflegekräfte zusammen.
Schreibe 2–3 natürliche Sätze – klar, menschlich, ehrlich, keine Floskeln.
Die Pflegekraft soll wissen: wen sie betreut, was die Hauptaufgaben sind und wie der Alltag aussieht.
Besonderheiten (Demenz, Nachteinsätze, Pflegedienst) nur erwähnen wenn relevant.
Keine Aufzählungen. Keine Überschriften. Nur Fließtext.
Gib ausschließlich den Beschreibungstext aus — keine Einleitung, keine Erläuterung.`;

const generateJobDescription: ActionHandler = async (_session, variables, deps) => {
  console.log(`[DBG][generateJobDescription][1-IN] hasKey=${!!deps.anthropicApiKey} vars=${JSON.stringify(variables).slice(0, 3000)}`);
  if (!deps.anthropicApiKey) {
    console.log(`[DBG][generateJobDescription][1b-NO-KEY] returning null`);
    return { description: null };
  }

  const input = variables as JobDescriptionInput;
  const dataText = buildPatientDataText(input);
  console.log(`[DBG][generateJobDescription][2-DATATEXT] ${JSON.stringify(dataText).slice(0, 2000)}`);

  if (!dataText.trim()) {
    console.log(`[DBG][generateJobDescription][2b-EMPTY-DATATEXT] returning null`);
    return { description: null };
  }

  try {
    const text = await callAnthropicForText(
      deps.anthropicApiKey,
      SYSTEM_PROMPT,
      `Pflegesituation:\n${dataText}`,
      deps.fetchFn,
    );
    console.log(`[DBG][generateJobDescription][3-RESULT] text=${JSON.stringify(text).slice(0, 2000)}`);
    return { description: text };
  } catch (e) {
    console.error('generateJobDescription failed:', (e as Error).message);
    return { description: null };
  }
};

// Shared Anthropic Messages API helper — used by generateJobDescription.
async function callAnthropicForText(
  apiKey: string,
  system: string,
  userContent: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 350,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    console.error('Anthropic error:', res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const body = await res.json() as { content?: Array<{ type: string; text: string }> };
  return body.content?.find(b => b.type === 'text')?.text?.trim() ?? null;
}

// ─── generateCaregiverGermanDescription — Mamamia regenerates the caregiver's
// German "about" text (about_de). We no longer generate the caregiver bio
// ourselves; the portal reads about_de straight from Mamamia and only calls
// this when it's stale (length ≤ 200). LLM-write on Mamamia's side (costs) →
// the frontend dedups per caregiver and the proxy rate-limits per IP.
const generateCaregiverGermanDescription: ActionHandler = async (_session, variables, deps) => {
  const id = (variables as { id?: unknown }).id;
  if (typeof id !== "number") throw new Error("id required (number)");
  const r = await runGraphQL<{
    GenerateCaregiverGermanDescription:
      | { id: number; about_de: string | null; motivation: string | null }
      | null;
  }>(deps, GENERATE_CAREGIVER_GERMAN_DESCRIPTION, { id, translate_to_pl: false });
  const cg = r.GenerateCaregiverGermanDescription;
  if (!cg) throw new Error("GenerateCaregiverGermanDescription returned null");
  return { about_de: cg.about_de ?? null, motivation: cg.motivation ?? null };
};

// ─── Interest actions (new — list + dismiss locally) ───────────────────────

// Surface JobOffer.interests for the portal. Same ownership model as
// listApplications: query bound to session.job_offer_id, customer can
// never read interests for somebody else's offer.
const listInterests: ActionHandler = async (session, _variables, deps) => {
  const r = await runGraphQL<{
    JobOffer: { interests: Array<{ caregiver: Record<string, unknown> | null }> } | null;
  }>(deps, LIST_INTERESTS, { id: session.job_offer_id });
  const rows = r.JobOffer?.interests ?? [];
  const certMap = await fetchCertificatesByCaregiver(
    deps,
    rows.map((i) => i.caregiver?.id as number).filter((n): n is number => typeof n === "number"),
  );
  for (const i of rows) {
    const id = i.caregiver?.id as number | undefined;
    if (i.caregiver && typeof id === "number" && certMap.has(id)) {
      i.caregiver.certificates = certMap.get(id);
    }
  }
  return r;
};

// Returns local dismiss-set for THIS lead. Frontend uses it to filter
// the InterestCard list ("klient powiedział nie, nie pokazuj więcej").
// Service-role bypasses RLS — ownership comes from session.lead_id.
const listDismissedCaregivers: ActionHandler = async (session, _variables, deps) => {
  if (!deps.supabase) throw new Error("supabase adapter not configured");
  const rows = await deps.supabase.selectDismissedCaregivers(session.lead_id, session.job_offer_id);
  return {
    caregiver_ids: rows.map((r) => r.caregiver_id),
    rows,
  };
};

// Returns the customer's accepted applications (from lead_application_acceptances,
// written by the kostenrechner bridge endpoint after AngebotPruefenModal step 2).
// Frontend reads on portal load → flips matching app status to 'accepted' →
// existing BookedScreen renders. Persists across reload.
const listAcceptedApplications: ActionHandler = async (session, _variables, deps) => {
  if (!deps.supabase) throw new Error("supabase adapter not configured");
  const rows = await deps.supabase.selectAcceptedApplications(session.lead_id);
  return {
    application_ids: rows.map((r) => r.application_id),
    rows,
  };
};

// UPSERT a dismiss row. Idempotent — clicking dismiss twice doesn't
// error. Bridge/detect-caregiver-events does NOT read this table, so
// dismiss is UI-only (customer mail keeps flowing when caregiver later
// applies — by design, per user decision).
const dismissCaregiver: ActionHandler = async (session, variables, deps) => {
  if (!deps.supabase) throw new Error("supabase adapter not configured");
  const v = variables as { caregiver_id?: unknown; kind?: unknown };
  if (typeof v.caregiver_id !== "number") throw new Error("caregiver_id required (number)");
  if (v.kind !== "interest" && v.kind !== "application") {
    throw new Error("kind must be 'interest' or 'application'");
  }
  await deps.supabase.upsertDismissedCaregiver(session.lead_id, v.caregiver_id, v.kind, session.job_offer_id);
  return { dismissed: true };
};

// ─── Dispatcher ────────────────────────────────────────────────────────────

export const ACTIONS: Record<ProxyAction, ActionHandler> = {
  getJobOffer,
  getCustomer,
  listApplications,
  listInterests,
  listMatchings,
  listInvitedCaregiverIds,
  listDismissedCaregivers,
  listAcceptedApplications,
  getCaregiver,
  searchLocations,
  getInviteRateState,
  listLeadJobs,
  updateCustomer,
  updateJobDescription,
  updateJobOfferDates,
  rejectApplication,
  storeConfirmation,
  inviteCaregiver,
  dismissCaregiver,
  generateJobDescription,
  generateCaregiverGermanDescription,
};

export function isKnownAction(name: string): name is ProxyAction {
  return name in ACTIONS;
}

// Re-export for tests
export type { ActionDeps, ActionHandler, SessionPayload };
