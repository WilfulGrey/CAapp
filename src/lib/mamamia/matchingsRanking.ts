// Client-side ranking for Mamamia matchings ("Passende Pflegekräfte" section).
//
// Mamamia returns matchings unordered — frontend ranks. The portal caps the
// visible list at 5 pending caregivers, so the comparator decides which 5
// the customer sees first. Hierarchy (top → bottom):
//
//   1. hp_total_jobs > 0  DESC  — caregivers with any prior assignment first.
//                                  Veteran heuristic — customer trust + faster
//                                  ramp-up.
//   2. avatar_retouched.aws_url truthy  DESC  — caregivers with a real photo
//                                                 first. Photo > initials-on-color
//                                                 placeholder for trust.
//   3. available_from ASC  — closest to "now" (null/past = 0ms, future = delta).
//   4. last_contact_at DESC  — recently-active caregivers respond faster.
//   5. hp_total_jobs DESC  — numeric tie-breaker inside the "had jobs" bucket.
//
// Extracted from CustomerPortalPage so the comparator can be unit-tested
// without rendering the page AND so the test + page can't drift.
//
// Defensive handling:
//   - hp_total_jobs null/undefined → treated as 0 (no jobs).
//   - avatar_retouched null OR avatar_retouched.aws_url null/empty → no photo.

import type { MamamiaMatching } from './types';

export function rankComparator(now: Date) {
  const nowMs = now.getTime();

  const availMs = (iso: string | null): number => {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? Math.max(0, t - nowMs) : Infinity;
  };

  const contactMs = (iso: string | null): number => {
    if (!iso) return -Infinity;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : -Infinity;
  };

  const hasJobs = (m: MamamiaMatching): number =>
    (m.caregiver.hp_total_jobs ?? 0) > 0 ? 1 : 0;

  const hasPhoto = (m: MamamiaMatching): number =>
    m.caregiver.avatar_retouched?.aws_url ? 1 : 0;

  return (a: MamamiaMatching, b: MamamiaMatching) => {
    // 1. Prior assignments first.
    const aj = hasJobs(a);
    const bj = hasJobs(b);
    if (aj !== bj) return bj - aj;

    // 2. Photo first (within the same jobs-bucket).
    const ap = hasPhoto(a);
    const bp = hasPhoto(b);
    if (ap !== bp) return bp - ap;

    // 3. available_from closest to "now".
    const av = availMs(a.caregiver.available_from);
    const bv = availMs(b.caregiver.available_from);
    if (av !== bv) return av - bv;

    // 4. Most-recently active.
    const ac = contactMs(a.caregiver.last_contact_at);
    const bc = contactMs(b.caregiver.last_contact_at);
    if (ac !== bc) return bc - ac;

    // 5. Numeric hp_total_jobs DESC (tie-breaker inside "had jobs" bucket).
    const ajn = a.caregiver.hp_total_jobs ?? 0;
    const bjn = b.caregiver.hp_total_jobs ?? 0;
    return bjn - ajn;
  };
}
