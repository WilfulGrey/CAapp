/**
 * Sterne-Zeile im Hero des Rechners (Martin 17.09.2026: „unter dem letzten
 * Punkt und vor den Logos zentriert unsere Bewertungssterne").
 *
 * EINE Quelle für die Zahl: primundus.de/erfahrungen. Dort werden Schnitt und
 * Anzahl aus den direkten Bewertungen (dieses Backend, /api/bewertungen) und
 * den beiden Google-Profilen (Places API, live) gerechnet. Hier wird nicht
 * nachgerechnet, sonst stehen auf beiden Seiten verschiedene Zahlen.
 *
 * VORSCHAU-STAND: gelesen wird der Seitentitel von /erfahrungen. Vor dem
 * Livegang ersetzt durch eine kleine JSON-Schnittstelle auf primundus.de, weil
 * die SEO-Läufe Titel umschreiben.
 *
 * Fällt die Quelle aus oder passt der Titel nicht: null, die Zeile fehlt dann.
 * Keine feste Zahl als Ersatz (CLAUDE.md, Święta zasada nr 1). Pur bis auf
 * ladeBewertungsStand — root-vitest kann standAusTitel direkt importieren.
 */

export interface BewertungsStand {
  /** z. B. 4.9 */
  schnitt: number;
  /** z. B. 126 */
  anzahl: number;
}

const QUELLE = 'https://www.primundus.de/erfahrungen';
const MUSTER = /(\d),(\d) von 5 Sternen aus (\d+) Bewertungen/;

/** Liest „4,9 von 5 Sternen aus 126 Bewertungen" aus dem <title> der Seite. */
export function standAusTitel(html: string): BewertungsStand | null {
  const titel = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
  const treffer = titel.match(MUSTER);
  if (!treffer) return null;
  const schnitt = Number(`${treffer[1]}.${treffer[2]}`);
  const anzahl = Number(treffer[3]);
  if (!(schnitt >= 1 && schnitt <= 5) || !(anzahl > 0)) return null;
  return { schnitt, anzahl };
}

export async function ladeBewertungsStand(): Promise<BewertungsStand | null> {
  try {
    const res = await fetch(QUELLE, { next: { revalidate: 60 * 60 } });
    if (!res.ok) {
      console.error(`[bewertungs-stand] ${QUELLE}: HTTP ${res.status}`);
      return null;
    }
    const stand = standAusTitel(await res.text());
    if (!stand) console.error('[bewertungs-stand] Titel passt nicht zum Muster');
    return stand;
  } catch (e) {
    console.error('[bewertungs-stand]', e);
    return null;
  }
}

/** Wie auf primundus.de: eine Nachkommastelle, deutsches Komma („4,9"). */
export function schnittText(wert: number): string {
  return (Math.round(wert * 10) / 10).toFixed(1).replace('.', ',');
}
