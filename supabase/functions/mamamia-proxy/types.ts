import type { SessionPayload } from "../_shared/sessionTypes.ts";
import type { LeadJobUpsertRow } from "../_shared/leadJobsSync.ts";

export type { SessionPayload };

// Whitelisted actions — handler rejects unknown values.
export type ProxyAction =
  // reads
  | "getJobOffer"
  | "getCustomer"
  | "listApplications"
  | "listInterests"
  | "listMatchings"
  | "listInvitedCaregiverIds"
  | "listDismissedCaregivers"
  | "listAcceptedApplications"
  | "getCaregiver"
  | "searchLocations"
  | "getInviteRateState"
  | "listLeadJobs"
  // writes
  | "updateCustomer"
  | "updateJobDescription"
  | "updateJobOfferDates"
  | "rejectApplication"
  | "storeConfirmation"
  | "uploadSignedContract"
  | "inviteCaregiver"
  | "dismissCaregiver"
  // AI
  | "generateJobDescription"
  | "generateCaregiverGermanDescription";

// One row of the lead_jobs table (Multi-Job, Phase 2) as surfaced to the
// frontend "Alle meine Einsätze" overview. 'laufend' is NOT stored — it is
// derived client-side from (status='gebucht' AND anreise <= today < abreise).
export interface LeadJobRow {
  id: string;
  mamamia_job_offer_id: number;
  status: string;
  anreise: string | null;
  abreise: string | null;
  position: number;
  // Card enrichment (Design-Parität): booked caregiver name / application count,
  // mirrored from Mamamia by the sync. Null when not applicable.
  pflegekraft: string | null;
  bewerbungen: number | null;
}

// Minimal Supabase client interface used by dismissCaregiver /
// listDismissedCaregivers. Real impl in proxy index.ts; tests inject
// a fake. Kept narrow so tests don't have to satisfy the full @supabase
// surface.
export interface ProxySupabase {
  // Multi-Job (Phase 2): the lead's jobs for the "Alle meine Einsätze"
  // overview. Scoped by session.lead_id (the residency baked into the
  // signed JWT) — NOT job-scoped, so a job-scoped session can still read
  // the full overview. Read-only.
  selectLeadJobs(leadId: string): Promise<LeadJobRow[]>;
  // Multi-Job (Phase 2A): upsert the synced jobs (mirror of Mamamia
  // Customer.job_offers) into lead_jobs. Keyed on (lead_id,
  // mamamia_job_offer_id) — inserts new jobs, updates status/anreise/abreise
  // on existing. Optional so test fakes that don't exercise sync can skip it.
  upsertLeadJobs?(
    leadId: string,
    jobs: LeadJobUpsertRow[],
  ): Promise<void>;
  // Multi-Job #2b: dismissals are PER JOB (mamamia_job_offer_id). Legacy rows
  // were backfilled to the lead's then-only job, so reads filter on the exact
  // job (no NULL handling).
  selectDismissedCaregivers(
    leadId: string,
    jobOfferId: number,
  ): Promise<Array<{ caregiver_id: number; kind: string }>>;
  upsertDismissedCaregiver(
    leadId: string,
    caregiverId: number,
    kind: "interest" | "application",
    jobOfferId: number,
  ): Promise<void>;
  // Used by listAcceptedApplications — frontend reads this set on portal
  // load to flip the matching Application's local status to 'accepted'
  // (which triggers BookedScreen). Source of truth lives in
  // lead_application_acceptances, written by bridge endpoint.
  selectAcceptedApplications(
    leadId: string,
  ): Promise<Array<{
    application_id: number;
    caregiver_id: number | null;
    accepted_at: string;
    /** Vollständiges Vertragsdaten-Objekt (Tagessatz, Anreise/Abreise,
     *  AG/LE-Namen, …) — wird im Frontend benutzt, um eine synthetische
     *  Application zu rekonstruieren, falls Mamamia die akzeptierte
     *  Application nicht (mehr) in listApplications zurückgibt. */
    contract_snapshot: Record<string, unknown> | null;
  }>>;
  // Used by inviteCaregiver + getInviteRateState. Counts attempts in the
  // rolling window FOR THE GIVEN JOB (Multi-Job #2a: per-job rate limit, not
  // per-lead). Includes legacy rows with NULL job (pre-scoping) so they keep
  // counting until they age out. Source-of-truth row written by
  // inviteCaregiver AFTER Mamamia StoreRequest succeeds.
  countRecentInviteAttempts(
    leadId: string,
    windowMinutes: number,
    jobOfferId: number,
  ): Promise<number>;
  // Oldest attempt within the window FOR THE GIVEN JOB (+ legacy NULL), or
  // null if empty. Used to compute retry_after_seconds (= oldest + window - now).
  oldestInviteAttemptWithin(
    leadId: string,
    windowMinutes: number,
    jobOfferId: number,
  ): Promise<Date | null>;
  // Writes a single attempt row stamped with the current job. ONLY called
  // after the upstream Mamamia StoreRequest succeeds — failed calls do NOT
  // consume the user's rate quota.
  recordInviteAttempt(
    leadId: string,
    caregiverId: number,
    jobOfferId: number,
  ): Promise<void>;
  // Plant (bzw. verschiebt) die "neue Pflegekräfte verfügbar"-Mail auf +24h
  // ab JETZT. Reschedult bei jeder Einladung → 24h ab der LETZTEN Einladung.
  // Best-effort: schlägt der Versand-Scheduler fehl, bleibt die Einladung
  // trotzdem erfolgreich. send-scheduled-emails cancelt sie bei Reaktion.
  // Optional, damit bestehende Test-Mocks ohne diese Methode gültig bleiben.
  scheduleNeuePflegekraefteMail?(leadId: string): Promise<void>;
  // Friert den Patientenbogen (Roh-Formular) am Lead ein (leads.patient_form) —
  // das SA-Portal zeigt ihn im Anfrage-Block als "was der Kunde angegeben hat".
  // Best-effort nach erfolgreichem UpdateCustomer; optional für Test-Mocks.
  saveLeadPatientForm?(leadId: string, form: Record<string, unknown>): Promise<void>;
  // (Der frühere application_intros-Cache für eine LLM-redigierte Version von
  // application.message ist entfallen — der Rekruter-Hinweis geht seit
  // 2026-07-22 VERBATIM an den Kunden, Registry #22.)
}

export interface ActionDeps {
  endpoint: string;
  getAgencyToken: () => Promise<string>;
  /** Panel-style auth (Sanctum SPA) — used for ImpersonateCustomer +
   *  customer-scoped mutations Mamamia gates behind the panel session.
   *  See _shared/mamamiaPanelClient.ts. */
  panelBaseUrl?: string;
  agencyEmail?: string;
  agencyPassword?: string;
  fetchFn?: typeof fetch;
  /** Anthropic API key — used by generateJobDescription action. */
  anthropicApiKey?: string;
  /** Supabase service-role adapter — used by dismiss-caregiver actions
   *  that read/write `lead_dismissed_caregivers`. Optional so tests
   *  that don't exercise dismiss can skip wiring it. */
  supabase?: ProxySupabase;
}

export type ActionHandler = (
  session: SessionPayload,
  variables: Record<string, unknown>,
  deps: ActionDeps,
) => Promise<unknown>;
