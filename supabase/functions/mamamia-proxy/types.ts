import type { SessionPayload } from "../_shared/sessionTypes.ts";

export type { SessionPayload };

// Whitelisted actions — handler rejects unknown values.
export type ProxyAction =
  // reads
  | "getJobOffer"
  | "getCustomer"
  | "listApplications"
  | "listMatchings"
  | "listInvitedCaregiverIds"
  | "getCaregiver"
  | "searchLocations"
  // writes
  | "updateCustomer"
  | "updateJobDescription"
  | "rejectApplication"
  | "storeConfirmation"
  | "inviteCaregiver"
  // AI
  | "generateJobDescription"
  | "generateCaregiverAbout";

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
}

export type ActionHandler = (
  session: SessionPayload,
  variables: Record<string, unknown>,
  deps: ActionDeps,
) => Promise<unknown>;
