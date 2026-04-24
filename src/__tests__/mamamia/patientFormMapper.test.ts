import { describe, it, expect } from 'vitest';
import {
  mapPatientFormToUpdateCustomerInput,
  type PatientFormShape,
} from '../../lib/mamamia/patientFormMapper';

function makeForm(overrides: Partial<PatientFormShape> = {}): PatientFormShape {
  return {
    anzahl: '1',
    geschlecht: 'Weiblich',
    geburtsjahr: '1945',
    pflegegrad: 'Pflegegrad 3',
    gewicht: '70–90 kg',
    groesse: '155–165 cm',
    mobilitaet: 'Rollstuhlfähig',
    heben: 'Nein',
    demenz: 'Nein',
    inkontinenz: 'Nein',
    nacht: 'Nein',
    p2_geschlecht: '',
    p2_geburtsjahr: '',
    p2_pflegegrad: '',
    p2_gewicht: '',
    p2_groesse: '',
    p2_mobilitaet: '',
    p2_heben: '',
    p2_demenz: '',
    p2_inkontinenz: '',
    p2_nacht: '',
    diagnosen: '',
    plz: '10115',
    ort: 'Berlin',
    haushalt: 'Ehepartner/in',
    wohnungstyp: 'Einfamilienhaus',
    urbanisierung: 'Großstadt',
    familieNahe: 'Ja',
    pflegedienst: 'Nein',
    internet: 'Ja',
    tiere: 'Keine',
    unterbringung: 'Zimmer in den Räumlichkeiten',
    aufgaben: '',
    wunschGeschlecht: 'Egal',
    rauchen: 'Nein',
    sonstigeWuensche: '',
    ...overrides,
  };
}

