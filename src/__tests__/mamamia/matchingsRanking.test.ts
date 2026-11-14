// Client-side ranking of Mamamia matchings — verifies the ordering
// rules used by CustomerPortalPage's `effectiveMatched`. Hierarchy
// (höchste Priorität zuerst):
//
//   1. Badge-Tier DESC (Elite > Stammkraft > Bewährt > Bekannt
//      > kein Label) — seit 12.08.2026 allein aus hp_total_jobs
//   2. Foto vorhanden DESC
//   3. Weiblich DESC
//   4. Alter ≤ 60 DESC
//   5. available_from ASC
//   6. last_contact_at DESC
//   7. hp_total_jobs DESC (numerischer Tie-Breaker)
//
// Der Comparator lebt in src/lib/mamamia/matchingsRanking.ts —
// geteilt zwischen Test + Page, damit sie nicht auseinander driften.

import { describe, it, expect } from 'vitest';
import { rankComparator } from '../../lib/mamamia/matchingsRanking';
import type { MamamiaMatching, MamamiaCaregiverRef } from '../../lib/mamamia/types';

// Default-Ref: female, 45 J. (year_of_birth 1981), Bronze (care_experience='1'),
// Foto vorhanden. So sind alle Defaults „gut" und das jeweilige Test-Feld
// ist klar isoliert.
function makeRef(o: Partial<MamamiaCaregiverRef>): MamamiaCaregiverRef {
  return {
    id: 1,
    first_name: 'X', last_name: 'Y',
    gender: 'female',
    year_of_birth: 1981,  // → 45 J. bei NOW=2026
    birth_date: null,
    germany_skill: 'level_3',
    care_experience: '1',
    available_from: null, last_contact_at: null, last_login_at: null,
    is_active_user: true,
    hp_total_jobs: 0, hp_total_days: 0, hp_avg_mission_days: 0,
    avatar: { aws_url: 'https://x/p.jpg' },
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

// ─── PRIMÄRE HIERARCHIE: Badge → Foto → Weiblich → Alter ─────────────

describe('matchings ranking — badge tier first', () => {
  it('Elite (≥12 Einsätze) ranks above Stammkraft (≥6)', () => {
    const sorted = [
      makeMatch({ id: 1, hp_total_jobs: 7 }),
      makeMatch({ id: 2, hp_total_jobs: 14 }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('Stammkraft > Bewährt > Bekannt > kein Label', () => {
    const sorted = [
      makeMatch({ id: 1, hp_total_jobs: 0 }),  // kein Label
      makeMatch({ id: 2, hp_total_jobs: 1 }),  // Bekannt
      makeMatch({ id: 3, hp_total_jobs: 3 }),  // Bewährt
      makeMatch({ id: 4, hp_total_jobs: 8 }),  // Stammkraft
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([4, 3, 2, 1]);
  });

  it('care_experience zählt NICHT mehr in den Score (seit 12.08.2026)', () => {
    // 30 behauptete Berufsjahre, aber kein Einsatz über uns — schlägt
    // die Kraft mit 2 echten Einsätzen NICHT.
    const sorted = [
      makeMatch({ id: 1, care_experience: '30', hp_total_jobs: 0 }),
      makeMatch({ id: 2, care_experience: '0', hp_total_jobs: 2 }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('Badge beats Foto: Stammkraft ohne Foto > Bekannt mit Foto', () => {
    const sorted = [
      makeMatch({ id: 1, hp_total_jobs: 1, avatar: { aws_url: 'p' }, avatar_retouched: { aws_url: 'p' } }),
      makeMatch({ id: 2, hp_total_jobs: 14, avatar: null, avatar_retouched: null }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });
});

describe('matchings ranking — photo (within same badge)', () => {
  it('Foto > kein Foto bei gleichem Badge', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '6', avatar: null, avatar_retouched: null }),
      makeMatch({ id: 2, care_experience: '6', avatar: { aws_url: 'https://x/p.jpg' }, avatar_retouched: null }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('avatar_retouched zählt als Foto-Quelle', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '6', avatar: null, avatar_retouched: null }),
      makeMatch({ id: 2, care_experience: '6', avatar: null, avatar_retouched: { aws_url: 'https://x/p.jpg' } }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('avatar_retouched mit null aws_url = kein Foto', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '6', avatar: null, avatar_retouched: { aws_url: null } }),
      makeMatch({ id: 2, care_experience: '6', avatar: { aws_url: 'https://x/p.jpg' } }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });
});

describe('matchings ranking — gender (within same badge + photo)', () => {
  it('weiblich > männlich', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '6', gender: 'male' }),
      makeMatch({ id: 2, care_experience: '6', gender: 'female' }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('weiblich > null/unknown gender', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '6', gender: null }),
      makeMatch({ id: 2, care_experience: '6', gender: 'female' }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });
});

describe('matchings ranking — age ≤ 60 (within badge + photo + gender)', () => {
  it('jung (45) > alt (65) — NOW=2026', () => {
    // 1981 → 45 J. (≤60); 1961 → 65 J. (>60)
    const sorted = [
      makeMatch({ id: 1, care_experience: '6', year_of_birth: 1961 }),
      makeMatch({ id: 2, care_experience: '6', year_of_birth: 1981 }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('grenzfall genau 60 zählt noch als ≤60', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '6', year_of_birth: 1965 }), // 61 J. → >60
      makeMatch({ id: 2, care_experience: '6', year_of_birth: 1966 }), // 60 J. → ≤60
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('unbekanntes Geburtsjahr → wie >60 (defensiv)', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '6', year_of_birth: null }),
      makeMatch({ id: 2, care_experience: '6', year_of_birth: 1981 }), // 45 J.
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });
});

// ─── TIE-BREAKER: available_from → last_contact_at → hp_total_jobs ────

describe('matchings ranking — tie-breakers (all primary keys equal)', () => {
  it('available_from null („Sofort") > future', () => {
    const sorted = [
      makeMatch({ id: 1, available_from: '2026-06-01T00:00:00Z' }),
      makeMatch({ id: 2, available_from: null }),
      makeMatch({ id: 3, available_from: '2026-05-15T00:00:00Z' }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 3, 1]);
  });

  it('past available_from clamps to 0 ≡ „Sofort"', () => {
    const sorted = [
      makeMatch({ id: 1, available_from: '2026-01-01T00:00:00Z', last_contact_at: '2025-12-01T00:00:00Z' }),
      makeMatch({ id: 2, available_from: null, last_contact_at: '2026-04-28T00:00:00Z' }),
    ].sort(rankComparator(NOW));
    // Both available 0; #2 has more recent contact → first.
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

  it('full tie → hp_total_jobs DESC als allerletztes Kriterium', () => {
    // Alle ID-Felder gleich auf badge/photo/gender/age/avail/contact —
    // unterscheiden sich nur in hp_total_jobs. Aber Achtung: hp_total_jobs
    // beeinflusst auch Badge-Score! Daher gleich-balanciert über
    // care_experience.
    const sorted = [
      makeMatch({ id: 1, care_experience: '5', hp_total_jobs: 0 }),  // Score 5 = Silber
      makeMatch({ id: 2, care_experience: '5', hp_total_jobs: 0 }),  // Score 5 = Silber
    ].sort(rankComparator(NOW));
    // Beide gleich → stable sort behält Original-Reihenfolge.
    expect(sorted.map(m => m.id)).toEqual([1, 2]);
  });
});

describe('matchings ranking — stable sort on full tie', () => {
  it('alles gleich → Original-Reihenfolge bleibt', () => {
    const items = [
      makeMatch({ id: 1 }),
      makeMatch({ id: 2 }),
      makeMatch({ id: 3 }),
    ];
    const sorted = items.slice().sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([1, 2, 3]);
  });
});

// ─── ZUSAMMENSPIEL ───────────────────────────────────────────────────

describe('matchings ranking — combined scenarios', () => {
  it('Hierarchy respected: badge dominiert alle anderen', () => {
    const sorted = [
      // Bekannt, weiblich, jung, mit Foto — gut auf 2-4, aber nur 1 Einsatz
      makeMatch({ id: 'low-badge', hp_total_jobs: 1, gender: 'female', year_of_birth: 1990, avatar: { aws_url: 'p' } } as never),
      // Stammkraft, männlich, alt, ohne Foto — schlecht auf 2-4, aber 14 Einsätze
      makeMatch({ id: 'stammkraft', hp_total_jobs: 14, gender: 'male', year_of_birth: 1955, avatar: null, avatar_retouched: null } as never),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual(['stammkraft', 'low-badge']);
  });

  it('Bei gleichem Badge: Foto > Gender > Alter', () => {
    // Alle Gold (care_experience=14, hp_total_jobs=0):
    //   A: kein Foto, female, jung
    //   B: Foto, male, jung       → Foto schlägt Gender
    //   C: Foto, female, alt
    //   D: Foto, female, jung     → die Idealkarte
    const sorted = [
      makeMatch({ id: 'A', care_experience: '14', avatar: null, avatar_retouched: null, gender: 'female', year_of_birth: 1990 } as never),
      makeMatch({ id: 'B', care_experience: '14', avatar: { aws_url: 'p' }, gender: 'male', year_of_birth: 1990 } as never),
      makeMatch({ id: 'C', care_experience: '14', avatar: { aws_url: 'p' }, gender: 'female', year_of_birth: 1955 } as never),
      makeMatch({ id: 'D', care_experience: '14', avatar: { aws_url: 'p' }, gender: 'female', year_of_birth: 1990 } as never),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual(['D', 'C', 'B', 'A']);
  });
});
