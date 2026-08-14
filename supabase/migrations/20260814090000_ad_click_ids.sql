-- Google-Ads-Attribution (SEA-Lauf 14.08.2026):
-- 1) analytics_sessions bekommt die restlichen Kampagnen-Parameter
--    (utm_term/utm_content) plus Klick-IDs (gclid/wbraid/gbraid), damit
--    Ads-Traffic von Organik trennbar wird, sobald das UTM-Suffix im
--    Ads-Konto gesetzt ist.
-- 2) leads bekommt die Klick-IDs, damit qualifizierte Leads später als
--    Offline-Conversions zu Google importiert werden können.
-- Alle Spalten nullable => backward-compatible mit laufendem Code
-- (Święta zasada nr 3). Der Code schreibt sie zusätzlich fail-soft
-- (separates best-effort Update), verträgt also auch eine verspätet
-- applizierte Migration.

alter table analytics_sessions
  add column if not exists utm_term text,
  add column if not exists utm_content text,
  add column if not exists gclid text,
  add column if not exists wbraid text,
  add column if not exists gbraid text;

alter table leads
  add column if not exists gclid text,
  add column if not exists wbraid text,
  add column if not exists gbraid text;
