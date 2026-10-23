-- OpenAI Ads (ChatGPT-Anzeigen): Conversions-API + Klick-Kennung, und
-- Wizard-Zähler je Quelle (SEA, 11.09.2026, Registry #64).
--
-- Befund: Seit dem 04.09. laufen Anzeigen in ChatGPT, 72 Sitzungen, 0 Leads,
-- 0 gemeldete Conversions. Der Pixel lädt nur mit Marketing-Einwilligung
-- (~6 % der Besucher) — OpenAI sieht also praktisch nie eine Anfrage, selbst
-- wenn eine käme. OpenAI hängt aber an jeden Anzeigenklick `?oppref=…`
-- (GA4: 41 von 42 Landings), und die Conversions API nimmt Ereignisse
-- serverseitig mit genau dieser Kennung an — dieselbe Mechanik wie der
-- Google-Offline-Upload mit der gclid, ohne Cookie, ohne Personendaten.
--
-- 1) leads.oppref: die Klick-Kennung, per best-effort Update wie gclid/utm_*
--    (Lead-Erstellung scheitert NIE an dieser Spalte).
alter table public.leads add column if not exists oppref text;

-- 2) Buchführung des Uploads (Gegenstück zu offline_conversion_uploads):
--    je Lead und Ereignisart genau eine Zeile; uploaded ODER permanent_failure.
--    Retriable Fehler bleiben unmarkiert → nächster Lauf.
create table if not exists public.openai_conversion_uploads (
  lead_id    uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  status     text not null check (status in ('uploaded', 'permanent_failure')),
  note       text,
  created_at timestamptz not null default now(),
  primary key (lead_id, event_type)
);
alter table public.openai_conversion_uploads enable row level security;
-- Keine Policies: nur service_role (Edge Function openai-conversions).

-- 3) wizard_zaehler bekommt die Quelle (google | chatgpt | sonst) — drei grobe
--    Töpfe je Tag/Stunde, weiterhin ohne jeden Personenbezug. Ohne diese
--    Spalte ließe sich nie sagen, ob ChatGPT-Besucher den Rechner überhaupt
--    beginnen (Einwilligungs-Events: 6 von 72 Sitzungen).
alter table public.wizard_zaehler add column if not exists quelle text not null default 'sonst';
alter table public.wizard_zaehler drop constraint if exists wizard_zaehler_pkey;
alter table public.wizard_zaehler add primary key (tag, stunde, ereignis, variante, quelle);

-- Alte Zwei-Parameter-Fassung weg, sonst wäre der RPC-Aufruf mit zwei
-- Parametern zwischen beiden Fassungen mehrdeutig. Die neue hat einen
-- Default, damit ein noch nicht neu gebauter Rechner weiter zählen kann.
drop function if exists public.wizard_zaehler_erhoehen(text, text);
create or replace function public.wizard_zaehler_erhoehen(p_ereignis text, p_variante text, p_quelle text default 'sonst')
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.wizard_zaehler (tag, stunde, ereignis, variante, quelle, anzahl)
  values (
    (now() at time zone 'Europe/Berlin')::date,
    extract(hour from (now() at time zone 'Europe/Berlin'))::smallint,
    p_ereignis, p_variante, coalesce(p_quelle, 'sonst'), 1
  )
  on conflict (tag, stunde, ereignis, variante, quelle)
  do update set anzahl = public.wizard_zaehler.anzahl + 1;
$$;
revoke all on function public.wizard_zaehler_erhoehen(text, text, text) from public;
revoke all on function public.wizard_zaehler_erhoehen(text, text, text) from anon;
grant execute on function public.wizard_zaehler_erhoehen(text, text, text) to service_role;

-- 4) Cron: alle 15 Minuten die Edge Function openai-conversions anstoßen
--    (Muster wie upload-offline-conversions). Ohne Schlüssel in der
--    Function-Env (Staging) antwortet sie 200 {skipped} — dort wirkungslos.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('openai-conversions');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'openai-conversions',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1),
      current_setting('app.settings.supabase_url', true)
    ) || '/functions/v1/openai-conversions'),
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
