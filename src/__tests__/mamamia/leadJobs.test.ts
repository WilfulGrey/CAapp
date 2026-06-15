import { describe, it, expect } from 'vitest';
import {
  deriveJobDisplayStatus,
  sortLeadJobs,
  formatJobZeitraum,
  formatJobDate,
} from '../../lib/mamamia/leadJobs';
import type { LeadJobRow } from '../../lib/mamamia/types';

const NOW = new Date('2026-06-15T12:00:00'); // → todayIso 2026-06-15

function job(p: Partial<LeadJobRow>): LeadJobRow {
  return {
    id: p.id ?? 'j1',
    mamamia_job_offer_id: p.mamamia_job_offer_id ?? 1,
    status: p.status ?? 'geplant',
    anreise: p.anreise ?? null,
    abreise: p.abreise ?? null,
    position: p.position ?? 0,
    pflegekraft: p.pflegekraft ?? null,
    bewerbungen: p.bewerbungen ?? null,
  };
}

describe('deriveJobDisplayStatus', () => {
  it('gebucht with today inside [anreise, abreise) → laufend', () => {
    expect(deriveJobDisplayStatus(job({ status: 'gebucht', anreise: '2026-06-01', abreise: '2026-07-01' }), NOW))
      .toBe('laufend');
  });

  it('gebucht with anreise in the future → gebucht (not yet laufend)', () => {
    expect(deriveJobDisplayStatus(job({ status: 'gebucht', anreise: '2026-09-01', abreise: '2026-10-01' }), NOW))
      .toBe('gebucht');
  });

  it('gebucht with abreise in the past → stays gebucht (only laufend is derived)', () => {
    expect(deriveJobDisplayStatus(job({ status: 'gebucht', anreise: '2026-01-01', abreise: '2026-02-01' }), NOW))
      .toBe('gebucht');
  });

  it('gebucht on the abreise day is NOT laufend (window is half-open)', () => {
    expect(deriveJobDisplayStatus(job({ status: 'gebucht', anreise: '2026-06-01', abreise: '2026-06-15' }), NOW))
      .toBe('gebucht');
  });

  it('gebucht on the anreise day IS laufend (window includes start)', () => {
    expect(deriveJobDisplayStatus(job({ status: 'gebucht', anreise: '2026-06-15', abreise: '2026-06-20' }), NOW))
      .toBe('laufend');
  });

  it('gebucht with null dates → gebucht', () => {
    expect(deriveJobDisplayStatus(job({ status: 'gebucht', anreise: null, abreise: null }), NOW)).toBe('gebucht');
  });

  it('geplant / abgeschlossen / storniert pass through unchanged', () => {
    expect(deriveJobDisplayStatus(job({ status: 'geplant' }), NOW)).toBe('geplant');
    expect(deriveJobDisplayStatus(job({ status: 'abgeschlossen' }), NOW)).toBe('abgeschlossen');
    expect(deriveJobDisplayStatus(job({ status: 'storniert' }), NOW)).toBe('storniert');
  });

  it('unknown stored status → geplant (safe neutral bucket)', () => {
    expect(deriveJobDisplayStatus(job({ status: 'wartet_auf_irgendwas' }), NOW)).toBe('geplant');
  });
});

describe('sortLeadJobs', () => {
  it('orders laufend → gebucht → geplant → abgeschlossen → storniert, then anreise asc', () => {
    const jobs = [
      job({ id: 'storno', status: 'storniert', anreise: '2026-01-01' }),
      job({ id: 'done', status: 'abgeschlossen', anreise: '2026-05-01' }),
      job({ id: 'plan-late', status: 'geplant', anreise: '2026-12-01' }),
      job({ id: 'plan-early', status: 'geplant', anreise: '2026-08-01' }),
      job({ id: 'now', status: 'gebucht', anreise: '2026-06-01', abreise: '2026-07-01' }), // laufend
      job({ id: 'booked', status: 'gebucht', anreise: '2026-09-01', abreise: '2026-10-01' }),
    ];
    expect(sortLeadJobs(jobs, NOW).map((j) => j.id)).toEqual([
      'now', 'booked', 'plan-early', 'plan-late', 'done', 'storno',
    ]);
  });

  it('null anreise sorts last within the same status', () => {
    const jobs = [
      job({ id: 'no-date', status: 'geplant', anreise: null }),
      job({ id: 'dated', status: 'geplant', anreise: '2026-08-01' }),
    ];
    expect(sortLeadJobs(jobs, NOW).map((j) => j.id)).toEqual(['dated', 'no-date']);
  });

  it('does not mutate the input array', () => {
    const jobs = [job({ id: 'b', anreise: '2026-09-01' }), job({ id: 'a', anreise: '2026-08-01' })];
    const before = jobs.map((j) => j.id);
    sortLeadJobs(jobs, NOW);
    expect(jobs.map((j) => j.id)).toEqual(before);
  });
});

describe('formatJobDate / formatJobZeitraum', () => {
  it('formats ISO date → dd.mm.yyyy', () => {
    expect(formatJobDate('2026-07-01')).toBe('01.07.2026');
    expect(formatJobDate('2026-07-01T00:00:00')).toBe('01.07.2026');
  });
  it('null → empty string', () => {
    expect(formatJobDate(null)).toBe('');
  });
  it('zeitraum: both dates → range', () => {
    expect(formatJobZeitraum(job({ anreise: '2026-07-01', abreise: '2026-08-12' }))).toBe('01.07.2026 – 12.08.2026');
  });
  it('zeitraum: only anreise → "ab"', () => {
    expect(formatJobZeitraum(job({ anreise: '2026-07-01', abreise: null }))).toBe('ab 01.07.2026');
  });
  it('zeitraum: no dates → "Zeitraum offen"', () => {
    expect(formatJobZeitraum(job({ anreise: null, abreise: null }))).toBe('Zeitraum offen');
  });
});
