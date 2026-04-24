import { describe, it, expect } from 'vitest';
import {
  mapCaregiverToNurse,
  formatMamamiaDate,
  jobOfferArrivalDisplay,
  customerDisplayName,
} from '../../lib/mamamia/mappers';
import type { MamamiaCaregiverRef } from '../../lib/mamamia/types';

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
