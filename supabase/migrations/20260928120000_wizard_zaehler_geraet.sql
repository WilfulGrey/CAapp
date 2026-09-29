-- Wizard-Zähler je Geräteklasse und mit feinerer Quelle (Registry #103, 28.09.2026).
--
-- Befund 28.09.: Ob Besucher von primundus.de die erste Frage beantworten, war
-- nicht messbar — der Zähler warf Website, direkte Besuche und alles andere in
-- `sonst`, und ob das Problem am Handy oder am Computer liegt, stand nirgends.
-- Die Quelle bekommt deshalb zwei neue Werte (website, direkt; das ist nur Code,
-- die Spalte ist Freitext), und es kommt die Geräteklasse dazu: mobil | desktop,
-- `unbekannt` für Zählungen alter Rechner-Stände. Weiterhin ohne jeden
-- Personenbezug: keine Sitzung, kein Cookie, kein User-Agent, nur die Klasse.
--
-- REIHENFOLGE BEIM LIVEGANG: diese Migration ZUERST auf Prod einspielen
-- (scripts/apply-migrations.sh), DANN den Rechner mergen. Die neue Funktion hat
-- Standardwerte für p_quelle und p_geraet — der alte Rechner zählt damit weiter
-- (Gerät `unbekannt`). Umgekehrt (Code vor Migration) würde der Aufruf mit
-- p_geraet ins Leere laufen und die Route verwirft den Fehler still.
alter table public.wizard_zaehler add column if not exists geraet text not null default 'unbekannt';
alter table public.wizard_zaehler drop constraint if exists wizard_zaehler_pkey;
alter table public.wizard_zaehler add primary key (tag, stunde, ereignis, variante, quelle, geraet);

-- Alte Drei-Parameter-Fassung weg, sonst wäre ein Aufruf mit drei Parametern
-- zwischen beiden Fassungen mehrdeutig (Muster wie 20260911123000).
drop function if exists public.wizard_zaehler_erhoehen(text, text, text);
create or replace function public.wizard_zaehler_erhoehen(
  p_ereignis text,
  p_variante text,
  p_quelle text default 'sonst',
  p_geraet text default 'unbekannt'
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.wizard_zaehler (tag, stunde, ereignis, variante, quelle, geraet, anzahl)
  values (
    (now() at time zone 'Europe/Berlin')::date,
    extract(hour from (now() at time zone 'Europe/Berlin'))::smallint,
    p_ereignis, p_variante, coalesce(p_quelle, 'sonst'), coalesce(p_geraet, 'unbekannt'), 1
  )
  on conflict (tag, stunde, ereignis, variante, quelle, geraet)
  do update set anzahl = public.wizard_zaehler.anzahl + 1;
$$;
revoke all on function public.wizard_zaehler_erhoehen(text, text, text, text) from public;
revoke all on function public.wizard_zaehler_erhoehen(text, text, text, text) from anon;
grant execute on function public.wizard_zaehler_erhoehen(text, text, text, text) to service_role;
