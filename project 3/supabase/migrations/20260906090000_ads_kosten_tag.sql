-- Werbeausgaben je Tag (Martin, 06.09.2026: „geil waere, wenn wir einen bereich
-- haetten im system wo wir das so sehen koennten, filtern koennten und auch nach
-- zeit filtern").
--
-- Warum gespeichert und nicht bei jeder Ansicht live geholt: die Google-Ads-API
-- braucht OAuth, Sekunden und ein Tageslimit. Fuer eine Seite mit freiem
-- Zeitfilter waere das jedes Mal ein Umweg ueber einen fremden Dienst. Der
-- Morgenbericht holt die Zahl ohnehin — er schreibt sie hier mit.
create table if not exists ads_kosten_tag (
  tag date primary key,
  kosten_netto numeric(10,2) not null default 0,
  aktualisiert_at timestamptz not null default now()
);

comment on table ads_kosten_tag is
  'Werbeausgaben je Tag (netto, EUR) aus Google Ads. Gefuellt vom Morgenbericht; erlaubt Auswertungen ueber freie Zeitraeume ohne Google-API-Aufruf.';

alter table ads_kosten_tag enable row level security;
-- Keine Policy: nur der Service-Key (Server) liest und schreibt. Der Anon-Key
-- liegt im Browser-Bundle, Kostendaten gehoeren dort nicht hin.
