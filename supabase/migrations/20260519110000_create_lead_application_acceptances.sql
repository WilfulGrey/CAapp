/*
  # lead_application_acceptances

  Per-application customer acceptance state. When a customer clicks
  "Betreuungskraft akzeptieren" in AngebotPruefenModal step 2, we record
  the application_id + the form data they entered. This is purely our
  internal MVP state — Mamamia is NOT notified (no STORE_CONFIRMATION).
  The Primundus team gets a notification email with the form data and
  contacts the customer manually to prepare contract documents.

  Two effects of this row existing:
  1. info@primundus.de team mail is fired once (deduped per event_type in
     the bridge endpoint).
  2. On portal reload, mamamia-proxy.listAcceptedApplications surfaces
     application_id to the frontend, which flips the matching app's
     status to 'accepted' → existing BookedScreen renders.

  Analogous to lead_dismissed_caregivers (PR #121) — service-role only,
  no public RLS, accessed via mamamia-proxy + bridge.

  Manual apply (no CI for migrations):
    npx supabase db push --linked --project-ref ycdwtrklpoqprabtwahi
*/

CREATE TABLE IF NOT EXISTS lead_application_acceptances (
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  application_id integer NOT NULL,
  caregiver_id integer,
  contract_patient jsonb NOT NULL DEFAULT '{}'::jsonb,
  contract_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, application_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_application_acceptances_lead
  ON lead_application_acceptances(lead_id);

ALTER TABLE lead_application_acceptances ENABLE ROW LEVEL SECURITY;
