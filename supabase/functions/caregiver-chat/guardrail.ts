// Serverseitiger Guardrail für den Pflegekraft-Chat — autoritative Prüfung
// (das clientseitige Pendant in PflegekraftChat.tsx ist nur UX). Kontaktdaten
// (Telefon/E-Mail) und Gehalts-/Geldangaben dürfen NICHT ausgetauscht werden;
// Vergütung + direkter Kontakt laufen ausschließlich über Primundus.
//
// Bewusst tolerant gegenüber legitimem Inhalt: Datumsangaben (z.B.
// 19.05.2026) bleiben erlaubt, weil Punkte als Trenner NICHT entfernt werden
// und so keine 7-stellige Ziffernfolge entsteht.

export type BlockReason = "kontakt" | "geld";

export function checkBlocked(text: string): BlockReason | null {
  // E-Mail
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return "kontakt";
  // Telefon: 7+ Ziffern am Stück nach Entfernen von Leerzeichen.
  if (/\d{7,}/.test(text.replace(/\s/g, ""))) return "kontakt";
  // Geldbetrag mit Währung (kein \b nach €, da € kein Wortzeichen ist)
  if (/\d[\d.,]*\s*(?:€|eur|euro)/i.test(text)) return "geld";
  // Gehalts-/Bezahl-Schlagworte (auch ohne Zahl)
  if (/(gehalt|lohn|bezahl|verdien|netto|brutto|schwarz|cash|bar\s*(zahl|geld))/i.test(text)) return "geld";
  return null;
}

export const BLOCK_MESSAGE: Record<BlockReason, string> = {
  kontakt:
    "Aus Sicherheitsgründen werden hier keine Kontaktdaten (Telefon/E-Mail) ausgetauscht. Den direkten Kontakt organisiert Primundus für Sie — Ihre Nachricht wurde nicht gesendet.",
  geld:
    "Fragen zu Gehalt oder Bezahlung klärt ausschließlich Primundus für Sie. Diese Nachricht wurde nicht gesendet.",
};
