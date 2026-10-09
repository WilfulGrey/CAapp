/*
  # Cron für die Anreise-Mail (Registry #119)

  Ruft detect-caregiver-events mit { "mode": "anreise" } alle 15 Minuten auf,
  versetzt um 7 Minuten zum Batch-Cron 'detect-caregiver-events' (*/15) — der
  Batch braucht allein ~110 s von ~150 s, deshalb ein eigener Aufruf.
  Muster: 20260519080000_setup_detect_caregiver_events_cron.sql.

  Erst einspielen, wenn die Funktion den Modus kennt: alter Code behandelt
  ein unbekanntes Body als Batch (Gotcha #16) — dann liefen zwei Batches.
  Ob Mails rausgehen, steuert weiter das Secret ANREISE_MAILS (aus/test/live).
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('detect-caregiver-events-anreise');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'detect-caregiver-events-anreise',
  '7-59/15 * * * *',
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
    body := '{"mode":"anreise"}'::jsonb
  );
  $$
);
