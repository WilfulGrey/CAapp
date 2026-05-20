// Client-side ranking of Mamamia matchings — verifies the ordering
// rules used by CustomerPortalPage's `effectiveMatched`. Hierarchy:
//   1. hp_total_jobs > 0  DESC  (any prior assignment first)
//   2. avatar_retouched.aws_url truthy  DESC  (photo first)
//   3. available_from ASC  (closest to "now" first; null = Sofort = top)
//   4. last_contact_at DESC (recently-active CGs respond faster)
//   5. hp_total_jobs   DESC numeric (tie-breaker inside "had jobs" bucket)
//
// The comparator lives in src/lib/mamamia/matchingsRanking.ts — shared
// between this test and the page so the two can't drift apart.

import { describe, it, expect } from 'vitest';
import { rankComparator } from '../../lib/mamamia/matchingsRanking';
import type { MamamiaMatching, MamamiaCaregiverRef } from '../../lib/mamamia/types';

function makeRef(o: Partial<MamamiaCaregiverRef>): MamamiaCaregiverRef {
  return {
    id: 1,
    first_name: 'X', last_name: 'Y',
    gender: 'female', year_of_birth: 1980, birth_date: null,
    germany_skill: 'level_3', care_experience: '5',
    available_from: null, last_contact_at: null, last_login_at: null,
    is_active_user: true,
    hp_total_jobs: 0, hp_total_days: 0, hp_avg_mission_days: 0,
    avatar_retouched: null,
    ...o,
  };
}

function makeMatch(o: Partial<MamamiaCaregiverRef> & { id?: number }): MamamiaMatching {
  return {
    id: o.id ?? 1,
    percentage_match: 100,
    is_show: true,
    is_best_matching: true,
    caregiver: makeRef({ id: o.id ?? 1, ...o }),
  };
}

const NOW = new Date('2026-04-29T12:00:00.000Z');

