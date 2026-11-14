// „Warum {Vorname} zu Ihnen passt“ im Profil der Pflegekraft (CustomerNurseModal).
//
// Martin 14.11.2026: „dann gucken wir nicht, was sie gemacht hat, sondern was der Kunde wünscht … Sie hat Erfahrung mit
// Demenz, mit Inkontinenz oder mit zwei Patienten“. Die Gründe kommen also aus dem Bedarf des KUNDEN, nicht aus dem Profil
// der Pflegekraft:
//   - vor dem ersten Speichern nur die Rechner-Antworten (Personen, Mobilität, Nacht); Demenz und Inkontinenz fragt der
//     Rechner nicht ab, sie bleiben offen (null) und erzeugen keine Zeile
//   - nach dem Speichern die gespeicherte Pflegesituation, beide Personen: ein Bedarf zählt, wenn EINE Person ihn hat
//     (welche Quelle gilt: bedarfFuerProfil)
// Einzige Ausnahme ist die Mobilität: Kennt das Profil die akzeptierten Mobilitätsstufen der Pflegekraft und fehlt die des
// Kunden darin, entfällt die Zeile. „mobil“ ergibt nie eine Zeile.
// Reine Funktionen ohne React, damit Portal und Tests dieselben Regeln benutzen.

export type Mobilitaet = 'mobil' | 'rollator' | 'rollstuhl' | 'bettlaegerig';

export interface KundenBedarf {
  /** Betreute Personen: 1 oder 2; null = unbekannt. */
  personen: 1 | 2 | null;
  demenz: boolean | null;
  inkontinenz: boolean | null;
  /** Einsätze in der Nacht (jede Antwort außer „Nein“). */
  nacht: boolean | null;
  /** Bei zwei Personen die anspruchsvollere Stufe. */
  mobilitaet: Mobilitaet | null;
}

export const OHNE_BEDARF: KundenBedarf = { personen: null, demenz: null, inkontinenz: null, nacht: null, mobilitaet: null };

export const GRUND_DEMENZ = 'Erfahrung mit Demenz';
export const GRUND_ZWEI_PERSONEN = 'Erfahrung mit zwei Personen';
export const GRUND_INKONTINENZ = 'Erfahrung mit Inkontinenz';
export const GRUND_NACHT = 'Erfahrung mit Einsätzen in der Nacht';
export const MOBILITAETS_GRUND: Record<Exclude<Mobilitaet, 'mobil'>, string> = {
  rollator: 'Erfahrung mit Rollator',
  rollstuhl: 'Erfahrung mit Rollstuhl',
  bettlaegerig: 'Erfahrung mit Bettlägerigkeit',
};

const RANG: Record<Mobilitaet, number> = { mobil: 0, rollator: 1, rollstuhl: 2, bettlaegerig: 3 };

/** Stufe aus einem Mobilitäts-Wort, egal aus welcher Quelle: Rechner (`rollator`), Bogen und Profil der Pflegekraft
 *  (`Rollatorfähig`, mappers.ts MOBILITY_DE / MAMAMIA_MOBILITY_TO_FORM), unübersetzt aus mamamia (`Walker`) oder die
 *  Vorschau (`Rollator`). Gehstock und „Gehfähig mit Hilfe“ zählen als mobil: Dazu gibt es keine Zeile. */
export function mobilitaetsStufe(wert: unknown): Mobilitaet | null {
  if (typeof wert !== 'string') return null;
  const w = wert.trim().toLowerCase();
  if (!w) return null;
  if (w.includes('bettl') || w.includes('bedridden')) return 'bettlaegerig';
  if (w.includes('rollstuhl') || w.includes('wheelchair')) return 'rollstuhl';
  if (w.includes('rollator') || w.includes('walker')) return 'rollator';
  if (w.includes('mobil') || w.includes('gehstock') || w.includes('gehf') || w.includes('walking stick')) return 'mobil';
  return null;
}

const anspruchsvoller = (a: Mobilitaet | null, b: Mobilitaet | null): Mobilitaet | null =>
  a === null ? b : b === null ? a : RANG[b] > RANG[a] ? b : a;

/** Ein Bedarf zählt, wenn eine Person ihn hat; „nein“ nur, wenn keine ihn hat und mindestens eine Antwort da ist. */
const eine = (...werte: Array<boolean | null>): boolean | null =>
  werte.includes(true) ? true : werte.includes(false) ? false : null;

