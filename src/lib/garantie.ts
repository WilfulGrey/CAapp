// Bestpreisgarantie im Portal-Pop-up (Portal-Redesign Teil 3, Martin 24.09.2026: „eigenes
// Pop-up, nicht Link raus"). Wortlaut 1:1 aus dem Kostenrechner (`project 3/lib/kraefte-vorschau.ts`
// GARANTIE, von Martin am 12.09. freigegeben) — nur mit ihm ändern.
// ⚠️ Spiegel: src/__tests__/garantie.test.ts prüft Zeichen für Zeichen gegen das Original.

export const GARANTIE_PORTAL = {
  titel: 'Bestpreisgarantie',
  zusage: 'Bei uns zahlen Sie nie mehr als für ein vergleichbares Angebot.',
  ablauf: 'Legen Sie uns das Angebot vor, wir passen unseren Preis an. Marta antwortet innerhalb eines Werktags.',
  warum: 'Das können wir, weil unsere Pflegekräfte bei uns angestellt sind und keine Vermittlungsgebühr anfällt.',
  aufklappen: 'Was heißt vergleichbar?',
  bedingungen: [
    'Die gleiche Betreuungssituation und der gleiche Umfang',
    'Legal angestelltes Personal mit A1-Bescheinigung',
    'Vergleichbare Qualifikation: Sprache, Führerschein, Erfahrung',
    'Gesamtpreis pro Monat, nicht der Eigenanteil nach Zuschüssen',
    'Schriftliches Angebot, nicht älter als 14 Tage',
  ],
} as const;
