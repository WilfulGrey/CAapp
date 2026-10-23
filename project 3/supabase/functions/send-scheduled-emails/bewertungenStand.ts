/**
 * Bewertungsstand für die Sterne in Martas Karte (Martin, 17.09.2026):
 *
 *   ★★★★★ 4,9 von 5 · 126 Bewertungen →
 *
 * Darstellung: lib/marta-karte.ts (Edge: martaKarte.ts).
 *
 * ⚠️ KOPIE von project 3/lib/bewertungen-stand.ts — Edge Functions können
 * nicht aus lib/ importieren (gleiche Lage wie quietHours.ts/names.ts).
 * Begründungen (Ersatzwert, fester Link, keine &m=-Markierung) stehen dort.
 * src/__tests__/bewertungenStand.test.ts vergleicht beide Kopien; Änderungen
 * IMMER in beiden Dateien.
 *
 * Unterschiede zur lib-Fassung: kein Prozess-Cache (index.ts lädt den Stand
 * einmal pro Aufruf) und kein `cache: 'no-store'` im fetch (Next-Option).
 */

export interface BewertungsStand {
  /** Schnitt mit einer Nachkommastelle, deutsch geschrieben: "4,9". */
  schnitt: string;
  /** Anzahl veröffentlichter Bewertungen, ganze Zahl ≥ 1. */
  anzahl: number;
}

export const BEWERTUNGS_STAND_URL = 'https://primundus.de/api/bewertungen-stand';
export const ERFAHRUNGEN_URL = 'https://primundus.de/erfahrungen';
/** Letzter bekannter Stand (17.09.2026), falls der Abruf ausfällt. */
export const BEWERTUNGS_STAND_ERSATZ: BewertungsStand = { schnitt: '4,9', anzahl: 126 };
export const BEWERTUNGS_STAND_TIMEOUT_MS = 2000;

export function pruefeBewertungsStand(payload: unknown): BewertungsStand | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const { schnitt, anzahl } = payload as Record<string, unknown>;
  if (typeof schnitt !== 'string' || !/^\d,\d$/.test(schnitt)) return null;
  const wert = Number(schnitt.replace(',', '.'));
  if (wert < 1 || wert > 5) return null;
  if (typeof anzahl !== 'number' || !Number.isInteger(anzahl) || anzahl < 1) return null;
  return { schnitt, anzahl };
}

/** Ein Abruf. Wirft nie: jeder Fehler ergibt den Ersatzwert. */
export async function ladeBewertungsStand(
  fetchFn: typeof fetch,
  timeoutMs = BEWERTUNGS_STAND_TIMEOUT_MS,
): Promise<BewertungsStand> {
  try {
    const res = await fetchFn(BEWERTUNGS_STAND_URL, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return BEWERTUNGS_STAND_ERSATZ;
    return pruefeBewertungsStand(await res.json()) ?? BEWERTUNGS_STAND_ERSATZ;
  } catch {
    return BEWERTUNGS_STAND_ERSATZ;
  }
}
