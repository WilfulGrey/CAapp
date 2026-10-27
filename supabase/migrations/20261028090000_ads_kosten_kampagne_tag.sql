-- Google-Ads-Kosten je Tag UND Kampagne (Registry #142, Martin 27.10.2026: „ja mach“
-- zur Admin-Seite „Trichter“ mit Kosten je Profil je Kanal).
--
-- ads_kosten_tag (project 3/supabase/migrations/20260906090000) hat nur die
-- Tagessumme. Für High Intent und PM getrennt braucht die Seite die Kosten je
-- Kampagne. Der Morgenbericht (daily-analytics-report) holt sie mit demselben
-- Ads-Zugang und schreibt sie hier per Upsert mit — Fehler bleiben im Log, die
-- Mail geht immer raus.
--
-- Liegt bewusst unter supabase/migrations (nicht project 3/): nur dieser Ordner
-- läuft über scripts/apply-migrations.sh — auf Staging per CI, auf Prod von Hand.
-- ads_kosten_tag lag in project 3/ und fehlt deshalb bis heute auf Staging.
--
-- Neue Tabelle, vom laufenden Code nicht gelesen: rückwärtskompatibel
-- (Święta zasada nr 3). Die Admin-Route meldet eine fehlende Tabelle als Hinweis.
create table if not exists public.ads_kosten_kampagne_tag (
  tag             date          not null,
  kampagne_id     text          not null,
  kampagne_name   text,
  kosten_netto    numeric(10,2) not null default 0,
  klicks          integer       not null default 0,
  impressionen    integer       not null default 0,
  aktualisiert_at timestamptz   not null default now(),
  primary key (tag, kampagne_id)
);

comment on table public.ads_kosten_kampagne_tag is
  'Werbeausgaben je Tag und Google-Ads-Kampagne (netto, EUR; Kampagne = campaign.id). Gefuellt vom Morgenbericht; Admin-Seite Trichter rechnet daraus Kosten je Profil je Kanal.';

alter table public.ads_kosten_kampagne_tag enable row level security;
-- Keine Policies: nur der Service-Key (Server) liest und schreibt. Der Anon-Key
-- liegt im Browser-Bundle, Kostendaten gehören dort nicht hin.
revoke all on table public.ads_kosten_kampagne_tag from anon, authenticated;
