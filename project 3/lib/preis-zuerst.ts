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
 * (Preis, Zuschüsse, Heimvergleich, Garantie, Konditionen, Kräfte) → Knopf →
 * Kontakt (drei Schritte aus Registry #76; `?kontakt=alt` = heutiges
 * Formular) → Portal. Ablauf `alt` = heute. 50/50 je Sitzung, klebrig,
 * `?ablauf=preis|alt` erzwingt. Pur (kein React/Next) — Root-Vitest
 * importiert es direkt.
 */
import { PORTAL_ANZAHL } from './kraefte-vorschau';

export const ABLAUF_KEY = 'prim_ablauf_variante';
export const ABLAUF_VARIANTEN = ['preis', 'alt'] as const;
export type Ablauf = (typeof ABLAUF_VARIANTEN)[number];

/**
 * Welchen Ablauf der Besucher sieht. Nur im Browser nach dem Mount rufen
 * (useEffect) — beim Rendern liefen Server und Client auseinander.
 * Bei gesperrtem Storage (Safari privat) zählt der Parameter, sonst `alt`.
 */
export function ablaufVariante(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  wuerfel: () => number = Math.random,
): Ablauf {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('ablauf'); } catch { q = null; }
  const erzwungen = q === 'preis' || q === 'alt' ? q : null;
  try {
    if (erzwungen) { storage?.setItem(ABLAUF_KEY, erzwungen); return erzwungen; }
    const gemerkt = storage?.getItem(ABLAUF_KEY);
    if (gemerkt === 'preis' || gemerkt === 'alt') return gemerkt;
    const neu: Ablauf = wuerfel() < 0.5 ? 'preis' : 'alt';
    storage?.setItem(ABLAUF_KEY, neu);
    return neu;
  } catch {
    return erzwungen ?? 'alt';
  }
}

/** „3.050 €" — ganze Euro, deutsches Tausenderzeichen, geschütztes Leerzeichen vor dem €. */
export function euro(betrag: number): string {
  return `${Math.round(betrag).toLocaleString('de-DE')} €`;
}

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
 * freigegeben) — eine Wahrheit vor und hinter der Schranke. Testsieger steht
 * im grünen Kopf darüber, deshalb hier nicht noch einmal.
 */
export const PREIS_SEITE = {
  label: 'Ihre Betreuungskosten',
  proMonat: 'im Monat',
  inklusive: 'Inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).',
  nachZuschuessen: (eigen: number) => `Nach Zuschüssen ca. ${euro(eigen)} im Monat`,
  eingerechnet: (namen: string) => (namen ? `${namen} eingerechnet.` : ''),
  /** Nur wenn zuhause günstiger ist als das Heim — sonst kein Satz (kein Schönrechnen). */
  heim: (eigen: number): string | null => {
    const weniger = HEIM_EIGENANTEIL - eigen;
    if (weniger <= 0) return null;
    return `Im Pflegeheim zahlen Sie im ersten Jahr durchschnittlich ${euro(HEIM_EIGENANTEIL)} im Monat selbst – zuhause rund ${euro(weniger)} weniger.`;
  },
  heimQuelle: 'Quelle: vdek-Auswertung, Stand 1. Juli 2026.',
  garantieMehr: 'Mehr Infos',
  haken: ['Täglich kündbar', 'Tagesgenaue Abrechnung', 'Erst auswählen, dann buchen', 'Keine Vermittlungsgebühr'],
  kostenErst: 'Kosten erst, wenn die Pflegekraft da ist.',
  kraefte: `${PORTAL_ANZAHL} passende Pflegekräfte – ab sofort verfügbar`,
  // Martin: „wenn er speichern will und Pflegekräfte sehen, dann Button".
  // „sichern" statt „speichern", damit der Knopf bei 375 px in eine Zeile passt (≤ 38 Zeichen).
  knopf: 'Pflegekräfte ansehen & Preis sichern →',
  // Sagt ehrlich, was als Nächstes kommt — keine Überraschungs-Schranke.
  unterKnopf: 'Dafür fragen wir im nächsten Schritt Ihre Kontaktdaten ab.',
} as const;

/**
 * Kontakt HINTER dem Preis: der Kunde kennt den Preis schon, also verspricht
 * hier nichts mehr den Preis — der Lohn sind die Pflegekräfte und das Portal.
 */
export const KONTAKT_NACH_PREIS = {
  // Kurz, damit der grüne Kopf auf dem Handy einzeilig bleibt („im Monat" stand auf der Preisseite).
  kopf: (brutto: number) => `Ihr Preis: ${euro(brutto)}`,
  emailText: 'Ihre Berechnung und den Zugang zu Ihren Pflegekräften erhalten Sie per E-Mail.',
  knopf: `Alle ${PORTAL_ANZAHL} Pflegekräfte ansehen →`,
  // Nur für `?kontakt=alt` (heutiges Drei-Felder-Formular hinter dem Preis):
  frageAlt: 'Für wen dürfen wir Ihr Kundenportal einrichten?',
  textAlt: `Dort sehen Sie alle ${PORTAL_ANZAHL} Pflegekräfte und Ihre Berechnung.`,
} as const;

/** Warteseite im Ablauf `preis`: ca. 3 s statt 10,7 s — die Preisberechnung braucht ca. 1 s, der Moment lässt den Preis individuell wirken. */
export const WARTE_KURZ_MS = [1000, 1200, 500] as const;
export const WARTE_KURZ_ENDE_MS = 500;