describe('matchings ranking', () => {
  it('available_from null ("Sofort") ranks above future dates', () => {
    const sorted = [
      makeMatch({ id: 1, available_from: '2026-06-01T00:00:00Z' }),
      makeMatch({ id: 2, available_from: null }),
      makeMatch({ id: 3, available_from: '2026-05-15T00:00:00Z' }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 3, 1]);
  });

  it('past available_from ranks equal to "Sofort" — tie broken by contact', () => {
    const sorted = [
      makeMatch({ id: 1, available_from: '2026-01-01T00:00:00Z', last_contact_at: '2025-12-01T00:00:00Z' }),
      makeMatch({ id: 2, available_from: null, last_contact_at: '2026-04-28T00:00:00Z' }),
    ].sort(rankComparator(NOW));
    // Both available_from clamp to 0; #2 has more recent contact → first.
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('availability tie → last_contact_at DESC wins', () => {
    const sorted = [
      makeMatch({ id: 1, available_from: '2026-05-15T00:00:00Z', last_contact_at: '2026-01-01T00:00:00Z' }),
      makeMatch({ id: 2, available_from: '2026-05-15T00:00:00Z', last_contact_at: '2026-04-28T00:00:00Z' }),
      makeMatch({ id: 3, available_from: '2026-05-15T00:00:00Z', last_contact_at: null }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1, 3]);
  });

  it('availability + contact tie → hp_total_jobs DESC wins', () => {
    const sorted = [
      makeMatch({ id: 1, available_from: null, last_contact_at: '2026-04-28T00:00:00Z', hp_total_jobs: 5 }),
      makeMatch({ id: 2, available_from: null, last_contact_at: '2026-04-28T00:00:00Z', hp_total_jobs: 20 }),
      makeMatch({ id: 3, available_from: null, last_contact_at: '2026-04-28T00:00:00Z', hp_total_jobs: 0 }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1, 3]);
  });

  it('full ordering: primary > secondary > tertiary', () => {
    // Build a deliberately scrambled set; expected order is what the rule says.
    const sorted = [
      // mid availability, old contact, many jobs (lose to better contact)
      makeMatch({ id: 'A', available_from: '2026-05-10T00:00:00Z', last_contact_at: '2026-01-01T00:00:00Z', hp_total_jobs: 100 } as never),
      // sofort + recent contact + few jobs (win on availability)
      makeMatch({ id: 'B', available_from: null, last_contact_at: '2026-04-25T00:00:00Z', hp_total_jobs: 1 } as never),
      // sofort + older contact + many jobs (lose to B on contact)
      makeMatch({ id: 'C', available_from: null, last_contact_at: '2026-03-01T00:00:00Z', hp_total_jobs: 50 } as never),
      // mid availability, recent contact, few jobs (beats A on contact)
      makeMatch({ id: 'D', available_from: '2026-05-10T00:00:00Z', last_contact_at: '2026-04-26T00:00:00Z', hp_total_jobs: 2 } as never),
      // far availability — last
      makeMatch({ id: 'E', available_from: '2026-09-01T00:00:00Z', last_contact_at: '2026-04-29T00:00:00Z', hp_total_jobs: 999 } as never),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual(['B', 'C', 'D', 'A', 'E']);
  });

  it('preserves original order on full tie (stable sort)', () => {
    const items = [
      makeMatch({ id: 1, available_from: null, last_contact_at: '2026-04-28T00:00:00Z', hp_total_jobs: 0 }),
      makeMatch({ id: 2, available_from: null, last_contact_at: '2026-04-28T00:00:00Z', hp_total_jobs: 0 }),
      makeMatch({ id: 3, available_from: null, last_contact_at: '2026-04-28T00:00:00Z', hp_total_jobs: 0 }),
    ];
    const sorted = items.slice().sort(rankComparator(NOW));
    // V8 / modern engines guarantee stable sort. Assert original order preserved.
    expect(sorted.map(m => m.id)).toEqual([1, 2, 3]);
  });
});

// ─── New prior-jobs + photo priority rules ───────────────────────────────

describe('matchings ranking — prior-jobs + photo priority', () => {
  it('caregiver with hp_total_jobs > 0 ranks above zero-jobs even if available_from worse', () => {
    const sorted = [
      makeMatch({ id: 1, hp_total_jobs: 0, available_from: null }),            // Sofort, rookie
      makeMatch({ id: 2, hp_total_jobs: 5, available_from: '2026-06-01T00:00:00Z' }), // future, experienced
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('within jobs-bucket: photo ranks above no-photo', () => {
    const sorted = [
      makeMatch({ id: 1, hp_total_jobs: 3, avatar_retouched: null }),
      makeMatch({ id: 2, hp_total_jobs: 3, avatar_retouched: { aws_url: 'https://x/p.jpg' } }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('within zero-jobs bucket: photo still ranks above no-photo', () => {
    const sorted = [
      makeMatch({ id: 1, hp_total_jobs: 0, avatar_retouched: null }),
      makeMatch({ id: 2, hp_total_jobs: 0, avatar_retouched: { aws_url: 'https://x/p.jpg' } }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('within jobs+photo bucket: existing available_from rule applies', () => {
    const sorted = [
      makeMatch({ id: 1, hp_total_jobs: 3, avatar_retouched: { aws_url: 'p' }, available_from: '2026-06-01T00:00:00Z' }),
      makeMatch({ id: 2, hp_total_jobs: 3, avatar_retouched: { aws_url: 'p' }, available_from: null }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('full 4-bucket sort: jobs+photo > jobs only > photo only > neither', () => {
    const sorted = [
      makeMatch({ id: 1, hp_total_jobs: 0, avatar_retouched: null }),                              // neither
      makeMatch({ id: 2, hp_total_jobs: 5, avatar_retouched: null }),                              // jobs only
      makeMatch({ id: 3, hp_total_jobs: 0, avatar_retouched: { aws_url: 'p' } }),                  // photo only
      makeMatch({ id: 4, hp_total_jobs: 5, avatar_retouched: { aws_url: 'p' } }),                  // jobs+photo
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([4, 2, 3, 1]);
  });

  it('avatar_retouched with null aws_url is treated as no-photo', () => {
    const sorted = [
      makeMatch({ id: 1, hp_total_jobs: 3, avatar_retouched: { aws_url: null } }),
      makeMatch({ id: 2, hp_total_jobs: 3, avatar_retouched: { aws_url: 'https://x/p.jpg' } }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('hp_total_jobs null is treated as no-jobs (jobs beats photo)', () => {
    const sorted = [
      // photo but null jobs → second bucket (photo only)
      makeMatch({ id: 1, hp_total_jobs: null as unknown as number, avatar_retouched: { aws_url: 'p' } }),
      // jobs but no photo → first bucket (jobs)
      makeMatch({ id: 2, hp_total_jobs: 1, avatar_retouched: null }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });
});
