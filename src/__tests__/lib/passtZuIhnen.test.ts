import { describe, it, expect } from 'vitest';
import {
  OHNE_BEDARF, bedarfAusFormular, bedarfAusRechner, bedarfFuerProfil, mobilitaetsStufe, passtGruende, qualifikationAbgedeckt,
  weitereQualifikationen, type KundenBedarf,
} from '../../lib/passtZuIhnen';

// „Warum {Vorname} zu Ihnen passt“ (Martin 14.11.2026: „dann gucken wir nicht, was sie gemacht hat, sondern was der Kunde
// wünscht … Sie hat Erfahrung mit Demenz, mit Inkontinenz oder mit zwei Patienten“).
const alles: KundenBedarf = { personen: 2, demenz: true, inkontinenz: true, nacht: true, mobilitaet: 'rollator' };

describe('passtGruende: Zeilen aus dem Bedarf des Kunden', () => {
  it('feste Reihenfolge wie im freigegebenen Bild: Demenz, zwei Personen, Inkontinenz, Nacht, Mobilität', () => {
    expect(passtGruende(alles)).toEqual([
      'Erfahrung mit Demenz',
      'Erfahrung mit zwei Personen',
      'Erfahrung mit Inkontinenz',
      'Erfahrung mit Einsätzen in der Nacht',
      'Erfahrung mit Rollator',
    ]);
  });

  it('nur was der Kunde braucht: eine Person, „nein“ und offene Antworten ergeben keine Zeile; ohne Bedarf leer', () => {
    expect(passtGruende({ personen: 1, demenz: false, inkontinenz: null, nacht: false, mobilitaet: null })).toEqual([]);
    expect(passtGruende(OHNE_BEDARF)).toEqual([]);
    expect(passtGruende(null)).toEqual([]);
    expect(passtGruende({ ...OHNE_BEDARF, inkontinenz: true })).toEqual(['Erfahrung mit Inkontinenz']);
  });

  it('Mobilität: mobil nie, Rollstuhl und Bettlägerigkeit mit eigenem Wortlaut', () => {
    expect(passtGruende({ ...OHNE_BEDARF, mobilitaet: 'mobil' })).toEqual([]);
    expect(passtGruende({ ...OHNE_BEDARF, mobilitaet: 'rollstuhl' })).toEqual(['Erfahrung mit Rollstuhl']);
    expect(passtGruende({ ...OHNE_BEDARF, mobilitaet: 'bettlaegerig' })).toEqual(['Erfahrung mit Bettlägerigkeit']);
  });

  it('Mobilitäts-Zeile entfällt, wenn die Pflegekraft die Stufe laut Profil nicht annimmt; bleibt, wenn unbekannt', () => {
    const rollstuhl = { ...OHNE_BEDARF, mobilitaet: 'rollstuhl' as const };
    // Wortlaut wie aus mappers.ts (MOBILITY_DE)
    expect(passtGruende(rollstuhl, { acceptedMobilities: ['Selbstständig mobil', 'Rollatorfähig', 'Bettlägerig'] })).toEqual([]);
    expect(passtGruende(rollstuhl, { acceptedMobilities: ['Rollstuhlfähig'] })).toEqual(['Erfahrung mit Rollstuhl']);
    // unübersetzt aus mamamia
    expect(passtGruende(rollstuhl, { acceptedMobilities: ['Wheelchair'] })).toEqual(['Erfahrung mit Rollstuhl']);
    // unbekannt: kein Profil, leere Liste, nur unlesbare Angaben
    expect(passtGruende(rollstuhl)).toEqual(['Erfahrung mit Rollstuhl']);
    expect(passtGruende(rollstuhl, { acceptedMobilities: [] })).toEqual(['Erfahrung mit Rollstuhl']);
    expect(passtGruende(rollstuhl, { acceptedMobilities: ['???'] })).toEqual(['Erfahrung mit Rollstuhl']);
    // die übrigen Zeilen hängen nie an der Pflegekraft
    expect(passtGruende({ ...alles, mobilitaet: 'rollstuhl' }, { acceptedMobilities: ['Rollatorfähig'] })).toHaveLength(4);
  });
});

