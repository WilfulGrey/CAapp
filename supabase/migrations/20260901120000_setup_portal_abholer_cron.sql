/*
  # Cron für den Portal-Abholer (eingekaufte Leads)

  Jede Minute — das Portal gibt dieselbe Anfrage an bis zu drei Anbieter,
  wer zuerst antwortet gewinnt. Feuert POST /api/portal-abholen im
  KOSTENRECHNER (Next.js-Route, nicht Edge Function!): die Route macht den
  ~1s IMAP-Poll der Portal-Postfächer und postet intern auf
  /api/portal-lead. Entscheidung Michał 01.09. (Registry #39): kein eigener
  Render-Cron-Dienst — dieselbe pg_cron-Infra wie detect-caregiver-events.

  Auth wie bei den bestehenden Crons (Bearer = service_role aus dem Vault).
  Die Ziel-URL kommt aus dem NEUEN Vault-Secret `kostenrechner_url`
  (per Env verschieden: prod https://kostenrechner.primundus.de, staging
  https://kostenrechner-staging.onrender.com) — VOR dem Apply anlegen:

    select vault.create_secret('https://kostenrechner.primundus.de', 'kostenrechner_url');

  Ohne Postfach-Zugänge in der Render-Env antwortet die Route 200
  {verarbeitet:0} — der Cron ist dort bewusst wirkungslos (Muster wie
  Google-Secrets auf Staging).

  Backward-kompatibel (Święta zasada 3): rein additiv, kein Schema-Change.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('portal-abholer');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'portal-abholer',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'kostenrechner_url' LIMIT 1),
      current_setting('app.settings.kostenrechner_url', true)
    ) || '/api/portal-abholen'),
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
