/*
  # lead_jobs — Multi-Job-Support pro Lead

  Bis heute: 1 Lead = 1 Mamamia-JobOffer (leads.mamamia_job_offer_id).
  Wenn das Primundus-Team nach einer Buchung einen Folge-Einsatz für
  denselben Customer in Mamamia anlegt, hatten wir keinen Platz dafür in
  unserer DB — das Portal konnte nur den ersten Job anzeigen, alle weiteren
  Bewerbungen/Acceptances liefen ins Leere.

  Neue Tabelle lead_jobs (1:N zum Lead) macht Multi-Job sauber abbildbar:
  ein "Job" ist eine Mamamia-JobOffer.id, gespiegelt mit Status + Daten.

  Status-Modell (drei persistente Werte, einer abgeleitet):

    geplant        keine Acceptance, Suchlauf läuft
    gebucht        Acceptance vorhanden, Anreise jetzt oder Zukunft
    abgeschlossen  Abreise < heute
    storniert      Job abgesagt (Customer/Team)

  'laufend' ist KEIN persistenter Status — wird im Frontend abgeleitet
  als (status=gebucht UND anreise <= today < abreise). Spart einen Cron,
  der Status zeitabhängig schreiben würde.

  Migration ist additiv: ALLE bestehenden Leads bekommen per Backfill einen
  lead_jobs-Eintrag aus leads.mamamia_job_offer_id, alle bestehenden
  Acceptances werden auf den neuen Job verlinkt. leads.mamamia_job_offer_id
  bleibt vorerst bestehen (Bridge-Code liest noch davon) — wird in
  Phase 3 entfernt, wenn alle Queries auf job_id umgestellt sind.

  Manueller Apply (kein CI für Migrations):
    npx supabase db push --linked --project-ref ycdwtrklpoqprabtwahi
*/

-- ─── 1. lead_jobs Tabelle ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  mamamia_job_offer_id integer NOT NULL,
  status               text NOT NULL DEFAULT 'geplant'
                       CHECK (status IN ('geplant', 'gebucht', 'abgeschlossen', 'storniert')),
  anreise              date,
  abreise              date,
  -- Frontend-Sortier-Hint (1 = oben). Default 0 = "von Mamamia-Datum
  -- ableiten". Wird selten manuell gesetzt.
  position             integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Pro Lead darf eine Mamamia-JobOffer.id nur EINMAL existieren.
  -- Schützt vor Doppel-Sync.
  UNIQUE (lead_id, mamamia_job_offer_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_jobs_lead_id
  ON lead_jobs(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_jobs_mamamia_job_offer_id
  ON lead_jobs(mamamia_job_offer_id);

-- updated_at-Trigger für UPSERT-Tracking (Mamamia-Sync wird oft
-- Daten aktualisieren — anreise/abreise/status können sich ändern).
CREATE OR REPLACE FUNCTION set_lead_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lead_jobs_updated_at ON lead_jobs;
CREATE TRIGGER lead_jobs_updated_at
  BEFORE UPDATE ON lead_jobs
  FOR EACH ROW EXECUTE FUNCTION set_lead_jobs_updated_at();

ALTER TABLE lead_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE lead_jobs IS
  'Multi-Job-Support: 1:N vom Lead. Spiegelt Mamamia-JobOffer-IDs + Status. Source-of-truth Status = (gebucht/geplant/abgeschlossen/storniert); ''laufend'' wird im Frontend zeitlich aus (gebucht + anreise <= today < abreise) abgeleitet.';

COMMENT ON COLUMN lead_jobs.mamamia_job_offer_id IS
  'JobOffer.id aus Mamamia. Innerhalb eines Leads eindeutig (UNIQUE constraint).';

COMMENT ON COLUMN lead_jobs.status IS
  'Persistenter Job-Status. ''laufend'' ist KEIN Wert hier — wird im Frontend zeitlich abgeleitet aus (gebucht + anreise im Zeitraum).';

COMMENT ON COLUMN lead_jobs.position IS
  'Manueller Sortier-Override fürs Portal. Default 0 = nach Status + Anreise sortieren. Selten gesetzt.';

-- ─── 2. lead_application_acceptances bekommt job_id ──────────────────
ALTER TABLE lead_application_acceptances
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES lead_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lead_application_acceptances_job_id
  ON lead_application_acceptances(job_id) WHERE job_id IS NOT NULL;

COMMENT ON COLUMN lead_application_acceptances.job_id IS
  'FK auf lead_jobs. Zeigt, zu welchem konkreten Job (= Mamamia-JobOffer) diese Acceptance gehört. NULL für historische Acceptances vor der Multi-Job-Migration (Backfill verlinkt sie auf den Default-Job).';

-- ─── 3. Backfill: für jeden bestehenden Lead einen lead_jobs Eintrag ──
-- Status leiten wir aus dem aktuellen Stand ab:
--   - Wenn eine Acceptance existiert → gebucht (Pflegekraft + Vertrag stehen)
--   - Sonst                          → geplant (kein/laufender Suchlauf)
-- Abreise aus der Vergangenheit haben wir in den alten Daten nicht — kommt
-- mit Phase 2 (Mamamia-Sync schreibt anreise/abreise nach).
INSERT INTO lead_jobs (lead_id, mamamia_job_offer_id, status, created_at)
SELECT
  l.id AS lead_id,
  l.mamamia_job_offer_id,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM lead_application_acceptances
      WHERE lead_id = l.id
    ) THEN 'gebucht'
    ELSE 'geplant'
  END,
  COALESCE(l.mamamia_onboarded_at, l.created_at)
FROM leads l
WHERE l.mamamia_job_offer_id IS NOT NULL
ON CONFLICT (lead_id, mamamia_job_offer_id) DO NOTHING;

-- ─── 4. Bestehende Acceptances per lead_id auf den neuen Job verlinken ──
-- Sicher annehmbar: vor der Migration hatte jeder Lead genau einen Job,
-- also matched lead_id eindeutig den einen lead_jobs-Eintrag.
UPDATE lead_application_acceptances a
SET job_id = j.id
FROM lead_jobs j
WHERE a.lead_id = j.lead_id
  AND a.job_id IS NULL;
