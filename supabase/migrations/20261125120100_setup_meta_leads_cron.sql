/*
  # Cron für die Facebook-Formular-Leads (freigegeben von Martin 27.11.2026)

  Lag bis zur Freigabe in supabase/nach-freigabe/. Reihenfolge beim Live-Gang:
    1. Migration 20261125120000_fb_leads.sql auf Prod eingespielt.
    2. Kostenrechner auf Render hat META_PAGE_ID und META_PAGE_TOKEN
       (ohne die beiden antwortet die Route 200 {"configured":false} und tut
       nichts — Staging bleibt so).
    3. Diese Datei per scripts/apply-migrations.sh eingespielt.

  Was der Cron tut: jede Minute (Martin 27.11.: Bestätigung sofort) POST /api/cron/meta-leads im
  KOSTENRECHNER (Next.js-Route, keine Edge Function). Muster wie
  20260901120000_setup_portal_abholer_cron.sql:
    - Ziel-URL aus dem Vault-Secret `kostenrechner_url` (prod
      https://kostenrechner.primundus.de, staging
      https://kostenrechner-staging.onrender.com) — gibt es schon, angelegt für
      den Portal-Abholer. Prod ruft damit
      https://kostenrechner.primundus.de/api/cron/meta-leads.
    - Bearer = Vault-Secret `supabase_service_role_key` (gibt es schon). Die
      Route vergleicht es mit SUPABASE_SERVICE_ROLE_KEY der Render-Env.
  Kein neues Secret nötig.

  Abschalten: select cron.unschedule('meta-leads');

  Backward-kompatibel (Święta zasada 3): rein additiv, kein Schema-Change.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('meta-leads');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'meta-leads',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'kostenrechner_url' LIMIT 1),
      current_setting('app.settings.kostenrechner_url', true)
    ) || '/api/cron/meta-leads'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1),
        current_setting('app.settings.service_role_key', true)
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
