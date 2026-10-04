/**
 * Social-Zuordnung: Beitrag → Anfrage (Registry #112, 04.10.2026, schlanke Fassung).
 *
 * Der Content-Loop (eigenes Supabase-Projekt, PM-SEO-repo docs/v1/ATTRIBUTION.md)
 * verlinkt Instagram- und Facebook-Beiträge über seine Klick-Weiterleitung hierher:
 *   /?utm_source=instagram|facebook&utm_medium=social&utm_campaign=…
 *     &utm_content=<variante>&content_id=<beitrag>&variant_id=<variante>&start=1
 * Er braucht aus dem Rechner nur eine Zahl je Variante: Anfragen (Lead neu angelegt).
 * Besuche meldet der Rechner nicht — die Klicks der Weiterleitung sind die Näherung.
 *
 * Regeln wie beim anonymen Zähler (lib/zaehler.ts, Registry #63):
 *  - Die Werte beschreiben den Beitrag, nicht die Person: jeder Besucher derselben
 *    Variante bringt dieselben Werte mit.
 *  - Kein Browser-Speicher (kein Cookie, kein local-/sessionStorage). Gelesen wird
 *    nur die Adresse, gehalten im Arbeitsspeicher der Seite.
 *  - Der Browser schickt nichts zusätzlich: die Herkunft reist im Feld `sozial` mit
 *    der ohnehin abgeschickten Anfrage. Erst der Server meldet an den Content-Loop
 *    (lib/sozial-zuordnung-server.ts).
 * Dieses Modul darf nie um ein Feld erweitert werden, das eine Person erkennbar macht.
 */

export const SOZIAL_PLATTFORMEN = ['instagram', 'facebook'] as const;
export type SozialPlattform = (typeof SOZIAL_PLATTFORMEN)[number];

// Dieselben Muster wie im Content-Loop: variants.tracking_id bzw. content_pieces.tracking_code.
const VARIANTE = /^[a-z0-9-]{3,32}$/;
const BEITRAG = /^[a-z0-9-]{2,24}$/;

export interface SozialHerkunft {
  variante: string;
  beitrag: string | null;
  plattform: SozialPlattform;
}

/** Herkunft aus der Adresse. Nur utm_medium=social von Instagram/Facebook mit gültiger Variante, sonst null. */
export function sozialAusSuche(search: string): SozialHerkunft | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return null; }
  const wert = (k: string) => (q.get(k) ?? '').trim().toLowerCase();
  if (wert('utm_medium') !== 'social') return null;
  const plattform = SOZIAL_PLATTFORMEN.find((p) => p === wert('utm_source'));
  const variante = wert('variant_id') || wert('utm_content');
  if (!plattform || !VARIANTE.test(variante)) return null;
  const beitrag = wert('content_id');
  return { variante, beitrag: BEITRAG.test(beitrag) ? beitrag : null, plattform };
}

/** Prüft auf dem Server, was der Browser im Feld `sozial` schickt. Nur die drei Felder, sonst null. */
export function sozialBereinigen(roh: unknown): SozialHerkunft | null {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null;
  const o = roh as Record<string, unknown>;
  const plattform = SOZIAL_PLATTFORMEN.find((p) => p === o.plattform);
  const variante = typeof o.variante === 'string' ? o.variante : '';
  if (!plattform || !VARIANTE.test(variante)) return null;
  const beitrag = typeof o.beitrag === 'string' && BEITRAG.test(o.beitrag) ? o.beitrag : null;
  return { variante, beitrag, plattform };
}

let gemerkt: SozialHerkunft | null = null;

/** Herkunft dieses Seitenaufrufs: beim ersten Treffer aus der Adresse, danach aus dem Arbeitsspeicher. */
export function sozialHerkunft(search: string = typeof window !== 'undefined' ? window.location.search : ''): SozialHerkunft | null {
  if (!gemerkt) gemerkt = sozialAusSuche(search);
  return gemerkt;
}

/** Nur für Tests: Arbeitsspeicher zurücksetzen. */
export function sozialZuruecksetzen(): void {
  gemerkt = null;
}
