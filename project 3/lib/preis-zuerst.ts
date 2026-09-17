/**
 * Preis zuerst (Registry #77, Martin 17.09.2026): „Wir zeigen dem Kunden den
 * Preis vor den Daten. Inkl. unserer Vorteile, Siegel etc. Und wenn er
 * speichern will und Pflegekräfte sehen, dann Button und dann erst die
 * Kontaktabfrage, um ins Portal zu kommen."
 *
 * Befund dahinter (anonyme Zähler 12.–17.09.): Fragen 2–8 kosten je 0–2 %,
 * am Kontaktschritt gehen 72 % (Google 78 %); 19 von 49 fassten dort nie ein
 * Feld an. Die Schranke selbst ist das Problem — und sie bricht das
 * Versprechen „Preis", das Anzeige, Seite und Rechner geben.
 *
 * Ablauf `preis`: 8 Fragen → kurze Warteseite (ca. 3 s statt 11) → PREISSEITE
 * → Knopf → KONTAKTSEITE (eine Seite, alle drei Angaben) → Portal.
 *
 * Martin 17.09. mittags: „lass alle auf neu machen und erst dann auf
 * 3-Step-Kontakt" / „Preis und erst dann alle Daten" — also KEIN 50/50:
 * jeder Besucher läuft `preis`; `?ablauf=alt` zeigt den alten Weg (Vergleich,
 * Notausgang). Die drei Kontaktschritte (Registry #76) bleiben im Code und
 * sind mit `?kontakt=stufen` zu sehen — ihr Test kommt danach. Pur (kein
 * React/Next) — Root-Vitest importiert es direkt.
 */
import { PORTAL_ANZAHL } from './kraefte-vorschau';

export const ABLAUF_KEY = 'prim_ablauf_variante';
export const ABLAUF_VARIANTEN = ['preis', 'alt'] as const;
export type Ablauf = (typeof ABLAUF_VARIANTEN)[number];

/**
 * Welchen Ablauf der Besucher sieht: `preis` für alle; `?ablauf=alt|preis`
 * erzwingt und klebt je Sitzung. Nur im Browser nach dem Mount rufen
 * (useEffect). Bei gesperrtem Storage (Safari privat) zählt der Parameter.
 */
export function ablaufVariante(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
): Ablauf {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('ablauf'); } catch { q = null; }
  const erzwungen = q === 'preis' || q === 'alt' ? q : null;
  try {
    if (erzwungen) { storage?.setItem(ABLAUF_KEY, erzwungen); return erzwungen; }
    const gemerkt = storage?.getItem(ABLAUF_KEY);
    if (gemerkt === 'preis' || gemerkt === 'alt') return gemerkt;
    return 'preis';
  } catch {
    return erzwungen ?? 'preis';
  }
}

/** „3.050 €" — ganze Euro, deutsches Tausenderzeichen, geschütztes Leerzeichen vor dem €. */
export function euro(betrag: number): string {
  return `${Math.round(betrag).toLocaleString('de-DE')}\u00A0€`;
}

/** Der eine Knopf des Ablaufs `preis` — auf der Preisseite UND als letzter Knopf der Kontaktabfrage. */
export const KNOPF_PREIS = 'Speichern & Pflegekräfte ansehen\u00A0→';

/** vdek-Auswertung zum 01.07.2026, Bundesdurchschnitt im ersten Jahr — derselbe Wert wie im Portal (HEIM_EIGENANTEIL). */
export const HEIM_EIGENANTEIL = 3364;

/** Kurznamen der Zuschüsse für die Zeile unter dem Eigenanteil; unbekannte Posten behalten ihr Label. */
const ZUSCHUSS_KURZ: Record<string, string> = {
  pflegegeld: 'Pflegegeld',
  entlastungsbudget_neu: 'Entlastungsbudget',
  steuervorteil: 'Steuervorteil',
};
export function zuschussNamen(items: Array<{ name: string; label: string; in_kalkulation: boolean }>): string {
  const n = items.filter((z) => z.in_kalkulation).map((z) => ZUSCHUSS_KURZ[z.name] ?? z.label);
  if (n.length <= 1) return n.join('');
  return `${n.slice(0, -1).join(', ')} und ${n[n.length - 1]}`;
}

/**
 * Die Preisseite. Wortlaut = Kostenkarte des Kundenportals (von Martin
 * freigegeben) — eine Wahrheit vor und hinter der Schranke.
 *
 * Runde 2 (Martin 17.09.: „selten so eine unruhige und schlechte Seite
 * gesehen"): EIN Blickfang (der Preis), EINE Stütze (nach Zuschüssen), EIN
 * Knopf — sonst nichts über der Falz. Keine Kästen im Kasten, keine zweite
 * Siegel-Pille neben dem Siegel im Kopf, drei Schriftgrößen, Grün nur für die
 * Ersparnis, Koralle nur für den Knopf. Garantie, Konditionen und
 * Heimvergleich stehen ruhig und einspaltig UNTER dem Knopf.
 */
