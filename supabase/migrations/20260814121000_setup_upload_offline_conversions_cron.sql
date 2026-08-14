/*
  # Cron für upload-offline-conversions

  Täglich 06:20 UTC (08:20 Berlin im Sommer, 07:20 im Winter) — nach dem
  daily-analytics-report (06:00). Lädt qualifizierte Leads mit Klick-ID
  als Offline-Conversions zu Google Ads hoch; Details im Function-Header
  und in docs/google-ads-tracking.md.

  Auth/URL aus dem Vault wie bei den bestehenden Crons
  (20260520070000_setup_daily_analytics_report_cron.sql). Ohne
  Google-Secrets in der Function-Env (Staging) antwortet die Function
  200 {skipped} — der Cron ist dort bewusst wirkungslos.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('upload-offline-conversions');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'upload-offline-conversions',
  '20 6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1),
      current_setting('app.settings.supabase_url', true)
    ) || '/functions/v1/upload-offline-conversions'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1),
        current_setting('app.settings.service_role_key', true)
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
