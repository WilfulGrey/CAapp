import type { SessionPayload } from "../_shared/sessionTypes.ts";

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
  | "inviteCaregiver"
  | "dismissCaregiver"
  // AI
  | "generateJobDescription"
  | "generateCaregiverAbout";

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
  selectDismissedCaregivers(
    leadId: string,
  ): Promise<Array<{ caregiver_id: number; kind: string }>>;
  upsertDismissedCaregiver(
    leadId: string,
    caregiverId: number,
    kind: "interest" | "application",
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
  // Used by inviteCaregiver + getInviteRateState. Counts attempts in
  // rolling time window (most callers: 60 min). Source-of-truth row is
  // written by inviteCaregiver AFTER Mamamia StoreRequest succeeds.
  countRecentInviteAttempts(
    leadId: string,
    windowMinutes: number,
  ): Promise<number>;
  // Returns the timestamp of the oldest attempt within the window, or
  // null if window is empty. Used to compute retry_after_seconds for
  // rate-limited responses (= oldest + window - now).
  oldestInviteAttemptWithin(
    leadId: string,
    windowMinutes: number,
  ): Promise<Date | null>;
  // Writes a single attempt row. ONLY called after the upstream
  // Mamamia StoreRequest call succeeds — failed calls do NOT consume
  // the user's rate quota.
  recordInviteAttempt(
    leadId: string,
    caregiverId: number,
  ): Promise<void>;
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
