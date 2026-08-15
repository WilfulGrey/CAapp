/*
  # daily_report_notes — Notizen der SEO-/SEA-Agenten für den Tagesreport

  Die Agenten-Sessions schreiben nach jedem Lauf 1-3 Kernerkenntnisse
  hinein (source = 'seo' | 'sea', note = ein kurzer deutscher Satz).
  daily-analytics-report liest alles seit Tagesbeginn des Report-Tags und
  hängt es als Abschnitt "Notizen der Agenten" an die Morgen-Mail.

  Backward-kompatibel (Święta zasada 3): neue Tabelle, kein bestehender
  Code liest/schreibt sie. RLS aktiv ohne anon-Policies — Zugriff nur per
  Service-Role (Agenten + Report-Funktion).
*/

CREATE TABLE IF NOT EXISTS daily_report_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Berlin')::date),
  source text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_report_notes_created_at
  ON daily_report_notes (created_at DESC);

ALTER TABLE daily_report_notes ENABLE ROW LEVEL SECURITY;
