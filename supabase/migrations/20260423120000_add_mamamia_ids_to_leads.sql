-- Dodaje kolumny dla cache'a onboardingu Mamamia (idempotency flow).
-- Edge Function `onboard-to-mamamia` czyta/zapisuje te wartości żeby
-- drugie otwarcie linku `?token=...` nie duplikowało Customer/JobOffer w Mamamii.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS mamamia_customer_id  integer,
  ADD COLUMN IF NOT EXISTS mamamia_job_offer_id integer,
  ADD COLUMN IF NOT EXISTS mamamia_user_token   text,
  ADD COLUMN IF NOT EXISTS mamamia_onboarded_at timestamptz;

-- Index na mamamia_customer_id żeby szybko sprawdzić "czy ten lead już onboardowany"
-- (Edge Function robi SELECT WHERE token=X, potem decyzja po mamamia_customer_id IS NOT NULL).
CREATE INDEX IF NOT EXISTS idx_leads_mamamia_customer_id
  ON leads(mamamia_customer_id)
  WHERE mamamia_customer_id IS NOT NULL;

-- Komentarze (dokumentacja w bazie)
COMMENT ON COLUMN leads.mamamia_customer_id   IS 'Customer.id z Mamamia beta — zapisane przy pierwszym onboardingu (Edge Function onboard-to-mamamia)';
COMMENT ON COLUMN leads.mamamia_job_offer_id  IS 'JobOffer.id z Mamamia beta — auto-created razem z Customer';
COMMENT ON COLUMN leads.mamamia_user_token    IS 'Agency JWT token z LoginAgency — używany przez browser jako Bearer do /graphql queries. Shared per-agency (Primundus), NIE per-user.';
COMMENT ON COLUMN leads.mamamia_onboarded_at  IS 'Timestamp pierwszego udanego onboardingu. null = lead jeszcze nie odwiedzony lub onboarding failed.';
