/* Herkunft von der Website primundus.de (Martin, 04.09.2026). Die Knöpfe dort
   verlinken mit `?start=1&src=apex-…`; drei Links tragen keine Markierung,
   dafür reicht die verweisende Seite. Beides wird beim ersten Aufruf gemerkt,
   damit der Absende-Schritt Minuten später noch weiß, woher der Besucher kam.

   Eigenes Modul seit 28.09.2026 (Registry #103): Der anonyme Zähler
   (lib/zaehler.ts) braucht dieselbe Regel, darf aber lib/analytics.ts nicht
   laden — dessen Prüf-Funktion läuft auch in der Server-Route. Dieses Modul
   hat keine Abhängigkeiten und ist im Server-Build harmlos (alles hinter
   `typeof window`). */

const WEBSITE_KEY = '_prim_website';
export type WebsiteHerkunft = { src: string; pfad?: string };

function websiteAusUrlUndReferrer(): WebsiteHerkunft | null {
  if (typeof window === 'undefined') return null;
  const src = new URLSearchParams(window.location.search).get('src') || '';
  let pfad: string | undefined;
  let vonWebsite = false;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && /(^|\.)primundus\.de$/.test(ref.hostname) && !/^kostenrechner\./.test(ref.hostname)) {
      vonWebsite = true;
      if (ref.pathname && ref.pathname !== '/') pfad = ref.pathname.slice(0, 80);
    }
  } catch { /* kaputter Referrer — dann eben ohne */ }
  // Bis 23.09.2026 galt nur `apex-…` — `ort-worms` von den 207 Ortsseiten wurde still
  // verworfen, deshalb gab es nie einen Lead mit Quelle website:ort-…. Jetzt gelten beide
  // Familien, mit Positionssuffix (-kopf, -kosten, -leiste, -schluss).
  // Länge 40 wie quelleBereinigen() auf dem Server (lib/lead-quelle.ts) — längere Werte würden dort
  // still zu „rechner" werden.
  if (/^(apex|ort)-[a-z0-9-]{1,36}$/.test(src)) return { src, pfad };
  if (vonWebsite) return { src: 'apex-referrer', pfad };
  return null;
}

export function websiteHerkunftMerken(): void {
  const h = websiteAusUrlUndReferrer();
  if (!h) return;
  try { sessionStorage.setItem(WEBSITE_KEY, JSON.stringify(h)); } catch { /* gesperrt */ }
}

/** Was beim ersten Aufruf gemerkt wurde — oder, falls nichts, die aktuelle URL. */
export function websiteHerkunft(): WebsiteHerkunft | null {
  try {
    const roh = sessionStorage.getItem(WEBSITE_KEY);
    if (roh) return JSON.parse(roh) as WebsiteHerkunft;
  } catch { /* gesperrt */ }
  return websiteAusUrlUndReferrer();
}

/* Einstieg ohne Verweis = direkter Besuch (Registry #103, 28.09.2026). Gemerkt
   wird nur der ERSTE Seitenaufruf im Tab: Wer über /bestpreisgarantie kommt und
   dann den Rechner öffnet, hat dort den Rechner selbst als Verweis — ohne das
   Merken würde aus einem direkten Besuch „sonst". Gespeichert wird nur
   `direkt` oder `verweis`, nie die Adresse. */
const EINSTIEG_KEY = '_prim_einstieg';
export type Einstieg = 'direkt' | 'verweis';

function einstiegAusReferrer(): Einstieg | null {
  if (typeof document === 'undefined') return null;
  if (!document.referrer) return 'direkt';
  try {
    const host = new URL(document.referrer).hostname;
    // Eigene Seiten des Rechners/Portals sind kein Einstieg, sondern ein Klick innerhalb.
    if (/^(kostenrechner|kundenportal)\.primundus\.de$/.test(host) || host === window.location.hostname) return null;
  } catch { /* kaputter Referrer */ }
  return 'verweis';
}

export function einstiegMerken(): void {
  try {
    if (sessionStorage.getItem(EINSTIEG_KEY)) return;
    const e = einstiegAusReferrer();
    if (e) sessionStorage.setItem(EINSTIEG_KEY, e);
  } catch { /* gesperrt */ }
}

/** Der gemerkte Einstieg des Tabs — oder, falls nichts gemerkt ist, der aktuelle Verweis. */
export function einstieg(): Einstieg | null {
  try {
    const roh = sessionStorage.getItem(EINSTIEG_KEY);
    if (roh === 'direkt' || roh === 'verweis') return roh;
  } catch { /* gesperrt */ }
  return einstiegAusReferrer();
}
