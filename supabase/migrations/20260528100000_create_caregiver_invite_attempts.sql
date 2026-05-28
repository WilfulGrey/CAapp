/*
  # caregiver_invite_attempts

  Rate-limit ledger for "Pflegekraft einladen" actions. The portal lets
  a customer invite caregivers (Mamamia StoreRequest), and we cap to
  5 invites per lead per rolling 60-minute window. Each successful
  Mamamia StoreRequest writes a row here BEFORE we tell the frontend
  it worked. The 6th attempt within 60 min is rejected upstream (in
  the mamamia-proxy.inviteCaregiver action) with a structured error
  carrying retry_after_seconds so the UI can show a wait-time modal.

  Why our own table, not Mamamia.Request as source-of-truth: the
  portal renders the invite as "wysłano" optimistically. If we counted
  off Mamamia, a fast 6-click burst would race the panel-mode
  StoreRequest persistence (~1-2s) and slip past the limit. Our row is
  written server-side INSIDE the proxy after StoreRequest succeeds,
  so the count is authoritative the moment the next request hits.

  Row meaning: ONLY successful Mamamia StoreRequest writes a row. If
  the panel call fails (Bug #17 race, etc.), we don't penalize the
  user — they can retry.

  Index on (lead_id, attempted_at DESC) so the recency count + the
  "oldest attempt in window" query (for retry_after_seconds) are both
  O(log n) + a small range scan.

  RLS: enabled, no public policy. Access is via mamamia-proxy actions
  with service-role (session JWT scopes to lead_id from the proxy
  side, not via RLS). Same pattern as lead_dismissed_caregivers +
  lead_application_acceptances.

  Manual apply (no CI for migrations on prod — staging gets it via
  /deploy-staging skill, prod via /deploy-prod):
    npx supabase db push --linked --project-ref taggpiwpwthgpcmaiqjw  # staging
    npx supabase db push --linked --project-ref ycdwtrklpoqprabtwahi  # prod
*/

CREATE TABLE IF NOT EXISTS caregiver_invite_attempts (
  id bigserial PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  caregiver_id integer NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Recency index: rate-limit counter + retry_after_seconds query both
-- read "most recent N rows for this lead within window". DESC matches
-- the typical ORDER BY attempted_at DESC LIMIT 5/1 access pattern.
CREATE INDEX IF NOT EXISTS idx_caregiver_invite_attempts_lead_recent
  ON caregiver_invite_attempts(lead_id, attempted_at DESC);

ALTER TABLE caregiver_invite_attempts ENABLE ROW LEVEL SECURITY;