describe('bedarfAusRechner: vor dem ersten Speichern nur Personen, Mobilität und Nacht', () => {
  it('Werte des Rechners (lib/supabase.ts prefillPatientFromLead), Demenz und Inkontinenz bleiben offen', () => {
    expect(bedarfAusRechner({ pflegegrad: 4, betreuung_fuer: 'ehepaar', mobilitaet: 'rollstuhl', nachteinsaetze: 'taeglich', demenz: 'ja' }))
      .toEqual({ personen: 2, demenz: null, inkontinenz: null, nacht: true, mobilitaet: 'rollstuhl' });
    expect(bedarfAusRechner({ betreuung_fuer: '1-person', mobilitaet: 'mobil', nachteinsaetze: 'nein' }))
      .toEqual({ personen: 1, demenz: null, inkontinenz: null, nacht: false, mobilitaet: 'mobil' });
    for (const n of ['gelegentlich', 'taeglich', 'mehrmals', 'regelmaessig']) expect(bedarfAusRechner({ nachteinsaetze: n }).nacht).toBe(true);
    expect(bedarfAusRechner({ mobilitaet: 'rollator' }).mobilitaet).toBe('rollator');
    expect(bedarfAusRechner({ mobilitaet: 'bettlaegerig' }).mobilitaet).toBe('bettlaegerig');
  });

  it('alte Werte (gehstock, gehfaehig) zählen als mobil; Unbekanntes und fehlende Daten als offen', () => {
    expect(bedarfAusRechner({ mobilitaet: 'gehstock' }).mobilitaet).toBe('mobil');
    expect(bedarfAusRechner({ mobilitaet: 'gehfaehig' }).mobilitaet).toBe('mobil');
    expect(bedarfAusRechner({ betreuung_fuer: 'xyz', nachteinsaetze: 'vielleicht' })).toEqual(OHNE_BEDARF);
    expect(bedarfAusRechner(null)).toEqual(OHNE_BEDARF);
    expect(passtGruende(bedarfAusRechner({ betreuung_fuer: 'ehepaar', mobilitaet: 'rollator', nachteinsaetze: 'gelegentlich' })))
      .toEqual(['Erfahrung mit zwei Personen', 'Erfahrung mit Einsätzen in der Nacht', 'Erfahrung mit Rollator']);
  });
});

describe('bedarfAusFormular: nach dem Speichern die Pflegesituation beider Personen', () => {
  it('Antworten wie im Formular (patientFormMapper.ts); eine Person', () => {
    expect(bedarfAusFormular({ anzahl: '1', mobilitaet: 'Rollatorfähig', demenz: 'Leichtgradig', inkontinenz: 'Harninkontinenz', nacht: '1–2 Mal' }))
      .toEqual({ personen: 1, demenz: true, inkontinenz: true, nacht: true, mobilitaet: 'rollator' });
    expect(bedarfAusFormular({ anzahl: '1', mobilitaet: 'Selbstständig mobil', demenz: 'Nein', inkontinenz: 'Nein', nacht: 'Nein' }))
      .toEqual({ personen: 1, demenz: false, inkontinenz: false, nacht: false, mobilitaet: 'mobil' });
    for (const i of ['Harninkontinenz', 'Stuhlinkontinenz', 'Beides']) expect(bedarfAusFormular({ inkontinenz: i }).inkontinenz).toBe(true);
    for (const d of ['Leichtgradig', 'Mittelgradig', 'Schwer']) expect(bedarfAusFormular({ demenz: d }).demenz).toBe(true);
    for (const n of ['Bis zu 1 Mal', '1–2 Mal', 'Mehr als 2']) expect(bedarfAusFormular({ nacht: n }).nacht).toBe(true);
  });

  it('zwei Personen: ein Bedarf zählt, wenn EINE Person ihn hat; Mobilität die anspruchsvollere', () => {
    const b = bedarfAusFormular({
      anzahl: '2',
      mobilitaet: 'Rollatorfähig', demenz: 'Nein', inkontinenz: '', nacht: 'Nein',
      p2_mobilitaet: 'Bettlägerig', p2_demenz: 'Schwer', p2_inkontinenz: 'Beides', p2_nacht: 'Nein',
    });
    expect(b).toEqual({ personen: 2, demenz: true, inkontinenz: true, nacht: false, mobilitaet: 'bettlaegerig' });
    expect(passtGruende(b)).toEqual(['Erfahrung mit Demenz', 'Erfahrung mit zwei Personen', 'Erfahrung mit Inkontinenz', 'Erfahrung mit Bettlägerigkeit']);
  });

  it('Felder der zweiten Person zählen nur bei zwei Personen (Reste nach dem Wechsel auf eine Person)', () => {
    expect(bedarfAusFormular({ anzahl: '1', demenz: 'Nein', p2_demenz: 'Schwer', p2_mobilitaet: 'Rollstuhlfähig' }))
      .toEqual({ personen: 1, demenz: false, inkontinenz: null, nacht: null, mobilitaet: null });
  });

  it('leer und Unbekanntes bleibt offen, auch der Bogen am Lead (Record<string, unknown>)', () => {
    expect(bedarfAusFormular({})).toEqual(OHNE_BEDARF);
    expect(bedarfAusFormular(null)).toEqual(OHNE_BEDARF);
    const amLead: Record<string, unknown> = { anzahl: '2', demenz: 'Bitte wählen', nacht: 42 };
    expect(bedarfAusFormular(amLead)).toEqual({ ...OHNE_BEDARF, personen: 2 });
  });
});

