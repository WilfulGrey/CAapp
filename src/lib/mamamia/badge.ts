// Single source of truth for the caregiver experience badge
// (Starter / Bronze / Silber / Gold / Platin).
//
// Score = years of experience + completed assignments (equal weighting,
// 1 Einsatz = 1 Jahr). Thresholds last recalibrated 14.06.2026 (#305) after a
// live-pool analysis (144 PKs / 4 Leads): pool-max score was 24, so the old
// Platin threshold (≥26) was unreachable. The current thresholds give a clean
// pyramid (~10 % Platin / ~30 % Gold / ~25 % Silber / ~14 % Bronze / Rest
// Starter).
//
// EVERYTHING badge-related funnels through here so the three consumers can't
// drift apart:
//   1. nurseLevel()          (components/portal/shared.ts)      — UI badge
//   2. rankComparator()      (lib/mamamia/matchingsRanking.ts)  — sort order
//   3. MIN_BADGE_SCORE funnel (pages/CustomerPortalPage.tsx)    — "Silber+" cut

/** Tier index: 0 Starter · 1 Bronze · 2 Silber · 3 Gold · 4 Platin. */
export type BadgeTier = 0 | 1 | 2 | 3 | 4;

/** Parse Mamamia's `care_experience` (a numeric string like "5") into a
 *  non-negative integer year count. Empty/non-string/unparseable → 0. */
export function parseExperienceYears(careExperience: string | null | undefined): number {
  return typeof careExperience === 'string'
    ? Math.max(0, parseInt(careExperience, 10) || 0)
    : 0;
}

/** Combined experience score from already-numeric inputs (Nurse shape). */
export function badgeScore(
  experienceYears: number | null | undefined,
  assignments: number | null | undefined,
): number {
  return (experienceYears || 0) + (assignments || 0);
}

/** Combined experience score straight from a raw Mamamia caregiver
 *  (parses care_experience, adds hp_total_jobs). */
export function caregiverBadgeScore(
  cg: { care_experience?: string | null; hp_total_jobs?: number | null },
): number {
  return parseExperienceYears(cg.care_experience) + (cg.hp_total_jobs ?? 0);
}

/** Score → tier index. Single place that owns the thresholds. */
export function badgeTier(score: number): BadgeTier {
  if (score >= 18) return 4; // Platin
  if (score >= 10) return 3; // Gold
  if (score >= 4) return 2;  // Silber
  if (score >= 1) return 1;  // Bronze
  return 0;                  // Starter
}

/** Minimum score the portal matching funnel prefers (Silber+, i.e. tier ≥ 2). */
export const MIN_BADGE_SCORE = 4;
