// Kontakt zu Marta Kapcio — EINE Quelle für Telefon, WhatsApp und Erreichbarkeit im Portal.
//
// Vorher standen die Werte an sechs Stellen verstreut, zwei WhatsApp-Links grüßten noch
// „Hallo Frau Wysocki" (Vorgängerin von Marta), und die Zeiten hießen „8:00–18:00", während
// Website, Kostenrechner und Mails „täglich 8–20 Uhr" sagen (24.09.2026, Portal-Redesign).

export const BERATERIN = 'Marta Kapcio';
export const TELEFON = '089 200 000 830';
export const TELEFON_HREF = 'tel:+4989200000830';
export const ERREICHBAR = 'täglich 8–20 Uhr';

const WHATSAPP_NUMMER = '4989200000830';
/** Gleiche Vorlage wie im Kostenrechner (Marta-Karte). */
export const WHATSAPP_TEXT = 'Hallo Frau Kapcio, ich habe eine Rückfrage:';

/** WhatsApp-Link, optional mit vorausgefülltem Text. */
export function whatsappHref(text?: string): string {
  const basis = `https://wa.me/${WHATSAPP_NUMMER}`;
  return text ? `${basis}?text=${encodeURIComponent(text)}` : basis;
}

export const WHATSAPP_HREF = whatsappHref(WHATSAPP_TEXT);