describe('bedarfFuerProfil: welche Quelle das Profil nimmt', () => {
  // Jede Quelle mit eigenem, erkennbarem Bedarf, damit eine vertauschte Rangfolge auffällt.
  const rechner = { betreuung_fuer: 'ehepaar', mobilitaet: 'rollstuhl', nachteinsaetze: 'taeglich', demenz: 'ja' };
  const abgesendet = { anzahl: '1', mobilitaet: 'Bettlägerig', demenz: 'Nein', inkontinenz: 'Nein', nacht: 'Nein' };
  const mamamiaForm = { anzahl: '2', mobilitaet: 'Rollatorfähig', demenz: 'Mittelgradig', inkontinenz: 'Harninkontinenz', nacht: 'Bis zu 1 Mal' };
  const amLead = { anzahl: '1', mobilitaet: 'Selbstständig mobil', demenz: 'Nein', inkontinenz: 'Stuhlinkontinenz', nacht: 'Nein' };
  const aktiv = { status: 'active', form: mamamiaForm };
  const gruende = (q: Parameters<typeof bedarfFuerProfil>[0]) => passtGruende(bedarfFuerProfil(q));

  it('vor dem ersten Speichern der Rechner (Personen, Nacht, Mobilität), auch wenn schon ein Bogen da wäre; Demenz und Inkontinenz fragt der Rechner nicht ab, sie stehen vor dem Speichern immer da (Martin 14.11.2026: „Wir wollen vorher überzeugen“)', () => {
    expect(gruende({ vorSpeichern: true, rechner, abgesendet, mamamia: aktiv, amLead }))
      .toEqual(['Erfahrung mit Demenz', 'Erfahrung mit zwei Personen', 'Erfahrung mit Inkontinenz', 'Erfahrung mit Einsätzen in der Nacht', 'Erfahrung mit Rollstuhl']);
    expect(bedarfFuerProfil({ vorSpeichern: true, rechner: { ...rechner, demenz: 'nein' } }).demenz).toBe(true);
    expect(bedarfFuerProfil({ vorSpeichern: true })).toEqual({ ...OHNE_BEDARF, demenz: true, inkontinenz: true });
    // Eine Person, nachts nie, mobil: vor dem Speichern trotzdem Demenz und Inkontinenz.
    expect(gruende({ vorSpeichern: true, rechner: { betreuung_fuer: '1-person', mobilitaet: 'mobil', nachteinsaetze: 'nein' } }))
      .toEqual(['Erfahrung mit Demenz', 'Erfahrung mit Inkontinenz']);
  });

  it('nach dem Speichern: in dieser Sitzung abgesendet > mamamia > Bogen am Lead > Rechner', () => {
    expect(gruende({ vorSpeichern: false, rechner, abgesendet, mamamia: aktiv, amLead })).toEqual(['Erfahrung mit Bettlägerigkeit']);
    expect(gruende({ vorSpeichern: false, rechner, mamamia: aktiv, amLead })).toEqual([
      'Erfahrung mit Demenz', 'Erfahrung mit zwei Personen', 'Erfahrung mit Inkontinenz', 'Erfahrung mit Einsätzen in der Nacht', 'Erfahrung mit Rollator',
    ]);
    expect(gruende({ vorSpeichern: false, rechner, mamamia: null, amLead })).toEqual(['Erfahrung mit Inkontinenz']);
    expect(gruende({ vorSpeichern: false, rechner, amLead: null }))
      .toEqual(['Erfahrung mit zwei Personen', 'Erfahrung mit Einsätzen in der Nacht', 'Erfahrung mit Rollstuhl']);
  });

  it('mamamia im Status „draft“ (nur Onboarding-Daten) zählt nicht: dann der Bogen am Lead; ohne Status zählt mamamia', () => {
    const entwurf = { status: 'draft', form: { anzahl: '2', mobilitaet: 'Rollatorfähig', demenz: '', inkontinenz: '' } };
    expect(gruende({ vorSpeichern: false, rechner, mamamia: entwurf, amLead })).toEqual(['Erfahrung mit Inkontinenz']);
    expect(gruende({ vorSpeichern: false, rechner, mamamia: entwurf }))
      .toEqual(['Erfahrung mit zwei Personen', 'Erfahrung mit Einsätzen in der Nacht', 'Erfahrung mit Rollstuhl']);
    expect(gruende({ vorSpeichern: false, mamamia: { status: null, form: mamamiaForm }, amLead })).toHaveLength(5);
  });
});

