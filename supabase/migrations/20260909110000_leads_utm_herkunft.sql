-- Kanal-Attribution am Lead (SEA, 09.09.2026): Seit dem 04.09. laufen neben
-- Google Ads auch Anzeigen in ChatGPT (OpenAI Ads). Google-Leads sind über
-- gclid/wbraid/gbraid erkennbar (Migration 20260814090000), ChatGPT-Klicks
-- bringen keine Klick-ID mit, nur UTM-Parameter. Damit Auswertungen die
-- Kanäle trennen können (Leads je Kanal, Kosten je Lead), landen die fünf
-- UTM-Werte der Sitzung jetzt am Lead — gleiche Mechanik wie die Klick-IDs:
-- nullable Spalten, im Code ein separates best-effort Update (fail-soft,
-- Święta zasada 3: Lead-Erstellung scheitert nie an fehlenden Spalten).

alter table leads
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text;
