import { describe, it, expect } from 'vitest';
// Cross-App-Import (pure Modul, siehe CLAUDE.md §Tests): der Diff der
// Admin-Korrektur lebt im Kostenrechner (project 3/lib/angaben-diff.ts),
// die Folgen (Patientenzahl in Mamamia, Portal-Prefill) trägt dieses Portal.
import { diffAngaben, mamamiaFelder, RESYNC_FELDER, ERLAUBT } from '../../project 3/lib/angaben-diff';
import { angabenLabel } from '../../project 3/lib/angaben-labels';

const RECHNER_FD = {
  betreuung_fuer: 'ehepaar', pflegegrad: 1, weitere_personen: 'ja', mobilitaet: 'rollator',
  nachteinsaetze: 'gelegentlich', deutschkenntnisse: 'sehr-gut', fuehrerschein: '', geschlecht: 'weiblich',
  // Rechner-Leads haben KEIN erfahrung; Portal-Extras bleiben unberührt
  plz: '69214', portal_details: 'Beziehung: Mutter',
};

describe('diffAngaben (Admin-Korrektur, Registry #55)', () => {
  it('unveränderte Eingabe ⇒ kein Diff — auch ohne Timing in fd und mit leerem erfahrung', () => {
    const r = diffAngaben(RECHNER_FD, 'sofort', { ...RECHNER_FD, erfahrung: '', care_start_timing: 'sofort' });
    expect(r).toEqual({ changed: [], fehler: [] });
  });

  it('betreuung_fuer 2→1 ist die einzige Änderung', () => {
    const r = diffAngaben(RECHNER_FD, 'sofort', { ...RECHNER_FD, betreuung_fuer: '1-person', erfahrung: '', care_start_timing: 'sofort' });
    expect(r.changed).toEqual([{ key: 'betreuung_fuer', alt: 'ehepaar', neu: '1-person' }]);
    expect(mamamiaFelder(r.changed)).toEqual(['betreuung_fuer']);
  });

  it('pflegegrad: 3 vs "3" ⇒ kein Diff; undefined vs 0 ⇒ Diff („Keine" ist ein Wert)', () => {
    expect(diffAngaben({ pflegegrad: '3' }, null, { pflegegrad: 3 }).changed).toEqual([]);
    expect(diffAngaben({}, null, { pflegegrad: 0 }).changed).toEqual([{ key: 'pflegegrad', alt: undefined, neu: 0 }]);
  });

  it('pflegegrad "" oder "2" (String) ⇒ Fehler, keine Koerzierung', () => {
    expect(diffAngaben({ pflegegrad: 3 }, null, { pflegegrad: '' }).fehler).toHaveLength(1);
    expect(diffAngaben({ pflegegrad: 3 }, null, { pflegegrad: '2' }).fehler).toHaveLength(1);
  });

  it('geschlecht undefined vs "" ⇒ kein Diff; "egal" vs "" ⇒ echte Änderung', () => {
    expect(diffAngaben({}, null, { geschlecht: '' }).changed).toEqual([]);
    expect(diffAngaben({ geschlecht: 'egal' }, null, { geschlecht: '' }).changed).toEqual([{ key: 'geschlecht', alt: 'egal', neu: '' }]);
  });

  it('care_start_timing wird gegen die SPALTE verglichen, nie gegen fd', () => {
    const r = diffAngaben({ care_start_timing: '1-monat' }, 'unklar', { care_start_timing: 'unklar' });
    expect(r.changed).toEqual([]);
    const r2 = diffAngaben({}, null, { care_start_timing: '2-4-wochen' });
    expect(r2.changed).toEqual([{ key: 'care_start_timing', alt: null, neu: '2-4-wochen' }]);
    expect(mamamiaFelder(r2.changed)).toEqual([]);
  });

  it('unveränderter Key außerhalb des Kanons (sehr-gut-sa) passiert; geänderter Key außerhalb ⇒ Fehler', () => {
    const fd = { ...RECHNER_FD, deutschkenntnisse: 'sehr-gut-sa' };
    expect(diffAngaben(fd, null, { deutschkenntnisse: 'sehr-gut-sa', mobilitaet: 'rollator' })).toEqual({ changed: [], fehler: [] });
    const r = diffAngaben(fd, null, { deutschkenntnisse: 'kommunikativ' });
    expect(r.changed).toEqual([{ key: 'deutschkenntnisse', alt: 'sehr-gut-sa', neu: 'kommunikativ' }]);
    expect(diffAngaben(fd, null, { mobilitaet: 'gehstock' }).fehler).toEqual(['mobilitaet: unzulässiger Wert "gehstock"']);
    expect(diffAngaben(fd, null, { deutschkenntnisse: 'sehr-gut-sa' }).fehler).toEqual([]);
    expect(diffAngaben({ deutschkenntnisse: 'sehr-gut' }, null, { deutschkenntnisse: 'sehr-gut-sa' }).fehler).toHaveLength(1);
  });

  it('RESYNC_FELDER spiegelt die Edge Fn (8 Keys, ohne erfahrung/care_start_timing)', () => {
    expect([...RESYNC_FELDER]).toEqual(['betreuung_fuer', 'pflegegrad', 'mobilitaet', 'nachteinsaetze', 'weitere_personen', 'deutschkenntnisse', 'fuehrerschein', 'geschlecht']);
    expect(ERLAUBT.deutschkenntnisse).not.toContain('sehr-gut-sa');
  });

  it('angabenLabel: pflegegrad 0 ⇒ „Kein Pflegegrad", leer ⇒ „—", unbekannt ⇒ roh', () => {
    expect(angabenLabel('pflegegrad', 0)).toBe('Kein Pflegegrad');
    expect(angabenLabel('pflegegrad', 3)).toBe('Pflegegrad 3');
    expect(angabenLabel('geschlecht', '')).toBe('—');
    expect(angabenLabel('care_start_timing', '1-monat')).toBe('1-monat');
    expect(angabenLabel('betreuung_fuer', 'ehepaar')).toBe('2 Personen');
  });
});
