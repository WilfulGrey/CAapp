-- Registry #54: atomowy "claim" onboardingu do Mamamii.
-- Dwa równoległe wołania onboard-to-mamamia (przeglądarka po redirectcie z
-- kalkulatora + send-scheduled-emails dla bloku "Unsere Empfehlung") robiły
-- oba cache-miss i zakładały DWÓCH klientów w MM (prod 2026-09-07: 10693+10694).
-- Pierwszy wołający zajmuje leada jednym UPDATE ... WHERE mamamia_customer_id
-- IS NULL AND (claim IS NULL OR claim < now()-2min); drugi czeka na wynik.
-- Nullable, bez defaultu — stary kod ją ignoruje (Święta zasada nr 3).
alter table public.leads
  add column if not exists mamamia_onboarding_started_at timestamptz;

comment on column public.leads.mamamia_onboarding_started_at is
  'Stempel "ktoś właśnie tworzy klienta w Mamamii" (onboard-to-mamamia claim). '
  'Zwalniany (null) po błędzie; po 2 min traktowany jako stale. Registry #54.';
