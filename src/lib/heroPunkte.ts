// Die Vorteile, die bis Registry #158 (09.11.2026) im Kopf der Kostenrechner-Startseite standen; dort stehen
// jetzt die Punkte von EinstiegMinimal (GARANTIE_PUNKTE). Hier für die älteren Ansichten (Martin 25.09.2026: „die Vorteile so
// verwenden, wie wir sie auf der Website haben … wie beim Kostenrechner auf der Startseite oben im
// Hero"). Der vierte Punkt „Bestpreisgarantie · Mehr Infos" steht im Markup und öffnet das Pop-up.
// ⚠️ Spiegel von `project 3/lib/hero-punkte.ts` — src/__tests__/heroPunkte.test.ts prüft den Wortlaut.
export const HERO_PUNKTE = [
  'Keine Vermittlungsgebühr',
  'Kein Vertrag vor Ihrer Auswahl',
  'Täglich kündbar, taggenau abgerechnet',
] as const;
