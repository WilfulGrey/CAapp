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
 * Martins Aufbau vom 10.09. (Runde 4) — Screen 1 (Warten) und Screen 2
 * (Ergebnis) als eine Geschichte: „5 passende Pflegekräfte – sofort
 * verfügbar", zwei Profile ganz, das dritte läuft in einen Verlauf aus, im
 * Verlauf „+ 3 weitere passende Pflegekräfte und Ihr persönliches
 * Sofortangebot", dann der Knopf, dann „Dafür benötigen wir nur noch Ihre
 * Kontaktdaten." Die Zahl 5 ist die Portal-Zahl (`waehleFuenf`).
 */
export const PORTAL_ANZAHL = 5;
/** So viele Profile stehen ganz auf dem Ergebnis-Screen; das nächste läuft in den Verlauf. */
export const GANZ_SICHTBAR = 2;

export const WARTE = {
  titel: 'Einen Moment bitte',
  text: 'Wir erstellen Ihr Sofortangebot und suchen passende Pflegekräfte.',
  schritt1: 'Sofortangebot berechnet',
  schritt2Laeuft: 'Passende Pflegekräfte werden gesucht',
  schritt2Fertig: (n: number) => (n === 1 ? '1 passende Pflegekraft gefunden' : `${n} passende Pflegekräfte gefunden`),
  // Dritter Schritt (Martin, 10.09.: „nur 2 Punkte sieht komisch aus") — und er
  // bereitet den Kopf „sofort verfügbar" vor.
  schritt3: 'Verfügbarkeit geprüft',
  schritt3Fertig: (n: number) => (n === 1 ? 'ab sofort verfügbar' : `alle ${n} ab sofort verfügbar`),
};

export function kopfzeile(gesamt: number = PORTAL_ANZAHL): string {
  return gesamt === 1 ? '1 passende Pflegekraft – sofort verfügbar' : `${gesamt} passende Pflegekräfte – sofort verfügbar`;
}

/**
 * Faktenzeile wie im Portal (`nurseFacts`): „12 J. Erfahrung · 31 Einsätze
 * über Primundus" — die Karte behält die Optik der Portal-Karte (Martin,
 * 10.09.: „warum veränderst du die Optik, das muss schon bleiben").
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

/** „Deutsch: gut · 10 Jahre Erfahrung" — Zeile aus Martins Aufbau (derzeit nicht auf der Karte, Optik bleibt Portal). */
export function kraftZeile(k: Pick<VorschauKraft, 'deutschWort' | 'erfahrungJahre'>): string {
  const teile: string[] = [];
  if (k.deutschWort) teile.push(`Deutsch: ${k.deutschWort.toLowerCase()}`);
  if (k.erfahrungJahre > 0) teile.push(k.erfahrungJahre === 1 ? '1 Jahr Erfahrung' : `${k.erfahrungJahre} Jahre Erfahrung`);
  return teile.join(' · ');
}

/** Antworten aus dem Rechner, die auf den Karten als Häkchen aufgegriffen werden. */
export interface HakenAntworten {
  mobility?: string | null;
  nightCare?: string | null;
  patientCount?: string | null;
  pflegegrad?: string | number | null;
  driving?: string | null;
}

/**
 * Zwei Häkchen je Karte. Wortlaut = die Haken der Angebotsmail
 * (`anforderungenAusAnfrage` in send-scheduled-emails/empfehlung.ts), damit
 * Rechner und Mail dieselbe Sprache sprechen: Sie greifen die ANGABEN DES
 * KUNDEN auf, sind kein zweites Matching. Einzige datengebundene Zeile ist
 * der Führerschein (die Function filtert danach). Fehlen Angaben, füllen
 * Verfügbarkeit und Einsätze auf.
 */
export function hakenAusAntworten(a: HakenAntworten, k: Pick<VorschauKraft, 'einsaetze'>): string[] {
  const t: string[] = [];
  const mob = (a.mobility ?? '').toLowerCase();
  const nacht = (a.nightCare ?? '').toLowerCase();
  const grad = Number(a.pflegegrad);
  if (mob === 'bettlaegerig') t.push('Erfahrung mit bettlägerigen Patienten');
  else if (mob === 'rollstuhl') t.push('Erfahrung mit Rollstuhlpatienten');
  if (nacht && nacht !== 'nein') t.push('Erfahrung mit nächtlichen Einsätzen');
  if ((a.patientCount ?? '').toLowerCase() === 'ehepaar') t.push('Erfahrung in der Betreuung von Ehepaaren');
  if (Number.isFinite(grad) && grad >= 4) t.push('Erfahrung bei hohem Pflegebedarf');
  if (mob === 'rollator') t.push('Erfahrung mit eingeschränkter Mobilität');
  if ((a.driving ?? '').toLowerCase() === 'ja') t.push('Führerschein vorhanden');
  if (k.einsaetze > 0) t.push(k.einsaetze === 1 ? '1 Einsatz über Primundus' : `${k.einsaetze} Einsätze über Primundus`);
  t.push('Ab sofort verfügbar');
  return t.slice(0, 2);
}

/** Der Verlauf unter den Profilen und der Knopf darin. */
export const VERLAUF = {
  weitere: (gesamt: number = PORTAL_ANZAHL, ganz: number = GANZ_SICHTBAR) => {
    const n = Math.max(1, gesamt - ganz);
    return n === 1 ? '+ 1 weitere passende Pflegekraft' : `+ ${n} weitere passende Pflegekräfte`;
  },
  angebot: 'und Ihr persönliches Sofortangebot',
  knopf: 'Alle Pflegekräfte & Sofortangebot ansehen\u00A0→',
  hinweis: 'Dafür benötigen wir nur noch Ihre Kontaktdaten.',
};

/**
 * Die Kontaktschranke — ein EIGENER Schritt nach dem Klick (Martin, 10.09.):
 * oben steht, was der Kunde bekommt („Sofortangebot & Pflegekräfte
 * anzeigen"), kein „Portal", kein „Fast geschafft"; die Fotos der gefundenen
 * Kräfte bleiben sichtbar; die Frage nach den Daten wie im alten Rechner
 * („Wohin dürfen wir … senden?") mit dem Grund „Kopie per E-Mail".
 */
export const SCHRANKE = {
  kopf: 'Sofortangebot & Pflegekräfte anzeigen',
  kopfText: 'Nur noch Name, E-Mail und Telefon',
  gefunden: (gesamt: number = PORTAL_ANZAHL) => `${gesamt} passende Pflegekräfte gefunden`,
  gefundenText: 'sofort verfügbar',
  titel: 'Wohin dürfen wir Ihr Sofortangebot senden?',
  text: `Sofortangebot und alle ${PORTAL_ANZAHL} Pflegekräfte sehen Sie direkt danach. Eine Kopie erhalten Sie per E-Mail.`,
  zurueck: 'Zurück zu den Pflegekräften',
  knopf: 'Alle Pflegekräfte & Sofortangebot ansehen\u00A0→',
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
