/**
 * Anonyme Wizard-Zähler ohne Einwilligung (Registry #63, 11.09.2026).
 *
 * Martin: „können wir nicht messen ohne Zustimmung – grenzwertig, aber
 * möglich". Möglich ist es nur, wenn WIRKLICH nichts Persönliches fließt:
 * Der Beacon trägt ausschließlich den Ereignisnamen und die Variante. Kein
 * Cookie, keine Sitzungs-ID, kein Lead, keine Zeit unterhalb der Stunde
 * (die setzt der Server). Die Route speichert weder IP noch User-Agent.
 * Deshalb steht dieser Zähler NICHT hinter dem Consent-Gate von
 * lib/analytics.ts — und darf auch nie um ein Feld erweitert werden, das
 * eine Person erkennbar macht.
 *
 * Gezählt wird je Schritt EINMAL pro Seitenaufruf (Set), damit ein Zurück
 * oder ein React-Rerender nicht als zweiter Besucher zählt.
 */

export const ZAEHLER_EREIGNISSE = [
  'schritt_1', 'schritt_2', 'schritt_3', 'schritt_4', 'schritt_5', 'schritt_6', 'schritt_7', 'schritt_8', 'schritt_9',
  'cta_geklickt', 'abgeschickt',
] as const;
export type ZaehlerEreignis = (typeof ZAEHLER_EREIGNISSE)[number];

export const ZAEHLER_VARIANTEN = ['vorschau', 'alt'] as const;
export type ZaehlerVariante = (typeof ZAEHLER_VARIANTEN)[number];

/**
 * Woher der Besucher kam — drei grobe Töpfe, kein Personenbezug (seit
 * 11.09.2026): google = Google-Ads-Klick (gclid/wbraid/gbraid oder
 * utm_source=google), chatgpt = ChatGPT-Anzeige (utm_source=chatgpt oder
 * oppref), sonst = alles andere. Grund: 72 ChatGPT-Sitzungen, 0 Leads, aber
 * nur 6 davon mit Einwilligung — ob diese Besucher den Rechner überhaupt
 * beginnen, war ohne diese Aufteilung nicht zu sehen.
 */
export const ZAEHLER_QUELLEN = ['google', 'chatgpt', 'sonst'] as const;
export type ZaehlerQuelle = (typeof ZAEHLER_QUELLEN)[number];

/** Quelle aus den gemerkten Anzeigen-Parametern (sessionStorage `_prim_ad_params`) und der URL. */
export function zaehlerQuelle(params: Record<string, unknown> | null | undefined, search = ''): ZaehlerQuelle {
  const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>;
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { q = new URLSearchParams(); }
  const wert = (k: string) => String(p[k] ?? q.get(k) ?? '').toLowerCase();
  if (wert('utm_source') === 'chatgpt' || wert('oppref')) return 'chatgpt';
  if (wert('gclid') || wert('wbraid') || wert('gbraid') || wert('utm_source') === 'google') return 'google';
  return 'sonst';
}

function quelleImBrowser(): ZaehlerQuelle {
  if (typeof window === 'undefined') return 'sonst';
  let params: Record<string, unknown> | null = null;
  try { params = JSON.parse(sessionStorage.getItem('_prim_ad_params') || 'null'); } catch { params = null; }
  return zaehlerQuelle(params, window.location.search);
}

export const ZAEHLER_PFAD = '/api/analytics/zaehler';

/** Prüft den Body der Route — nur bekannte Werte, sonst null. */
export function pruefeZaehler(body: unknown): { ereignis: ZaehlerEreignis; variante: ZaehlerVariante; quelle: ZaehlerQuelle } | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const ereignis = ZAEHLER_EREIGNISSE.find((e) => e === o.ereignis);
  const variante = ZAEHLER_VARIANTEN.find((v) => v === o.variante);
  const quelle = o.quelle === undefined ? 'sonst' : ZAEHLER_QUELLEN.find((q) => q === o.quelle);
  return ereignis && variante && quelle ? { ereignis, variante, quelle } : null;
}

const gezaehlt = new Set<string>();

/** Schickt einen Zähl-Beacon; überlebt Navigation (sendBeacon / keepalive). Einmal je Ereignis und Seitenaufruf. */
export function zaehle(ereignis: ZaehlerEreignis, variante: ZaehlerVariante, sender: { sendBeacon?: (url: string, data: Blob) => boolean; fetch?: typeof fetch } = typeof navigator !== 'undefined' ? { sendBeacon: navigator.sendBeacon?.bind(navigator), fetch: typeof fetch === 'function' ? fetch.bind(globalThis) : undefined } : {}, quelle: ZaehlerQuelle = quelleImBrowser()): boolean {
  const key = `${ereignis}|${variante}`;
  if (gezaehlt.has(key)) return false;
  gezaehlt.add(key);
  const body = JSON.stringify({ ereignis, variante, quelle });
  try {
    if (sender.sendBeacon) {
      const ok = sender.sendBeacon(ZAEHLER_PFAD, new Blob([body], { type: 'application/json' }));
      if (ok) return true;
    }
    sender.fetch?.(ZAEHLER_PFAD, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Nur für Tests: Dedupe zurücksetzen. */
export function zaehlerZuruecksetzen(): void {
  gezaehlt.clear();
}