describe('mapPatientFormToUpdateCustomerInput', () => {
  it('anzahl=1 → 1 patient', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm());
    expect(r.patients).toHaveLength(1);
  });

  it('anzahl=2 → 2 patients', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({
      anzahl: '2',
      p2_geschlecht: 'Männlich',
      p2_geburtsjahr: '1942',
      p2_pflegegrad: 'Pflegegrad 2',
      p2_mobilitaet: 'Gehfähig mit Hilfe',
      p2_heben: 'Nein',
      p2_demenz: 'Leichtgradig',
      p2_inkontinenz: 'Nein',
      p2_nacht: 'Nein',
    }));
    expect(r.patients).toHaveLength(2);
    expect(r.patients?.[1].gender).toBe('male');
    expect(r.patients?.[1].care_level).toBe(2);
    expect(r.patients?.[1].mobility_id).toBe(3);
    expect(r.patients?.[1].dementia).toBe('yes');
  });

  it('maps mobility labels → mobility_id', () => {
    for (const [label, expected] of [
      ['Selbstständig mobil', 1],
      ['Am Gehstock', 2],
      ['Rollatorfähig', 3],
      ['Gehfähig mit Hilfe', 3],
      ['Rollstuhlfähig', 4],
      ['Bettlägerig', 5],
    ] as const) {
      const r = mapPatientFormToUpdateCustomerInput(makeForm({ mobilitaet: label }));
      expect(r.patients?.[0].mobility_id).toBe(expected);
    }
  });

  it('parses pflegegrad "Pflegegrad N" → N', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({ pflegegrad: 'Pflegegrad 5' }));
    expect(r.patients?.[0].care_level).toBe(5);
  });

  it('maps gender Weiblich/Männlich → female/male', () => {
    const female = mapPatientFormToUpdateCustomerInput(makeForm({ geschlecht: 'Weiblich' }));
    const male = mapPatientFormToUpdateCustomerInput(makeForm({ geschlecht: 'Männlich' }));
    expect(female.patients?.[0].gender).toBe('female');
    expect(male.patients?.[0].gender).toBe('male');
  });

  it('dementia Nein → "no", else → "yes"', () => {
    for (const [v, expected] of [
      ['Nein', 'no'],
      ['Leichtgradig', 'yes'],
      ['Mittelgradig', 'yes'],
      ['Schwer', 'yes'],
    ] as const) {
      const r = mapPatientFormToUpdateCustomerInput(makeForm({ demenz: v }));
      expect(r.patients?.[0].dementia).toBe(expected);
    }
  });

  it('incontinence → correct boolean triplet', () => {
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ inkontinenz: 'Nein' })).patients?.[0]).toMatchObject({
      incontinence: false, incontinence_feces: false, incontinence_urine: false,
    });
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ inkontinenz: 'Harninkontinenz' })).patients?.[0]).toMatchObject({
      incontinence: true, incontinence_urine: true, incontinence_feces: false,
    });
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ inkontinenz: 'Stuhlinkontinenz' })).patients?.[0]).toMatchObject({
      incontinence: true, incontinence_feces: true, incontinence_urine: false,
    });
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ inkontinenz: 'Beides' })).patients?.[0]).toMatchObject({
      incontinence: true, incontinence_feces: true, incontinence_urine: true,
    });
  });

  it('night operations Nein/Gelegentlich/Regelmäßig → no/occasionally/more_than_2 (live-verified)', () => {
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ nacht: 'Nein' })).patients?.[0].night_operations).toBe('no');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ nacht: 'Gelegentlich' })).patients?.[0].night_operations).toBe('occasionally');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ nacht: 'Regelmäßig' })).patients?.[0].night_operations).toBe('more_than_2');
  });

  it('threads existingPatientIds into patient objects (required for persistence)', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({
      anzahl: '2',
      p2_geschlecht: 'Männlich',
      p2_geburtsjahr: '1942',
      p2_pflegegrad: 'Pflegegrad 2',
      p2_mobilitaet: 'Gehfähig mit Hilfe',
      p2_heben: 'Nein',
      p2_demenz: 'Nein',
      p2_inkontinenz: 'Nein',
      p2_nacht: 'Nein',
    }), { existingPatientIds: [12689, 12690] });
    expect(r.patients?.[0].id).toBe(12689);
    expect(r.patients?.[1].id).toBe(12690);
  });

  it('omits patient.id when no existing ids provided (new-patient flow)', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm());
    expect(r.patients?.[0].id).toBeUndefined();
  });

  it('passes weight/height strings through', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm());
    expect(r.patients?.[0].weight).toBe('70–90 kg');
    expect(r.patients?.[0].height).toBe('155–165 cm');
  });

  it('location_id preferred over plz/ort custom_text', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm(), { locationId: 1148 });
    expect(r.location_id).toBe(1148);
    expect(r.location_custom_text).toBeUndefined();
  });

  it('location_custom_text fallback when no id', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm());
    expect(r.location_custom_text).toBe('10115 Berlin');
    expect(r.location_id).toBeUndefined();
  });

  it('maps familieNahe + internet yes/no (live-verified working enums)', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({
      familieNahe: 'Nein', internet: 'Ja',
    }));
    expect(r.has_family_near_by).toBe('no');
    expect(r.internet).toBe('yes');
  });

  it('skips other_people_in_house / accommodation / smoking_household (unknown enums, would crash Mamamia)', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({
      haushalt: 'Ehepartner/in',
      wohnungstyp: 'Einfamilienhaus',
      rauchen: 'Ja',
    }));
    expect(r.other_people_in_house).toBeUndefined();
    expect(r.accommodation).toBeUndefined();
    expect(r.smoking_household).toBeUndefined();
  });

  it('combines diagnosen/aufgaben/sonstigeWuensche into job_description', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({
      diagnosen: 'Parkinson',
      aufgaben: 'Körperpflege',
      sonstigeWuensche: 'Tierlieb',
    }));
    expect(r.job_description).toContain('Diagnosen: Parkinson');
    expect(r.job_description).toContain('Aufgaben: Körperpflege');
    expect(r.job_description).toContain('Sonstige Wünsche: Tierlieb');
  });

  it('no job_description key when all textareas empty', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm());
    expect(r.job_description).toBeUndefined();
  });

  it('omits fields when source is empty (no stale null overwrite)', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({
      geschlecht: '', pflegegrad: '', mobilitaet: '',
    }));
    expect(r.patients?.[0].gender).toBeUndefined();
    expect(r.patients?.[0].care_level).toBeUndefined();
    expect(r.patients?.[0].mobility_id).toBeUndefined();
  });
});
