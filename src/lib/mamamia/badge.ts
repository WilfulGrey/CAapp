// Single source of truth für die Erfahrungsstufe einer Pflegekraft.
//
// Basis seit 12.08.2026: AUSSCHLIESSLICH die Zahl UNSERER Einsätze
// (`Caregiver.hp_total_jobs` — abgeschlossene Missionen über mamamia/HP).
// Damit rechnet das Portal dasselbe wie das SA-Portal, das am 03.08. auf
// dieselbe Basis umgestellt hat (mamamia-sadash `lib/caregiverBadge.js`,
// Schwellen 12 / 6 / 2 / 1). Vorher addierte das Portal `care_experience`
// (Jahre) dazu und rechnete gegen 18 / 10 / 4 / 1 — dieselbe Pflegekraft
// bekam in den beiden Systemen unterschiedliche Stufen.
//
// Warum Jahre raus sind: `care_experience` ist Selbstauskunft und sagt
// nichts darüber, wie oft jemand bei UNS gearbeitet hat. Ein Einsatz
// wog dadurch genauso viel wie ein behauptetes Berufsjahr.
//
// EVERYTHING badge-related funnels through here so the consumers can't
// drift apart:
//   1. nurseLevel()          (components/portal/shared.ts)      — UI badge
//   2. rankComparator()      (lib/mamamia/matchingsRanking.ts)  — sort order
//   3. MIN_BADGE_SCORE funnel (pages/CustomerPortalPage.tsx)    — "Bewährt+"
//   4. EXPERIENCE_LEVELS     (components/portal/CustomerNurseModal.tsx)
//                                                        — Erklär-Popup
// Ausserhalb dieses Repos zieht `detect-caregiver-events/index.ts`
// (`mapHpToBadge`) dieselben Schwellen — bei Änderungen mitziehen; die
// Edge Function wird separat deployt.

/** Tier index: 0 ohne Label · 1 Bekannt · 2 Bewährt · 3 Stammkraft · 4 Elite.
 *  Die Wörter selbst leben in `nurseLevel` (components/portal/shared.ts). */
export type BadgeTier = 0 | 1 | 2 | 3 | 4;

/** Parse Mamamia's `care_experience` (a numeric string like "5") into a
 *  non-negative integer year count. Empty/non-string/unparseable → 0.
 *  Zählt seit 12.08. NICHT mehr in die Stufe — die Jahre werden weiterhin
 *  auf der Karte als „N J. Erfahrung" angezeigt. */
export function parseExperienceYears(careExperience: string | null | undefined): number {
  return typeof careExperience === 'string'
    ? Math.max(0, parseInt(careExperience, 10) || 0)
    : 0;
}

/** Score = Anzahl abgeschlossener Einsätze über uns (Nurse-Shape). */
export function badgeScore(assignments: number | null | undefined): number {
  return assignments || 0;
}

/** Score straight from a raw Mamamia caregiver. */
export function caregiverBadgeScore(
  cg: { hp_total_jobs?: number | null },
): number {
  return cg.hp_total_jobs ?? 0;
}

/** Score → tier index. Single place that owns the thresholds.
 *  Identisch zu mamamia-sadash `caregiverBadge.js`. */
export function badgeTier(score: number): BadgeTier {
  if (score >= 12) return 4; // Elite      (SA-Portal: Platin — gleiches Wort)
  if (score >= 6) return 3;  // Stammkraft (SA-Portal: Gold — gleiches Wort)
  if (score >= 2) return 2;  // Bewährt    (SA-Portal: Silber)
  if (score >= 1) return 1;  // Bekannt    (SA-Portal: Bronze)
  return 0;                  // kein Label (SA-Portal: Starter)
}

/** Mindest-Score, den der Matching-Trichter bevorzugt (Tier ≥ 2 = „Bewährt"). */
export const MIN_BADGE_SCORE = 2;
