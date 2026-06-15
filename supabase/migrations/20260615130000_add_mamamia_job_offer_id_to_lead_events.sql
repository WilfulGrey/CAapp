/*
  Multi-Job-Detection: lead_events bekommt mamamia_job_offer_id.

  detect-caregiver-events scannte bisher nur den Default-Job
  (leads.mamamia_job_offer_id). Fuer Multi-Job-Kunden landeten Bewerbungen/
  Interessen auf den anderen Jobs nie in lead_events und loesten keine Mail aus.

  Diese Spalte traegt den konkreten Mamamia-JobOffer pro Event und erlaubt
  per-Job-Dedup im Detector: dieselbe Pflegekraft auf Job A und Job B feuert
  zwei Events (je einer pro Job), aber nie doppelt fuer denselben Job.

  Nullable, KEIN Backfill: Alt-Events vor dieser Migration bleiben NULL und
  werden vom Detector als Default-Job-Events behandelt (NULL == Default-Job,
  siehe index.ts seen-set mapping). Ein Backfill wuerde nichts gewinnen.

  Additiv, re-runnable, shell-safe fuer apply-migrations.sh / run_query.
*/
ALTER TABLE lead_events
  ADD COLUMN IF NOT EXISTS mamamia_job_offer_id integer;

CREATE INDEX IF NOT EXISTS idx_lead_events_job_offer
  ON lead_events(mamamia_job_offer_id)
  WHERE mamamia_job_offer_id IS NOT NULL;
