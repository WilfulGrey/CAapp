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
    pflegedienstHaeufigkeit: '',
    pflegedienstAufgaben: '',
    internet: 'Ja',
    tiere: 'Keine',
    unterbringung: 'Zimmer in den Räumlichkeiten',
    aufgaben: '',
    wunschGeschlecht: 'Egal',
    rauchen: 'Nein',
    sonstigeWuensche: '',
    wunschGetriebe: '',
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

  it('weight/height: en-dash normalized to ASCII hyphen (Mamamia panel format)', () => {
    // Pre-Bug-#13a Customer 7653 stored "70–90 kg" (en-dash) — Mamamia
    // panel rendered the field empty because its dropdown enum uses
    // hyphen-formatted buckets. Fix: normalize en-dash on the way out.
    const r = mapPatientFormToUpdateCustomerInput(makeForm());
    expect(r.patients?.[0].weight).toBe('70-90 kg');
    expect(r.patients?.[0].height).toBe('155-165 cm');
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

  it('maps wunschGetriebe → customer_caregiver_wish.driving_license_gearbox', () => {
    // Customer picks the gearbox in the CA-app patient form (step 3).
    // Schaltung → manual; Automatik → automatic; Egal → automatic
    // (permissive — any licensed cg can drive auto). Empty omits the
    // field so the onboard default ('automatic') sticks.
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ wunschGetriebe: 'Schaltung' }))
      .customer_caregiver_wish?.driving_license_gearbox).toBe('manual');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ wunschGetriebe: 'Automatik' }))
      .customer_caregiver_wish?.driving_license_gearbox).toBe('automatic');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ wunschGetriebe: 'Egal' }))
      .customer_caregiver_wish?.driving_license_gearbox).toBe('automatic');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ wunschGetriebe: '' }))
      .customer_caregiver_wish?.driving_license_gearbox).toBeUndefined();
  });

  it('maps rauchen → customer_caregiver_wish.smoking (yes_outside / no)', () => {
    // Post-2026-04-28 audit: rauchen is a CAREGIVER preference, not a
    // customer attribute. It moved from smoking_household to wish.smoking.
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ rauchen: 'Ja' })).customer_caregiver_wish?.smoking).toBe('yes_outside');
    expect(mapPatientFormToUpdateCustomerInput(makeForm({ rauchen: 'Nein' })).customer_caregiver_wish?.smoking).toBe('no');
  });

  it('diagnosen + aufgaben + sonstigeWuensche split between job_description and wish row', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({
      diagnosen: 'Parkinson',
      aufgaben: 'Körperpflege',
      sonstigeWuensche: 'Tierlieb',
    }));
    // Medical diagnoses stay on customer.job_description.
    expect(r.job_description).toContain('Diagnosen: Parkinson');
    // Caregiver-side fields land on the wish row, not job_description.
    expect(r.job_description).not.toContain('Körperpflege');
    expect(r.job_description).not.toContain('Tierlieb');
    expect(r.customer_caregiver_wish?.tasks).toBe('Körperpflege');
    expect(r.customer_caregiver_wish?.other_wishes).toBe('Tierlieb');
  });

  it('Bug #13a: job_description always carries auto-summary even without diagnoses', () => {
    // Patient form has no "krótki opis sytuacji" free-text, but Mamamia
    // panel + caregiver listings render this prominently. Auto-summary
    // (DE) gives the agency a quick picture from the form data.
    const r = mapPatientFormToUpdateCustomerInput(makeForm({
      pflegegrad: 'Pflegegrad 4',
      mobilitaet: 'Rollstuhlfähig',
      demenz: 'Mittelgradig',
      inkontinenz: 'Harninkontinenz',
      nacht: '1–2 Mal',
    }));
    expect(r.job_description).toContain('24-Stunden-Betreuung gesucht');
    expect(r.job_description).toContain('Pflegegrad 4');
    expect(r.job_description).toContain('rollstuhlfähig');
    expect(r.job_description).toContain('Demenzdiagnose: mittelgradig');
    expect(r.job_description).toContain('Inkontinenz: harninkontinenz');
    expect(r.job_description).toContain('Nächtliche Unterstützung: 1–2 mal');
  });

  it('Bug #13a: wish.shopping defaults to "no" so panel field is non-empty', () => {
    // Patient form doesn't ask "Czy opiekun musi robić zakupy?"; without
    // a default Mamamia panel shows the dropdown empty. Default 'no' is
    // prod-most-common (43% of active customers).
    const r = mapPatientFormToUpdateCustomerInput(makeForm());
    expect(r.customer_caregiver_wish?.shopping).toBe('no');
  });

  it('Bug #13a: equipment_ids defaults to [1, 2] (TV + Bathroom)', () => {
    // Patient form doesn't ask; panel "Wyposażenie zakwaterowania" is
    // multi-select required. [1, 2] is the single most-common pair in
    // active prod customers.
    const r = mapPatientFormToUpdateCustomerInput(makeForm());
    expect(r.equipment_ids).toEqual([1, 2]);
  });

  it('Bug #13a: night_operations_description placeholder when nacht != Nein', () => {
    // Patient form doesn't have a free-text for night-time tasks, but
    // Mamamia panel renders the description field as empty without it.
    // Standard placeholder (3 locales) covers the gap.
    const r = mapPatientFormToUpdateCustomerInput(makeForm({ nacht: 'Bis zu 1 Mal' }));
    expect(r.patients?.[0].night_operations_description).toBeTruthy();
    expect(r.patients?.[0].night_operations_description_de).toBeTruthy();
    expect(r.patients?.[0].night_operations_description_en).toBeTruthy();
    expect(r.patients?.[0].night_operations_description_pl).toBeTruthy();
  });

  it('Bug #13a: nacht=Nein → no night_operations_description (placeholder skipped)', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({ nacht: 'Nein' }));
    expect(r.patients?.[0].night_operations).toBe('no');
    expect(r.patients?.[0].night_operations_description).toBeUndefined();
  });

  it('Bug #13b: tool_ids re-derive from mobility on every save (proxy PRESERVE_QUERY otherwise sticks stale)', () => {
    // Without this: Customer 7655 patient[1] had mobility_id=1 (mobile) +
    // tools=[4,6] (hoist+care-bed) — tools were inherited from couple
    // onboard (Person 1 bedridden) and proxy PRESERVE_QUERY re-injected
    // them every save because patientFormMapper didn't ship tool_ids.
    for (const [label, mobId, expectedTools] of [
      ['Bettlägerig', 5, [4, 6]],
      ['Rollstuhlfähig', 4, [3]],
      ['Rollatorfähig', 3, [2]],
      ['Am Gehstock', 2, [1]],
      ['Selbstständig mobil', 1, [1]],
    ] as const) {
      const r = mapPatientFormToUpdateCustomerInput(makeForm({ mobilitaet: label }));
      expect(r.patients?.[0].mobility_id).toBe(mobId);
      expect(r.patients?.[0].tool_ids).toEqual(expectedTools);
    }
  });

  it('Bug #13b: tool_ids omitted when mobility itself is empty (no overwrite)', () => {
    // Defensive — if user clears mobility (which shouldn't happen via UI
    // since it's required), don't blow away tool_ids by deriving from
    // unknown. Mapper already skips mobility_id in that case.
    const r = mapPatientFormToUpdateCustomerInput(makeForm({ mobilitaet: '' }));
    expect(r.patients?.[0].mobility_id).toBeUndefined();
    expect(r.patients?.[0].tool_ids).toBeUndefined();
  });

  it('omits fields when source is empty (no stale null overwrite)', () => {
    const r = mapPatientFormToUpdateCustomerInput(makeForm({
      geschlecht: '', pflegegrad: '', mobilitaet: '',
    }));
    expect(r.patients?.[0].gender).toBeUndefined();
    expect(r.patients?.[0].care_level).toBeUndefined();
    expect(r.patients?.[0].mobility_id).toBeUndefined();
  });

  // ─── Bug #9: pflegedienst description on job_description ──────────────
  // Mamamia GraphQL UpdateCustomer doesn't expose
  // day_care_facility_description as a writable input — verified live on
  // beta 2026-05-05 by the deployed mutation failing with
  // "Internal server error" upstream. Workaround: append the description
  // to job_description as `Pflegedienst: {frequency}: {tasks}`, separated
  // from other segments (Diagnosen, etc.) by ` | `.

  describe('pflegedienst description on job_description', () => {
    it('pflegedienst=Ja with frequency + tasks → job_description has Pflegedienst segment (DE)', () => {
      // job_description carries: auto-summary | Diagnosen (if set) | Pflegedienst (if set)
      // pflegedienstAufgaben uses '; ' as the internal separator so the
      // task labels (which contain commas inside parens like
      // "Grundpflege (Körperpflege, Anziehen)") can be split back
      // unambiguously.
      const r = mapPatientFormToUpdateCustomerInput(makeForm({
        pflegedienst: 'Ja',
        pflegedienstHaeufigkeit: '2× pro Woche',
        pflegedienstAufgaben: 'Grundpflege (Körperpflege, Anziehen); Wundversorgung',
      }));
      expect(r.day_care_facility).toBe('yes');
      expect(r.job_description).toContain(
        'Pflegedienst: 2× pro Woche: Grundpflege (Körperpflege, Anziehen), Wundversorgung',
      );
      expect(r.job_description).toContain('24-Stunden-Betreuung gesucht');
      // No dedicated description fields — they aren't writable on Mamamia.
      expect((r as Record<string, unknown>).day_care_facility_description).toBeUndefined();
    });

    it('pflegedienst=Geplant treated like Ja (Mamamia has no third option)', () => {
      const r = mapPatientFormToUpdateCustomerInput(makeForm({
        pflegedienst: 'Geplant',
        pflegedienstHaeufigkeit: 'Täglich',
        pflegedienstAufgaben: 'Medikamentengabe',
      }));
      expect(r.day_care_facility).toBe('yes');
      expect(r.job_description).toContain('Pflegedienst: Täglich: Medikamentengabe');
    });

    it('diagnoses + pflegedienst combine in one job_description (separator " | ")', () => {
      const r = mapPatientFormToUpdateCustomerInput(makeForm({
        diagnosen: 'Diabetes Typ 2',
        pflegedienst: 'Ja',
        pflegedienstHaeufigkeit: '1× pro Woche',
        pflegedienstAufgaben: 'Wundversorgung',
      }));
      // Order: summary | Diagnosen | Pflegedienst
      expect(r.job_description).toMatch(
        /^24-Stunden-Betreuung gesucht\..* \| Diagnosen: Diabetes Typ 2 \| Pflegedienst: 1× pro Woche: Wundversorgung$/,
      );
    });

    it('pflegedienst=Nein → no Pflegedienst segment in job_description (summary still present)', () => {
      // Stale frequency/tasks must not leak through when customer says No.
      const r = mapPatientFormToUpdateCustomerInput(makeForm({
        pflegedienst: 'Nein',
        pflegedienstHaeufigkeit: 'Täglich', // stale leftover
        pflegedienstAufgaben: 'Medikamentengabe',
      }));
      expect(r.day_care_facility).toBe('no');
      expect(r.job_description).toContain('24-Stunden-Betreuung gesucht');
      expect(r.job_description).not.toContain('Pflegedienst:');
    });

    it('pflegedienst=Ja with empty follow-ups → no Pflegedienst segment (only summary)', () => {
      // Validation in AngebotCard prevents save when follow-ups are blank,
      // but this is a defense-in-depth: don't ship a literal `Pflegedienst: `
      // segment with empty body if a malformed body slips through.
      const r = mapPatientFormToUpdateCustomerInput(makeForm({
        pflegedienst: 'Ja',
        pflegedienstHaeufigkeit: '',
        pflegedienstAufgaben: '',
      }));
      expect(r.day_care_facility).toBe('yes');
      expect(r.job_description).toContain('24-Stunden-Betreuung gesucht');
      expect(r.job_description).not.toContain('Pflegedienst:');
    });
  });
});
