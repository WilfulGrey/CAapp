// Vorgemerkte Pflegekräfte vor dem ersten Speichern der Pflegesituation (Registry #145, Martin 03.11.2026: „Preis oben,
// kurze Hemmnisnehmer … Und dann sofort Pflegekräfte … Und dann geht's weiter“).
//
// Wer vor dem Speichern bei einer Pflegekraft „Einladen“ tippt, bekommt das Fenster „{Name} einladen“; die Pflegekraft
// wird dabei vorgemerkt und nach dem ersten erfolgreichen Speichern automatisch eingeladen (CustomerPortalPage). Gemerkt
// werden NUR die caregiver_ids, je Token unter einem eigenen Schlüssel, damit ein Neuladen sie nicht verliert. Keine
// Namen, keine Fotos: die kommen beim Anzeigen aus der geladenen Liste.
//
// localStorage kann fehlen oder werfen (iOS-WebKit im privaten Modus): dann gelten die Vormerkungen nur für die Sitzung.
//
// Nachbesserung 2 (03.11.2026): höchstens 5 Vormerkungen (die Grenze 5 Einladungen je Stunde); eine abgelehnte oder
// ausgeblendete Karte verliert ihre Vormerkung, und Zeile/Einladen nennen nie mehr Namen, als eingeladen werden können
// (`einladbareVormerkungen`). Namen brechen nie mitten um (`nameGeschuetzt`).

export const vormerkSchluessel = (token: string) => `pm_vorgemerkt_${token}`;

/** Höchstens so viele Pflegekräfte lassen sich vormerken — so viele dürfen in einer Stunde eingeladen werden. */
export const MAX_VORMERKUNGEN = 5;

/** Gespeicherte Vormerkungen für den Token, in der Reihenfolge des Vormerkens; Unlesbares ⇒ leer. */
export function ladeVormerkungen(token: string | null | undefined): number[] {
  if (!token) return [];
  try {
    const roh = localStorage.getItem(vormerkSchluessel(token));
    if (!roh) return [];
    const werte = JSON.parse(roh) as unknown;
    if (!Array.isArray(werte)) return [];
    const ids = werte.filter((w): w is number => typeof w === 'number' && Number.isInteger(w) && w > 0);
    return [...new Set(ids)].slice(0, MAX_VORMERKUNGEN);
  } catch {
    return [];
  }
}

/** Schreibt die Vormerkungen (leer ⇒ Schlüssel entfernt). Fehler werden geschluckt. */
export function speichereVormerkungen(token: string | null | undefined, ids: readonly number[]): void {
  if (!token) return;
  try {
    if (ids.length === 0) localStorage.removeItem(vormerkSchluessel(token));
    else localStorage.setItem(vormerkSchluessel(token), JSON.stringify([...new Set(ids)].slice(0, MAX_VORMERKUNGEN)));
  } catch { /* privater Modus — dann nur für die Sitzung */ }
}

/**
 * Die Vorgemerkten, die nach dem Speichern wirklich eingeladen werden: in der Reihenfolge des Vormerkens, nur wer als
 * offene Karte zu sehen ist (nicht abgelehnt, nicht ausgeblendet), höchstens 5 und nie mehr als `frei` (noch freie
 * Einladungen in dieser Stunde). Dieselbe Liste speist Karte („Vorgemerkt ✓“), Zeile und das Einladen nach dem Speichern.
 */
export function einladbareVormerkungen(vorgemerkt: readonly number[], offen: readonly number[], frei: number): number[] {
  const grenze = Math.max(0, Math.min(MAX_VORMERKUNGEN, Math.floor(frei)));
  return vorgemerkt.filter((id) => offen.includes(id)).slice(0, grenze);
}

/** Name ohne Umbruch in der Mitte: „Anna N.“ mit geschütztem Leerzeichen (U+00A0). */
export const nameGeschuetzt = (name: string) => name.replace(/ /g, '\u00A0');

/** „Emilia W.“ · „Emilia W. und Anna N.“ · „Emilia W., Anna N. und Ewa L.“ — jeder Name mit geschütztem Leerzeichen. */
export function namenListe(namen: readonly string[]): string {
  const n = namen.map(nameGeschuetzt);
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} und ${n[n.length - 1]}`;
}

/** Hinweis nach dem automatischen Einladen: „{Name} ist eingeladen.“ bzw. „{Name1} und {Name2} sind eingeladen.“ */
export function eingeladenHinweis(namen: readonly string[]): string {
  return `${namenListe(namen)} ${namen.length === 1 ? 'ist' : 'sind'} eingeladen.`;
}
