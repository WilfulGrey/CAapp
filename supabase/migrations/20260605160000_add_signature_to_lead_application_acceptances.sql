/*
  # Signatur-/Audit-Spalten für lead_application_acceptances

  Stufe B des Vertragsflows: beim Buchen unterschreibt der Kunde online. Wir
  speichern die elektronische Signatur (getippter Name) + Zeitstempel + IP als
  einfachen Audit-Trail, plus einen Snapshot der Vertragsdaten (Parteien,
  Zeitraum, Tagessatz), aus dem die Vertragskopie (HTML) erzeugt + an Kunde
  und Team gemailt wurde.

  Additiv (alle Spalten nullable) — bestehende Acceptance-Zeilen bleiben gültig.

  Manueller Apply (kein CI für Migrations):
    npx supabase db push --linked --project-ref ycdwtrklpoqprabtwahi
*/

ALTER TABLE lead_application_acceptances
  ADD COLUMN IF NOT EXISTS signatur text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_ip text,
  ADD COLUMN IF NOT EXISTS contract_snapshot jsonb;
