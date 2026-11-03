// Vorgemerkte Pflegekräfte vor dem ersten Speichern der Pflegesituation (Registry #145, Martin 03.11.2026: „Preis oben,
// kurze Hemmnisnehmer … Und dann sofort Pflegekräfte … Und dann geht's weiter“).
//
// Wer vor dem Speichern bei einer Pflegekraft „Einladen“ tippt, bekommt das Fenster „{Name} einladen“; die Pflegekraft
// wird dabei vorgemerkt und nach dem ersten erfolgreichen Speichern automatisch eingeladen (CustomerPortalPage). Gemerkt
// werden NUR die caregiver_ids, je Token unter einem eigenen Schlüssel, damit ein Neuladen sie nicht verliert. Keine
// Namen, keine Fotos: die kommen beim Anzeigen aus der geladenen Liste.
//
// localStorage kann fehlen oder werfen (iOS-WebKit im privaten Modus): dann gelten die Vormerkungen nur für die Sitzung.

export const vormerkSchluessel = (token: string) => `pm_vorgemerkt_${token}`;

/** Gespeicherte Vormerkungen für den Token, in der Reihenfolge des Vormerkens; Unlesbares ⇒ leer. */
export function ladeVormerkungen(token: string | null | undefined): number[] {
  if (!token) return [];
  try {
    const roh = localStorage.getItem(vormerkSchluessel(token));
    if (!roh) return [];
    const werte = JSON.parse(roh) as unknown;
    if (!Array.isArray(werte)) return [];
    const ids = werte.filter((w): w is number => typeof w === 'number' && Number.isInteger(w) && w > 0);
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

/** Schreibt die Vormerkungen (leer ⇒ Schlüssel entfernt). Fehler werden geschluckt. */
export function speichereVormerkungen(token: string | null | undefined, ids: readonly number[]): void {
  if (!token) return;
  try {
    if (ids.length === 0) localStorage.removeItem(vormerkSchluessel(token));
    else localStorage.setItem(vormerkSchluessel(token), JSON.stringify([...new Set(ids)]));
  } catch { /* privater Modus — dann nur für die Sitzung */ }
}

/** „Emilia W.“ · „Emilia W. und Anna N.“ · „Emilia W., Anna N. und Ewa L.“ */
export function namenListe(namen: readonly string[]): string {
  if (namen.length <= 1) return namen[0] ?? '';
  return `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`;
}

/** Hinweis nach dem automatischen Einladen: „{Name} ist eingeladen.“ bzw. „{Name1} und {Name2} sind eingeladen.“ */
export function eingeladenHinweis(namen: readonly string[]): string {
  return `${namenListe(namen)} ${namen.length === 1 ? 'ist' : 'sind'} eingeladen.`;
}