// ── Rechner (lead.kalkulation.formularDaten) ─────────────────────────────────────────────────────────────────────────
// Werte wie in lib/supabase.ts prefillPatientFromLead: betreuung_fuer '1-person' | 'ehepaar'; mobilitaet mobil | rollator |
// rollstuhl | bettlaegerig (alt: gehstock, gehfaehig); nachteinsaetze nein | gelegentlich | taeglich | mehrmals (alt:
// regelmaessig).
const RECHNER_NACHT: Record<string, boolean> = { nein: false, gelegentlich: true, taeglich: true, mehrmals: true, regelmaessig: true };

export function bedarfAusRechner(fd: Record<string, unknown> | null | undefined): KundenBedarf {
  if (!fd) return OHNE_BEDARF;
  const wer = String(fd.betreuung_fuer ?? '');
  return {
    personen: wer === 'ehepaar' ? 2 : wer === '1-person' ? 1 : null,
    demenz: null,
    inkontinenz: null,
    nacht: RECHNER_NACHT[String(fd.nachteinsaetze ?? '')] ?? null,
    mobilitaet: mobilitaetsStufe(fd.mobilitaet),
  };
}

// ── Gespeicherte Pflegesituation (PatientForm-Felder) ────────────────────────────────────────────────────────────────
// Gleiche Felder für den in dieser Sitzung abgesendeten Bogen, mamamia (mapMamamiaCustomerToPatientForm) und den Bogen am
// Lead (`leads.patient_form`). Antworten wie im Formular (patientFormMapper.ts); Unbekanntes zählt als offen.
const FORM_DEMENZ: Record<string, boolean> = { Nein: false, Leichtgradig: true, Mittelgradig: true, Schwer: true };
const FORM_INKONTINENZ: Record<string, boolean> = { Nein: false, Harninkontinenz: true, Stuhlinkontinenz: true, Beides: true };
const FORM_NACHT: Record<string, boolean> = {
  Nein: false, 'Bis zu 1 Mal': true, '1–2 Mal': true, '1-2 Mal': true, 'Mehr als 2': true,
  // Ältere Entwürfe (patientFormMapper.ts nachtToApi)
  Gelegentlich: true, 'Regelmäßig': true,
};

type FormFeld = 'anzahl' | 'mobilitaet' | 'demenz' | 'inkontinenz' | 'nacht'
  | 'p2_mobilitaet' | 'p2_demenz' | 'p2_inkontinenz' | 'p2_nacht';
export type GespeicherteSituation = Partial<Record<FormFeld, unknown>>;

const antwort = (tabelle: Record<string, boolean>, wert: unknown): boolean | null =>
  typeof wert === 'string' && wert in tabelle ? tabelle[wert] : null;

export function bedarfAusFormular(form: GespeicherteSituation | null | undefined): KundenBedarf {
  if (!form) return OHNE_BEDARF;
  const anzahl = String(form.anzahl ?? '');
  const zwei = anzahl === '2';
  // Felder der zweiten Person nur, wenn es zwei sind: Nach einem Wechsel auf eine Person können sie noch im Bogen stehen.
  const beide = (feld: 'demenz' | 'inkontinenz' | 'nacht', tabelle: Record<string, boolean>) =>
    eine(antwort(tabelle, form[feld]), zwei ? antwort(tabelle, form[`p2_${feld}` as const]) : null);
  return {
    personen: zwei ? 2 : anzahl === '1' ? 1 : null,
    demenz: beide('demenz', FORM_DEMENZ),
    inkontinenz: beide('inkontinenz', FORM_INKONTINENZ),
    nacht: beide('nacht', FORM_NACHT),
    mobilitaet: anspruchsvoller(mobilitaetsStufe(form.mobilitaet), zwei ? mobilitaetsStufe(form.p2_mobilitaet) : null),
  };
}

// ── Welche Quelle das Profil nimmt ───────────────────────────────────────────────────────────────────────────────────
/** Was das Portal (CustomerPortalPage) über den Kunden hat. */
export interface ProfilQuellen {
  /** Pflegesituation noch nie gespeichert (weder in dieser Sitzung noch laut Lead oder mamamia). */
  vorSpeichern: boolean;
  /** Rechner-Antworten (`lead.kalkulation.formularDaten`). */
  rechner?: Record<string, unknown> | null;
  /** In dieser Sitzung abgesendeter Bogen. */
  abgesendet?: GespeicherteSituation | null;
  /** mamamia-Kunde mit Patienten: Status und die Patienten als Bogen (mapMamamiaCustomerToPatientForm). */
  mamamia?: { status?: string | null; form: GespeicherteSituation } | null;
  /** Zuletzt abgesendeter Bogen am Lead (`leads.patient_form`). */
  amLead?: GespeicherteSituation | null;
}

