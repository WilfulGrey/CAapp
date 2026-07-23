-- Kanoniczny plik umowy (Michał 2026-07-21: „generować 1 PDF, wysyłać go do
-- klienta, do nas i na serwer. 1 i ten sam, niezmieniany plik").
--
-- Bridge renderuje PDF RAZ przy akcepcie i składa bajty tutaj:
--   contracts/<lead_id>/<application_id>.pdf
-- Z tego samego obiektu korzystają: załącznik Mail C (klient), mail teamowy,
-- upload do Mamamii (sync-acceptance / cron) i podgląd w portalu
-- (/api/contract-pdf). sha256 bajtów w lead_application_acceptances.pdf_sha256.
--
-- Bucket PRYWATNY, bez policies na storage.objects → dostęp wyłącznie
-- service-role (bridge + edge fns). Backward-compatible: stary kod bucketu
-- nie zna i dalej renderuje na żądanie (fallback zostaje w kodzie).

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;
