/**
 * Kontakt in drei Schritten (Registry #76, Martin 16.09.2026).
 *
 * Befund: Am Kontaktschritt gingen alle Besucher, die kein Feld berührten
 * (19 von 49 mit Einwilligung seit 27.08.); wer ein Feld anfasste, schickte
 * zu 87 % ab. Martin: „klein anfangen, dann ist man so weit, dass man es
 * einfach macht" — und: den Lead schon mit Name + E-Mail speichern, die
 * Preis-Mail auch ohne Nummer schicken, die Nummer danach erfragen.
 *
 * Seit Registry #77 (17.09.) würfelt dieses Modul nicht mehr selbst. Der
 * Test liegt beim Ablauf (`lib/preis-zuerst.ts`, Registry #80, Martin 18.09.:
 * „Preis zeigen wir nicht an, den Kontakt dafür in drei Schritten — als A/B-Test
 * mit der anderen Variante, wir zeigen den Preis vorher an"): Ablauf `alt` =
 * kein Preis, Kontakt in DREI Schritten (`stufen`); Ablauf `preis` = Preisseite,
 * dann EINE Kontaktseite (`alt`). `kontaktStandard(ablauf)` liefert genau das.
 * `?kontakt=stufen` bzw. `?kontakt=seite` (auch `alt`) erzwingt die Form
 * unabhängig vom Ablauf (Abnahme, Vergleich) und klebt je Sitzung.
 * Pur (kein React/Next) — Root-Vitest importiert es direkt.
 */

import { SCHRANKE } from './kraefte-vorschau';

export const KONTAKT_KEY = 'prim_kontakt_variante';

export const KONTAKT_VARIANTEN = ['stufen', 'alt'] as const;
export type KontaktVariante = (typeof KONTAKT_VARIANTEN)[number];

export const KONTAKT_STUFEN = ['name', 'email', 'telefon'] as const;
export type KontaktStufe = (typeof KONTAKT_STUFEN)[number];

/**
 * Welche Kontaktform der Ablauf vorgibt (Registry #80): ohne Preis die drei
 * Schritte, hinter der Preisseite die eine Seite (`alt` = `KontaktSeite.tsx`).
 */
export function kontaktStandard(ablauf: 'preis' | 'alt'): KontaktVariante {
  return ablauf === 'alt' ? 'stufen' : 'alt';
}

/**
 * Welche Kontaktform der Besucher sieht. Nur im Browser nach dem Mount rufen
 * (useEffect) — beim Rendern würde Server und Client auseinanderlaufen.
 * Erzwungen (`?kontakt=…`, klebt je Sitzung) schlägt gemerkt schlägt
 * `standard` (den gibt der Ablauf vor, siehe `kontaktStandard`).
 * Der Standard wird NICHT gemerkt — er soll dem Ablauf folgen.
 */
export function kontaktVariante(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  standard: KontaktVariante = 'alt',
): KontaktVariante {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('kontakt'); } catch { q = null; }
  const erzwungen: KontaktVariante | null = q === 'stufen' ? 'stufen' : q === 'alt' || q === 'seite' ? 'alt' : null;
  try {
    if (erzwungen) { storage?.setItem(KONTAKT_KEY, erzwungen); return erzwungen; }
    const gemerkt = storage?.getItem(KONTAKT_KEY);
    if (gemerkt === 'stufen' || gemerkt === 'alt') return gemerkt;
    return standard;
  } catch {
    return erzwungen ?? standard;
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
