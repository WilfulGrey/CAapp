import { describe, it, expect } from 'vitest';
import {
  parseExperienceYears,
  badgeScore,
  caregiverBadgeScore,
  badgeTier,
  MIN_BADGE_SCORE,
} from '../../lib/mamamia/badge';

describe('parseExperienceYears', () => {
  it('parses a numeric string', () => {
    expect(parseExperienceYears('5')).toBe(5);
    expect(parseExperienceYears('12')).toBe(12);
  });
  it('non-string / empty / unparseable → 0', () => {
    expect(parseExperienceYears('')).toBe(0);
    expect(parseExperienceYears('abc')).toBe(0);
    expect(parseExperienceYears(null)).toBe(0);
    expect(parseExperienceYears(undefined)).toBe(0);
  });
  it('clamps negative to 0', () => {
    expect(parseExperienceYears('-3')).toBe(0);
  });
});

describe('badgeScore (numeric inputs)', () => {
  it('sums years + assignments', () => {
    expect(badgeScore(6, 4)).toBe(10);
  });
  it('null/undefined → 0 component', () => {
    expect(badgeScore(null, 3)).toBe(3);
    expect(badgeScore(5, undefined)).toBe(5);
    expect(badgeScore(null, null)).toBe(0);
  });
});

describe('caregiverBadgeScore (raw caregiver)', () => {
  it('parses care_experience + hp_total_jobs', () => {
    expect(caregiverBadgeScore({ care_experience: '6', hp_total_jobs: 4 })).toBe(10);
  });
  it('missing/non-string fields → treated as 0', () => {
    expect(caregiverBadgeScore({ care_experience: null, hp_total_jobs: null })).toBe(0);
    expect(caregiverBadgeScore({ care_experience: '3' })).toBe(3);
    expect(caregiverBadgeScore({ hp_total_jobs: 7 })).toBe(7);
  });
});

describe('badgeTier (thresholds — single source of truth)', () => {
  it('Starter: 0', () => {
    expect(badgeTier(0)).toBe(0);
  });
  it('Bronze: 1..3', () => {
    expect(badgeTier(1)).toBe(1);
    expect(badgeTier(3)).toBe(1);
  });
  it('Silber: 4..9', () => {
    expect(badgeTier(4)).toBe(2);
    expect(badgeTier(9)).toBe(2);
  });
  it('Gold: 10..17', () => {
    expect(badgeTier(10)).toBe(3);
    expect(badgeTier(17)).toBe(3);
  });
  it('Platin: ≥18', () => {
    expect(badgeTier(18)).toBe(4);
    expect(badgeTier(26)).toBe(4);
  });
});

describe('MIN_BADGE_SCORE', () => {
  it('is the Silber threshold (4)', () => {
    expect(MIN_BADGE_SCORE).toBe(4);
    expect(badgeTier(MIN_BADGE_SCORE)).toBe(2); // Silber
  });
});
