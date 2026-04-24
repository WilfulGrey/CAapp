import type { SessionPayload } from "../_shared/sessionTypes.ts";

export type { SessionPayload };

// Whitelisted actions — handler rejects unknown values.
export type ProxyAction =
  // reads
  | "getJobOffer"
  | "getCustomer"
  | "listApplications"
  | "listMatchings"
  | "getCaregiver"
  | "searchLocations"
  // writes
  | "updateCustomer"
  | "rejectApplication"
  | "storeConfirmation"
  | "inviteCaregiver";

export interface ActionDeps {
  endpoint: string;
  getAgencyToken: () => Promise<string>;
  fetchFn?: typeof fetch;
}

export type ActionHandler = (
  session: SessionPayload,
  variables: Record<string, unknown>,
  deps: ActionDeps,
) => Promise<unknown>;
