/*
  # Setup Cron Job for daily-analytics-report

  Triggers the daily-analytics-report Edge Function every morning at
  06:00 UTC, which equals:
    - 08:00 Europe/Berlin in summer (CEST, UTC+2)
    - 07:00 Europe/Berlin in winter (CET, UTC+1)

  The function fetches yesterday's + day-before-yesterday's analytics
  from analytics_sessions / analytics_events / leads / lead_events,
  builds an HTML email and sends it via SMTP to the recipients in the
  DAILY_REPORT_RECIPIENTS env var (defaults to
  martin@mamamia.app + info@primundus.de when unset).

  pg_cron + pg_net extensions are already enabled by
  20260311163926_setup_scheduled_email_cron_job.sql; CREATE EXTENSION
  IF NOT EXISTS calls are kept here as defensive idempotency.

  Manual apply (no CI for migrations today):
    npx supabase db push --linked --project-ref ycdwtrklpoqprabtwahi

  Manual one-off trigger (z.B. zum Testen):
    curl -X POST \
      -H "Authorization: Bearer <service_role_key>" \
      -H "Content-Type: application/json" \
      -d '{}' \
      https://ycdwtrklpoqprabtwahi.supabase.co/functions/v1/daily-analytics-report
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Defensive: drop the schedule if it already exists so re-running this
-- migration is idempotent (cron.schedule will error on duplicate name).
DO $$
BEGIN
  PERFORM cron.unschedule('daily-analytics-report');
EXCEPTION WHEN OTHERS THEN
  -- ignore: schedule didn't exist yet
  NULL;
END $$;

SELECT cron.schedule(
  'daily-analytics-report',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1),
      current_setting('app.settings.supabase_url', true)
    ) || '/functions/v1/daily-analytics-report'),
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
