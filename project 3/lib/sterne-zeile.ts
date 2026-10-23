/**
 * Bewertungssterne auf der Startseite des Rechners (Martin 17.09.2026, „ja
 * alles online"): unter den Hero-Punkten und über den Kundenstimmen steht
 * dieselbe Zeile „★★★★★ 4,9 von 5 aus 126 Bewertungen".
 *
 * Quelle ist `GET https://primundus.de/api/bewertungen-stand` (Website-Repo),
 * gerechnet wie auf primundus.de/erfahrungen. Die Kundenmails lesen dieselbe
 * Schnittstelle (`lib/bewertungen-stand.ts`, PR #726) und haben einen
 * Ersatzwert, weil keine Mail an einem Website-Ausfall hängen darf. Hier gibt
 * es bewusst KEINEN: fällt die Quelle aus, fehlen die Zeilen. Eine feste Zahl
 * auf der Seite hätte nach der ersten neuen Bewertung nicht mehr gestimmt.
 *
 * Pures Modul ohne Imports (Root-vitest: src/__tests__/sterneZeile.test.ts).
 * Laden mit Next-Cache: lib/sterne-zeile-laden.ts.
 */

export interface SterneStand {
  /** Schnitt, wie ihn /erfahrungen schreibt: "4,9". */
  schnitt: string;
  /** Schnitt als Zahl für die Füllung der Sterne, z. B. 4.89. */
  wert: number;
  /** Anzahl aller Bewertungen, ganze Zahl ≥ 1. */
  anzahl: number;
}

export const STERNE_STAND_URL = 'https://primundus.de/api/bewertungen-stand';

/** Antwort der Schnittstelle prüfen. Alles Unerwartete ergibt null. */
export function pruefeSterneStand(payload: unknown): SterneStand | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const { schnitt, wert, anzahl } = payload as Record<string, unknown>;
  if (typeof schnitt !== 'string' || !/^\d,\d$/.test(schnitt)) return null;
  const ausText = Number(schnitt.replace(',', '.'));
  if (ausText < 1 || ausText > 5) return null;
  if (typeof anzahl !== 'number' || !Number.isInteger(anzahl) || anzahl < 1) return null;
  // `wert` hat zwei Nachkommastellen (4.89) und füllt den fünften Stern
  // genauer. Fehlt er oder passt er nicht zum Text, zählt der Text.
  const genau =
    typeof wert === 'number' && wert >= 1 && wert <= 5 && Math.abs(wert - ausText) <= 0.051 ? wert : ausText;
  return { schnitt, wert: genau, anzahl };
}

/** Gefüllter Anteil (0 bis 1) des Sterns an Position i (0 bis 4). */
export function sternFuellung(wert: number, i: number): number {
  return Math.max(0, Math.min(1, wert - i));
}

/** „126 Bewertungen", „1 Bewertung", „1.204 Bewertungen". */
export function anzahlText(anzahl: number): string {
  const zahl = String(anzahl).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${zahl} ${anzahl === 1 ? 'Bewertung' : 'Bewertungen'}`;
}
