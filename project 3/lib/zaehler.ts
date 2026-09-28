/**
 * Anonyme Wizard-Zähler ohne Einwilligung (Registry #63, 11.09.2026).
 *
 * Martin: „können wir nicht messen ohne Zustimmung – grenzwertig, aber
 * möglich". Möglich ist es nur, wenn WIRKLICH nichts Persönliches fließt:
 * Der Beacon trägt ausschließlich den Ereignisnamen, die Variante, die grobe
 * Quelle und die Geräteklasse (mobil/desktop, seit 28.09.2026). Kein
 * Cookie, keine Sitzungs-ID, kein Lead, keine Zeit unterhalb der Stunde
 * (die setzt der Server). Die Route speichert weder IP noch User-Agent.
 * Deshalb steht dieser Zähler NICHT hinter dem Consent-Gate von
 * lib/analytics.ts — und darf auch nie um ein Feld erweitert werden, das
 * eine Person erkennbar macht.
 *
 * Gezählt wird je Schritt EINMAL pro Seitenaufruf (Set), damit ein Zurück
 * oder ein React-Rerender nicht als zweiter Besucher zählt.
 */

import { istPruefbrowser } from './pruefbrowser';
import { einstieg, websiteHerkunft, type Einstieg } from './website-herkunft';
import { zaehlerGeraetAus, type ZaehlerGeraet } from './geraet';

export const ZAEHLER_EREIGNISSE = [
  'schritt_1', 'schritt_2', 'schritt_3', 'schritt_4', 'schritt_5', 'schritt_6', 'schritt_7', 'schritt_8', 'schritt_9',
  'cta_geklickt', 'abgeschickt',
  'garantie_geoeffnet', // Pop-up der Bestpreisgarantie geöffnet (12.09.2026)
  'garantie_weiter', // aus dem Pop-up in den Rechner (Knopf statt Verstanden, 13.09.2026)
  // Kontakt in drei Schritten (Registry #76, 16.09.2026): Teilschritte und
  // Ausgang. `abgeschickt` = Lead gespeichert (in `stufen` schon nach der
  // E-Mail), `absenden_geklickt`/`absenden_fehler` trennen „nie geklickt"
  // von „geklickt, Server-Fehler", `telefon_angegeben`/`ohne_telefon` den
  // Anteil mit Rückrufnummer.
  'kontakt_email', 'kontakt_telefon', 'absenden_geklickt', 'absenden_fehler', 'telefon_angegeben', 'ohne_telefon',
  // Preis zuerst (Registry #77, 17.09.2026): Preisseite gesehen, Knopf zur
  // Kontaktabfrage geklickt, Preisberechnung gescheitert (dann läuft der
  // Besucher den heutigen Weg).
  'preis_gesehen', 'kontakt_geoeffnet', 'preis_fehler',
] as const;
export type ZaehlerEreignis = (typeof ZAEHLER_EREIGNISSE)[number];

// `preis` = Preisseite vor dem Kontakt (Registry #77), `stufen` = kein Preis,
// Kontakt in drei Schritten — die beiden Arme des Ablauf-Tests (Registry #80,
// das Los fällt beim Laden, die Fragen 1–8 laufen also schon unter dem Los);
// `alt` = das alte Formular (nur noch erzwungen), `vorschau` = Karten-Seite (?kraefte=1).
export const ZAEHLER_VARIANTEN = ['vorschau', 'alt', 'stufen', 'preis'] as const;
export type ZaehlerVariante = (typeof ZAEHLER_VARIANTEN)[number];

/**
 * Woher der Besucher kam — grobe Töpfe, kein Personenbezug (seit 11.09.2026,
 * erweitert 28.09.2026, Registry #103): google = Google-Ads-Klick
 * (gclid/wbraid/gbraid oder utm_source=google), chatgpt = ChatGPT-Anzeige
 * (utm_source=chatgpt oder oppref), website = Knopf oder Verweis von
 * primundus.de (dieselbe Regel wie die Lead-Quelle `website:…`), direkt =
 * erster Aufruf im Tab ohne Verweis, sonst = alles andere (Suchmaschinen,
 * Mail-Apps, fremde Seiten). Bis 28.09. lagen website, direkt und sonst
 * zusammen in `sonst` — ob Website-Besucher Frage 1 beantworten, war damit
 * nicht messbar.
 */
