/**
 * Kontakt in drei Schritten (Registry #76, Martin 16.09.2026).
 *
 * Befund: Am Kontaktschritt gingen alle Besucher, die kein Feld berührten
 * (19 von 49 mit Einwilligung seit 27.08.); wer ein Feld anfasste, schickte
 * zu 87 % ab. Martin: „klein anfangen, dann ist man so weit, dass man es
 * einfach macht" — und: den Lead schon mit Name + E-Mail speichern, die
 * Preis-Mail auch ohne Nummer schicken, die Nummer danach erfragen.
 *
 * Der EINE Test seit dem 19.09.2026 (Registry #80, Martin: „die alte Seite mit
 * angepasster Wartezeit und dann nur einen Test mit dem 3-Step-Kontakt"): im
 * Ablauf `alt` (kein Preis vor dem Kontakt) sehen `anteilStufen` der Besucher
 * die drei Schritte, der Rest das alte Formular. Das Los fällt einmal und klebt
 * 30 Tage (localStorage `prim_kontakt_los`), damit ein Wiederkehrer denselben
 * Arm sieht; es wird nur gelesen, solange der Test läuft. Hinter der Preisseite
 * (`?ablauf=preis`) bleibt die eine Kontaktseite. `?kontakt=stufen` bzw.
 * `?kontakt=seite` (auch `alt`) erzwingt die Form (sessionStorage, klebt je
 * Sitzung) und schlägt das Los. `KONTAKT_TEST.aktiv = false` beendet den Test.
 * Pur (kein React/Next) — Root-Vitest importiert es direkt.
 */

import { SCHRANKE } from './kraefte-vorschau';

export const KONTAKT_KEY = 'prim_kontakt_variante';

export const KONTAKT_VARIANTEN = ['stufen', 'alt'] as const;
export type KontaktVariante = (typeof KONTAKT_VARIANTEN)[number];

export const KONTAKT_STUFEN = ['name', 'email', 'telefon'] as const;
export type KontaktStufe = (typeof KONTAKT_STUFEN)[number];

/** Der Kontakt-Test: `aktiv: false` = alle sehen das alte Formular (eine Zeile + Merge). */
export const KONTAKT_TEST = { aktiv: true, anteilStufen: 0.5 } as const;
export type KontaktTest = { readonly aktiv: boolean; readonly anteilStufen: number };
/** Das Los (localStorage): `{ v: 'stufen'|'alt', t: <ms> }`, gültig 30 Tage. */
export const LOS_KEY = 'prim_kontakt_los';
export const LOS_TAGE = 30;
type Speicher = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Was `kontaktVariante` ohne Zwang liefert: im Ablauf `alt` das Los (solange der
 * Test läuft), hinter der Preisseite die eine Seite (`alt` = `KontaktSeite.tsx`).
 */
export function kontaktStandard(ablauf: 'preis' | 'alt', test: KontaktTest = KONTAKT_TEST): KontaktVariante | 'wuerfeln' {
  return ablauf === 'alt' && test.aktiv ? 'wuerfeln' : 'alt';
}

/** Das gemerkte Los, wenn es gültig ist — sonst null. */
function gemerktesLos(los: Speicher | null, jetzt: number): KontaktVariante | null {
  try {
    const roh = los?.getItem(LOS_KEY);
    if (!roh) return null;
    const { v, t } = JSON.parse(roh) as { v?: unknown; t?: unknown };
    if ((v !== 'stufen' && v !== 'alt') || typeof t !== 'number') return null;
    return jetzt - t <= LOS_TAGE * 24 * 60 * 60 * 1000 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Welche Kontaktform der Besucher sieht. Nur im Browser nach dem Mount rufen
 * (useEffect) — beim Rendern würde Server und Client auseinanderlaufen.
 * Reihenfolge: erzwungen (`?kontakt=…`, in `storage` gemerkt, klebt je Sitzung)
 * → in dieser Sitzung erzwungen → gültiges Los (`los`, 30 Tage; nur wenn
 * `standard === 'wuerfeln'`) → neues Los (wird gemerkt) → feste Vorgabe.
 * Ohne Los-Speicher fällt das Los auf `alt` — ein Los, das nicht klebt, fiele
 * bei jedem Aufruf neu. Eine feste Vorgabe wird nie gemerkt.
 */
export function kontaktVariante(
  search: string,
  storage: Speicher | null,
  standard: KontaktVariante | 'wuerfeln' = 'alt',
  zufall: () => number = Math.random,
  los: Speicher | null = storage,
  jetzt: number = Date.now(),
  test: KontaktTest = KONTAKT_TEST,
): KontaktVariante {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('kontakt'); } catch { q = null; }
  const erzwungen: KontaktVariante | null = q === 'stufen' ? 'stufen' : q === 'alt' || q === 'seite' ? 'alt' : null;
  const fest: KontaktVariante = standard === 'wuerfeln' ? 'alt' : standard;
  try {
    if (erzwungen) { storage?.setItem(KONTAKT_KEY, erzwungen); return erzwungen; }
    const gemerkt = storage?.getItem(KONTAKT_KEY);
    if (gemerkt === 'stufen' || gemerkt === 'alt') return gemerkt;
  } catch {
    return erzwungen ?? fest;
  }
  if (standard !== 'wuerfeln' || !los) return fest;
  const alt = gemerktesLos(los, jetzt);
  if (alt) return alt;
  const neu: KontaktVariante = zufall() < test.anteilStufen ? 'stufen' : 'alt';
  try { los.setItem(LOS_KEY, JSON.stringify({ v: neu, t: jetzt })); } catch { return 'alt'; }
  return neu;
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
