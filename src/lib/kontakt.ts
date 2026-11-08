// Kontakt zu Marta Kapcio — EINE Quelle für Telefon, WhatsApp und Erreichbarkeit im Portal.
//
// Vorher standen die Werte an sechs Stellen verstreut, zwei WhatsApp-Links grüßten noch
// „Hallo Frau Wysocki" (Vorgängerin von Marta), und die Zeiten hießen „8:00–18:00", während
// Website, Kostenrechner und Mails „täglich 8–20 Uhr" sagen (24.09.2026, Portal-Redesign).

export const BERATERIN = 'Marta Kapcio';
export const TELEFON = '089 200 000 830';
export const TELEFON_HREF = 'tel:+4989200000830';
export const ERREICHBAR = 'täglich 8–20 Uhr';
/** Dieselben Zeiten als Zahlen (Stunde, deutsche Zeit): von 8:00 bis 19:59. */
export const ERREICHBAR_VON = 8;
export const ERREICHBAR_BIS = 20;

// formatToParts statt format: „de-DE“ schreibt die Stunde allein als „08 Uhr“.
const STUNDE_BERLIN = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' });

/** Ist Marta gerade erreichbar (täglich 8–20 Uhr deutscher Zeit, auch wenn das Gerät in einer anderen Zeitzone steht)?
 *  Minimal-Einstieg (Registry #147, Martin 08.11.: „in der Arbeitszeit … so einen grünen Punkt … danach blenden wir Anrufen
 *  aus … nur noch WhatsApp aktiv, weil außerhalb der Geschäftszeiten“). Feiertage kennt die Regel nicht (Zeiten „täglich“). */
export function istErreichbar(jetzt: Date = new Date()): boolean {
  const stunde = Number(STUNDE_BERLIN.formatToParts(jetzt).find((t) => t.type === 'hour')?.value);
  return stunde >= ERREICHBAR_VON && stunde < ERREICHBAR_BIS;
}

const WHATSAPP_NUMMER = '4989200000830';
/** Gleiche Vorlage wie im Kostenrechner (Marta-Karte). */
export const WHATSAPP_TEXT = 'Hallo Frau Kapcio, ich habe eine Rückfrage:';

/** WhatsApp-Link, optional mit vorausgefülltem Text. */
export function whatsappHref(text?: string): string {
  const basis = `https://wa.me/${WHATSAPP_NUMMER}`;
  return text ? `${basis}?text=${encodeURIComponent(text)}` : basis;
}

export const WHATSAPP_HREF = whatsappHref(WHATSAPP_TEXT);
