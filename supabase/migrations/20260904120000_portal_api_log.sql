/*
  # portal_api_log — Verarbeitungsprotokoll fuer API-Portale (pflege-helfer24.de)

  Gegenstueck zu portal_mail_log (Registry #47) fuer Portale, die Leads
  nicht per Mail, sondern ueber eine Partner-API liefern. Der Schluessel
  dort ist (postfach, uidvalidity, uid bigint) — die Lead-UUID der API
  passt nicht hinein, deshalb eine eigene Tabelle mit demselben Vokabular.

  Eine Zeile je (portal, extern_id). Status:
    erledigt      — Lead angelegt (lead_id gesetzt); mit `grund` auch fuer
                    Duplikate ("Lead bereits vorhanden — keine Mail 1")
    uebersprungen — Schutzregeln / Bestandskunde / falsches Produkt; grund
    abgelehnt     — deterministisch (HTTP 400): dauerhaft, KEIN Retry
    offen         — transient (5xx, Netz): naechster Takt versucht erneut,
                    solange die ID im 7-Tage-Fenster der API liegt
    altbestand    — beim Erstlauf vorgefunden und AELTER als der Tag der
                    Inbetriebnahme (Entscheidung Michał 04.09.: keine
                    Historie anschreiben). Sentinel extern_id '__seed__'
                    markiert den Erstlauf selbst; '__api__' traegt den
                    Zustand des letzten Abrufs (offen = API nicht erreichbar
                    / Token tot — sichtbar im Admin, statt still leer).

  lead_id: ON DELETE SET NULL, NICHT cascade — sonst kaeme der Lead beim
  naechsten Takt wieder (Mail 1 erneut).

  Schreiben nur service_role (Abholer-Route im Kostenrechner), RLS an.
  Rein additiv (Święta zasada 3): kein bestehender Code kennt die Tabelle.
*/

create table if not exists portal_api_log (
  portal text not null,
  extern_id text not null,
  status text not null check (status in ('erledigt', 'uebersprungen', 'abgelehnt', 'offen', 'altbestand')),
  grund text,
  lead_id uuid references leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (portal, extern_id)
);

alter table portal_api_log enable row level security;

/* Der Admin liest das Protokoll im Browser mit dem anon-Key (Abschnitt
   "Leads ohne Lead" im Portal-Reiter von /admin/leads). Nur SELECT.
   Muster: "Admin (anon) kann portal_mail_log lesen" (20260903150000). */
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'portal_api_log'
      and policyname = 'Admin (anon) kann portal_api_log lesen'
  ) then
    create policy "Admin (anon) kann portal_api_log lesen"
      on portal_api_log for select to anon
      using (true);
  end if;
end $$;

/* Realtime (Registry #48): der Admin lauscht per postgres_changes auch auf
   portal_api_log, sonst bliebe der API-Abschnitt bis zum Reload stehen.
   Guard wie in 20260903170000 (ADD TABLE wirft 42710 bei Doppelmitgliedschaft). */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'portal_api_log'
  ) then
    alter publication supabase_realtime add table public.portal_api_log;
  end if;
end $$;
