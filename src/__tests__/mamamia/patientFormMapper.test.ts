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

  it('night operations: 4-option dropdown maps 1:1 to prod enum (verified vs DB 2026-04-27)', () => {
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ nacht: 'Nein' })).patients?.[0].night_operations).toBe('no');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ nacht: 'Bis zu 1 Mal' })).patients?.[0].night_operations).toBe('up_to_1_time');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ nacht: '1–2 Mal' })).patients?.[0].night_operations).toBe('1_2_times');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ nacht: 'Mehr als 2' })).patients?.[0].night_operations).toBe('more_than_2');
  });

  it('night operations: legacy "Gelegentlich"/"Regelmäßig" still work for old drafts', () => {
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ nacht: 'Gelegentlich' })).patients?.[0].night_operations).toBe('occasionally');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ nacht: 'Regelmäßig' })).patients?.[0].night_operations).toBe('up_to_1_time');
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

  it('maps accommodation (verified prod enum 2026-04-27)', () => {
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ wohnungstyp: 'Einfamilienhaus' })).accommodation).toBe('single_family_house');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ wohnungstyp: 'Wohnung in Mehrfamilienhaus' })).accommodation).toBe('apartment');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ wohnungstyp: 'Andere' })).accommodation).toBe('other');
  });

  it('derives other_people_in_house from anzahl (yes/no enum)', () => {
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ anzahl: '2' })).other_people_in_house).toBe('yes');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ anzahl: '1' })).other_people_in_house).toBe('no');
  });

  it('maps rauchen → customer_caregiver_wish.smoking (yes_outside / no)', () => {
    // Post-2026-04-28 audit: rauchen is a CAREGIVER preference, not a
    // customer attribute. It moved from smoking_household to wish.smoking.
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ rauchen: 'Ja' })).customer_caregiver_wish?.smoking).toBe('yes_outside');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ rauchen: 'Nein' })).customer_caregiver_wish?.smoking).toBe('no');
  });

  it('only diagnosen lands in job_description; aufgaben/sonstigeWuensche go to wish', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({
      diagnosen: 'Parkinson',
      aufgaben: 'Körperpflege',
      sonstigeWuensche: 'Tierlieb',
    }));
    // Medical diagnoses stay on customer.job_description (this is what
    // caregivers read to prepare).
    expect(r.job_description).toContain('Diagnosen: Parkinson');
    // Caregiver-side fields land on the wish row, not job_description.
    expect(r.job_description).not.toContain('Körperpflege');
    expect(r.job_description).not.toContain('Tierlieb');
    expect(r.customer_caregiver_wish?.tasks).toBe('Körperpflege');
    expect(r.customer_caregiver_wish?.other_wishes).toBe('Tierlieb');
  });

  it('no job_description key when no diagnoses', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({ aufgaben: 'X' }));
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
