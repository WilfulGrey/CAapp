/*
  # portal_mail_log — Verarbeitungsprotokoll des Portal-Abholers

  Ersetzt die IMAP-\Seen-Flagge als Gedächtnis des Abholers (Registry #47).
  Zweimal (02.–03.09.) hat ein offener Webmail-Client Mails als gelesen
  markiert und der Cron sah sie nie; dauerhaft kaputte Mails hielten den
  Lauf ewig auf HTTP 500. Ab jetzt ist das Postfach für uns READ-ONLY —
  Menschen dürfen darin sitzen, die Wahrheit ist diese Tabelle.

  Eine Zeile je (postfach, uidvalidity, uid). Status:
    erledigt      — Lead angelegt (lead_id gesetzt)
    uebersprungen — Schutzregeln (zu alt, Status nicht ansprechbar); grund
    abgelehnt     — deterministisch (keine Einwilligung, keine Adresse,
                    HTTP 400): dauerhaft, KEIN Retry — beendet die
                    500-jede-Minute-Schleife (Registry #46)
    offen         — transient (5xx, Netz): nächster Takt versucht erneut;
                    NUR dieser Status färbt den Lauf rot
    altbestand    — beim Erstlauf eines (postfach, uidvalidity)-Paars
                    vorgefunden, nie verarbeitet (Seed-Muster Bug #25 —
                    schützt Historie und UIDVALIDITY-Wechsel vor erneuter
                    Mail 1). uid=0 = Sentinel "Postfach war leer beim
                    Initialisieren" (echte IMAP-UIDs beginnen bei 1).

  lead_id: ON DELETE SET NULL, NICHT cascade — eine mitgelöschte Zeile
  ließe die Mail im nächsten Takt wiederauferstehen (Mail 1 erneut).

  Schreiben nur service_role (Abholer-Route im Kostenrechner) — RLS an,
  keine Schreib-Policies. Rein additiv (Święta zasada 3): kein bestehender
  Code liest oder schreibt sie.
*/

create table if not exists portal_mail_log (
  postfach text not null,
  uidvalidity bigint not null,
  uid bigint not null,
  status text not null check (status in ('erledigt', 'uebersprungen', 'abgelehnt', 'offen', 'altbestand')),
  grund text,
  lead_id uuid references leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (postfach, uidvalidity, uid)
);

alter table portal_mail_log enable row level security;

/* Der Admin liest das Protokoll im Browser mit dem anon-Key (Abschnitt
   "Postfach" im Portal-Reiter von /admin/leads). Nur SELECT — schreiben
   kann weiterhin ausschliesslich service_role.
   Muster: "Admin (anon) kann lead_jobs lesen" (20260804090000). */
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'portal_mail_log'
      and policyname = 'Admin (anon) kann portal_mail_log lesen'
  ) then
    create policy "Admin (anon) kann portal_mail_log lesen"
      on portal_mail_log for select to anon
      using (true);
  end if;
end $$;
