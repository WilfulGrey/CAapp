/* Einstiegsseite und Herkunft des Besuchs auf primundus.de (Registry #120, 09.10.2026).

   Befund der Auswertung vom 09.10.: Bei 11 von 32 Website-Anfragen (11.09.–08.10.) fehlte die Seite, und ob jemand über
   Google oder direkt auf primundus.de kam, speicherte niemand — der Rechner sieht nur primundus.de als Verweis. Jetzt hängt
   primundus.de beim Klick in den Rechner zwei Werte an den Link (Apex `lib/einstieg.ts`): `ein` = erste Seite des Besuchs,
   `her` = Art der Herkunft, nur die Klasse. Der Rechner übernimmt sie beim ersten Aufruf, schickt sie mit der Absendung,
   und die Absende-Route legt sie als Ereignis `website_einstieg` an die Anfrage — zu JEDER Absendung, auch beim Duplikat.

   Bewusst OHNE Speicher auf dem Gerät (Martin 29.09.: nichts Neues ablegen): Die Werte leben im Arbeitsspeicher der Seite.
   Wechsel innerhalb des Rechners (Bestpreisgarantie → Fragebogen) laden nicht neu und behalten sie; nach einem Neuladen
   gilt, was in der Adresse steht. */

// Gleiche Liste wie HERKUNFT in primundus.de `lib/einstieg.ts` — Unbekanntes verwirft der Server.
export const EINSTIEG_HERKUNFT = [
  'google', 'anzeige', 'bing', 'ki', 'suche', 'sozial', 'andere', 'direkt', 'intern', 'unbekannt',
] as const;
export type EinstiegHerkunft = (typeof EINSTIEG_HERKUNFT)[number];
export type WebsiteEinstieg = { pfad: string | null; herkunft: EinstiegHerkunft };

// Dieselbe Regel wie `websitePfadSicher` in der Absende-Route.
const PFAD = /^\/[a-z0-9\-\/]{0,80}$/i;

/** Der Client schickt, der Server entscheidet: nur bekannte Klassen und Pfade nach Muster, sonst null. */
export function websiteEinstiegBereinigen(roh: unknown): WebsiteEinstieg | null {
  if (!roh || typeof roh !== 'object') return null;
  const { pfad, herkunft } = roh as Record<string, unknown>;
  if (typeof herkunft !== 'string' || !(EINSTIEG_HERKUNFT as readonly string[]).includes(herkunft)) return null;
  return { pfad: typeof pfad === 'string' && PFAD.test(pfad) ? pfad : null, herkunft: herkunft as EinstiegHerkunft };
}

export function websiteEinstiegAusAdresse(suche: string): WebsiteEinstieg | null {
  const p = new URLSearchParams(suche);
  return websiteEinstiegBereinigen({ pfad: p.get('ein'), herkunft: p.get('her') });
}

let gemerkt: WebsiteEinstieg | null = null;

/** Beim ersten Aufruf der Seite (AnalyticsProvider): Werte aus der Adresse in den Arbeitsspeicher. */
export function websiteEinstiegMerken(): void {
  if (typeof window === 'undefined') return;
  const e = websiteEinstiegAusAdresse(window.location.search);
  if (e) gemerkt = e;
}

/** Was beim ersten Aufruf gemerkt wurde — oder, falls nichts, die aktuelle Adresse. */
export function websiteEinstieg(): WebsiteEinstieg | null {
  if (gemerkt) return gemerkt;
  if (typeof window === 'undefined') return null;
  return websiteEinstiegAusAdresse(window.location.search);
}

/** Inhalt des Ereignisses `website_einstieg`; `quelle` ist die schon bereinigte Quelle dieser Absendung. */
export function websiteEinstiegEreignis(
  e: WebsiteEinstieg,
  ergebnis: { isNew: boolean; isUpgrade: boolean },
  quelle: string,
): { pfad: string | null; herkunft: EinstiegHerkunft; art: 'neu' | 'hochgestuft' | 'duplikat'; quelle: string } {
  const art = ergebnis.isNew ? 'neu' : ergebnis.isUpgrade ? 'hochgestuft' : 'duplikat';
  return { pfad: e.pfad, herkunft: e.herkunft, art, quelle };
}
