/*
  # Vertrags-Audit-Ausbau für lead_application_acceptances (Refactor PR1)

  Vollständiger Audit-Trail der Online-Unterschrift + Grundlage für den
  server-seitigen Mamamia-Sync (PR2):

  - contract_version        — Version des Vertragstextes (z.B. 'v1.0'). Der §§-Text
                              lebt im Code; ohne Version rendern alte Verträge nach
                              einer Textänderung mit NEUEM Wortlaut. Ab jetzt pinnen wir.
  - signed_ort              — Ort der Unterschrift (wurde bisher im Browser verworfen).
  - consent_read /          — die beiden Pflicht-Checkboxen (Vertragstext gelesen /
    consent_widerruf          Widerrufsbelehrung akzeptiert). Bisher nur UI-Gate,
                              nie persistiert — Beweislücke.
  - contract_ag             — Auftraggeber-Block als diskrete Felder (jsonb). Bisher
                              überlebte AG nur einkomponiert im contract_snapshot.
  - pdf_sha256              — SHA-256 des einmal gerenderten Vertrags-PDFs (Tamper-
                              Evidence; gleiche Bytes gehen an Mails + Mamamia S3).
  - mamamia_confirmed_at /  — Sync-Stempel Phase A (StoreConfirmation verarbeitet,
    mamamia_confirmation_id   Confirmation-Id übernommen).
  - mamamia_pdf_uploaded_at — Sync-Stempel Phase B (signiertes PDF via StoreFile →
                              UpdateConfirmation(file_tokens) angehängt — erst NACH
                              server-seitiger Verarbeitung der Confirmation erlaubt).
  - mamamia_sync_alerted_at — Team-Alert-Marker (Sync >24h unvollständig).

  Additiv (alle Spalten nullable) — bestehende Zeilen + alter Code bleiben gültig
  (Święta zasada nr 3, backward-compatible).

  Manueller Apply (kein CI für Migrations):
    scripts/apply-migrations.sh taggpiwpwthgpcmaiqjw   # staging zuerst
    scripts/apply-migrations.sh ycdwtrklpoqprabtwahi   # prod VOR dem Merge
*/

ALTER TABLE lead_application_acceptances
  ADD COLUMN IF NOT EXISTS contract_version text,
  ADD COLUMN IF NOT EXISTS signed_ort text,
  ADD COLUMN IF NOT EXISTS consent_read boolean,
  ADD COLUMN IF NOT EXISTS consent_widerruf boolean,
  ADD COLUMN IF NOT EXISTS contract_ag jsonb,
  ADD COLUMN IF NOT EXISTS pdf_sha256 text,
  ADD COLUMN IF NOT EXISTS mamamia_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS mamamia_confirmation_id integer,
  ADD COLUMN IF NOT EXISTS mamamia_pdf_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS mamamia_sync_alerted_at timestamptz;

-- Retry-Scan des Sync-Crons (PR2): unterschriebene, aber noch nicht (voll)
-- gesyncte Acceptances. Partial Index hält ihn winzig.
CREATE INDEX IF NOT EXISTS idx_acceptances_mamamia_sync_pending
  ON lead_application_acceptances (accepted_at)
  WHERE signatur IS NOT NULL
    AND (mamamia_confirmed_at IS NULL OR mamamia_pdf_uploaded_at IS NULL);
