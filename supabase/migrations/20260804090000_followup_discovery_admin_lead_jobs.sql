/*
  # Follow-up joby (Bug #24): discovery-stempel + admin-widok lead_jobs

  1. `leads.mamamia_jobs_checked_at` — samostrojenie fazy discovery w cronie
     detect-caregiver-events: leady POZA active-setem (status zamknięty lub
     wygasły token) są sondowane w Mamamii („czy otwarto nowy job?") najwyżej
     co DISCOVERY_RECHECK_HOURS, max DISCOVERY_BATCH_SIZE na run — kolumna
     trzyma znacznik ostatniej sondy (NULL = nigdy nie sondowany, idzie
     pierwszy). Nullable, bez DEFAULT — w pełni backward-compatible
     (Święta zasada nr 3).

  2. RLS: `lead_jobs` FOR SELECT TO anon — admin kostenrechnera (project 3/
     app/admin) czyta Supabase bezpośrednio anon-keyem z przeglądarki
     (istniejąca postura: polityka „Jeder kann Leads sehen" na leads,
     migracja 20260212100310 w project 3). Card „Einsätze (Mamamia)" w detalu
     leada + badge liczby jobów na liście potrzebują odczytu lead_jobs.
     Tylko SELECT — żadnych polityk zapisu (pisze wyłącznie service-role
     przez detect/proxy).

     DŁUG TECHNICZNY (świadomy): docelowo admin powinien przejść na
     authenticated/service-side fetch zamiast otwartego anon-read — dotyczy
     całej postury admina, nie tylko tej tabeli.
*/

ALTER TABLE leads ADD COLUMN IF NOT EXISTS mamamia_jobs_checked_at timestamptz;

-- Partial index pod query discovery (order by checked_at nulls first + filtry).
CREATE INDEX IF NOT EXISTS idx_leads_mamamia_jobs_checked_at
  ON leads (mamamia_jobs_checked_at NULLS FIRST)
  WHERE mamamia_customer_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_jobs' AND policyname = 'Admin (anon) kann lead_jobs lesen'
  ) THEN
    CREATE POLICY "Admin (anon) kann lead_jobs lesen"
      ON lead_jobs FOR SELECT TO anon
      USING (true);
  END IF;
END $$;
