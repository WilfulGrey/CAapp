import { describe, it, expect } from 'vitest';
import {
  parseExperienceYears,
  badgeScore,
  caregiverBadgeScore,
  badgeTier,
  MIN_BADGE_SCORE,
} from '../../lib/mamamia/badge';
import { nurseLevel } from '../../components/portal/shared';

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

describe('badgeScore — nur Einsätze (seit 12.08.2026)', () => {
  it('ist die Zahl der Einsätze', () => {
    expect(badgeScore(4)).toBe(4);
  });
  it('null/undefined → 0', () => {
    expect(badgeScore(null)).toBe(0);
    expect(badgeScore(undefined)).toBe(0);
  });
});

describe('caregiverBadgeScore (raw caregiver)', () => {
  it('liest hp_total_jobs', () => {
    expect(caregiverBadgeScore({ hp_total_jobs: 7 })).toBe(7);
  });
  it('fehlend/null → 0', () => {
    expect(caregiverBadgeScore({ hp_total_jobs: null })).toBe(0);
    expect(caregiverBadgeScore({})).toBe(0);
  });
  it('care_experience zählt NICHT mehr mit', () => {
    // Vor dem 12.08. war das 6 + 4 = 10. Jahre sind Selbstauskunft und
    // sagen nichts über Einsätze bei uns.
    expect(caregiverBadgeScore({ care_experience: '6', hp_total_jobs: 4 } as {
      care_experience?: string | null; hp_total_jobs?: number | null;
    })).toBe(4);
  });
});

describe('badgeTier — Schwellen wie im SA-Portal (12/6/2/1)', () => {
  it('kein Label: 0', () => {
    expect(badgeTier(0)).toBe(0);
  });
  it('Bekannt: genau 1', () => {
    expect(badgeTier(1)).toBe(1);
  });
  it('Bewährt: 2..5', () => {
    expect(badgeTier(2)).toBe(2);
    expect(badgeTier(5)).toBe(2);
  });
  it('Stammkraft: 6..11', () => {
    expect(badgeTier(6)).toBe(3);
    expect(badgeTier(11)).toBe(3);
  });
  it('Elite: ≥12', () => {
    expect(badgeTier(12)).toBe(4);
    expect(badgeTier(35)).toBe(4);
  });
});

describe('MIN_BADGE_SCORE', () => {
  it('ist die „Bewährt"-Schwelle (2)', () => {
    expect(MIN_BADGE_SCORE).toBe(2);
    expect(badgeTier(MIN_BADGE_SCORE)).toBe(2);
  });
});

describe('nurseLevel — Labels folgen den Schwellen', () => {
  it('Einsätze bestimmen das Label, Jahre nicht', () => {
    // 12 Jahre Erfahrung, aber erst 1 Einsatz über uns → „Bekannt".
    expect(nurseLevel(12, 1).label).toBe('Bekannt');
    expect(nurseLevel(0, 2).label).toBe('Bewährt');
    expect(nurseLevel(0, 6).label).toBe('Stammkraft');
    expect(nurseLevel(0, 12).label).toBe('Elite');
  });
  it('„Stammkraft" liegt auf derselben Stufe wie im SA-Portal (Gold, 6–11)', () => {
    // Verhindert, dass Berater und Kunde bei demselben Wort verschiedene
    // Stufen meinen — mamamia-sadash caregiverBadge.js: gold min 6.
    expect(nurseLevel(0, 5).label).not.toBe('Stammkraft');
    expect(nurseLevel(0, 6).label).toBe('Stammkraft');
    expect(nurseLevel(0, 11).label).toBe('Stammkraft');
    expect(nurseLevel(0, 12).label).not.toBe('Stammkraft');
  });
  it('ohne Einsatz: Ersatz-Wort statt Leere — je nachdem, ob Jahre da sind', () => {
    // Keine fünfte Stufe der Leiter, sondern eine andere Achse: Die Stufen
    // messen Einsätze BEI UNS, „Berufserfahren" spricht über die (selbst
    // ausgewiesenen) Jahre davor, „Neu dabei" behauptet gar nichts.
    expect(nurseLevel(20, 0).label).toBe('Berufserfahren');
    expect(nurseLevel(1, 0).label).toBe('Berufserfahren');
    expect(nurseLevel(0, 0).label).toBe('Neu dabei');
  });
});