export const ZAEHLER_QUELLEN = ['google', 'chatgpt', 'website', 'direkt', 'sonst'] as const;
export type ZaehlerQuelle = (typeof ZAEHLER_QUELLEN)[number];

/** Handy/Tablet oder Computer (lib/geraet.ts) — nur die Klasse, nie der User-Agent. */
export const ZAEHLER_GERAETE = ['mobil', 'desktop'] as const;

/** Quelle aus den gemerkten Anzeigen-Parametern (sessionStorage `_prim_ad_params`), der URL und dem Einstieg.
 *  Anzeigen gehen vor: Wer über eine Anzeige kam und danach primundus.de besucht, bleibt Anzeige. */
export function zaehlerQuelle(
  params: Record<string, unknown> | null | undefined,
  search = '',
  herkunft: { website?: boolean; einstieg?: Einstieg | null } = {},
): ZaehlerQuelle {
  const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>;
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { q = new URLSearchParams(); }
  const wert = (k: string) => String(p[k] ?? q.get(k) ?? '').toLowerCase();
  if (wert('utm_source') === 'chatgpt' || wert('oppref')) return 'chatgpt';
  if (wert('gclid') || wert('wbraid') || wert('gbraid') || wert('utm_source') === 'google') return 'google';
  if (herkunft.website) return 'website';
  if (herkunft.einstieg === 'direkt') return 'direkt';
  return 'sonst';
}

function quelleImBrowser(): ZaehlerQuelle {
  if (typeof window === 'undefined') return 'sonst';
  let params: Record<string, unknown> | null = null;
  try { params = JSON.parse(sessionStorage.getItem('_prim_ad_params') || 'null'); } catch { params = null; }
  return zaehlerQuelle(params, window.location.search, { website: websiteHerkunft() !== null, einstieg: einstieg() });
}

function geraetImBrowser(): ZaehlerGeraet {
  return typeof navigator === 'undefined' ? 'desktop' : zaehlerGeraetAus(navigator.userAgent || '');
}

export const ZAEHLER_PFAD = '/api/analytics/zaehler';

/** Prüft den Body der Route — nur bekannte Werte, sonst null. Fehlt das Gerät (Rechner vor dem
 *  28.09.2026 noch im Browser-Cache), zählt es als `unbekannt` statt verworfen zu werden. */
export function pruefeZaehler(body: unknown): { ereignis: ZaehlerEreignis; variante: ZaehlerVariante; quelle: ZaehlerQuelle; geraet: ZaehlerGeraet | 'unbekannt' } | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const ereignis = ZAEHLER_EREIGNISSE.find((e) => e === o.ereignis);
  const variante = ZAEHLER_VARIANTEN.find((v) => v === o.variante);
  const quelle = o.quelle === undefined ? 'sonst' : ZAEHLER_QUELLEN.find((q) => q === o.quelle);
  const geraet = o.geraet === undefined ? 'unbekannt' : ZAEHLER_GERAETE.find((g) => g === o.geraet);
  return ereignis && variante && quelle && geraet ? { ereignis, variante, quelle, geraet } : null;
}

const gezaehlt = new Set<string>();

/** Schickt einen Zähl-Beacon; überlebt Navigation (sendBeacon / keepalive). Einmal je Ereignis und Seitenaufruf. */
export function zaehle(ereignis: ZaehlerEreignis, variante: ZaehlerVariante, sender: { sendBeacon?: (url: string, data: Blob) => boolean; fetch?: typeof fetch } = typeof navigator !== 'undefined' ? { sendBeacon: navigator.sendBeacon?.bind(navigator), fetch: typeof fetch === 'function' ? fetch.bind(globalThis) : undefined } : {}, quelle: ZaehlerQuelle = quelleImBrowser(), geraet: ZaehlerGeraet = geraetImBrowser()): boolean {
  if (istPruefbrowser()) return false; // automatische Prüfläufe zählen nicht (Registry #104)
  const key = `${ereignis}|${variante}`;
  if (gezaehlt.has(key)) return false;
  gezaehlt.add(key);
  const body = JSON.stringify({ ereignis, variante, quelle, geraet });
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
