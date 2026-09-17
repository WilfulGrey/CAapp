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

import { SCHRANKE } from './kraefte-vorschau';

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

/** Der Knopf des heutigen Formulars (Variante `alt`) — wortgleich mit dem Trunk, damit die Kontrolle unverändert bleibt. */
export const KNOPF_KONTAKT = 'Preis & Pflegekräfte ansehen →';

/**
 * Die drei Teilschritte. Jede Frage gibt dem Feld einen Grund; die Zeile
 * darunter sagt, was der Kunde bekommt — nicht, was wir brauchen (Martins
 * Linie vom 12.09.). Kein „Werbeanruf", kein „Sofortangebot".
 *
 * Runde 3 (Martin, 16.09. spät, zum E-Mail-Schritt): „Oben steht, Preis ist
 * berechnet … jetzt fragen wir, wohin dürfen wir die Preisberechnung
 * schicken — ich weiß nicht, ob ich das verstehen würde. So viel Text.
 * Kein Zurück. Überladen." Also: kein „schicken" (widerspricht dem
 * Sofortpreis — die Zeile sagt, dass er den Preis GLEICH SIEHT und die
 * Kopie zusätzlich bekommt), kein Zähler, keine Fußzeile (die Leiste
 * darunter sagt schon „kostenfrei & unverbindlich"), kein Zurück; der
 * Telefon-Grund steht in der Frage statt in einer eigenen Zeile.
 */
export const STUFEN = {
  name: {
    frage: 'Wie dürfen wir Sie ansprechen?',
    // Runde 2/3 (Martin): kein Hinweis auf drei Schritte, kein Zähler.
    text: '',
    platzhalter: 'Ihr Name',
    knopf: 'Weiter →',
    fehler: 'Bitte geben Sie Ihren Namen ein',
  },
  email: {
    frage: 'Wie lautet Ihre E-Mail-Adresse?',
    // Der Kunde hat „Ihr Preis ist berechnet" gelesen — die Zeile löst den
    // scheinbaren Widerspruch: sehen gleich hier, Kopie zusätzlich per Mail.
    // Nicht „auf der nächsten Seite" (als Nächstes kommt die Nummer).
    text: 'Ihren Preis sehen Sie gleich – eine Kopie der Berechnung erhalten Sie per E-Mail.',
    platzhalter: 'E-Mail-Adresse',
    knopf: 'Weiter →',
    fehler: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
  },
  telefon: {
    // Runde 2 (Martin): „Per Mail haben Sie eine Kopie erhalten" — hier ist
    // der Satz wahr, der Lead ist nach dem E-Mail-Schritt gespeichert und die
    // Mail ausgelöst. „Unterwegs" statt „erhalten", weil die Zustellung
    // Sekunden bis Minuten dauert; die eingegebene Adresse steht dahinter.
    bestaetigung: 'Eine Kopie Ihrer Preisberechnung ist per E-Mail unterwegs an',
    frage: 'Unter welcher Nummer erreichen wir Sie bei Rückfragen zu Ihrer Betreuung?',
    text: '',
    platzhalter: 'Telefonnummer',
    // Martin: „Jetzt alle Pflegekräfte … sehen" — derselbe Knopf wie auf der
    // Kräfte-Vorschau (Strecke v2, mit „alle 5"), passt bei 375 px in eine Zeile.
    knopf: SCHRANKE.knopf,
    // Klein und grau unter dem Hauptknopf (wie „Abmelden" auf der
    // Rückmeldeseite): der Hauptweg bleibt die Nummer, der Lead ist da.
    ohne: 'Ohne Rückrufnummer weiter',
  },
} as const;

/** Fehlertext, wenn das Speichern des Leads scheitert — kein alert(), inline am Knopf. */
export const STUFEN_FEHLER = {
  speichern: 'Das hat leider nicht geklappt. Bitte versuchen Sie es noch einmal.',
  telefon: 'Die Nummer konnte nicht gespeichert werden. Bitte noch einmal versuchen – oder ohne Nummer weiter.',
} as const;
