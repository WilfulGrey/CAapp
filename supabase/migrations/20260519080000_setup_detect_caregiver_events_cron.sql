/*
  # Setup Cron Job for detect-caregiver-events

  Triggers the detect-caregiver-events Edge Function every 15 minutes
  with an empty body, which the function interprets as "batch mode" —
  iterating all active leads (mamamia_job_offer_id IS NOT NULL, token
  still valid, status not in terminal state) and POSTing
  caregiver_interest_shown / application_received events to the bridge
  endpoint for each newly-arrived Bewerbung/Interest.

  Pairs with PR #114 (customer mail templates) and PR #118 (detect
  function — single-lead curl mode).

  pg_cron + pg_net extensions are already enabled by
  20260311163926_setup_scheduled_email_cron_job.sql; CREATE EXTENSION
  IF NOT EXISTS calls are kept here as defensive idempotency.

  Manual apply (no CI for migrations today):
    npx supabase db push --linked --project-ref ycdwtrklpoqprabtwahi
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Defensive: drop the schedule if it already exists so re-running this
-- migration is idempotent (cron.schedule will error on duplicate name).
DO $$
BEGIN
  PERFORM cron.unschedule('detect-caregiver-events');
EXCEPTION WHEN OTHERS THEN
  -- ignore: schedule didn't exist yet
  NULL;
END $$;

SELECT cron.schedule(
  'detect-caregiver-events',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1),
      current_setting('app.settings.supabase_url', true)
    ) || '/functions/v1/detect-caregiver-events'),
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
