/*
  # Realtime für /admin/leads — leads + portal_mail_log in die Publikation

  Die Lead-Liste im Admin aktualisiert sich ab jetzt live (Supabase
  Realtime, postgres_changes) statt per Hand über „Aktualisieren"
  (Registry #48). Der Realtime-Dienst streamt nur Tabellen, die Mitglied
  der Publikation supabase_realtime sind — sie existiert auf Staging und
  Prod (insert+update), war aber bisher LEER. Der Dashboard-Schalter
  „Enable Realtime" ist genau dieses ALTER PUBLICATION, nichts weiter.

  Guard über pg_publication_tables: ADD TABLE wirft 42710, wenn die Tabelle
  schon Mitglied ist (z. B. nach einem Klick im Dashboard).

  REPLICA IDENTITY bleibt default: die Seite liest nur `new`, nie `old`.
  Rechte unverändert: Realtime prüft RLS je Empfänger (WALRUS) — die
  bestehenden anon-SELECT-Policies auf leads und portal_mail_log genügen.
  Rein additiv (Święta zasada 3): keine Tabelle, Spalte oder Policy ändert
  sich; ohne lauschendes Frontend ist die Mitgliedschaft wirkungslos.
*/

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'portal_mail_log'
  ) then
    alter publication supabase_realtime add table public.portal_mail_log;
  end if;
end $$;
