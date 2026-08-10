/*
  # Deutsch-Grade trennen: „Gut" (Formular) und „Sehr gut" (nur SA-Portal)

  Fachlich (Martin, 10.08.2026):
    - level_3 = „Gut"      → 450 €, oberste im KUNDENFORMULAR wählbare Stufe
    - level_4 = „Sehr gut" → 600 €, ausschließlich vom SA-Portal wählbar

  1. Bestehende Zeile `sehr-gut` (450 €) bekommt das Label „Gut".
     Der ANTWORT-KEY bleibt bewusst `sehr-gut`: unter diesem Wert liegen alle
     bisherigen Leads in `formularDaten.deutschkenntnisse` gespeichert. Ein
     Umbenennen ließe deren Neuberechnung (recalculate-all-leads, Angebots-
     Anpassung) ins Leere laufen. Das Formular zeigt ohnehin schon „Gut".

  2. Neue Zeile `sehr-gut-sa` (600 €, Label „Sehr gut"). Sie ist im Formular
     NICHT auswählbar — die Kalkulation schlägt exakt den gewählten Antwort-Key
     nach, dieser Key kann dort also nie getroffen werden. Genutzt wird sie vom
     SA-Portal, das die mamamia-Stufe level_4 darauf abbildet.

  Idempotent: mehrfaches Ausführen ändert nichts.
*/

UPDATE pricing_config
   SET antwort_label = 'Gut',
       updated_at    = now()
 WHERE kategorie  = 'deutschkenntnisse'
   AND antwort_key = 'sehr-gut';

INSERT INTO pricing_config (kategorie, antwort_key, antwort_label, aufschlag_euro, sortierung, aktiv)
SELECT 'deutschkenntnisse', 'sehr-gut-sa', 'Sehr gut', 600, 4, true
 WHERE NOT EXISTS (
   SELECT 1 FROM pricing_config
    WHERE kategorie = 'deutschkenntnisse' AND antwort_key = 'sehr-gut-sa'
 );
