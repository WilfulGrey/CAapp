-- Facebook-/Instagram-Leads aus Meta-Sofortformularen (Rückruf-Anzeige, 11/2026).
--
-- POST /api/cron/meta-leads im Kostenrechner holt sie über die Graph API
-- (project 3/lib/meta-leads.ts) und schreibt sie hierher. id = Lead-ID von
-- Meta: Einfügen mit ON CONFLICT DO NOTHING, ein Lead landet nie doppelt und
-- bekommt nie zwei Mails. Nur frisch eingefügte Zeilen lösen die Team-Mail
-- und die Bestätigungsmail an den Lead aus.
--   notified_at      Team-Mail verschickt
--   confirm_sent_at  Bestätigungsmail an den Lead verschickt
--   fields           alle Antworten des Formulars roh (field_data)
--
-- Der Cron, der die Route aufruft: 20261125120100_setup_meta_leads_cron.sql
-- (lag bis zur Freigabe am 27.11.2026 in supabase/nach-freigabe/).
--
-- Rückwärtskompatibel (Święta zasada 3): neue Tabelle, alter Code liest und
-- schreibt sie nicht.

create table if not exists public.fb_leads (
  id              text        primary key,
  form_id         text,
  form_name       text,
  ad_name         text,
  campaign_name   text,
  platform        text,
  created_time    timestamptz not null,
  name            text,
  email           text,
  phone           text,
  fields          jsonb       not null default '{}'::jsonb,
  status          text        not null default 'Neu',
  notes           text        not null default '',
  notified_at     timestamptz,
  confirm_sent_at timestamptz,
  inserted_at     timestamptz not null default now()
);

create index if not exists fb_leads_created_time on public.fb_leads (created_time desc);

alter table public.fb_leads enable row level security;
-- Keine Policies: nur service_role (Route /api/cron/meta-leads).
revoke all on table public.fb_leads from anon, authenticated;
