/**
 * Kontakt in drei Schritten (Registry #76, Martin 16.09.2026).
 *
 * Befund: Am Kontaktschritt gingen alle Besucher, die kein Feld berührten
 * (19 von 49 mit Einwilligung seit 27.08.); wer ein Feld anfasste, schickte
 * zu 87 % ab. Martin: „klein anfangen, dann ist man so weit, dass man es
 * einfach macht" — und: den Lead schon mit Name + E-Mail speichern, die
 * Preis-Mail auch ohne Nummer schicken, die Nummer danach erfragen.
 *
 * Läuft als 50/50 gegen das heutige Formular (Variante `alt`), weil der
 * Traffic-Mix allein den Kontaktschritt zwischen 8 % und 31 % schwanken
 * lässt (16.09.) — ohne gleichzeitige Kontrolle wäre die Wirkung nicht
 * lesbar. Die Variante klebt je Sitzung (sessionStorage), `?kontakt=stufen`
 * bzw. `?kontakt=alt` erzwingt sie. Pur (kein React/Next) — Root-Vitest
 * importiert es direkt.
 */

export const KONTAKT_KEY = 'prim_kontakt_variante';

export const KONTAKT_VARIANTEN = ['stufen', 'alt'] as const;
export type KontaktVariante = (typeof KONTAKT_VARIANTEN)[number];

export const KONTAKT_STUFEN = ['name', 'email', 'telefon'] as const;
export type KontaktStufe = (typeof KONTAKT_STUFEN)[number];

/**
 * Welche Variante der Besucher sieht. Nur im Browser nach dem Mount rufen
 * (useEffect) — beim Rendern würde Server und Client auseinanderlaufen.
 * Bei gesperrtem Storage (Safari privat) zählt der Parameter, sonst `alt`.
 */
export function kontaktVariante(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  wuerfel: () => number = Math.random,
): KontaktVariante {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('kontakt'); } catch { q = null; }
  const erzwungen = q === 'stufen' || q === 'alt' ? q : null;
  try {
    if (erzwungen) { storage?.setItem(KONTAKT_KEY, erzwungen); return erzwungen; }
    const gemerkt = storage?.getItem(KONTAKT_KEY);
    if (gemerkt === 'stufen' || gemerkt === 'alt') return gemerkt;
    const neu: KontaktVariante = wuerfel() < 0.5 ? 'stufen' : 'alt';
    storage?.setItem(KONTAKT_KEY, neu);
    return neu;
  } catch {
    return erzwungen ?? 'alt';
  }
}

/** Derselbe Knopf wie im heutigen Formular — der Kunde hat das Versprechen geklickt, der letzte Knopf löst es ein. */
export const KNOPF_KONTAKT = 'Preis & Pflegekräfte ansehen →';

/**
 * Die drei Teilschritte. Jede Frage gibt dem Feld einen Grund; die Zeile
 * darunter sagt, was der Kunde bekommt — nicht, was wir brauchen (Martins
 * Linie vom 12.09.). Kein „Werbeanruf", kein „Sofortangebot".
 */
export const STUFEN = {
  name: {
    frage: 'Wie dürfen wir Sie ansprechen?',
    text: 'Ihr Preis wartet – noch 3 kurze Angaben.',
    platzhalter: 'Ihr Name',
    knopf: 'Weiter →',
    fehler: 'Bitte geben Sie Ihren Namen ein',
  },
  email: {
    frage: 'Wohin dürfen wir Ihre Preisberechnung schicken?',
    text: 'Den Preis sehen Sie gleich auf der nächsten Seite, die Berechnung kommt zusätzlich per E-Mail.',
    platzhalter: 'E-Mail-Adresse',
    knopf: 'Weiter →',
    fehler: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
  },
  telefon: {
    frage: 'Unter welcher Nummer erreichen wir Sie bei Rückfragen?',
    text: 'Nur bei Rückfragen zu Ihrer Betreuung.',
    platzhalter: 'Telefonnummer',
    knopf: KNOPF_KONTAKT,
    // Klein und grau unter dem Hauptknopf (wie „Abmelden" auf der
    // Rückmeldeseite): der Hauptweg bleibt die Nummer, der Lead ist da.
    ohne: 'Ohne Rückrufnummer weiter',
  },
} as const;

/** „Angabe 1 von 3" über dem Feld. */
export function stufenZaehler(stufe: KontaktStufe): string {
  return `Angabe ${KONTAKT_STUFEN.indexOf(stufe) + 1} von ${KONTAKT_STUFEN.length}`;
}

/** Fehlertext, wenn das Speichern des Leads scheitert — kein alert(), inline am Knopf. */
export const STUFEN_FEHLER = {
  speichern: 'Das hat leider nicht geklappt. Bitte versuchen Sie es noch einmal.',
  telefon: 'Die Nummer konnte nicht gespeichert werden. Bitte noch einmal versuchen – oder ohne Nummer weiter.',
} as const;

/** Fußzeilen: die Einwilligung steht dort, wo die Daten abgeschickt werden (E-Mail-Schritt). */
export const STUFEN_FUSS = {
  name: 'Kostenlos · unverbindlich',
  email: 'Sofort sichtbar · kostenlos · unverbindlich',
  telefon: 'Sofort sichtbar · kostenlos · unverbindlich',
} as const;
