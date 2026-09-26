-- Partner-Akquise: eigener Versand der Rundmail + drei Nachfassmails an Vermittler.
--
-- Drei Tabellen, alle nur für den Service-Key (RLS an, keine Policy):
--   partner_kontakte        — die Liste (Import aus CSV), Status stoppt die Reihe
--   partner_mail_freigaben  — Sperre PRO MAIL: ohne freigegeben_am geht diese Mail an niemanden
--   partner_mail_versand    — jede Zustellung genau einmal (unique Kontakt × Mail)
--
-- Martin, 11.09.2026: „Es darf aber keine mail raus, bevor das nicht explizit
-- freigegeben wurde von mir.“ freigegeben_am wird nur gesetzt, nachdem Martin
-- die jeweilige Mail im Chat freigegeben hat. Zusätzlich muss in der
-- Edge-Function PARTNER_VERSAND_AKTIV=1 gesetzt sein (zweiter Schalter).

create table if not exists public.partner_kontakte (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  firma         text,
  anrede        text check (anrede in ('Herr', 'Frau')),
  vorname       text,
  nachname      text,
  domain        text generated always as (lower(split_part(email, '@', 2))) stored,
  -- A/B nur für den Betreff der Hauptmail (A = Kunden, B = Anfragen)
  variante      text not null check (variante in ('A', 'B')),
  status        text not null default 'aktiv'
                check (status in ('aktiv', 'abgemeldet', 'angemeldet', 'geantwortet', 'unzustellbar', 'ausgeschlossen')),
  status_seit   timestamptz,
  abmelde_token uuid not null default gen_random_uuid(),
  quelle        text,
  created_at    timestamptz not null default now()
);

create unique index if not exists partner_kontakte_email_uidx on public.partner_kontakte (lower(email));
create unique index if not exists partner_kontakte_token_uidx on public.partner_kontakte (abmelde_token);
create index if not exists partner_kontakte_status_idx on public.partner_kontakte (status);

create table if not exists public.partner_mail_freigaben (
  mail            text primary key check (mail in ('haupt', 'nf1', 'nf2', 'nf3')),
  freigegeben_am  timestamptz,
  freigegeben_von text,
  notiz           text
);

insert into public.partner_mail_freigaben (mail) values ('haupt'), ('nf1'), ('nf2'), ('nf3')
on conflict (mail) do nothing;

create table if not exists public.partner_mail_versand (
  id          bigserial primary key,
  kontakt_id  uuid not null references public.partner_kontakte (id) on delete cascade,
  mail        text not null check (mail in ('haupt', 'nf1', 'nf2', 'nf3')),
  -- reserviert: vor dem SMTP-Aufruf eingetragen, damit zwei Läufe nie doppelt senden
  status      text not null default 'reserviert' check (status in ('reserviert', 'gesendet', 'fehler')),
  betreff     text,
  fehler      text,
  erstellt_am timestamptz not null default now(),
  gesendet_am timestamptz,
  unique (kontakt_id, mail)
);

create index if not exists partner_mail_versand_gesendet_idx on public.partner_mail_versand (gesendet_am);

alter table public.partner_kontakte       enable row level security;
alter table public.partner_mail_freigaben enable row level security;
alter table public.partner_mail_versand   enable row level security;
