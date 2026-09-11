/**
 * Telefonnummer im Kontakt-Schritt (Martin 11.09.2026: „ich kann Buchstaben
 * eingeben und der Button ist sofort aktiv — es dürften nur Zahlen und +
 * sein und eine Mindestanzahl").
 *
 * Maßstab sind 284 echte Anfragen seit 15.06.: kürzeste echte Festnetznummer
 * mit Vorwahl 8 Ziffern („0821 1234"), alles darunter war unvollständig;
 * Buchstaben kamen nur als „… oder …" zwischen zwei Nummern vor. Erlaubt
 * bleiben die Trennzeichen, die Kunden und Autofill wirklich tippen
 * (Leerzeichen, /, -, Klammern). „+" nur ganz vorne.
 *
 * Pur (kein React/Next) — Root-Vitest importiert es direkt.
 */

export const TELEFON_MIN_ZIFFERN = 8;
export const TELEFON_MAX_ZIFFERN = 15; // E.164

export const TELEFON_FEHLER = {
  leer: 'Bitte geben Sie Ihre Telefonnummer ein',
  kurz: 'Bitte die vollständige Nummer mit Vorwahl eingeben',
  lang: 'Bitte nur eine Telefonnummer eingeben',
} as const;

/** Entfernt beim Tippen alles außer Ziffern, Trennzeichen und einem führenden „+". */
export function telefonBereinigen(roh: string): string {
  const erlaubt = roh.replace(/[^\d+\s/()-]/g, '').replace(/\s{2,}/g, ' ');
  const plusVorne = erlaubt.trimStart().startsWith('+');
  const ohnePlus = erlaubt.replace(/\+/g, '');
  return plusVorne ? `+${ohnePlus.trimStart()}` : ohnePlus;
}

/** Ziffern ohne internationale Vorwahl-Einleitung „00". */
export function telefonZiffern(roh: string): string {
  const ziffern = roh.replace(/\D/g, '');
  return ziffern.startsWith('00') ? ziffern.slice(2) : ziffern;
}

/** '' = in Ordnung, sonst der Hinweistext. */
export function telefonFehler(roh: string): string {
  if (!roh.trim()) return TELEFON_FEHLER.leer;
  const n = telefonZiffern(roh).length;
  if (n < TELEFON_MIN_ZIFFERN) return TELEFON_FEHLER.kurz;
  if (n > TELEFON_MAX_ZIFFERN) return TELEFON_FEHLER.lang;
  return '';
}

export function telefonGueltig(roh: string): boolean {
  return telefonFehler(roh) === '';
}
