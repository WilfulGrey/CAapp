/*
  # pria_gespraeche — Mitschrift der Chats mit Pria

  Eine Zeile je Ereignis, geklammert über `sid` (eine Sitzung = ein Gespräch).
  Damit lässt sich hinterher nachlesen, was VOR der Kontaktaufnahme im Chat
  stand und was danach — und wo Pria danebenlag.

  `lead_id` bleibt leer, bis aus dem Gespräch ein Lead wird; dann wird es in
  allen Zeilen derselben `sid` nachgetragen. So hängt der Lead am Gespräch und
  das Gespräch am Lead.

  Backward-kompatibel (Święta zasada 3): neue Tabelle, kein bestehender Code
  liest oder schreibt sie. RLS aktiv ohne anon-Policies — Zugriff nur per
  Service-Role (die Schreibroute und die Admin-Seite laufen serverseitig).

  Aufbewahrung: Gesprächstexte sind personenbezogen, sobald jemand seine
  Situation schildert. `alt_aufraeumen()` löscht alles, was älter als 180 Tage
  ist UND zu keinem Lead gehört; der Aufruf gehört in den bestehenden
  Cron-Kontext, nicht in den Request-Pfad.
*/

CREATE TABLE IF NOT EXISTS pria_gespraeche (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sid text NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  -- 'kunde' | 'pria' | 'modell' | 'system'
  rolle text NOT NULL,
  text text NOT NULL DEFAULT '',
  -- Entscheidung des Modells: typ/feld/werte, plus Tokenverbrauch.
  -- Als jsonb, weil sich das Werkzeug noch ändern wird.
  meta jsonb,
  -- 'lead' | 'funnel' | 'portal_handoff' — markiert die Wendepunkte
  ereignis text,
  zeit timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ein Gespräch am Stück lesen.
CREATE INDEX IF NOT EXISTS idx_pria_gespraeche_sid_zeit
  ON pria_gespraeche (sid, zeit);
-- Liste im Admin: das Neueste zuerst.
CREATE INDEX IF NOT EXISTS idx_pria_gespraeche_zeit
  ON pria_gespraeche (zeit DESC);
-- Vom Lead zum Gespräch springen.
CREATE INDEX IF NOT EXISTS idx_pria_gespraeche_lead
  ON pria_gespraeche (lead_id) WHERE lead_id IS NOT NULL;

ALTER TABLE pria_gespraeche ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE pria_gespraeche IS
  'Mitschrift der Pria-Chats. lead_id wird nachgetragen, sobald aus dem Gespräch ein Lead wird.';
