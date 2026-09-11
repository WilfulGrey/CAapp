-- Anonyme Zähler für den Kostenrechner-Wizard (Registry #63, 11.09.2026).
-- Martin: „können wir nicht messen ohne Zustimmung – grenzwertig, aber möglich".
-- Bewusst OHNE Personenbezug: kein Cookie, keine Sitzungs-ID, keine IP, kein
-- User-Agent, keine Minute — nur Tag, Stunde (Europe/Berlin), Ereignis und
-- Variante mit einem Zähler. Damit gibt es nichts, was einer Person zugeordnet
-- werden könnte, und nichts wird auf dem Gerät gespeichert oder gelesen.
create table if not exists public.wizard_zaehler (
  tag      date     not null,
  stunde   smallint not null,
  ereignis text     not null,
  variante text     not null,
  anzahl   integer  not null default 0,
  primary key (tag, stunde, ereignis, variante)
);
alter table public.wizard_zaehler enable row level security;
-- Keine Policies: nur service_role (Route /api/analytics/zaehler, Skript zaehler.py).

create or replace function public.wizard_zaehler_erhoehen(p_ereignis text, p_variante text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.wizard_zaehler (tag, stunde, ereignis, variante, anzahl)
  values (
    (now() at time zone 'Europe/Berlin')::date,
    extract(hour from (now() at time zone 'Europe/Berlin'))::smallint,
    p_ereignis, p_variante, 1
  )
  on conflict (tag, stunde, ereignis, variante)
  do update set anzahl = public.wizard_zaehler.anzahl + 1;
$$;
revoke all on function public.wizard_zaehler_erhoehen(text, text) from public;
revoke all on function public.wizard_zaehler_erhoehen(text, text) from anon;
grant execute on function public.wizard_zaehler_erhoehen(text, text) to service_role;
