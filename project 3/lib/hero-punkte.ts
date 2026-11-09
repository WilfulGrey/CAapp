/**
 * Die drei Punkte unter dem Hero-Knopf — und seit 17.09.2026 auch unter dem
 * Knopf der Preisseite (Martin: „lös das doch so wie auf der Startseite").
 * EINE Quelle für beide Stellen, damit der Wortlaut nicht auseinanderläuft.
 * Der vierte Punkt („Bestpreisgarantie · Mehr Infos") hängt an GARANTIE.wort
 * und öffnet das Pop-up — er steht im Markup, nicht hier. Pur, ohne Imports.
 */
export const HERO_PUNKTE = [
  'Keine Vermittlungsgebühr',
  'Kein Vertrag vor Ihrer Auswahl',
  'Täglich kündbar, taggenau abgerechnet',
] as const;

/**
 * Seit Registry #158 (Martin 09.11.2026: „Punkte unter dem Button sind jetzt nicht die gleichen wie unter dem Preis …
 * vereinheitlichen?“) stehen unter dem Hero-Knopf dieselben drei Punkte wie im Portal unter dem Preis, nach der
 * Bestpreisgarantie: Spiegel von GARANTIE_PUNKTE in src/components/portal/EinstiegMinimal.tsx (Martin 08.11.: „Keine
 * Vorauszahlung, keine Vermittlungsgebühr. Keine Mindestlaufzeit … Beides genügt.“; „Kein Vertrag vor Ihrer Auswahl
 * finde ich kacke“, 22.10.). HERO_PUNKTE bleibt für /kalkulation (dort mit eigener Unterzeile je Punkt).
 */
export const PORTAL_PUNKTE = ['Keine Vorauszahlung', 'Keine Vermittlungsgebühr', 'Keine Mindestlaufzeit'] as const;
