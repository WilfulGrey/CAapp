// Unsichtbare Messpunkte des Kundenportals (Registry #123, Martin 14.10.2026: „1,2,3 ja").
//
// Das Portal meldet sie über reportLeadEvent (src/lib/leadEvents.ts, dort dieselbe Liste MESSPUNKTE — ein Test
// vergleicht beide) an /api/lead-event. Sie sind REINE Aufzeichnung: Der Bridge-Endpoint nimmt sie in ALLOWED_EVENTS und
// NON_DEDUPED_EVENTS auf, aber nie in TEAM_NOTIFY_EVENTS, CUSTOMER_MAIL_EVENTS oder TRANSACTIONAL_MAIL_EVENTS, und er hat
// für sie keinen eigenen Zweig. Also keine Team-Mail, keine Kundenmail, kein Reminder, kein Status-Wechsel. Keine Edge
// Function liest sie (Offline-Conversions nur patient_data_saved bzw. die Buchung, Pausen- und Meilenstein-Listen sind
// feste Listen ohne diese Namen). Das Portal schickt sie zusätzlich mit `notify: false`.
//
// Nicht dedupliziert am Server: Das Portal meldet jeden Messpunkt einmal je Sitzung (Profil und Einladen je Pflegekraft,
// Häufige Fragen je Frage). Auswertung je Lead zählen, nicht Zeilen — wie patient_form_step (Registry #109/#122).
//
// metadata (keine Personendaten):
//   profil_geoeffnet        { caregiver_id, quelle: karte|liste|interesse|bewerbung|bearbeitet|gebucht|mail|sonstige, vor_speichern }
//   einladen_getippt        { caregiver_id, quelle: karte|interesse|profil, vor_speichern }
//   warum_geoeffnet         —   Pop-up „Warum erst die Pflegesituation?" (nur vor dem ersten Speichern)
//   bestpreis_geoeffnet     —   Pop-up Bestpreisgarantie
//   kosten_aufgeklappt      —   „Alle Kosten im Überblick"
//   faq_geoeffnet           { frage: kurzer Schlüssel, z. B. 'deutsch', 'ablauf' }
//   kalender_geoeffnet      —   Kalender des Startdatums im Patientenbogen
//   kalender_zu_ohne_datum  —   Kalender zu, kein Tag gewählt, Feld leer
//   formular_sichtbar       { schritt, vor_speichern }   erstes Feld des Patientenbogens zur Hälfte im Bild (Registry #130)
//   feld_beruehrt           { schritt, feld, vor_speichern }   Feld auf Seite 1 oder 3 angetippt; `feld` = data-field-Schlüssel
//   weiter_blockiert        { schritt, offen, vor_speichern }  „Weiter“/„Speichern“ mit offenen Pflichtfeldern (Schlüssel)
//   zur_pflegesituation     { quelle: kasten|warum|karte|schritte|frage|mail|stand, vor_speichern }  Knopf ins Formular
// `vor_speichern` = die Pflegesituation wurde noch nie gespeichert (Portal: !patientSaved && !schonAbgesendet).
export const MESSPUNKTE = [
  'profil_geoeffnet',
  'einladen_getippt',
  'warum_geoeffnet',
  'bestpreis_geoeffnet',
  'kosten_aufgeklappt',
  'faq_geoeffnet',
  'kalender_geoeffnet',
  'kalender_zu_ohne_datum',
  'formular_sichtbar',
  'feld_beruehrt',
  'weiter_blockiert',
  'zur_pflegesituation',
] as const;

export type Messpunkt = typeof MESSPUNKTE[number];