describe('mobilitaetsStufe: dieselbe Stufe aus Rechner, Bogen, Profil und mamamia', () => {
  it('alle Schreibweisen', () => {
    expect(['rollator', 'Rollatorfähig', 'Rollator', 'Walker'].map(mobilitaetsStufe)).toEqual(['rollator', 'rollator', 'rollator', 'rollator']);
    expect(['rollstuhl', 'Rollstuhlfähig', 'Wheelchair'].map(mobilitaetsStufe)).toEqual(['rollstuhl', 'rollstuhl', 'rollstuhl']);
    expect(['bettlaegerig', 'Bettlägerig', 'Bedridden'].map(mobilitaetsStufe)).toEqual(['bettlaegerig', 'bettlaegerig', 'bettlaegerig']);
    expect(['mobil', 'Selbstständig mobil', 'Mobile', 'Mobil', 'Am Gehstock', 'Walking stick', 'Gehfähig mit Hilfe'].map(mobilitaetsStufe))
      .toEqual(Array(7).fill('mobil'));
    expect([undefined, null, '', 42, 'irgendwas'].map(mobilitaetsStufe)).toEqual([null, null, null, null, null]);
  });
});

describe('Weitere Qualifikationen: ohne die, die eine Zeile oben schon sagt', () => {
  it('„Demenzbetreuung“ entfällt neben „Erfahrung mit Demenz“, sonst bleibt sie', () => {
    const q = 'Demenzbetreuung, Mobilisierung, Wundversorgung';
    expect(weitereQualifikationen(q, ['Erfahrung mit Demenz'])).toEqual(['Mobilisierung', 'Wundversorgung']);
    expect(weitereQualifikationen(q, ['Erfahrung mit zwei Personen'])).toEqual(['Demenzbetreuung', 'Mobilisierung', 'Wundversorgung']);
    expect(qualifikationAbgedeckt('Demenzbetreuung', ['Erfahrung mit Demenz'])).toBe(true);
    expect(qualifikationAbgedeckt('Demenzbetreuung', [])).toBe(false);
  });

  it('auch Inkontinenz und Mobilität; Trennzeichen Komma, Semikolon, Zeile; doppelte einmal; nichts übrig = leer', () => {
    const gruende = passtGruende(alles);
    expect(weitereQualifikationen('Inkontinenzversorgung; Rollator-Training\nKochen, Kochen', gruende)).toEqual(['Kochen']);
    expect(weitereQualifikationen('Demenzbetreuung', ['Erfahrung mit Demenz'])).toEqual([]);
    expect(weitereQualifikationen(undefined, gruende)).toEqual([]);
    expect(weitereQualifikationen(' , ', gruende)).toEqual([]);
  });
});
