// Shared JWT session payload — used by onboard-to-mamamia (create) and
// mamamia-proxy (verify). Kept separate from per-function domain types.

export interface SessionPayload {
  customer_id: number;
  job_offer_id: number;
  lead_id: string;
  /** Customer email from Supabase lead — used for SendInvitationCustomer (K6).
   *  Stored in JWT so the proxy never trusts client-supplied addresses. */
  email: string;
  /** Customer-scope JWT obtained via CustomerVerifyEmail (K6). Optional —
   *  populated only after the customer clicks the magic-link verify mail.
   *  Mutations that require customer scope (SendInvitationCaregiver) check
   *  this and reject if absent. */
  customer_token?: string;
}
