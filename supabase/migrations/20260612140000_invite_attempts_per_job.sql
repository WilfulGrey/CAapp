/*
  # caregiver_invite_attempts: Rate-Limit per JOB statt per Lead (Multi-Job #2a)

  Bisher zählte das 5/60min-Invite-Limit pro Lead. Bei Multi-Job würde eine
  Einladung in Job A das Kontingent von Job B aufbrauchen. Wir scopen jetzt auf
  mamamia_job_offer_id (= session.job_offer_id, der aktuell gewählte Job).

  Spalte nullable: bestehende Zeilen (pre-Multi-Job) bleiben Lead-weit gültig —
  die Reads filtern `mamamia_job_offer_id = current OR IS NULL`, sodass
  Alt-Einladungen weiter zählen (konservativ) und sich nach dem 60min-Fenster
  selbst auswaschen. caregiver_invite_attempts ist ein Append-Only-Ledger
  (kein UNIQUE) — additive Spalte, kein Constraint-Umbau nötig.

  Manueller Apply via supabase-ops run_query (kein $$ → shell-safe).
*/
ALTER TABLE caregiver_invite_attempts
  ADD COLUMN IF NOT EXISTS mamamia_job_offer_id integer;

CREATE INDEX IF NOT EXISTS idx_invite_attempts_lead_job
  ON caregiver_invite_attempts(lead_id, mamamia_job_offer_id, attempted_at);

COMMENT ON COLUMN caregiver_invite_attempts.mamamia_job_offer_id IS
  'Mamamia JobOffer.id des Jobs, in dem eingeladen wurde (= session.job_offer_id). NULL für Alt-Zeilen vor dem Multi-Job-Scoping; Reads zählen current OR NULL.';
