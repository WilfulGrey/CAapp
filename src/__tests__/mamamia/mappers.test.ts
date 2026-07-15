import { describe, it, expect } from 'vitest';
import {
  mapCaregiverToNurse,
  formatMamamiaDate,
  jobOfferArrivalDisplay,
  customerDisplayName,
  mapMamamiaCustomerToPatientForm,
  germanySkillBucket,
  requiredGermanyLevelForWish,
  matchesGermanyWish,
  synthesizeAcceptedApplicationFromSnapshot,
  synthesizeAcceptedApplicationFromFinalConfirmation,
  pickFinalConfirmedJob,
  applyAcceptedOverlay,
  type UIApplication,
} from '../../lib/mamamia/mappers';
import type {
  MamamiaCaregiverRef,
  MamamiaCaregiverFull,
  MamamiaCustomer,
  MamamiaAcceptedApplicationRow,
  MamamiaAcceptedApplications,
  MamamiaCustomerJobOffer,
} from '../../lib/mamamia/types';

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
    avatar: null,
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

  it('maps germany_skill level_0..level_4 → 3 Stufen Grund/Mittel/Gut (bars 1..3)', () => {
    for (const [skill, expected] of [
      ['level_0', { level: 'Grund',  bars: 1 }],
      ['level_1', { level: 'Grund',  bars: 1 }],
      ['level_2', { level: 'Mittel', bars: 2 }],
      ['level_3', { level: 'Gut',    bars: 3 }],
      ['level_4', { level: 'Gut',    bars: 3 }],
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

  it('image: falls back to raw avatar when avatar_retouched is null', () => {
    const n = mapCaregiverToNurse(
      makeCg({ avatar_retouched: null, avatar: { aws_url: 'https://s3/raw.jpg' } }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.image).toBe('https://s3/raw.jpg');
  });

  it('image: prefers avatar_retouched over raw avatar', () => {
    const n = mapCaregiverToNurse(
      makeCg({ avatar_retouched: { aws_url: 'https://s3/retouched.jpg' }, avatar: { aws_url: 'https://s3/raw.jpg' } }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.image).toBe('https://s3/retouched.jpg');
  });

  it('image: prefers avatar_retouched_promo over retouched + raw (Foto-Queue Spitze)', () => {
    const n = mapCaregiverToNurse(
      makeCg({
        avatar_retouched_promo: { aws_url: 'https://s3/promo.jpg' },
        avatar_retouched: { aws_url: 'https://s3/retouched.jpg' },
        avatar: { aws_url: 'https://s3/raw.jpg' },
      }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.image).toBe('https://s3/promo.jpg');
  });

  it('image: promo null/leer → fällt auf retouched zurück', () => {
    const n = mapCaregiverToNurse(
      makeCg({ avatar_retouched_promo: { aws_url: null }, avatar_retouched: { aws_url: 'https://s3/retouched.jpg' } }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.image).toBe('https://s3/retouched.jpg');
  });

  it('image: undefined when both avatar_retouched and raw avatar are null', () => {
    const n = mapCaregiverToNurse(
      makeCg({ avatar_retouched: null, avatar: null }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(n.image).toBeUndefined();
  });

  // ─── referencePdfUrl from certificates (Referenz_*.pdf) ───────────────
  describe('referencePdfUrl', () => {
    it('undefined when no certificates', () => {
      const n = mapCaregiverToNurse(makeCg(), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
      expect(n.referencePdfUrl).toBeUndefined();
    });

    it('undefined when certificates have no Referenz_*.pdf', () => {
      const n = mapCaregiverToNurse(
        makeCg({
          certificates: [
            { original_name: 'Zertifikat_Pflege.pdf', aws_url: 'https://s3/z.pdf', created_at: '2026-01-01T00:00:00Z', mime_type: 'application/pdf' },
            { original_name: 'Ausweis.jpg', aws_url: 'https://s3/a.jpg', created_at: '2026-02-01T00:00:00Z', mime_type: 'image/jpeg' },
          ],
        }),
        { nowIso: NOW_ISO, nowYear: NOW_YEAR },
      );
      expect(n.referencePdfUrl).toBeUndefined();
    });

    it('picks the Referenz_*.pdf (CG 12082 example)', () => {
      const n = mapCaregiverToNurse(
        makeCg({
          certificates: [
            { original_name: 'Zertifikat_Pflege.pdf', aws_url: 'https://s3/z.pdf', created_at: '2026-01-01T00:00:00Z', mime_type: 'application/pdf' },
            { original_name: 'Referenz_S_Wadysaw_2026-06-08.pdf', aws_url: 'https://s3/ref-0608.pdf', created_at: '2026-06-08T10:00:00Z', mime_type: 'application/pdf' },
          ],
        }),
        { nowIso: NOW_ISO, nowYear: NOW_YEAR },
      );
      expect(n.referencePdfUrl).toBe('https://s3/ref-0608.pdf');
    });

    it('picks the NEWEST when multiple Referenz files exist', () => {
      const n = mapCaregiverToNurse(
        makeCg({
          certificates: [
            { original_name: 'Referenz_Alt_2025-03-01.pdf', aws_url: 'https://s3/old.pdf', created_at: '2025-03-01T00:00:00Z', mime_type: 'application/pdf' },
            { original_name: 'Referenz_Neu_2026-06-08.pdf', aws_url: 'https://s3/new.pdf', created_at: '2026-06-08T00:00:00Z', mime_type: 'application/pdf' },
            { original_name: 'Referenz_Mittel_2026-01-15.pdf', aws_url: 'https://s3/mid.pdf', created_at: '2026-01-15T00:00:00Z', mime_type: 'application/pdf' },
          ],
        }),
        { nowIso: NOW_ISO, nowYear: NOW_YEAR },
      );
      expect(n.referencePdfUrl).toBe('https://s3/new.pdf');
    });

    it('ignores a Referenz match that has no aws_url', () => {
      const n = mapCaregiverToNurse(
        makeCg({
          certificates: [
            { original_name: 'Referenz_NoUrl.pdf', aws_url: null, created_at: '2026-06-08T00:00:00Z', mime_type: 'application/pdf' },
          ],
        }),
        { nowIso: NOW_ISO, nowYear: NOW_YEAR },
      );
      expect(n.referencePdfUrl).toBeUndefined();
    });

    it('matches case-insensitively (referenz_*.pdf)', () => {
      const n = mapCaregiverToNurse(
        makeCg({
          certificates: [
            { original_name: 'referenz_klein.PDF', aws_url: 'https://s3/ci.pdf', created_at: '2026-06-08T00:00:00Z', mime_type: 'application/pdf' },
          ],
        }),
        { nowIso: NOW_ISO, nowYear: NOW_YEAR },
      );
      expect(n.referencePdfUrl).toBe('https://s3/ci.pdf');
    });
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
          { personality: 'brand_new_trait' },
        ],
        hobbies: [
          { hobby: 'cooking' },
          { hobby: 'crossword' },
        ],
      }) as any,
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    // Unbekannte Enum-Werte werden "prettified" (Unterstriche → Leerzeichen,
    // jedes Wort groß) statt roh durchgereicht — nie ein "brand_new_trait" im UI.
    expect(n.profile?.personalities).toEqual(['freundlich', 'selbstständig', 'Brand New Trait']);
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
    expect(n.profile?.acceptedMobilities).toEqual(['Selbstständig mobil', 'Rollstuhlfähig', 'Bettlägerig']);
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
      customer_caregiver_wish: null, customer_contract: null,
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

  it('Bug #17b: weight/height edge buckets reverse-map to form labels', () => {
    // Mamamia stores edges as "40-50"/"> 100" (weight), "140-150"/"190+"
    // (height). Reverse mapper must re-emit the form's Unter/Über labels
    // so AngebotCard prefill picks the correct dropdown option.
    // Verified live 2026-05-12 on Customer 8454.
    const cust = makeCustWithGender('female');
    cust.patients = [{ ...cust.patients![0], weight: '40-50', height: '140-150' }];
    const lo = mapMamamiaCustomerToPatientForm(cust);
    expect(lo.gewicht).toBe('Unter 50 kg');
    expect(lo.groesse).toBe('Unter 151 cm');

    cust.patients = [{ ...cust.patients![0], weight: '> 100', height: '190+' }];
    const hi = mapMamamiaCustomerToPatientForm(cust);
    expect(hi.gewicht).toBe('Über 100 kg');
    expect(hi.groesse).toBe('Über 190 cm');
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
      patients: [], customer_caregiver_wish: null, customer_contract: null,
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
      customer_caregiver_wish: null, customer_contract: null,
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

// ─── Bug #13k — Pflegedienst description via dedicated fields ───────────
// Mamamia mutation now accepts day_care_facility_description{,_de,_en,_pl}
// (verified live 2026-05-07 — Customer 7659 sanity). Reverse mapper czyta
// te pola pierwsze; legacy job_description segment jako fallback dla
// customers utworzonych pre-Bug-#13k.

describe('mapMamamiaCustomerToPatientForm — Bug #13k pflegedienst dedicated fields', () => {
  function makeCustWithDedicatedDesc(
    facility: 'yes' | 'no' | null,
    descDe: string | null,
    jobDescription: string | null = null,
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
      day_care_facility_description: descDe,
      day_care_facility_description_de: descDe,
      day_care_facility_description_en: null,
      day_care_facility_description_pl: null,
      patients: [], customer_caregiver_wish: null, customer_contract: null,
    } as unknown as MamamiaCustomer;
  }

  it('day_care_facility_description_de "freq: tasks" → split into haeufigkeit + aufgaben', () => {
    const r = mapMamamiaCustomerToPatientForm(
      makeCustWithDedicatedDesc('yes', '2× pro Woche: Wundversorgung, Injektionen'),
    );
    expect(r.pflegedienstHaeufigkeit).toBe('2× pro Woche');
    expect(r.pflegedienstAufgaben).toBe('Wundversorgung, Injektionen');
  });

  it('dedicated field preferred over legacy job_description segment', () => {
    const r = mapMamamiaCustomerToPatientForm(
      makeCustWithDedicatedDesc(
        'yes',
        '3× pro Woche: NEW',
        'Pflegedienst: 1× pro Woche: OLD',
      ),
    );
    expect(r.pflegedienstHaeufigkeit).toBe('3× pro Woche');
    expect(r.pflegedienstAufgaben).toBe('NEW');
  });

  it('day_care_facility_description without colon → all on Häufigkeit (free-text fallback)', () => {
    const r = mapMamamiaCustomerToPatientForm(
      makeCustWithDedicatedDesc('yes', 'Mehrmals pro Woche'),
    );
    expect(r.pflegedienstHaeufigkeit).toBe('Mehrmals pro Woche');
    expect(r.pflegedienstAufgaben).toBeUndefined();
  });

  it('day_care_facility=no → ignores dedicated description (UX consistency)', () => {
    const r = mapMamamiaCustomerToPatientForm(
      makeCustWithDedicatedDesc('no', 'stale: data'),
    );
    expect(r.pflegedienst).toBe('Nein');
    expect(r.pflegedienstHaeufigkeit).toBeUndefined();
    expect(r.pflegedienstAufgaben).toBeUndefined();
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
      customer_caregiver_wish: null, customer_contract: null,
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

// ─── hp_recent_assignments — patients_count + patient_mobility_id ────────────

describe('mapCaregiverToNurse — hp_recent_assignments detail fields', () => {
  const NOW = '2026-05-12T12:00:00.000Z';

  function makeCgWithAssignments(
    assignments: Array<{
      arrival_date: string;
      departure_date: string;
      postal_code?: string;
      city?: string;
      status: string;
      patients_count?: number | null;
      patient_mobility_id?: number | null;
    }>,
  ) {
    return {
      ...makeCg({ hp_total_jobs: assignments.length }),
      hobbies: [],
      personalities: [],
      mobilities: [],
      languagables: [],
      nationality: null,
      hp_recent_assignments: assignments.map(a => ({
        postal_code: '10115',
        city: 'Berlin',
        patients_count: null,
        patient_mobility_id: null,
        ...a,
      })),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  it('uses patients_count from API (2 patients)', () => {
    const cg = makeCgWithAssignments([{
      arrival_date: '2025-01-01',
      departure_date: '2025-02-01',
      status: 'finish',
      patients_count: 2,
      patient_mobility_id: null,
    }]);
    const n = mapCaregiverToNurse(cg, { nowIso: NOW, nowYear: 2026 });
    expect(n.detailedAssignments?.[0]?.patientCount).toBe(2);
  });

  it('falls back to patientCount=1 when patients_count is null', () => {
    const cg = makeCgWithAssignments([{
      arrival_date: '2025-01-01',
      departure_date: '2025-02-01',
      status: 'finish',
      patients_count: null,
    }]);
    const n = mapCaregiverToNurse(cg, { nowIso: NOW, nowYear: 2026 });
    expect(n.detailedAssignments?.[0]?.patientCount).toBe(1);
  });

  it('computes duration in Tagen for a short assignment', () => {
    const cg = makeCgWithAssignments([{
      arrival_date: '2025-01-01',
      departure_date: '2025-01-10',
      status: 'finish',
    }]);
    const n = mapCaregiverToNurse(cg, { nowIso: NOW, nowYear: 2026 });
    expect(n.detailedAssignments?.[0]?.duration).toBe('9 Tage');
  });

  it('uses singular "Tag" for a 1-day assignment', () => {
    const cg = makeCgWithAssignments([{
      arrival_date: '2025-01-01',
      departure_date: '2025-01-02',
      status: 'finish',
    }]);
    const n = mapCaregiverToNurse(cg, { nowIso: NOW, nowYear: 2026 });
    expect(n.detailedAssignments?.[0]?.duration).toBe('1 Tag');
  });

  it('computes duration in Wochen for a mid-length assignment', () => {
    const cg = makeCgWithAssignments([{
      arrival_date: '2025-01-01',
      departure_date: '2025-02-01',
      status: 'finish',
    }]);
    const n = mapCaregiverToNurse(cg, { nowIso: NOW, nowYear: 2026 });
    expect(n.detailedAssignments?.[0]?.duration).toBe('4 Wochen');
  });

  it('computes duration in Monaten for a long assignment', () => {
    const cg = makeCgWithAssignments([{
      arrival_date: '2025-01-01',
      departure_date: '2025-04-01',
      status: 'finish',
    }]);
    const n = mapCaregiverToNurse(cg, { nowIso: NOW, nowYear: 2026 });
    expect(n.detailedAssignments?.[0]?.duration).toBe('3 Monate');
  });

  it('filters out non-finish assignments', () => {
    const cg = makeCgWithAssignments([
      { arrival_date: '2025-01-01', departure_date: '2025-02-01', status: 'rejected', patients_count: 1 },
      { arrival_date: '2025-03-01', departure_date: '2025-04-01', status: 'finish', patients_count: 2 },
    ]);
    const n = mapCaregiverToNurse(cg, { nowIso: NOW, nowYear: 2026 });
    expect(n.detailedAssignments?.length).toBe(1);
    expect(n.detailedAssignments?.[0]?.patientCount).toBe(2);
  });
});

describe('mapMamamiaCustomerToPatientForm — phone', () => {
  function makeCust(
    phone: string | null,
    contractPhone: string | null = null,
  ): MamamiaCustomer {
    return {
      id: 1, customer_id: 'x-1', status: 'active',
      first_name: null, last_name: null, email: null, phone,
      language_id: null, location_id: null, location_custom_text: null,
      job_description: null, arrival_at: null, departure_at: null,
      care_budget: null, gender: null, year_of_birth: null,
      accommodation: null, caregiver_accommodated: null,
      other_people_in_house: null, has_family_near_by: null,
      smoking_household: null, internet: null, urbanization_id: null,
      pets: null, is_pet_dog: null, is_pet_cat: null, is_pet_other: null,
      day_care_facility: null,
      patients: null,
      customer_caregiver_wish: null,
      customer_contract: contractPhone == null ? null : { id: 1, phone: contractPhone },
    } as unknown as MamamiaCustomer;
  }

  it('surfaces non-empty Customer.phone to form', () => {
    const r = mapMamamiaCustomerToPatientForm(makeCust('+49 89 200 000 830'));
    expect(r.phone).toBe('+49 89 200 000 830');
  });

  it('omits phone when both Customer.phone and contract.phone are null', () => {
    const r = mapMamamiaCustomerToPatientForm(makeCust(null, null));
    expect(r.phone).toBeUndefined();
  });

  it('falls back to customer_contract.phone when Customer.phone is null (manual panel edit case)', () => {
    const r = mapMamamiaCustomerToPatientForm(makeCust(null, '+49 30 123 456'));
    expect(r.phone).toBe('+49 30 123 456');
  });

  it('prefers Customer.phone over customer_contract.phone when both set', () => {
    const r = mapMamamiaCustomerToPatientForm(makeCust('+49 89 TOP', '+49 30 CONTRACT'));
    expect(r.phone).toBe('+49 89 TOP');
  });
});

// Mamamia hat 5 germany_skill-Stufen (level_0..level_4), der Kostenrechner und
// damit das Kundenangebot kennen aber nur 3 (grundlegend, kommunikativ,
// sehr-gut). Diese Helper-Tests sichern, dass die Stufen-Brücke korrekt zu
// genau 3 Buckets gemappt wird und der Aufpreis nur greift, wenn die
// Pflegekraft tatsächlich höher als der Wunsch liegt — sonst würden wir
// Pflegekräfte mit passender Sprache zu Unrecht mit "+150 €/Mo" markieren.
describe('germanySkillBucket (5-Stufen → 3-Stufen-Bridge)', () => {
  it('maps level_0/level_1 → grund', () => {
    expect(germanySkillBucket('level_0')).toBe('grund');
    expect(germanySkillBucket('level_1')).toBe('grund');
  });
  it('maps level_2 → mittel (das ist Mamamias mittlere Stufe)', () => {
    expect(germanySkillBucket('level_2')).toBe('mittel');
  });
  it('maps level_3/level_4 → gut', () => {
    expect(germanySkillBucket('level_3')).toBe('gut');
    expect(germanySkillBucket('level_4')).toBe('gut');
  });
  it('returns null for unknown/empty values', () => {
    expect(germanySkillBucket(null)).toBeNull();
    expect(germanySkillBucket('')).toBeNull();
    expect(germanySkillBucket('level_99')).toBeNull();
  });
});

describe('requiredGermanyLevelForWish (Kostenrechner-Tier → EXAKTE Stufe)', () => {
  it('grundlegend → level_1', () => {
    expect(requiredGermanyLevelForWish('grundlegend')).toBe('level_1');
  });
  it('kommunikativ → level_2', () => {
    expect(requiredGermanyLevelForWish('kommunikativ')).toBe('level_2');
  });
  it('sehr-gut → level_4 (Bindestrich + Underscore)', () => {
    expect(requiredGermanyLevelForWish('sehr-gut')).toBe('level_4');
    expect(requiredGermanyLevelForWish('sehr_gut')).toBe('level_4');
  });
  it('tolerates upper-case / whitespace', () => {
    expect(requiredGermanyLevelForWish('  Kommunikativ ')).toBe('level_2');
  });
  it('null/unknown → null (Filter bleibt aus)', () => {
    expect(requiredGermanyLevelForWish(null)).toBeNull();
    expect(requiredGermanyLevelForWish('???')).toBeNull();
  });
});

describe('matchesGermanyWish (STRIKT: exakte Stufe pro Tier)', () => {
  it('grundlegend zeigt NUR level_1 (nicht level_0, nicht stärker)', () => {
    expect(matchesGermanyWish('level_1', 'grundlegend')).toBe(true);
    expect(matchesGermanyWish('level_0', 'grundlegend')).toBe(false);
    expect(matchesGermanyWish('level_2', 'grundlegend')).toBe(false);
    expect(matchesGermanyWish('level_4', 'grundlegend')).toBe(false);
  });
  it('kommunikativ zeigt NUR level_2', () => {
    expect(matchesGermanyWish('level_2', 'kommunikativ')).toBe(true);
    expect(matchesGermanyWish('level_1', 'kommunikativ')).toBe(false);
    expect(matchesGermanyWish('level_3', 'kommunikativ')).toBe(false);
    expect(matchesGermanyWish('level_4', 'kommunikativ')).toBe(false);
  });
  it('sehr-gut zeigt NUR level_4 (NICHT level_3/B1!)', () => {
    expect(matchesGermanyWish('level_4', 'sehr-gut')).toBe(true);
    expect(matchesGermanyWish('level_3', 'sehr-gut')).toBe(false);
    expect(matchesGermanyWish('level_2', 'sehr-gut')).toBe(false);
  });
  it('kein Tier gewählt (null/leer) → alle zeigen', () => {
    expect(matchesGermanyWish('level_3', null)).toBe(true);
    expect(matchesGermanyWish('level_0', '')).toBe(true);
  });
  it('unbekannte Pflegekraft-Stufe (null) → zeigen (nicht wegfiltern)', () => {
    expect(matchesGermanyWish(null, 'sehr-gut')).toBe(true);
  });
});

describe('mapCaregiverToNurse — language.bucket füllt 3-Stufen-Bridge', () => {
  it('füllt bucket aus germany_skill (level_4 → gut)', () => {
    const n = mapCaregiverToNurse(makeCg({ germany_skill: 'level_4' }), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(n.language.bucket).toBe('gut');
  });
  it('bucket=null für unbekannte germany_skill (kein Aufpreis möglich)', () => {
    const n = mapCaregiverToNurse(makeCg({ germany_skill: null }), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(n.language.bucket).toBeNull();
  });
});

// ─── Acceptance-Synthese (Bug-Fix Michael Dachs 11.06.2026) ──────────────
// Mamamia entfernt akzeptierte Bewerbungen aus listApplications, daher
// braucht das Portal eine Rekonstruktion aus dem contract_snapshot, sonst
// rendert BookedScreen nicht + die anderen Bewerbungen werden weiter als
// "offen" angezeigt.
describe('synthesizeAcceptedApplicationFromSnapshot', () => {
  function makeRow(overrides: Partial<MamamiaAcceptedApplicationRow> = {}): MamamiaAcceptedApplicationRow {
    return {
      application_id: 9006,
      caregiver_id: 21395,
      accepted_at: '2026-06-11T10:51:25Z',
      contract_snapshot: {
        datum: '11.06.2026',
        vertragsbeginn: '01.07.2026',
        voraussAbreise: '12.08.2026',
        tagessatz: 'EUR 83,00',
        ag: { name: 'Marianne Dachs' },
        le: null,
        dl: { name: 'Kamila Bilska-Wabik' },
      },
      ...overrides,
    };
  }
  function makeFullCg(overrides: Partial<MamamiaCaregiverFull> = {}): MamamiaCaregiverFull {
    return {
      ...makeCg(),
      ...overrides,
    } as MamamiaCaregiverFull;
  }

  it('liefert Platzhalter-App wenn Caregiver-Profil noch nicht geladen (BookedScreen + PDF dürfen nie verschwinden)', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(makeRow(), null, { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(r).not.toBeNull();
    expect(r!.status).toBe('accepted');
    expect(r!.id).toBe('9006');
    expect(r!.nurse.name).toBe('Ihre Pflegekraft');
  });

  it('nutzt fallbackName für die Platzhalter-Karte (Name aus unseren Events)', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(makeRow(), null, { nowIso: NOW_ISO, nowYear: NOW_YEAR }, 'Edyta T.');
    expect(r!.nurse.name).toBe('Edyta T.');
    expect(r!.nurse.caregiverId).toBe(21395);
  });

  it('rekonstruiert Application mit status=accepted + Mamamia-application-id als String', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(makeRow(), makeFullCg(), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(r).not.toBeNull();
    expect(r!.id).toBe('9006');
    expect(r!.status).toBe('accepted');
  });

  it('parst Tagessatz "EUR 83,00" → monatlicheKosten = 83 × 30 = 2490', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(makeRow(), makeFullCg(), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(r!.offer.monatlicheKosten).toBe(2490);
  });

  it('übernimmt Anreise- und Abreisedatum aus contract_snapshot direkt', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(makeRow(), makeFullCg(), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(r!.offer.anreisedatum).toBe('01.07.2026');
    expect(r!.offer.abreisedatum).toBe('12.08.2026');
  });

  it('setzt Anreise/Abreise-Kosten auf 125 € (Standard-Pauschale)', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(makeRow(), makeFullCg(), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(r!.offer.anreisekosten).toBe(125);
    expect(r!.offer.abreisekosten).toBe(125);
  });

  it('feiertagszuschlag = tagessatz (doppelter Tagessatz pro Feiertag)', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(makeRow(), makeFullCg(), { nowIso: NOW_ISO, nowYear: NOW_YEAR });
    expect(r!.offer.feiertagszuschlag).toBe(83);
  });

  it('parst englische Tausender-/Dezimaltrennung "EUR 1,234.56" → 1235', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(
      makeRow({ contract_snapshot: { tagessatz: 'EUR 1,234.56' } as never }),
      makeFullCg(),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(r!.offer.monatlicheKosten).toBe(1235 * 30);
  });

  it('parst deutsche Tausender "1.234,56 €" → 1235', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(
      makeRow({ contract_snapshot: { tagessatz: '1.234,56 €' } as never }),
      makeFullCg(),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(r!.offer.monatlicheKosten).toBe(1235 * 30);
  });

  it('fehlender / unparsbarer Tagessatz → monatlicheKosten = 0 (statt Crash)', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(
      makeRow({ contract_snapshot: null }),
      makeFullCg(),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(r!.offer.monatlicheKosten).toBe(0);
    // Fallback-Strings statt "undefined"-leaks ins UI
    expect(r!.offer.anreisedatum).toBe('—');
    expect(r!.offer.abreisedatum).toBe('—');
  });

  it('nurse-Felder kommen vom geladenen Caregiver-Profil', () => {
    const r = synthesizeAcceptedApplicationFromSnapshot(
      makeRow(),
      makeFullCg({ first_name: 'Kamila', last_name: 'Bilska-Wabik' }),
      { nowIso: NOW_ISO, nowYear: NOW_YEAR },
    );
    expect(r!.nurse.name).toBe('Kamila B.');
  });
});

// ─── Gebucht-Ableitung aus dem Mamamia-Stand (Bug-Fix Hagedorn 15.07.2026) ──
// Akzeptiert die AGENTUR die Bewerbung im SA-Portal, gibt es keine
// lead_application_acceptances-Zeile UND Mamamia entfernt die Bewerbung aus
// listApplications — das Portal zeigte weiter den Onboarding-Zustand statt
// BookedScreen. Einziger Beleg: JobOffer.final_confirmation (GET_CUSTOMER
// job_offers).

const OPTS = { nowIso: NOW_ISO, nowYear: NOW_YEAR };

function makeConfirmedJob(overrides: Partial<MamamiaCustomerJobOffer> = {}): MamamiaCustomerJobOffer {
  return {
    id: 16226,
    arrival_at: '2026-08-01 00:00:00',
    departure_at: '2026-09-12 00:00:00',
    salary_offered: 2490,
    status: 'on_job',
    final_confirmation: {
      id: 5511,
      final_confirmed_at: '2026-07-14 09:30:00',
      caregiver: { id: 21395, first_name: 'Edyta', last_name: 'Testowa' },
    },
    ...overrides,
  };
}

function makeUiApp(overrides: Partial<UIApplication> = {}): UIApplication {
  return {
    id: '7997',
    nurse: mapCaregiverToNurse(makeCg(), OPTS),
    agencyName: 'Pflegeagentur',
    appliedAt: 'vor 2 Std.',
    status: 'new',
    message: '',
    offer: {
      monatlicheKosten: 2400,
      anreisedatum: '01.08.2026',
      abreisedatum: '12.09.2026',
      anreisekosten: 125,
      abreisekosten: 125,
      reisetage: 'Halb',
      feiertagszuschlag: 80,
      kuendigungsfrist: 'Täglich kündbar',
      submittedAt: '10.07.2026',
    },
    ...overrides,
  };
}

const NO_ACCEPTANCES: MamamiaAcceptedApplications = { application_ids: [], rows: [] };

describe('pickFinalConfirmedJob', () => {
  it('fail-soft: alte Proxy-Version ohne job_offers (undefined/null) → null', () => {
    expect(pickFinalConfirmedJob(undefined, 16226)).toBeNull();
    expect(pickFinalConfirmedJob(null, 16226)).toBeNull();
  });

  it('kein Job mit final_confirmation → null', () => {
    expect(pickFinalConfirmedJob([{ id: 16226, status: 'search' }], 16226)).toBeNull();
  });

  it('final_confirmation ohne caregiver zählt NICHT (kein halber Gebucht-Zustand)', () => {
    const job = makeConfirmedJob({
      final_confirmation: { id: 5511, final_confirmed_at: null, caregiver: null },
    });
    expect(pickFinalConfirmedJob([job], 16226)).toBeNull();
  });

  it('bevorzugt den zur Session gehörenden Job (session.job_offer_id)', () => {
    const other = makeConfirmedJob({ id: 999 });
    const sessionJob = makeConfirmedJob({ id: 16226 });
    expect(pickFinalConfirmedJob([other, sessionJob], 16226)).toBe(sessionJob);
  });

  it('fällt auf den ersten bestätigten Job zurück, wenn der Session-Job keine Confirmation hat', () => {
    const unconfirmed = { id: 16226, status: 'search' };
    const confirmed = makeConfirmedJob({ id: 999 });
    expect(pickFinalConfirmedJob([unconfirmed, confirmed], 16226)).toBe(confirmed);
  });
});

describe('synthesizeAcceptedApplicationFromFinalConfirmation', () => {
  it('baut accepted-App mit fc-Präfix-ID (Kollision mit echten Bewerbungs-IDs ausgeschlossen)', () => {
    const r = synthesizeAcceptedApplicationFromFinalConfirmation(makeConfirmedJob(), null, OPTS);
    expect(r).not.toBeNull();
    expect(r!.status).toBe('accepted');
    expect(r!.id).toBe('fc-5511');
  });

  it('Platzhalter-Name aus dem Confirmation-Caregiver, solange getCaregiver nicht geladen ist', () => {
    const r = synthesizeAcceptedApplicationFromFinalConfirmation(makeConfirmedJob(), null, OPTS);
    expect(r!.nurse.name).toBe('Edyta Testowa');
    expect(r!.nurse.caregiverId).toBe(21395);
  });

  it('volles Profil (getCaregiver) gewinnt über den Platzhalter', () => {
    const cg = { ...makeCg({ id: 21395, first_name: 'Edyta', last_name: 'Testowa' }) } as MamamiaCaregiverFull;
    const r = synthesizeAcceptedApplicationFromFinalConfirmation(makeConfirmedJob(), cg, OPTS);
    expect(r!.nurse.name).toBe('Edyta T.');
  });

  it('Konditionen kommen aus dem Job: salary_offered = Monatskosten, Tagessatz = Monat/30', () => {
    const r = synthesizeAcceptedApplicationFromFinalConfirmation(makeConfirmedJob(), null, OPTS);
    expect(r!.offer.monatlicheKosten).toBe(2490);
    expect(r!.offer.feiertagszuschlag).toBe(83); // 2490 / 30
    expect(r!.offer.anreisedatum).toBe('01.08.2026');
    expect(r!.offer.abreisedatum).toBe('12.09.2026');
    expect(r!.offer.submittedAt).toBe('14.07.2026');
  });

  it('fail-soft bei fehlenden Feldern: Daten "—", Kosten 0 (statt Crash/undefined)', () => {
    const r = synthesizeAcceptedApplicationFromFinalConfirmation(
      makeConfirmedJob({
        arrival_at: null,
        departure_at: null,
        salary_offered: null,
        final_confirmation: { id: 5511, caregiver: { id: 21395 } },
      }),
      null,
      OPTS,
    );
    expect(r!.offer.monatlicheKosten).toBe(0);
    expect(r!.offer.feiertagszuschlag).toBe(0);
    expect(r!.offer.anreisedatum).toBe('—');
    expect(r!.offer.abreisedatum).toBe('—');
    expect(r!.nurse.name).toBe('Ihre Pflegekraft');
  });

  it('null ohne caregiver in der Confirmation', () => {
    const r = synthesizeAcceptedApplicationFromFinalConfirmation(
      makeConfirmedJob({ final_confirmation: { id: 5511, caregiver: null } }),
      null,
      OPTS,
    );
    expect(r).toBeNull();
  });
});

describe('applyAcceptedOverlay', () => {
  it('(a) Mamamia-Confirmation OHNE Portal-Annahme → synthetische accepted-App, BookedScreen-Bedingung wahr', () => {
    const prev = [makeUiApp()]; // offene Bewerbung einer ANDEREN Pflegekraft (10053)
    const result = applyAcceptedOverlay(prev, {
      acceptances: NO_ACCEPTANCES,
      confirmedJob: makeConfirmedJob(),
      caregiverProfile: null,
      firstAcceptedCaregiverId: 21395,
      opts: OPTS,
    });
    const acceptedApp = result.find((a) => a.status === 'accepted') ?? null;
    expect(acceptedApp).not.toBeNull(); // exakt die acceptedApp-Derivation der Page
    expect(acceptedApp!.synthetic).toBe(true);
    expect(acceptedApp!.id).toBe('fc-5511');
    // die offene Bewerbung bleibt unangetastet erhalten
    expect(result.filter((a) => a.status === 'new')).toHaveLength(1);
  });

  it('(a) geladenes Caregiver-Profil ersetzt den Platzhalter (gleicher Mechanismus wie Pfad 2)', () => {
    const cg = { ...makeCg({ id: 21395, first_name: 'Edyta', last_name: 'Testowa' }) } as MamamiaCaregiverFull;
    const result = applyAcceptedOverlay([], {
      acceptances: NO_ACCEPTANCES,
      confirmedJob: makeConfirmedJob(),
      caregiverProfile: cg,
      firstAcceptedCaregiverId: 21395,
      opts: OPTS,
    });
    expect(result[0].nurse.name).toBe('Edyta T.');
  });

  it('(b) beides vorhanden → Portal-Annahme hat Vorrang, KEINE Doppel-Synthese', () => {
    // Portal-Annahme für App 7997 (noch in listApplications) + Mamamia-Confirmation
    const prev = [makeUiApp({ id: '7997' })];
    const result = applyAcceptedOverlay(prev, {
      acceptances: { application_ids: [7997], rows: [{ application_id: 7997, caregiver_id: 10053, accepted_at: '2026-07-10T10:00:00Z', contract_snapshot: null }] },
      confirmedJob: makeConfirmedJob(),
      caregiverProfile: null,
      firstAcceptedCaregiverId: 10053,
      opts: OPTS,
    });
    expect(result.filter((a) => a.status === 'accepted')).toHaveLength(1);
    expect(result.find((a) => a.id === 'fc-5511')).toBeUndefined();
    expect(result).toHaveLength(1);
  });

  it('(b) Portal-Annahme mit contract_snapshot-Synthese + Mamamia-Confirmation → nur EINE synthetische App (aus dem Snapshot)', () => {
    const result = applyAcceptedOverlay([], {
      acceptances: {
        application_ids: [9006],
        rows: [{ application_id: 9006, caregiver_id: 21395, accepted_at: '2026-06-11T10:51:25Z', contract_snapshot: null }],
      },
      confirmedJob: makeConfirmedJob(),
      caregiverProfile: null,
      firstAcceptedCaregiverId: 21395,
      opts: OPTS,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('9006'); // Snapshot-Pfad, NICHT fc-5511
    expect(result[0].status).toBe('accepted');
  });

  it('(c) keine Confirmation + keine Portal-Annahme → applications unverändert', () => {
    const prev = [makeUiApp()];
    const result = applyAcceptedOverlay(prev, {
      acceptances: NO_ACCEPTANCES,
      confirmedJob: null,
      caregiverProfile: null,
      firstAcceptedCaregiverId: null,
      opts: OPTS,
    });
    expect(result).toEqual(prev);
  });

  it('Pfad 3 patcht eine noch gelistete Bewerbung derselben Pflegekraft statt zu doppeln', () => {
    // Edge: final_confirmation existiert, aber Mamamia listet die Bewerbung
    // (noch) in listApplications → patchen, keine zweite Karte.
    const sameCg = makeUiApp({
      id: '8001',
      nurse: mapCaregiverToNurse(makeCg({ id: 21395, first_name: 'Edyta', last_name: 'Testowa' }), OPTS),
    });
    const result = applyAcceptedOverlay([sameCg], {
      acceptances: NO_ACCEPTANCES,
      confirmedJob: makeConfirmedJob(),
      caregiverProfile: null,
      firstAcceptedCaregiverId: 21395,
      opts: OPTS,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('8001');
    expect(result[0].status).toBe('accepted');
    expect(result[0].synthetic).toBeUndefined();
  });

  it('Pfad 3 synthetisiert NICHT, wenn schon eine accepted-App da ist (optimistisches Update)', () => {
    const prev = [makeUiApp({ status: 'accepted' })];
    const result = applyAcceptedOverlay(prev, {
      acceptances: NO_ACCEPTANCES,
      confirmedJob: makeConfirmedJob(),
      caregiverProfile: null,
      firstAcceptedCaregiverId: 21395,
      opts: OPTS,
    });
    expect(result).toHaveLength(1);
    expect(result.filter((a) => a.status === 'accepted')).toHaveLength(1);
    expect(result.find((a) => a.id === 'fc-5511')).toBeUndefined();
  });

  it('synthetische Apps werden jeden Lauf verworfen + frisch abgeleitet (Platzhalter-Upgrade)', () => {
    const stale = { ...synthesizeAcceptedApplicationFromFinalConfirmation(makeConfirmedJob(), null, OPTS)!, synthetic: true };
    const cg = { ...makeCg({ id: 21395, first_name: 'Edyta', last_name: 'Testowa' }) } as MamamiaCaregiverFull;
    const result = applyAcceptedOverlay([stale], {
      acceptances: NO_ACCEPTANCES,
      confirmedJob: makeConfirmedJob(),
      caregiverProfile: cg,
      firstAcceptedCaregiverId: 21395,
      opts: OPTS,
    });
    expect(result).toHaveLength(1);
    expect(result[0].nurse.name).toBe('Edyta T.'); // upgegradet, nicht dupliziert
  });
});
