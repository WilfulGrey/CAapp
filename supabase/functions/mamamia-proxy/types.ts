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

// Minimal Supabase client interface used by dismissCaregiver /
// listDismissedCaregivers. Real impl in proxy index.ts; tests inject
// a fake. Kept narrow so tests don't have to satisfy the full @supabase
// surface.
export interface ProxySupabase {
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
  ): Promise<Array<{ application_id: number; caregiver_id: number | null; accepted_at: string }>>;
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
