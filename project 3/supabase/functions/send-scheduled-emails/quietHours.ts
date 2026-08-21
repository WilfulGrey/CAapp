/**
 * Nachtruhe für Kundenmails (Martin, 19.08.: „wir versenden Mails an Kunden
 * auch nachts" — gemessen: 22 % aller Kundenmails der letzten 30 Tage gingen
 * zwischen 21:00 und 07:00 raus, 59 davon zwischen Mitternacht und 6 Uhr).
 *
 * Ursache: alle Ketten rechnen rein relativ („+4 h", „+12 h", „+48 h") ab dem
 * auslösenden Ereignis. Eine Bewerbung um 13:00 ⇒ 12-Stunden-Erinnerung um
 * 01:00 nachts.
 *
 * Regel: Was in die Ruhezeit fällt, rutscht auf den nächsten Morgen um 8:00
 * BERLINER Zeit — nie früher als ursprünglich geplant. Transaktionale Mails
 * (Eingangsbestätigung, Buchungsbestätigung, Angebots-Anpassung) sind
 * ausgenommen: sie beantworten eine Handlung des Kunden, da wäre Warten
 * schlechter als Nachtruhe.
 *
 * ⚠️ ZWEITE KOPIE in project 3/lib/quiet-hours.ts —
 * Edge Functions können nicht aus lib/ importieren (CI kopiert nur den
 * functions-Ordner; gleiche Lage wie appendJobParam/names.ts). Änderungen
 * IMMER in beiden Dateien.
 */

/** Ab dieser Berliner Stunde wird nicht mehr zugestellt. */
export const RUHE_AB_STUNDE = 21;
/** Ab dieser Berliner Stunde wieder — auch die Zielzeit der Verschiebung. */
export const RUHE_BIS_STUNDE = 8;

/** Kalenderfelder eines Zeitpunkts in Berliner Zeit. */
function berlinFelder(d: Date): { jahr: number; monat: number; tag: number; stunde: number } {
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(d);
  const hole = (typ: string) => Number(teile.find((t) => t.type === typ)?.value ?? '0');
  // 24 kommt bei hour12:false für Mitternacht vor — auf 0 normalisieren.
  const stunde = hole('hour') % 24;
  return { jahr: hole('year'), monat: hole('month'), tag: hole('day'), stunde };
}

/**
 * Der Zeitpunkt, an dem in Berlin an diesem Kalendertag 8:00 ist — als echter
 * UTC-Moment. Zwei Durchgänge, weil der Zonen-Versatz selbst vom Ergebnis
 * abhängt (Sommer-/Winterzeit); der zweite Durchgang korrigiert die Schätzung.
 */
function berlinMorgen(jahr: number, monat: number, tag: number): Date {
  let ms = Date.UTC(jahr, monat - 1, tag, RUHE_BIS_STUNDE, 0, 0);
  for (let i = 0; i < 2; i++) {
    const ist = berlinFelder(new Date(ms));
    const diff = RUHE_BIS_STUNDE - ist.stunde;
    if (diff === 0) break;
    ms += diff * 60 * 60 * 1000;
  }
  return new Date(ms);
}

/**
 * Verschiebt einen geplanten Sendezeitpunkt aus der Nachtruhe heraus.
 * Außerhalb der Ruhezeit bleibt der Zeitpunkt unverändert.
 */
export function ausDerNachtruhe(zeitpunkt: Date): Date {
  const { jahr, monat, tag, stunde } = berlinFelder(zeitpunkt);
  if (stunde >= RUHE_BIS_STUNDE && stunde < RUHE_AB_STUNDE) return zeitpunkt;
  if (stunde < RUHE_BIS_STUNDE) return berlinMorgen(jahr, monat, tag);
  // 21:00–23:59 ⇒ Morgen des FOLGETAGS (über UTC-Mitternacht rechnen, damit
  // Monats- und Jahreswechsel stimmen).
  const naechster = new Date(Date.UTC(jahr, monat - 1, tag) + 24 * 60 * 60 * 1000);
  return berlinMorgen(naechster.getUTCFullYear(), naechster.getUTCMonth() + 1, naechster.getUTCDate());
}

/** Bequemer ISO-Wrapper für die Planungsstellen. */
export function sendezeitIso(zeitpunkt: Date): string {
  return ausDerNachtruhe(zeitpunkt).toISOString();
}
