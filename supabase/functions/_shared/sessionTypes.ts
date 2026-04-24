// Shared JWT session payload — used by onboard-to-mamamia (create) and
// mamamia-proxy (verify). Kept separate from per-function domain types.

export interface SessionPayload {
  customer_id: number;
  job_offer_id: number;
  lead_id: string;
}
