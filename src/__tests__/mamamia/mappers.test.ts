import { describe, it, expect } from 'vitest';
import {
  mapCaregiverToNurse,
  formatMamamiaDate,
  jobOfferArrivalDisplay,
  customerDisplayName,
  mapMamamiaCustomerToPatientForm,
} from '../../lib/mamamia/mappers';
import type { MamamiaCaregiverRef, MamamiaCustomer } from '../../lib/mamamia/types';

const NOW_ISO = '2026-04-24T12:00:00.000Z';
const NOW_YEAR = 2026;

function makeCg(overrides: Partial<MamamiaCaregiverRef> = {}): MamamiaCaregiverRef {
  return {
    id: 10053,
    first_name: 'Anna',
    last_name: 'Kowalski',
    gender: 'female',
    year_of_birth: 1990,
    birth_date: null,
    germany_skill: 'level_2',
    care_experience: '5',
    available_from: null,
    last_contact_at: null,
    last_login_at: null,
    is_active_user: true,
    hp_total_jobs: 15,
    hp_total_days: 500,
    hp_avg_mission_days: 40,
    avatar_retouched: { aws_url: 'https://s3/avatar.jpg' },
    ...overrides,
  };
}

describe('mapCaregiverToNurse', () => {
  it('displays "Firstname L." (last initial)', () => {
    const n = mapCaregiverToNurse(makeCg(), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(n.name).toBe('Anna K.');
  });

  it('falls back to first name when last missing', () => {
    const n = mapCaregiverToNurse(makeCg({ first_name: 'Anna', last_name: null }), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(n.name).toBe('Anna');
  });

  it('computes age from year_of_birth', () => {
    const n = mapCaregiverToNurse(makeCg({ year_of_birth: 1990 }), { nowIso: NOW_ISO, nowYear: 2026 });
    expect(n.age).toBe(36);
  });

  it('computes age from birth_date preferentially over year_of_birth', () => {
    const n = mapCaregiverToNurse(
      makeCg({ birth_date: '1985-06-15', year_of_birth: 1990 }),
      { nowIso: NOW_ISO, nowYear: 2026 },
    );
    expect(n.age).toBe(2026 - 1985);
  });

  it('maps germany_skill level_0..level_4 → A1..B2-C1 + bars 1..5', () => {
    for (const [skill, expected] of [
      ['level_0', { level: 'A1', bars: 1 }],
      ['level_1', { level: 'A1-A2', bars: 2 }],
      ['level_2', { level: 'A2-B1', bars: 3 }],
      ['level_3', { level: 'B1-B2', bars: 4 }],
      ['level_4', { level: 'B2-C1', bars: 5 }],
    ] as const) {
      const n = mapCaregiverToNurse(makeCg({ germany_skill: skill }), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
      expect(n.language.level).toBe(expected.level);
      expect(n.language.bars).toBe(expected.bars);
    }
  });

  it('availability: "Sofort" when available_from is null', () => {
    const n = mapCaregiverToNurse(makeCg({ available_from: null }), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(n.availability).toBe('Sofort');
    expect(n.availableSoon).toBe(true);
  });

  it('availability: "ab DD. Month" for future date', () => {
    const n = mapCaregiverToNurse(
      makeCg({ available_from: '2026-05-15T00:00:00.000Z' }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.availability).toContain('15');
    expect(n.availableSoon).toBe(false);
  });

  it('experience: care_experience in years → "X J. Erfahrung"', () => {
    const n = mapCaregiverToNurse(makeCg({ care_experience: '8' }), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(n.experience).toBe('8 J. Erfahrung');
  });

  it('experience: fallback from hp_total_days / 365 when care_experience missing', () => {
    const n = mapCaregiverToNurse(
      makeCg({ care_experience: null, hp_total_days: 730 }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.experience).toBe('2 J. Erfahrung');
  });

  it('history maps hp_total_jobs + hp_avg_mission_days (converted to months)', () => {
    const n = mapCaregiverToNurse(
      makeCg({ hp_total_jobs: 20, hp_avg_mission_days: 43 }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.history?.assignments).toBe(20);
    // 43 days / 7 = 6.14 weeks / 4.3 = ~1.43 months
    expect(n.history?.avgDurationMonths).toBeCloseTo(1.4, 1);
  });

  it('isLive: true when active + last_login ≤ 30 min ago', () => {
    const n = mapCaregiverToNurse(
      makeCg({ is_active_user: true, last_login_at: '2026-04-24T11:45:00.000Z' }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.isLive).toBe(true);
  });

  it('isLive: false when last_login > 30 min ago', () => {
    const n = mapCaregiverToNurse(
      makeCg({ is_active_user: true, last_login_at: '2026-04-24T10:00:00.000Z' }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.isLive).toBe(false);
  });

  it('addedTime: "gerade eben" for <5min', () => {
    const n = mapCaregiverToNurse(
      makeCg({ last_contact_at: '2026-04-24T11:58:00.000Z' }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.addedTime).toBe('gerade eben');
  });

  it('addedTime: "vor X Std." for <24h', () => {
    const n = mapCaregiverToNurse(
      makeCg({ last_contact_at: '2026-04-24T09:00:00.000Z' }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.addedTime).toBe('vor 3 Std.');
  });

  it('addedTime: "gestern" for 1-2 days', () => {
    const n = mapCaregiverToNurse(
      makeCg({ last_contact_at: '2026-04-23T12:00:00.000Z' }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.addedTime).toBe('gestern');
  });

  it('color: deterministic from id % 20', () => {
    const n1 = mapCaregiverToNurse(makeCg({ id: 100 }), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    const n2 = mapCaregiverToNurse(makeCg({ id: 100 }), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(n1.color).toBe(n2.color);
  });

  it('image: uses avatar_retouched.aws_url when present', () => {
    const n = mapCaregiverToNurse(makeCg(), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(n.image).toBe('https://s3/avatar.jpg');
  });

  it('image: undefined when avatar_retouched is null', () => {
    const n = mapCaregiverToNurse(
      makeCg({ avatar_retouched: null }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.image).toBeUndefined();
  });
});

describe('mapCaregiverToNurse — full profile (translations + units)', () => {
  function makeFullCg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ...makeCg(),
      // Promote to "full" by adding fields the type-narrow uses for detection
      hobbies: [],
      personalities: [],
      mobilities: [],
      languagables: [],
      nationality: null,
      ...overrides,
    };
  }

  it('translates Polish nationality → Polnisch', () => {
    const n = mapCaregiverToNurse(
      // deno-lint-ignore no-explicit-any
      makeFullCg({ nationality: { nationality: 'Polish' } }) as any,
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.profile?.nationality).toBe('Polnisch');
  });

  it('falls through unknown nationality unchanged', () => {
    const n = mapCaregiverToNurse(
      // deno-lint-ignore no-explicit-any
      makeFullCg({ nationality: { nationality: 'Klingon' } }) as any,
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.profile?.nationality).toBe('Klingon');
  });

  it('appends "kg" / "cm" units to weight/height bucket strings', () => {
    const n = mapCaregiverToNurse(
      // deno-lint-ignore no-explicit-any
      makeFullCg({ weight: '81-90', height: '171-180' }) as any,
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.profile?.weight).toBe('81-90 kg');
    expect(n.profile?.height).toBe('171-180 cm');
  });

  it('translates education enum to German label', () => {
    const cases: Array<[string, string]> = [
      ['high_school', 'Gymnasium / Abitur'],
      ['studies', 'Studium'],
      ['vocational', 'Berufsausbildung'],
      ['primary_school', 'Grundschule'],
    ];
    for (const [raw, label] of cases) {
      const n = mapCaregiverToNurse(
        // deno-lint-ignore no-explicit-any
        makeFullCg({ education: raw }) as any,
        { nowIso: NOW_ISO, nowYear: NOW_YEAR },
      );
      expect(n.profile?.education).toBe(label);
    }
  });

  it('translates personalities + hobbies to German', () => {
    const n = mapCaregiverToNurse(
      // deno-lint-ignore no-explicit-any
      makeFullCg({
        personalities: [
          { personality: 'friendly' },
          { personality: 'independent' },
          { personality: 'totally-unknown-trait' },
        ],
        hobbies: [
          { hobby: 'cooking' },
          { hobby: 'crossword' },
        ],
      }) as any,
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.profile?.personalities).toEqual(['freundlich', 'selbstständig', 'totally-unknown-trait']);
    expect(n.profile?.hobbies).toEqual(['Kochen', 'Kreuzworträtsel']);
  });

  it('translates accepted mobilities to German', () => {
    const n = mapCaregiverToNurse(
      // deno-lint-ignore no-explicit-any
      makeFullCg({
        mobilities: [
          { mobility: 'Mobile' },
          { mobility: 'Wheelchair' },
          { mobility: 'Bedridden' },
        ],
      }) as any,
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.profile?.acceptedMobilities).toEqual(['Mobil', 'Rollstuhl', 'Bettlägerig']);
  });

  it('drivingLicense: parses gearbox label from enum', () => {
    const cases: Array<[string, boolean, string | undefined]> = [
      ['no', false, undefined],
      ['yes', true, undefined],
      ['yes_automatic', true, 'Automatik'],
      ['yes_manual', true, 'Schaltung'],
      ['yes_automatic_manual', true, 'Automatik & Schaltung'],
    ];
    for (const [raw, hasLic, gearbox] of cases) {
      const n = mapCaregiverToNurse(
        // deno-lint-ignore no-explicit-any
        makeFullCg({ driving_license: raw }) as any,
        { nowIso: NOW_ISO, nowYear: NOW_YEAR },
      );
      expect(n.profile?.drivingLicense).toBe(hasLic);
      expect(n.profile?.drivingLicenseGearbox).toBe(gearbox);
    }
  });

  it('translates marital_status to German', () => {
    const n = mapCaregiverToNurse(
      // deno-lint-ignore no-explicit-any
      makeFullCg({ marital_status: 'married' }) as any,
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.profile?.maritalStatus).toBe('Verheiratet');
  });
});

describe('formatMamamiaDate', () => {
  it('parses Mamamia "YYYY-MM-DD HH:mm:ss" format', () => {
    expect(formatMamamiaDate('2026-05-01 00:00:00')).toBe('01.05.2026');
  });

  it('parses ISO format', () => {
    expect(formatMamamiaDate('2026-05-01T00:00:00.000Z')).toBe('01.05.2026');
  });

  it('null → null', () => {
    expect(formatMamamiaDate(null)).toBe(null);
  });
});

describe('jobOfferArrivalDisplay', () => {
  it('formats arrival_at', () => {
    expect(jobOfferArrivalDisplay({
      id: 1, job_offer_id: 'x', status: 'search', title: 't',
      salary_offered: 2000, arrival_at: '2026-06-15 00:00:00',
      departure_at: null, applications_count: 0, confirmations_count: 0,
      created_at: '2026-04-24T00:00:00Z',
    })).toBe('15.06.2026');
  });

  it('null JobOffer → null', () => {
    expect(jobOfferArrivalDisplay(null)).toBe(null);
  });
});

describe('mapApplicationToUI', () => {
  const baseApp = {
    id: 333,
    caregiver_id: 10053,
    job_offer_id: 16226,
    parent_id: null,
    is_counter_offer: false,
    salary: 2250,
    message: 'Bewerbung text',
    arrival_at: '2026-05-01 00:00:00',
    departure_at: '2026-07-12 00:00:00',
    arrival_fee: 120,
    departure_fee: 120,
    holiday_surcharge: 0,
    active_until_at: '2026-04-24T11:00:00.000Z',
    caregiver: makeCg(),
  };

  it('maps core offer fields: monatlicheKosten, anreise/abreisedatum (DE format), fees', async () => {
    const { mapApplicationToUI } = await import('../../lib/mamamia/mappers');
    const ui = mapApplicationToUI(baseApp, null, { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(ui.offer.monatlicheKosten).toBe(2250);
    expect(ui.offer.anreisedatum).toBe('01.05.2026');
    expect(ui.offer.abreisedatum).toBe('12.07.2026');
    expect(ui.offer.anreisekosten).toBe(120);
    expect(ui.offer.abreisekosten).toBe(120);
    expect(ui.message).toBe('Bewerbung text');
    expect(ui.id).toBe('333');
    expect(ui.status).toBe('new');
    expect(ui.nurse.name).toBe('Anna K.');
  });

  it('defaults to 0 when salary/fees missing', async () => {
    const { mapApplicationToUI } = await import('../../lib/mamamia/mappers');
    const ui = mapApplicationToUI(
      { ...baseApp, salary: null, arrival_fee: null, departure_fee: null },
      null,
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(ui.offer.monatlicheKosten).toBe(0);
    expect(ui.offer.anreisekosten).toBe(0);
    expect(ui.offer.abreisekosten).toBe(0);
  });

  it('appliedAt: "vor X Std." for recent active_until_at', async () => {
    const { mapApplicationToUI } = await import('../../lib/mamamia/mappers');
    const ui = mapApplicationToUI(
      { ...baseApp, active_until_at: '2026-04-24T10:00:00.000Z' },
      null,
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(ui.appliedAt).toBe('vor 2 Std.');
  });
});

describe('mapMatchingToNurse', () => {
  it('delegates to mapCaregiverToNurse', async () => {
    const { mapMatchingToNurse } = await import('../../lib/mamamia/mappers');
    const nurse = mapMatchingToNurse({
      id: 10,
      percentage_match: 100,
      is_show: true,
      is_best_matching: true,
      caregiver: makeCg({ id: 10, first_name: 'Marta', last_name: 'Wisniewski' }),
    }, { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(nurse.name).toBe('Marta W.');
  });
});

describe('customerDisplayName', () => {
  it('"first last" when both present', () => {
    expect(customerDisplayName({
      id: 1, customer_id: 'x', status: null, first_name: 'Anna', last_name: 'Schmidt',
      email: 'x@x.de', location_id: null, location_custom_text: null, job_description: null,
      arrival_at: null, departure_at: null, care_budget: null,
    })).toBe('Anna Schmidt');
  });

  it('falls back to email when both names null', () => {
    expect(customerDisplayName({
      id: 1, customer_id: 'x', status: null, first_name: null, last_name: null,
      email: 'x@x.de', location_id: null, location_custom_text: null, job_description: null,
      arrival_at: null, departure_at: null, care_budget: null,
    })).toBe('x@x.de');
  });

  it('null customer → null', () => {
    expect(customerDisplayName(null)).toBe(null);
  });
});

describe('mapMamamiaCustomerToPatientForm — patientGenderKnown', () => {
  // Marcin's NEW calculator never asks for the patient's salutation, so
  // every stage-A onboard hits the `resolvePatientGender` fallback in
  // the onboard mapper which defaults to "female". When the lead later
  // opens the portal, that meaningless default would prefill "Weiblich"
  // in the patient-form Geschlecht dropdown — confusing the customer
  // who expects an empty state until they pick. The new
  // `patientGenderKnown` flag tells the mapper to omit gender prefill
  // so AngebotCard renders the dropdown empty.
  function makeCustWithGender(g: 'female' | 'male'): MamamiaCustomer {
    return {
      id: 1, customer_id: 'x-1', status: 'active',
      first_name: null, last_name: null, email: null, phone: null,
      language_id: null, location_id: null, location_custom_text: null,
      job_description: null, arrival_at: null, departure_at: null,
      care_budget: null, gender: null, year_of_birth: null,
      accommodation: null, caregiver_accommodated: null,
      other_people_in_house: null, has_family_near_by: null,
      smoking_household: null, internet: null, urbanization_id: null,
      pets: null, is_pet_dog: null, is_pet_cat: null, is_pet_other: null,
      day_care_facility: null,
      patients: [{ id: 11, gender: g, year_of_birth: null, care_level: 3,
        mobility_id: null, weight: null, height: null, night_operations: null,
        dementia: null, dementia_description: null, incontinence: null,
        incontinence_feces: null, incontinence_urine: null, smoking: null,
        lift_id: null }],
      customer_caregiver_wish: null, customer_contracts: [],
    } as unknown as MamamiaCustomer;
  }

  // Bug #13 (2026-05-07): patientGenderKnown opt deleted. Onboard no
  // longer injects patient.gender default 'female' (calculator nie pyta);
  // Mamamia returns null until patient form save → reverse mapper outputs
  // '' for null gender naturally. Real user-saved gender propagates.

  it('null gender (pre-patient-form-save) → empty string', () => {
    const cust = makeCustWithGender(null as unknown as 'female');
    const r = mapMamamiaCustomerToPatientForm(cust);
    expect(r.geschlecht).toBe('');
  });

  it('user-saved gender from patient form → real value surfaces', () => {
    const r = mapMamamiaCustomerToPatientForm(makeCustWithGender('female'));
    expect(r.geschlecht).toBe('Weiblich');
  });

  it('p2_geschlecht propagates from real patient[1].gender', () => {
    const cust = makeCustWithGender('female');
    cust.patients = [
      cust.patients![0],
      { ...cust.patients![0], id: 12, gender: 'male' },
    ];
    const r = mapMamamiaCustomerToPatientForm(cust);
    expect(r.geschlecht).toBe('Weiblich');
    expect(r.p2_geschlecht).toBe('Männlich');
    expect(r.p2_pflegegrad).toBe('Pflegegrad 3');
  });
});

// ─── Bug #9 round-trip: pflegedienst from job_description → form ─────────
// AngebotCard ships frequency + tasks via job_description as
// "Pflegedienst: {frequency}: {task1, task2, ...}" (combined with other
// segments like "Diagnosen: …" using " | "). When the user re-opens the
// form, the reverse mapper isolates the Pflegedienst segment and splits
// on the first inner colon to restore both controls.

describe('mapMamamiaCustomerToPatientForm — pflegedienst from job_description', () => {
  function makeCustWithDayCare(
    facility: 'yes' | 'no' | null,
    jobDescription: string | null,
  ): MamamiaCustomer {
    return {
      id: 1, customer_id: 'x-1', status: 'active',
      first_name: null, last_name: null, email: null, phone: null,
      language_id: null, location_id: null, location_custom_text: null,
      job_description: jobDescription, arrival_at: null, departure_at: null,
      care_budget: null, gender: null, year_of_birth: null,
      accommodation: null, caregiver_accommodated: null,
      other_people_in_house: null, has_family_near_by: null,
      smoking_household: null, internet: null, urbanization_id: null,
      pets: null, is_pet_dog: null, is_pet_cat: null, is_pet_other: null,
      day_care_facility: facility,
      patients: [], customer_caregiver_wish: null, customer_contracts: [],
    } as unknown as MamamiaCustomer;
  }

  it('day_care_facility=yes with "Pflegedienst: {freq}: {tasks}" → splits into both fields', () => {
    const r = mapMamamiaCustomerToPatientForm(
      makeCustWithDayCare('yes', 'Pflegedienst: 2× pro Woche: Grundpflege (Körperpflege, Anziehen), Wundversorgung'),
    );
    expect(r.pflegedienst).toBe('Ja');
    expect(r.pflegedienstHaeufigkeit).toBe('2× pro Woche');
    expect(r.pflegedienstAufgaben).toBe(
      'Grundpflege (Körperpflege, Anziehen), Wundversorgung',
    );
  });

  it('isolates Pflegedienst segment from a multi-segment job_description', () => {
    // job_description carries Diagnosen + Pflegedienst joined by " | ".
    // Reverse mapper picks just the Pflegedienst part — Diagnosen lives
    // on its own form field, fed by a different code path.
    const r = mapMamamiaCustomerToPatientForm(
      makeCustWithDayCare(
        'yes',
        'Diagnosen: Diabetes Typ 2 | Pflegedienst: 1× pro Woche: Wundversorgung',
      ),
    );
    expect(r.pflegedienstHaeufigkeit).toBe('1× pro Woche');
    expect(r.pflegedienstAufgaben).toBe('Wundversorgung');
  });

  it('day_care_facility=no → no follow-up fields prefilled', () => {
    // Even if the job_description carries a stale Pflegedienst segment
    // while facility=no (legacy data), don't prefill — UX consistency.
    const r = mapMamamiaCustomerToPatientForm(
      makeCustWithDayCare('no', 'Pflegedienst: 1× pro Woche: Wundversorgung'),
    );
    expect(r.pflegedienst).toBe('Nein');
    expect(r.pflegedienstHaeufigkeit).toBeUndefined();
    expect(r.pflegedienstAufgaben).toBeUndefined();
  });

  it('Pflegedienst segment with no inner colon → puts everything on Häufigkeit (free-text fallback)', () => {
    const r = mapMamamiaCustomerToPatientForm(
      makeCustWithDayCare('yes', 'Pflegedienst: Mehrmals pro Woche'),
    );
    expect(r.pflegedienstHaeufigkeit).toBe('Mehrmals pro Woche');
    expect(r.pflegedienstAufgaben).toBeUndefined();
  });

  it('job_description without Pflegedienst segment → no follow-up prefill', () => {
    // Legacy customers might have job_description with only Diagnosen.
    const r = mapMamamiaCustomerToPatientForm(
      makeCustWithDayCare('yes', 'Diagnosen: Hypertonie'),
    );
    expect(r.pflegedienstHaeufigkeit).toBeUndefined();
    expect(r.pflegedienstAufgaben).toBeUndefined();
  });
});

// ─── Weight/height — straight passthrough (Bug #13 refactor) ──────────
// Pre-Bug-#13 onboard injected DEFAULT_WEIGHT="61-70" + DEFAULT_HEIGHT="161-170"
// for Mamamia matching, and reverse mapper detected the exact pair to suppress.
// After Bug #13 onboard ships nothing for weight/height; Mamamia returns null
// until patient form save. Reverse mapper passes any non-null bucket through
// with the kg/cm suffix and emits '' for null.

describe('mapMamamiaCustomerToPatientForm — weight/height passthrough', () => {
  function makeCustWithPatient(
    weight: string | null,
    height: string | null,
  ): MamamiaCustomer {
    return {
      id: 1, customer_id: 'x-1', status: 'active',
      first_name: null, last_name: null, email: null, phone: null,
      language_id: null, location_id: null, location_custom_text: null,
      job_description: null, arrival_at: null, departure_at: null,
      care_budget: null, gender: null, year_of_birth: null,
      accommodation: null, caregiver_accommodated: null,
      other_people_in_house: null, has_family_near_by: null,
      smoking_household: null, internet: null, urbanization_id: null,
      pets: null, is_pet_dog: null, is_pet_cat: null, is_pet_other: null,
      day_care_facility: null,
      patients: [{
        id: 11, gender: null, year_of_birth: null, care_level: 3,
        mobility_id: null, weight, height, night_operations: null,
        dementia: null, dementia_description: null, incontinence: null,
        incontinence_feces: null, incontinence_urine: null, smoking: null,
        lift_id: null,
      }],
      customer_caregiver_wish: null, customer_contracts: [],
    } as unknown as MamamiaCustomer;
  }

  it('null weight/height (pre-patient-form-save) → empty', () => {
    const r = mapMamamiaCustomerToPatientForm(makeCustWithPatient(null, null));
    expect(r.gewicht).toBe('');
    expect(r.groesse).toBe('');
  });

  it('user-saved bucket → kg/cm suffix added', () => {
    const r = mapMamamiaCustomerToPatientForm(makeCustWithPatient('81-90', '171-180'));
    expect(r.gewicht).toBe('81-90 kg');
    expect(r.groesse).toBe('171-180 cm');
  });

  it('Bug #13: user who genuinely picked 61-70 + 161-170 sees real values (no spurious suppression)', () => {
    // Pre-Bug-#13 reverse mapper suppressed this exact pair as the onboard
    // default sentinel — surfaced as empty even when the user explicitly
    // saved 61-70 / 161-170. Bug #13 removes onboard injection of those
    // defaults entirely, so this pair is now always real user input and
    // surfaces as-is.
    const r = mapMamamiaCustomerToPatientForm(makeCustWithPatient('61-70', '161-170'));
    expect(r.gewicht).toBe('61-70 kg');
    expect(r.groesse).toBe('161-170 cm');
  });
});

// ─── Bug #13e — Pflegegrad "Kein/e" via natywne care_level=null ──────────
// Mamamia panel oferuje "Keine" — w bazie `care_level: null`. Zweryfikowane
// live 2026-05-07 na Customer 7658 (po ręcznym ustawieniu "brak" w panelu,
// query zwróciło null). NIE wymyślamy mapowania na 1 + sentinel tag.

describe('mapMamamiaCustomerToPatientForm — Bug #13e Kein/e via care_level=null', () => {
  function makeCustWithPg(careLevel: number | null): MamamiaCustomer {
    return {
      id: 1, customer_id: 'x-1', status: 'active',
      first_name: null, last_name: null, email: null, phone: null,
      language_id: null, location_id: null, location_custom_text: null,
      job_description: null, arrival_at: null, departure_at: null,
      care_budget: null, gender: null, year_of_birth: null,
      accommodation: null, caregiver_accommodated: null,
      other_people_in_house: null, has_family_near_by: null,
      smoking_household: null, internet: null, urbanization_id: null,
      pets: null, is_pet_dog: null, is_pet_cat: null, is_pet_other: null,
      day_care_facility: null,
      patients: [{
        id: 11, gender: null, year_of_birth: null, care_level: careLevel,
        mobility_id: null, weight: null, height: null, night_operations: null,
        dementia: null, dementia_description: null, incontinence: null,
        incontinence_feces: null, incontinence_urine: null, smoking: null,
        lift_id: null,
      }],
      customer_caregiver_wish: null, customer_contracts: [],
    } as unknown as MamamiaCustomer;
  }

  it('care_level=null → "Kein/e" (natywna opcja Mamamia "Keine")', () => {
    const r = mapMamamiaCustomerToPatientForm(makeCustWithPg(null));
    expect(r.pflegegrad).toBe('Kein/e');
  });

  it('care_level=1 → "Pflegegrad 1" (real PG1)', () => {
    const r = mapMamamiaCustomerToPatientForm(makeCustWithPg(1));
    expect(r.pflegegrad).toBe('Pflegegrad 1');
  });

  it('care_level=3 → "Pflegegrad 3"', () => {
    const r = mapMamamiaCustomerToPatientForm(makeCustWithPg(3));
    expect(r.pflegegrad).toBe('Pflegegrad 3');
  });
});
