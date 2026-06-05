/*
  # lead_caregiver_messages

  Chat-Verlauf zwischen Kunde (Lead) und beworbener Pflegekraft. Der Kunde
  schreibt im Portal auf Deutsch; die Nachricht wird automatisch ins Polnische
  übersetzt (text_pl) und umgekehrt für Antworten der Pflegekraft (text_de).

  Rollen / Sprachrichtung:
    - sender='customer'  : Kunde → Pflegekraft. Eingabe Deutsch (text_de),
                           Übersetzung Polnisch (text_pl).
    - sender='caregiver' : Pflegekraft → Kunde. Eingabe Polnisch (text_pl),
                           Übersetzung Deutsch (text_de). Wird von Mamamia
                           über die reply-Action eingespielt.
    - sender='system'    : interne Hinweise (reserviert; aktuell ungenutzt —
                           Guardrail-Blocks werden NICHT gespeichert, sondern
                           sofort mit 422 abgelehnt).

  Sicherheit / Datenschutz:
    - Kontaktdaten (Telefon/E-Mail) und Gehalts-/Geldangaben werden vom
      caregiver-chat-Edge-Function-Guardrail VOR dem Insert blockiert.
    - Service-role only (RLS an, keine public policy) — Zugriff ausschließlich
      über die caregiver-chat Edge-Function (Token- bzw. Shared-Secret-Auth).

  Zustellung in die Caregiver-App liegt bei Mamamia (liest neue
  Kundennachrichten + postet Antworten via reply-Action).

  Manueller Apply (kein CI für Migrations):
    npx supabase db push --linked --project-ref ycdwtrklpoqprabtwahi
*/

CREATE TABLE IF NOT EXISTS lead_caregiver_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  application_id integer,
  caregiver_id integer,
  sender text NOT NULL CHECK (sender IN ('customer', 'caregiver', 'system')),
  text_de text,
  text_pl text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Verlauf wird pro Lead (+ optional Bewerbung) chronologisch geladen.
CREATE INDEX IF NOT EXISTS idx_lead_caregiver_messages_lead
  ON lead_caregiver_messages(lead_id, application_id, created_at);

ALTER TABLE lead_caregiver_messages ENABLE ROW LEVEL SECURITY;
