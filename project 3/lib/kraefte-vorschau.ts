/**
 * Kräfte-Vorschau vor der Kontaktschranke (Martin, 09.09.2026).
 *
 * Reine Logik für den Rechner: Ist die Vorschau eingeschaltet, welche
 * Wünsche gehen an die Edge Function, wie heißt die Zeile unter dem Namen.
 * Netz und React leben in MultiStepForm.tsx.
 *
 * SCHALTER: Die Vorschau ist bewusst hinter `?kraefte=1` versteckt, bis
 * Martin sie abgenommen hat — danach entscheidet der Split (analytics.ts)
 * darüber, wer sie sieht. Der Schalter wird in sessionStorage gemerkt, weil
 * die Variantenweiche die URL neu schreibt.
 */

export interface VorschauKraft {
  id: number;
  vorname: string;
  alter: number | null;
  deutschWort: string | null;
  erfahrungJahre: number;
  einsaetze: number;
  stufe: string;
  fotoUrl: string;
  verfuegbarAb: string | null;
}

export const VORSCHAU_KEY = 'prim_kraefte_vorschau';

/** Liest den Schalter aus der URL (`?kraefte=1|0`) und merkt ihn sich. */
export function kraefteVorschauAktiv(search: string, storage: Pick<Storage, 'getItem' | 'setItem'> | null): boolean {
  const params = new URLSearchParams(search);
  const q = params.get('kraefte');
  try {
    if (q === '1') { storage?.setItem(VORSCHAU_KEY, '1'); return true; }
    if (q === '0') { storage?.setItem(VORSCHAU_KEY, '0'); return false; }
    return storage?.getItem(VORSCHAU_KEY) === '1';
  } catch {
    return q === '1';
  }
}

export interface Wuensche {
  deutsch: string | null;
  geschlecht: string | null;
  fuehrerschein: string | null;
}

/** Nur die drei Wünsche, die mamamia-Kräfte wirklich unterscheiden. */
export function wuenscheAusAntworten(state: { germanLevel?: string | null; gender?: string | null; driving?: string | null }): Wuensche {
  return {
    deutsch: state.germanLevel || null,
    geschlecht: state.gender || null,
    fuehrerschein: state.driving || null,
  };
}

/**
 * Faktenzeile wie im Portal (`nurseFacts`): „Stammkraft: 7 J. Erfahrung ·
 * 8 Einsätze über Primundus". Kein Datum mehr — `available_from` wird bei
 * mamamia nicht gepflegt und veraltet auf der Karte (Martin, 10.09.); die
 * Verfügbarkeit steht als fester Chip „Ab sofort verfügbar" daneben.
 */
export function kraftFakten(k: Pick<VorschauKraft, 'erfahrungJahre' | 'einsaetze'>): string {
  const teile: string[] = [];
  if (k.erfahrungJahre > 0) teile.push(`${k.erfahrungJahre} J. Erfahrung`);
  if (k.einsaetze > 0) teile.push(k.einsaetze === 1 ? '1 Einsatz über Primundus' : `${k.einsaetze} Einsätze über Primundus`);
  return teile.length > 0 ? teile.join(' · ') : 'bereit für den ersten Einsatz';
}

/** Sprachbalken wie im Portal (SprachBalken.tsx): Grund 1, Mittel 2, Gut 3. */
export function deutschBalken(wort: string | null): number {
  switch (wort) {
    case 'Grund': return 1;
    case 'Mittel': return 2;
    case 'Gut': return 3;
    default: return 0;
  }
}

/**
 * Der rote Faden von Schritt 9 (Martin, 10.09.): EINE Zahl von der Animation
 * bis ins Portal. Das Portal zeigt fünf Vorschläge (`waehleFuenf` in
 * send-scheduled-emails/empfehlung.ts), also zählt die Animation auf 5, der
 * Kopf nennt 5, die Karten zeigen 3 davon vorab, und der Knopf sagt, dass als
 * Nächstes die Kontaktdaten kommen — danach Angebot und alle 5.
 */
export const PORTAL_ANZAHL = 5;

export function kopfzeile(gesamt: number = PORTAL_ANZAHL): { titel: string; text: string } {
  return {
    titel: gesamt === 1 ? '✓ 1 passende Pflegekraft gefunden' : `✓ ${gesamt} passende Pflegekräfte gefunden`,
    text: 'Ab sofort verfügbar, persönlich auf Ihre Angaben abgestimmt',
  };
}

/** Dritte Zeile der Warte-Animation im Vorschau-Modus: „3 davon sehen Sie gleich vorab". */
export function bereitText(gezeigt: number): string {
  return gezeigt === 1 ? '1 davon sehen Sie gleich vorab' : `${gezeigt} davon sehen Sie gleich vorab`;
}

/** Zwischen Karten und Knopf: warum genau diese Karten hier stehen. */
export function bruecke(gezeigt: number, gesamt: number = PORTAL_ANZAHL): string {
  return gezeigt === 1 ? `Das ist 1 Ihrer ${gesamt} Pflegekräfte.` : `Das sind ${gezeigt} Ihrer ${gesamt} Pflegekräfte.`;
}

/** Knopf unter den Karten, bevor die Felder offen sind — kündigt die Kontaktdaten an (Martins Wortlaut). */
export const KNOPF_VOR_KONTAKT = {
  // Geschütztes Leerzeichen vor dem Pfeil: auf 375 px brach der Pfeil allein in die zweite Zeile.
  text: 'Kontaktdaten eingeben & Angebot ansehen\u00A0→',
  hinweis: `Danach sofort: Ihr Monatspreis und alle ${PORTAL_ANZAHL} Pflegekräfte im Portal`,
};

/** Die Kontaktschranke selbst; der Absendeknopf heißt wie im normalen Rechner. */
export const SCHRANKE = {
  titel: 'Fast geschafft: Ihre Kontaktdaten',
  text: `Danach öffnet sich sofort Ihr Portal mit Angebot, Monatspreis und allen ${PORTAL_ANZAHL} Pflegekräften.`,
  knopf: 'Angebot & Pflegekräfte anzeigen →',
};

/** Antwort der Function absichern — nur, was die Karte braucht, nie mehr. */
export function parseVorschau(json: unknown): VorschauKraft[] {
  const liste = (json && typeof json === 'object' && Array.isArray((json as { kraefte?: unknown }).kraefte))
    ? (json as { kraefte: unknown[] }).kraefte
    : [];
  return liste.flatMap((k) => {
    if (!k || typeof k !== 'object') return [];
    const o = k as Record<string, unknown>;
    if (typeof o.id !== 'number' || typeof o.vorname !== 'string' || typeof o.fotoUrl !== 'string' || !/^https:\/\//.test(o.fotoUrl)) return [];
    return [{
      id: o.id,
      vorname: o.vorname.slice(0, 30),
      alter: typeof o.alter === 'number' ? o.alter : null,
      deutschWort: typeof o.deutschWort === 'string' ? o.deutschWort : null,
      erfahrungJahre: typeof o.erfahrungJahre === 'number' ? o.erfahrungJahre : 0,
      einsaetze: typeof o.einsaetze === 'number' ? o.einsaetze : 0,
      stufe: typeof o.stufe === 'string' ? o.stufe : '',
      fotoUrl: o.fotoUrl,
      verfuegbarAb: typeof o.verfuegbarAb === 'string' ? o.verfuegbarAb : null,
    }];
  }).slice(0, 3);
}