/** Bedarf für „Warum … zu Ihnen passt“. Vor dem ersten Speichern nur der Rechner (auch wenn `formularDaten.demenz` gesetzt
 *  ist: Demenz und Inkontinenz bleiben offen). Danach die gespeicherte Pflegesituation in dieser Rangfolge: in dieser
 *  Sitzung abgesendet, mamamia, Bogen am Lead; fehlen alle drei, wieder der Rechner. mamamia im Status „draft“ zählt nicht:
 *  Dort stehen nur die Daten aus dem Onboarding (Demenz und Inkontinenz leer, Heben auf dem Standardwert), der echte Bogen
 *  liegt dann am Lead. */
export function bedarfFuerProfil(q: ProfilQuellen): KundenBedarf {
  const rechner = bedarfAusRechner(q.rechner);
  if (q.vorSpeichern) return rechner;
  const mamamia = q.mamamia && q.mamamia.status !== 'draft' ? q.mamamia.form : null;
  const gespeichert = q.abgesendet ?? mamamia ?? q.amLead ?? null;
  return gespeichert ? bedarfAusFormular(gespeichert) : rechner;
}

// ── Gründe ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Zeilen für den Kasten „Warum {Vorname} zu Ihnen passt“ in fester Reihenfolge; leer = Kasten entfällt.
 *  `pflegekraft.acceptedMobilities` wie aus mappers.ts (`profile.acceptedMobilities`); ohne erkennbare Stufe gilt die
 *  Mobilität der Pflegekraft als unbekannt und die Zeile bleibt. */
export function passtGruende(
  bedarf: KundenBedarf | null | undefined,
  pflegekraft?: { acceptedMobilities?: readonly string[] } | null,
): string[] {
  if (!bedarf) return [];
  const gruende: string[] = [];
  if (bedarf.demenz === true) gruende.push(GRUND_DEMENZ);
  if (bedarf.personen === 2) gruende.push(GRUND_ZWEI_PERSONEN);
  if (bedarf.inkontinenz === true) gruende.push(GRUND_INKONTINENZ);
  if (bedarf.nacht === true) gruende.push(GRUND_NACHT);
  const stufe = bedarf.mobilitaet;
  if (stufe && stufe !== 'mobil') {
    const bekannt = (pflegekraft?.acceptedMobilities ?? []).map(mobilitaetsStufe).filter((s): s is Mobilitaet => s !== null);
    if (bekannt.length === 0 || bekannt.includes(stufe)) gruende.push(MOBILITAETS_GRUND[stufe]);
  }
  return gruende;
}

/** Die Mobilitäts-Zeilen, damit das Profil sie weglassen kann, solange die Stufen der Pflegekraft noch laden (sonst
 *  stünde die Zeile kurz da und verschwände wieder). */
export const MOBILITAETS_GRUENDE: readonly string[] = Object.values(MOBILITAETS_GRUND);

// Welche Qualifikation eine Zeile oben schon sagt: „Demenzbetreuung“ neben „Erfahrung mit Demenz“ wäre doppelt.
const ABGEDECKT: ReadonlyArray<readonly [string, RegExp]> = [
  [GRUND_DEMENZ, /demenz/i],
  [GRUND_INKONTINENZ, /inkontinenz/i],
  [MOBILITAETS_GRUND.rollator, /rollator/i],
  [MOBILITAETS_GRUND.rollstuhl, /rollstuhl/i],
  [MOBILITAETS_GRUND.bettlaegerig, /bettl[äa]ger/i],
];

/** true, wenn eine der gezeigten Zeilen die Qualifikation schon abdeckt (Demenz ↔ eine Qualifikation mit „Demenz“). */
export function qualifikationAbgedeckt(qualifikation: string, gruende: readonly string[]): boolean {
  return ABGEDECKT.some(([grund, muster]) => gruende.includes(grund) && muster.test(qualifikation));
}

/** „Weitere Qualifikationen“: die Angabe aus mamamia (Freitext, meist mit Kommas getrennt) als Liste, ohne die schon
 *  abgedeckten. Leer = Zeile entfällt. */
export function weitereQualifikationen(qualifikationen: string | null | undefined, gruende: readonly string[]): string[] {
  const teile = (qualifikationen ?? '').split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean);
  return [...new Set(teile)].filter((q) => !qualifikationAbgedeckt(q, gruende));
}