export const PREIS_SEITE = {
  // Satz der Portal-Kostenkarte; die Garantie hängt als Wort mit Link an
  // („mit Bestpreisgarantie" = GARANTIE.vorsatz + GARANTIE.wort, wie im Kopf des Kontakt-Schritts).
  proMonat: 'im Monat',
  // Satz der Portal-Kostenkarte. Die Garantie steht EINMAL auf der Seite: als vierter
  // Punkt unter dem Knopf, wie auf der Startseite (Martin: nicht doppelt).
  inklusive: 'Inkl. Steuern, Gebühren und Sozialabgaben.',
  zuzueglich: 'Zzgl. Kost und Logis sowie Reisekosten (125\u00A0€ pro Fahrt).',
  zuschussLabel: 'Nach Zuschüssen',
  zuschussWert: (eigen: number) => `ca. ${euro(eigen)}`,
  eingerechnet: (namen: string) => (namen ? `${namen} eingerechnet` : ''),
  // Martins Wortlaut (17.09.): „Speichern & Pflegekräfte ansehen". Derselbe Knopf
  // steht am Ende der Kontaktabfrage (Martins Linie 11.09.: der Kunde klickt ein
  // Versprechen, der letzte Knopf löst es ein).
  knopf: KNOPF_PREIS,
  // Eine Zeile neben den Fotos — „ab sofort verfügbar" sagte schon die Warteseite.
  unterKnopf: 'Passend zu Ihren Angaben',
  garantieMehr: 'Mehr Infos',
  // Unter dem Knopf wie auf der Startseite (Martin 17.09.): die Hero-Punkte
  // (lib/hero-punkte.ts) mit „Bestpreisgarantie · Mehr Infos" als viertem, die
  // Sterne-Zeile (lib/sterne-zeile.ts, live von primundus.de), darunter Marta.
  // Martin 17.09.: nicht auf den Preis beschränkt — allgemein helfen, auch bei Zuschüssen und Förderung.
  marta: { frage: 'Kann ich Ihnen weiterhelfen?', text: 'Ich berate Sie gerne – auch zu Zuschüssen und Förderung. Schnell und unverbindlich.' },
  /** Nur wenn zuhause günstiger ist als das Heim — sonst kein Satz (kein Schönrechnen). */
  heim: (eigen: number): string | null => {
    const weniger = HEIM_EIGENANTEIL - eigen;
    if (weniger <= 0) return null;
    return `Zum Vergleich: Im Pflegeheim zahlen Sie im ersten Jahr durchschnittlich ${euro(HEIM_EIGENANTEIL)} im Monat selbst – zuhause rund ${euro(weniger)} weniger.`;
  },
  heimQuelle: 'Quelle: vdek-Auswertung, Stand 1. Juli 2026.',
} as const;

/**
 * Kontakt HINTER dem Preis: der Kunde kennt den Preis schon, also verspricht
 * hier nichts mehr den Preis — der Lohn sind die Pflegekräfte.
 */
export const KONTAKT_NACH_PREIS = {
  // Kurz, damit der grüne Kopf auf dem Handy einzeilig bleibt („im Monat" stand auf der Preisseite).
  kopf: (brutto: number) => `Ihr Preis: ${euro(brutto)}`,
  // Nur für `?kontakt=stufen` (drei Schritte, Test kommt später):
  emailText: 'Ihre Berechnung und den Zugang zu Ihren Pflegekräften erhalten Sie per E-Mail.',
  knopf: KNOPF_PREIS,
} as const;

/**
 * Die Kontaktseite hinter dem Preis (Martin 17.09.: „Diese Seite müssen wir
 * schön machen, damit das auch gut konvertiert"). Dieselbe ruhige Sprache wie
 * die Preisseite: eine Frage, eine Zeile Lohn (Fotos + Satz), drei Felder mit
 * sichtbaren Beschriftungen, ein Knopf, darunter nur der Datenschutz-Satz.
 * Die Frage nimmt den Knopf auf, den der Kunde gerade geklickt hat
 * („Speichern …") und folgt Martins Muster vom 12.09. („Für wen dürfen wir …?").
 * Kein „Portal", kein „Fast geschafft", kein „brauchen".
 */
export const KONTAKT_SEITE = {
  frage: 'Für wen dürfen wir Ihre Preisberechnung speichern?',
  lohn: `Danach sehen Sie sofort Ihre ${PORTAL_ANZAHL} Pflegekräfte.`,
  label: { name: 'Ihr Name', email: 'E-Mail-Adresse', phone: 'Telefonnummer' },
  platzhalterTelefon: 'z. B. 0170 1234567',
  // Martins Wortlaut (17.09., Portal-Profil): sagen, WANN wir anrufen.
  telefonHinweis: 'Nur bei Rückfragen oder wenn etwas dringend geklärt werden muss.',
  knopf: KNOPF_PREIS,
  sendet: 'Wird gespeichert …',
  datenschutzVor: 'Mit dem Absenden stimmen Sie unserer',
  datenschutzLink: 'Datenschutzerklärung',
  datenschutzNach: 'zu.',
  fehler: {
    name: 'Bitte geben Sie Ihren Namen ein',
    emailLeer: 'Bitte geben Sie Ihre E-Mail-Adresse ein',
    email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
    speichern: 'Das hat leider nicht geklappt. Bitte versuchen Sie es noch einmal.',
  },
} as const;

/** Warteseite im Ablauf `preis`: ca. 3 s statt 10,7 s — die Preisberechnung braucht ca. 1 s, der Moment lässt den Preis individuell wirken. */
export const WARTE_KURZ_MS = [1000, 1200, 500] as const;
export const WARTE_KURZ_ENDE_MS = 500;
