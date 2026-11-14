// Client-side ranking of Mamamia matchings — verifies the ordering
// rules used by CustomerPortalPage's `effectiveMatched`. Hierarchy seit
// Registry #166 (14.11.2026, Martin: „die besten mit Foto und viele Jahre
// Erfahrung"), höchste Priorität zuerst:
//
//   1. Foto vorhanden DESC
//   2. Jahre Erfahrung DESC (jahreErfahrung: care_experience, sonst
//      hp_total_days / 365)
//   3. Einsätze bei uns (hp_total_jobs) DESC
//   4. Weiblich DESC
//   5. Alter ≤ 60 DESC
//   6. available_from ASC
//   7. last_contact_at DESC
//
// Der Comparator lebt in src/lib/mamamia/matchingsRanking.ts —
// geteilt zwischen Test + Page, damit sie nicht auseinander driften.

import { describe, it, expect } from 'vitest';
import { rankComparator } from '../../lib/mamamia/matchingsRanking';
import type { MamamiaMatching, MamamiaCaregiverRef } from '../../lib/mamamia/types';

// Default-Ref: female, 45 J. (year_of_birth 1981), 1 Jahr Erfahrung (care_experience='1'),
// 0 Einsätze, Foto vorhanden. So sind alle Defaults „gut" und das jeweilige Test-Feld
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

// ─── PRIMÄRE HIERARCHIE: Foto → Jahre → Einsätze → Weiblich → Alter ─────

describe('matchings ranking — Foto zuerst, dann Jahre, dann Einsätze (Registry #166)', () => {
  it('Foto schlägt Einsätze: 14 Einsätze ohne Foto stehen hinter 1 Einsatz mit Foto', () => {
    const sorted = [
      makeMatch({ id: 1, hp_total_jobs: 14, avatar: null, avatar_retouched: null }),
      makeMatch({ id: 2, hp_total_jobs: 1 }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('Foto schlägt Jahre: 20 Jahre ohne Foto stehen hinter 1 Jahr mit Foto', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '20', avatar: null, avatar_retouched: null }),
      makeMatch({ id: 2, care_experience: '1' }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('Jahre schlagen Einsätze: 15 Jahre ohne Einsatz vor 2 Jahren mit 14 Einsätzen', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '2', hp_total_jobs: 14 }),
      makeMatch({ id: 2, care_experience: '15', hp_total_jobs: 0 }),
      makeMatch({ id: 3, care_experience: '8', hp_total_jobs: 0 }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 3, 1]);
  });

  it('gleiche Jahre → mehr Einsätze zuerst', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '6', hp_total_jobs: 1 }),
      makeMatch({ id: 2, care_experience: '6', hp_total_jobs: 7 }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('Jahre aus hp_total_days zählen, wenn care_experience leer ist — wie auf der Zeile', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '3' }),
      makeMatch({ id: 2, care_experience: null, hp_total_days: 365 * 6 }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });

  it('care_experience „0" fällt NICHT auf die Tage zurück', () => {
    const sorted = [
      makeMatch({ id: 1, care_experience: '0', hp_total_days: 365 * 9 }),
      makeMatch({ id: 2, care_experience: '1' }),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual([2, 1]);
  });
});

describe('matchings ranking — Foto-Quellen', () => {
  it('Foto > kein Foto bei gleichen Jahren', () => {
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

describe('matchings ranking — gender (gleiche Jahre + Foto)', () => {
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

describe('matchings ranking — age ≤ 60 (gleiche Jahre + Foto + Gender)', () => {
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

// ─── TIE-BREAKER: available_from → last_contact_at ────────────────────

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

  it('kein last_contact_at bei beiden → Gleichstand (0, nicht NaN), Reihenfolge bleibt', () => {
    const cmp = rankComparator(NOW);
    const a = makeMatch({ id: 1, last_contact_at: null });
    const b = makeMatch({ id: 2, last_contact_at: null });
    expect(cmp(a, b)).toBe(0);
    expect([a, b].sort(cmp).map(m => m.id)).toEqual([1, 2]);
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
  it('Martins Fall: die mit Foto und den meisten Jahren steht oben, Einsätze entscheiden erst danach', () => {
    const sorted = [
      makeMatch({ id: 'stammkraft-ohne-foto', hp_total_jobs: 14, care_experience: '3', avatar: null, avatar_retouched: null } as never),
      makeMatch({ id: 'neu-1-jahr', hp_total_jobs: 0, care_experience: '1' } as never),
      makeMatch({ id: 'erfahren-15', hp_total_jobs: 0, care_experience: '15' } as never),
      makeMatch({ id: 'bewaehrt-8', hp_total_jobs: 2, care_experience: '8' } as never),
    ].sort(rankComparator(NOW));
    expect(sorted.map(m => m.id)).toEqual(['erfahren-15', 'bewaehrt-8', 'neu-1-jahr', 'stammkraft-ohne-foto']);
  });

  it('Bei gleichen Jahren und Einsätzen: Foto > Gender > Alter', () => {
    // Alle 14 Jahre, 0 Einsätze:
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
