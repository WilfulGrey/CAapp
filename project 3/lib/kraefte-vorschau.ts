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
 * Was der Kunde auf Schritt 9 angetippt hat, bevor die Kontaktfelder
 * aufgehen: eine Karte (Profil / Einladen) oder der Knopf darunter. Wandert
 * in die Messung und als `cg=`-Deeplink ins Portal.
 */
export interface KraefteWahl {
  aktion: 'einladen' | 'profil' | 'button';
  id?: number;
  vorname?: string;
}

/**
 * Überschrift, Satz und Knopftext der Kontaktschranke — je nachdem, was der
 * Kunde angetippt hat. Reihenfolge stimmt jetzt: erst Kontaktdaten, dann
 * Preis (Martin, 10.09.: „Preis anzeigen & Kontaktdaten eingeben ist doch
 * falsche Reihenfolge").
 */
export function kraftAktionTexte(w: KraefteWahl | null): { titel: string; text: string; knopf: string } {
  const danach = 'Danach öffnet sich Ihr Portal mit Monatspreis, Anreisedatum und den passenden Profilen.';
  if (w?.aktion === 'einladen' && w.vorname) {
    return { titel: `${w.vorname} einladen`, text: `Dafür brauchen wir kurz Ihre Kontaktdaten. ${danach}`, knopf: `${w.vorname} einladen →` };
  }
  if (w?.aktion === 'profil' && w.vorname) {
    return { titel: `Profil von ${w.vorname} ansehen`, text: `Dafür brauchen wir kurz Ihre Kontaktdaten. ${danach}`, knopf: 'Profil öffnen →' };
  }
  return { titel: 'Preis & Profile ansehen', text: `Kurz Ihre Kontaktdaten — ${danach.charAt(0).toLowerCase()}${danach.slice(1)}`, knopf: 'Preis & Profile jetzt ansehen →' };
}

/** Portal-URL um den Deeplink auf die gewählte Kraft ergänzen (öffnet dort ihr Profil, wenn sie im Matching steht). */
export function portalUrlMitWahl(portalUrl: string, w: KraefteWahl | null): string {
  if (!w?.id) return portalUrl;
  return `${portalUrl}${portalUrl.includes('?') ? '&' : '?'}cg=${w.id}&goto=matches`;
}

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
