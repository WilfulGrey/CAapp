-- Partner-Akquise: Zeitsteuerung. BEWUSST NICHT in supabase/migrations/ —
-- wird erst beim Scharfschalten auf PROD ausgeführt, nachdem Martin die
-- Hauptmail freigegeben hat (siehe PR „Partner-Akquise: eigener Versand“).
--
-- Alle 15 Minuten ein Lauf; die Funktion selbst sendet nur Mo–Fr 9–17 Uhr,
-- höchstens 10 pro Lauf / 40 pro Stunde, und nur freigegebene Mails.

select cron.schedule(
  'send-partner-akquise',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url' limit 1)
           || '/functions/v1/send-partner-akquise',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key' limit 1)
    ),
    body := '{"modus":"versand"}'::jsonb
  );
  $$
);

-- Freigabe einer Mail (nur nach Martins „freigegeben“ im Chat):
--   update public.partner_mail_freigaben set freigegeben_am = now(), freigegeben_von = 'Martin' where mail = 'haupt';
--
-- Sofort alles stoppen:
--   select cron.unschedule('send-partner-akquise');
--   update public.partner_mail_freigaben set freigegeben_am = null;
