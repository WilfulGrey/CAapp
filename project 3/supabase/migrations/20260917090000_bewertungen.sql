-- Kundenbewertungen fuer primundus.de/erfahrungen (17.09.2026).
--
-- Die Seite primundus.de/erfahrungen (anderes Repo) schreibt und liest ueber
-- /api/bewertungen des Kostenrechners. Ablauf und Umgebungsvariablen:
-- project 3/lib/bewertungen.ts.
--
-- Status: unbestaetigt (E-Mail-Link noch nicht geklickt) → bestaetigt (wartet
-- auf das Team) → veroeffentlicht | abgelehnt. Oeffentlich sichtbar ist nur
-- veroeffentlicht.
--
-- Tokens stehen nur als sha256-Hash hier. Wer die Datenbank liest, kann damit
-- keine Bewertung bestaetigen oder freigeben.
--
-- Rueckwaertskompatibel (neue Tabelle): alter Code liest und schreibt sie nicht.

create table if not exists public.bewertungen (
  id uuid primary key default gen_random_uuid(),
  erstellt_am timestamptz not null default now(),

  sterne smallint not null check (sterne between 1 and 5),
  text text not null,
  name text not null,
  ort text null,
  email text not null,

  ip_hash text null,
  user_agent text null,

  status text not null default 'unbestaetigt'
    check (status in ('unbestaetigt', 'bestaetigt', 'veroeffentlicht', 'abgelehnt')),
  bestaetigen_token_hash text unique,
  moderation_token_hash text unique,
  bestaetigt_am timestamptz null,
  veroeffentlicht_am timestamptz null,
  abgelehnt_am timestamptz null,

  kunde_bestaetigt boolean not null default false,
  lead_id uuid null references public.leads(id) on delete set null,

  antwort text null,
  antwort_am timestamptz null,

  quelle text not null default 'primundus.de/erfahrungen',
  turnstile_ok boolean null
);

comment on table public.bewertungen is
  'Kundenbewertungen fuer primundus.de/erfahrungen. Nur status=veroeffentlicht ist oeffentlich (GET /api/bewertungen). Tokens nur als sha256-Hash.';
comment on column public.bewertungen.ip_hash is
  'sha256(BEWERTUNG_HASH_SALT + IP). Nur fuer das Limit von 3 Bewertungen je 24 h, keine Klartext-IP.';
comment on column public.bewertungen.kunde_bestaetigt is
  'Vom Team bei der Freigabe gesetzt („als bestaetigter Kunde markieren“). Nie automatisch.';
comment on column public.bewertungen.lead_id is
  'Neuester Nicht-Test-Lead mit derselben E-Mail zum Zeitpunkt der Bestaetigung. Nur Hinweis fuers Team.';
comment on column public.bewertungen.antwort is
  'Oeffentliche Antwort von Primundus. Wird derzeit direkt in der Datenbank gepflegt.';

-- Oeffentliche Liste: status = veroeffentlicht, neueste zuerst.
create index if not exists bewertungen_status_veroeffentlicht_idx
  on public.bewertungen (status, veroeffentlicht_am desc);
-- E-Mail-Sperre (eine aktive Bewertung je Adresse in 30 Tagen).
create index if not exists bewertungen_email_lower_idx
  on public.bewertungen (lower(email));
-- IP-Limit (3 je 24 h).
create index if not exists bewertungen_ip_hash_erstellt_idx
  on public.bewertungen (ip_hash, erstellt_am);

alter table public.bewertungen enable row level security;
-- Keine Policy: nur der Service-Key (Server) liest und schreibt. Der Anon-Key
-- liegt im Browser-Bundle; E-Mail-Adressen und IP-Hashes gehoeren dort nicht hin.
