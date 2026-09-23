-- Herkunft eines Rechner-Starts von primundus.de (23.09.2026):
-- `src` = Seite + Knopfposition, z. B. ort-worms-kopf, apex-kosten-schluss.
-- Jeder Knopf auf primundus.de sendet den Parameter seit Monaten, gespeichert
-- wurde er nie: 0 von 2.303 Sitzungen der letzten 30 Tage tragen einen.
-- Nullable, best-effort geschrieben (derselbe Weg wie gclid/utm_content in
-- 20260814090000) — fehlt die Migration, fehlt nur die Attribution, nie die Session.

alter table analytics_sessions
  add column if not exists src text;

comment on column analytics_sessions.src is
  'Herkunft von primundus.de: Seite + Knopfposition (URL-Parameter src)';
