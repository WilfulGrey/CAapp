// Bewertungssterne im Portal (Marta-Kasten, Portal-Redesign Teil 3): dieselbe Zeile wie auf
// primundus.de, im Rechner und in den Mails — „★★★★★ 4,9 · 126 Bewertungen".
//
// Quelle `https://primundus.de/api/bewertungen-stand` (CORS offen, stündlich neu). Wie auf der
// Rechner-Startseite gibt es KEINEN Ersatzwert: Fällt die Quelle aus, fehlt die Zeile. Eine feste
// Zahl hätte nach der ersten neuen Bewertung nicht mehr gestimmt (Święta zasada nr 1).
//
// ⚠️ Spiegel der puren Funktionen aus `project 3/lib/sterne-zeile.ts`;
// src/__tests__/sterne.test.ts prüft beide gegen dieselben Eingaben.
import { useEffect, useState } from 'react';

export interface SterneStand {
  schnitt: string;
  wert: number;
  anzahl: number;
}

export const STERNE_STAND_URL = 'https://primundus.de/api/bewertungen-stand';
export const ERFAHRUNGEN_URL = 'https://primundus.de/erfahrungen';

/** Antwort der Schnittstelle prüfen. Alles Unerwartete ergibt null. */
export function pruefeSterneStand(payload: unknown): SterneStand | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const { schnitt, wert, anzahl } = payload as Record<string, unknown>;
  if (typeof schnitt !== 'string' || !/^\d,\d$/.test(schnitt)) return null;
  const ausText = Number(schnitt.replace(',', '.'));
  if (ausText < 1 || ausText > 5) return null;
  if (typeof anzahl !== 'number' || !Number.isInteger(anzahl) || anzahl < 1) return null;
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

/** Stand einmal laden; null solange unterwegs oder bei jedem Fehler. */
export function useSterneStand(): SterneStand | null {
  const [stand, setStand] = useState<SterneStand | null>(null);
  useEffect(() => {
    let aktiv = true;
    const abbruch = new AbortController();
    const zeit = setTimeout(() => abbruch.abort(), 5000);
    fetch(STERNE_STAND_URL, { signal: abbruch.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (aktiv) setStand(pruefeSterneStand(j)); })
      .catch(() => { /* Zeile fehlt dann — kein Ersatzwert */ })
      .finally(() => clearTimeout(zeit));
    return () => { aktiv = false; abbruch.abort(); clearTimeout(zeit); };
  }, []);
  return stand;
}
