/*
 * Kopfleiste über Frage 1–8 und „So geht's“ unter Frage 1 (Martin 03.11.2026, Registry #146).
 *
 * Martin: „wenn man den Kostenrechner öffnet, da die Überschrift ändern und
 * vielleicht machen wir darunter, weil die erste Frage ja sehr kurz ist,
 * einfach die Infos …“. Die Kopfleiste sagt dasselbe wie die H1 der Startseite
 * („Passende Pflegekräfte sofort finden.“, #822), hier ohne Punkt. Der
 * Kontaktschritt behält seinen grünen Kopf (SCHRANKE.kopf).
 *
 * Wortlaute nur mit Martins Freigabe ändern.
 */

/** Rote Kopfleiste des Fragebogens, Frage 1–8. War „In 2 Minuten zu Ihrem Preis“. */
export const RECHNER_KOPF = 'Passende Pflegekräfte sofort finden';

/**
 * Ablauf in vier Schritten, nur unter den Antworten von Frage 1 („Wie viele Personen …“).
 * Schritt 1 in Martins eigenem Wort „preisrelevante Fragen“ (Nachbesserung 03.11.2026),
 * war „Ein paar Fragen zum Preis beantworten“.
 */
export const SO_GEHTS = {
  titel: "So geht's",
  schritte: [
    'Ein paar preisrelevante Fragen beantworten',
    'Kontaktdaten angeben',
    'Preis und passende Pflegekräfte sehen',
    'Pflegekräfte einladen: kurz die Pflegesituation beschreiben',
  ],
} as const;
