/*
  # lead_dismissed_caregivers

  Per-lead UI hide-list. When a customer clicks "Ablehnen" on an
  Interest card (Pflegekraft signalisiert Interesse), we record the
  caregiver_id here so the next portal load filters that caregiver out
  of the Interest section.

  IMPORTANT design choice: dismissal lives entirely on our side.
  Mamamia is NOT notified — the underlying Interest record on their
  side is untouched. detect-caregiver-events also does NOT consult
  this table, so if the caregiver later applies formally
  (application_received) the customer email still fires. Dismiss is
  a UI-only "I've seen this, don't show again" signal.

  kind = 'application' is reserved (CHECK constraint accepts it) for
  future cases where a customer dismisses an Application without going
  through Mamamia REJECT_APPLICATION. Today only 'interest' is used.

  RLS: enabled, no public policy. Access is via mamamia-proxy actions
  that use service-role (session JWT scopes to lead_id from the proxy
  side, not via RLS).

  Manual apply (no CI for migrations):
    npx supabase db push --linked --project-ref ycdwtrklpoqprabtwahi
*/

CREATE TABLE IF NOT EXISTS lead_dismissed_caregivers (
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  caregiver_id integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('interest', 'application')),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, caregiver_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_lead_dismissed_caregivers_lead
  ON lead_dismissed_caregivers(lead_id);

ALTER TABLE lead_dismissed_caregivers ENABLE ROW LEVEL SECURITY;
