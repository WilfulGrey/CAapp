/*
  lead_dismissed_caregivers: Dismiss per JOB statt per Lead (Multi-Job #2b)

  Bisher PRIMARY KEY (lead_id, caregiver_id, kind) -> ein Dismiss galt
  Lead-weit. Bei Multi-Job soll ein Abgelehnt in Job A die PK nicht in Job B
  verstecken. Wir nehmen mamamia_job_offer_id in den PK auf.

  Da ein PK keine NULLs erlaubt: bestehende Dismisses werden auf den (damals
  einzigen) Job des Leads zurueckgeschrieben -- das ist die korrekte
  Zuordnung. (Pruefung: 0 Orphans, alle Dismiss-Leads sind onboarded.)
  Danach NOT NULL + PK-Tausch. Keine NULL-Sonderbehandlung im Read noetig.

  Apply via supabase-ops run_query (shell-safe: kein Dollar, kein Backtick).
*/
ALTER TABLE lead_dismissed_caregivers
  ADD COLUMN IF NOT EXISTS mamamia_job_offer_id integer;

UPDATE lead_dismissed_caregivers d
  SET mamamia_job_offer_id = l.mamamia_job_offer_id
  FROM leads l
  WHERE d.lead_id = l.id AND d.mamamia_job_offer_id IS NULL;

ALTER TABLE lead_dismissed_caregivers
  ALTER COLUMN mamamia_job_offer_id SET NOT NULL;

ALTER TABLE lead_dismissed_caregivers
  DROP CONSTRAINT lead_dismissed_caregivers_pkey;

ALTER TABLE lead_dismissed_caregivers
  ADD PRIMARY KEY (lead_id, caregiver_id, kind, mamamia_job_offer_id);
