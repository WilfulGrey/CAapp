/**
 * Die drei Punkte von /kalkulation (Seite und Druck), der Preisseite (aus seit
 * Registry #80), der älteren Portal-Ansichten (Spiegel src/lib/heroPunkte.ts)
 * und der Mails (MAIL_HERO_PUNKTE). Bis Registry #158 (09.11.2026) standen sie
 * auch unter dem Hero-Knopf; dort stehen jetzt PORTAL_PUNKTE (unten).
 * Der Punkt „Bestpreisgarantie · Mehr Infos" hängt an GARANTIE.wort
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
