/**
 * Bewertungszeile unter Martas Karte in den Kundenmails (Martin, 17.09.2026):
 *
 *   ★★★★★ 4,9 von 5 aus 126 Bewertungen · Erfahrungen lesen →
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

const GOLD = '#D4A843';
const STERN_HELL = '#E3D9CB';
const DUNKEL = '#3D2B1F';
const TEXT = '#555';
const LINK = '#8B7355';

export function pruefeBewertungsStand(payload: unknown): BewertungsStand | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const { schnitt, anzahl } = payload as Record<string, unknown>;
  if (typeof schnitt !== 'string' || !/^\d,\d$/.test(schnitt)) return null;
  const wert = Number(schnitt.replace(',', '.'));
  if (wert < 1 || wert > 5) return null;
  if (typeof anzahl !== 'number' || !Number.isInteger(anzahl) || anzahl < 1) return null;
  return { schnitt, anzahl };
}

function tausender(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Eine Zeile, direkt unter der Karte. Die Karte darüber trägt dafür keinen
 * eigenen Abstand nach unten mehr — den setzt `abstandUnten` hier (24 px wie
 * die Karte in den meisten Mails, 32 px in Angebots- und Link-Mail).
 * Umbruch auf schmalen Bildschirmen nur vor dem Link: Sterne und Zahlen
 * bleiben zusammen.
 */
export function bewertungsZeileHtml(stand: BewertungsStand, abstandUnten = 24): string {
  const gold = Math.min(5, Math.max(0, Math.round(Number(stand.schnitt.replace(',', '.')))));
  const sterne =
    `<span style="font-size:14px;letter-spacing:1px;color:${GOLD};">${'&#9733;'.repeat(gold)}</span>` +
    (gold < 5 ? `<span style="color:${STERN_HELL};">${'&#9733;'.repeat(5 - gold)}</span>` : '');
  const wort = stand.anzahl === 1 ? 'Bewertung' : 'Bewertungen';
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${abstandUnten}px 0;">
      <tr>
        <td style="padding:10px 2px 0;font-size:13px;line-height:1.6;color:${TEXT};text-align:left;">
          <span style="white-space:nowrap;">${sterne}&nbsp;<strong style="color:${DUNKEL};">${stand.schnitt}</strong> von 5 aus <strong style="color:${DUNKEL};">${tausender(stand.anzahl)}</strong> ${wort}</span>&nbsp;&middot; <a href="${ERFAHRUNGEN_URL}" style="color:${LINK};font-weight:600;text-decoration:none;white-space:nowrap;">Erfahrungen lesen&nbsp;&rarr;</a>
        </td>
      </tr>
    </table>`;
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
