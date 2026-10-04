/**
 * Social-Zuordnung: Beitrag → Besuch → Anfrage (Registry #112, 04.10.2026).
 *
 * Der Content-Loop (eigenes Supabase-Projekt, PM-SEO-repo docs/v1/ATTRIBUTION.md)
 * verlinkt Instagram- und Facebook-Beiträge über seine Klick-Weiterleitung hierher:
 *   /?utm_source=instagram|facebook&utm_medium=social&utm_campaign=…
 *     &utm_content=<variante>&content_id=<beitrag>&variant_id=<variante>&start=1
 * Für den Variantenvergleich braucht er je Variante zwei Zahlen aus dem Rechner:
 * Besuche (Seite geladen) und Anfragen (Lead neu angelegt).
 *
 * Regeln wie beim anonymen Zähler (lib/zaehler.ts, Registry #63):
 *  - Die Werte beschreiben den Beitrag, nicht die Person: jeder Besucher derselben
 *    Variante bringt dieselben Werte mit.
 *  - Kein Browser-Speicher (kein Cookie, kein local-/sessionStorage). Gelesen wird
 *    nur die Adresse, gehalten im Arbeitsspeicher der Seite. Der Rechner ändert die
 *    Adresse nicht, nach einem Neuladen steht der Wert also wieder dort.
 *  - Der Browser schickt nur an die eigene Domain (SOZIAL_PFAD). Erst der Server
 *    meldet an den Content-Loop (lib/sozial-zuordnung-server.ts).
 * Dieses Modul darf nie um ein Feld erweitert werden, das eine Person erkennbar macht.
 */

export const SOZIAL_PFAD = '/api/sozial-zuordnung';

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

/** Prüft, was der Browser schickt (Besuchs-Route, Lead-Absenden). Nur die drei Felder, sonst null. */
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
let besuchGemeldet = false;

/** Herkunft dieses Seitenaufrufs: beim ersten Treffer aus der Adresse, danach aus dem Arbeitsspeicher. */
export function sozialHerkunft(search: string = typeof window !== 'undefined' ? window.location.search : ''): SozialHerkunft | null {
  if (!gemerkt) gemerkt = sozialAusSuche(search);
  return gemerkt;
}

type Sender = { sendBeacon?: (url: string, data: Blob) => boolean; fetch?: typeof fetch };

function browserSender(): Sender {
  if (typeof navigator === 'undefined') return {};
  return {
    sendBeacon: navigator.sendBeacon?.bind(navigator),
    fetch: typeof fetch === 'function' ? fetch.bind(globalThis) : undefined,
  };
}

/** Meldet den Besuch einmal je Seitenaufruf, nur bei Social-Herkunft. Überlebt Navigation (sendBeacon / keepalive). */
export function meldeSozialBesuch(sender: Sender = browserSender(), search?: string): boolean {
  if (besuchGemeldet) return false;
  const herkunft = sozialHerkunft(search);
  if (!herkunft) return false;
  besuchGemeldet = true;
  const body = JSON.stringify({ ereignis: 'besuch', ...herkunft });
  try {
    if (sender.sendBeacon?.(SOZIAL_PFAD, new Blob([body], { type: 'application/json' }))) return true;
    sender.fetch?.(SOZIAL_PFAD, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Nur für Tests: Arbeitsspeicher zurücksetzen. */
export function sozialZuruecksetzen(): void {
  gemerkt = null;
  besuchGemeldet = false;
}
