/**
 * Bewertungsstand für die Sterne in Martas Karte (Martin, 17.09.2026):
 *
 *   ★★★★★ 4,9 von 5 · 126 Bewertungen →
 *
 * Darstellung: lib/marta-karte.ts (Edge: martaKarte.ts).
 *
 * Die Zahlen kommen live aus `GET https://primundus.de/api/bewertungen-stand`
 * (Website-Repo; Antwort `{ schnitt: "4,9", wert, anzahl, url, stand }`).
 * Fällt der Abruf aus (Timeout 2 s, HTTP-Fehler, kaputte Werte), steht der
 * Stand vom 17.09.2026 in der Mail — Martins Vorgabe, damit keine Mail an
 * einem Website-Ausfall hängt.
 *
 * Der Link führt immer auf ERFAHRUNGEN_URL, nicht auf `url` aus der Antwort:
 * ein Linkziel in Kundenmails soll nicht von einer fremden Antwort abhängen.
 * Keine Mail-Markierung (`&m=`): die gilt nur für Portal-Links, die das
 * Portal in portal_opened schreibt; primundus.de wertet sie nicht aus.
 *
 * Pures Modul ohne Imports (Root-vitest: src/__tests__/bewertungenStand.test.ts).
 *
 * ⚠️ ZWEITE KOPIE in supabase/functions/send-scheduled-emails/bewertungenStand.ts —
 * Edge Functions können nicht aus lib/ importieren (gleiche Lage wie
 * quiet-hours.ts/names.ts). Der vitest oben vergleicht beide Kopien; Änderungen
 * IMMER in beiden Dateien. Nur hier: holeBewertungsStand mit Prozess-Cache.
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
      cache: 'no-store',
    });
    if (!res.ok) return BEWERTUNGS_STAND_ERSATZ;
    return pruefeBewertungsStand(await res.json()) ?? BEWERTUNGS_STAND_ERSATZ;
  } catch {
    return BEWERTUNGS_STAND_ERSATZ;
  }
}

// ── Nur Kostenrechner (Next.js): Prozess-Cache ────────────────────────────
// Ein Render-Prozess verschickt viele Mails; eine Stunde alte Zahlen reichen.
// Ein Fehlschlag wird nur zehn Minuten gemerkt, damit ein frisch live
// geschalteter Endpunkt schnell ankommt. `cache: 'no-store'` oben hält den
// Next-Datencache heraus — der würde auch eine 404 eine Stunde lang aufheben.

const CACHE_OK_MS = 60 * 60_000;
const CACHE_FEHLER_MS = 10 * 60_000;

let cache: { stand: BewertungsStand; bis: number } | null = null;

export async function holeBewertungsStand(opts: {
  fetchFn?: typeof fetch;
  jetzt?: () => number;
} = {}): Promise<BewertungsStand> {
  const jetzt = opts.jetzt ?? Date.now;
  if (cache && jetzt() < cache.bis) return cache.stand;
  const stand = await ladeBewertungsStand(opts.fetchFn ?? fetch);
  // Fehlschlag = genau das Ersatz-Objekt (Identität, nicht Wertgleichheit:
  // ein echter Abruf mit 4,9/126 liefert ein neues Objekt).
  const fehlschlag = stand === BEWERTUNGS_STAND_ERSATZ;
  cache = { stand, bis: jetzt() + (fehlschlag ? CACHE_FEHLER_MS : CACHE_OK_MS) };
  return stand;
}

/** Nur für Tests. */
export function leereBewertungsStandCache(): void {
  cache = null;
}
