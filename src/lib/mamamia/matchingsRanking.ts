// Client-side ranking for Mamamia matchings ("Passende Pflegekräfte" section).
//
// Mamamia returns matchings unordered — frontend ranks. Das Portal zeigt
// max 5 pending Pflegekräfte, daher entscheidet diese Reihenfolge welche
// fünf der Kunde zuerst sieht.
//
// Hierarchie (von oben nach unten, jedes Kriterium ist ein Tie-Breaker
// für das nächste):
//
//   1. **Badge-Tier DESC** (Platin > Gold > Silber > Bronze > Starter).
//      User-Spec 14.06.: „vor allem sortiert nach Badge (bestes zuerst —
//      also Platin am besten alle)". Score = experienceYears + assignments,
//      gleiche Berechnung wie nurseLevel() im UI.
//   2. **Foto vorhanden** DESC (avatar_retouched.aws_url OR avatar.aws_url).
//      Bild > Initialen-Platzhalter — wirkt vertrauenswürdiger.
//   3. **Weiblich zuerst** DESC. User-Spec: Mehrheit der Kundschaft
//      bevorzugt weibliche Pflegekräfte; explizite Wahl nicht gefragt.
//   4. **Alter ≤ 60** DESC (year_of_birth ≥ nowYear-60). User-Spec
//      „nicht älter als 60 Jahre" — als Soft-Ranking (nicht Hart-Filter),
//      damit bei kleinem Pool trotzdem etwas sichtbar bleibt. Unbekanntes
//      Geburtsjahr wird wie >60 behandelt (defensiv, damit die mit
//      bekanntem jungem Alter klar oben sind).
//   5. available_from ASC (Sofort = top).
//   6. last_contact_at DESC.
//   7. hp_total_jobs DESC (numerischer Tie-Breaker).
//
// Defensive handling:
//   - hp_total_jobs / care_experience null/undefined → 0.
//   - Avatar mit null aws_url → kein Foto.
//   - year_of_birth null → wie >60 behandelt.

import type { MamamiaMatching } from './types';

// Badge-Tier: identisch mit nurseLevel() im UI (shared.ts), aber als
// numerischer Score statt Label. Höher = besser.
function badgeTierScore(experienceYears: number, assignments: number): number {
  const score = (experienceYears || 0) + (assignments || 0);
  // Schwellen 1:1 mit nurseLevel() in shared.ts. Live-Pool-Analyse 14.06.
  // ergab Pool-Max Score=24, alte Platin-Schwelle (≥26) war unerreichbar.
  // Neue Schwellen: ~10 % Platin / ~30 % Gold / ~25 % Silber / ~14 % Bronze.
  if (score >= 18) return 4; // Platin
  if (score >= 10) return 3; // Gold
  if (score >= 4)  return 2; // Silber
  if (score >= 1)  return 1; // Bronze
  return 0;                  // Starter
}

export function rankComparator(now: Date) {
  const nowMs = now.getTime();
  const nowYear = now.getFullYear();

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

  const badge = (m: MamamiaMatching): number => {
    const cg = m.caregiver;
    // care_experience ist im Mamamia-Schema ein numerischer String (z.B. "5").
    const exp = typeof cg.care_experience === 'string'
      ? Math.max(0, parseInt(cg.care_experience, 10) || 0)
      : 0;
    return badgeTierScore(exp, cg.hp_total_jobs ?? 0);
  };

  const hasPhoto = (m: MamamiaMatching): number =>
    (m.caregiver.avatar_retouched?.aws_url || m.caregiver.avatar?.aws_url) ? 1 : 0;

  const isFemale = (m: MamamiaMatching): number =>
    m.caregiver.gender === 'female' ? 1 : 0;

  const isYoung = (m: MamamiaMatching): number => {
    const yob = m.caregiver.year_of_birth;
    if (!yob) return 0; // unbekanntes Alter → defensiv wie >60
    return (nowYear - yob) <= 60 ? 1 : 0;
  };

  return (a: MamamiaMatching, b: MamamiaMatching) => {
    // 1. Badge-Tier (Platin > Gold > Silber > Bronze > Starter).
    const ba = badge(a);
    const bb = badge(b);
    if (ba !== bb) return bb - ba;

    // 2. Foto vorhanden.
    const ap = hasPhoto(a);
    const bp = hasPhoto(b);
    if (ap !== bp) return bp - ap;

    // 3. Weiblich zuerst.
    const af = isFemale(a);
    const bf = isFemale(b);
    if (af !== bf) return bf - af;

    // 4. Alter ≤ 60.
    const ay = isYoung(a);
    const by = isYoung(b);
    if (ay !== by) return by - ay;

    // 5. available_from closest to "now".
    const av = availMs(a.caregiver.available_from);
    const bv = availMs(b.caregiver.available_from);
    if (av !== bv) return av - bv;

    // 6. Most-recently active.
    const ac = contactMs(a.caregiver.last_contact_at);
    const bc = contactMs(b.caregiver.last_contact_at);
    if (ac !== bc) return bc - ac;

    // 7. Numeric hp_total_jobs DESC.
    const ajn = a.caregiver.hp_total_jobs ?? 0;
    const bjn = b.caregiver.hp_total_jobs ?? 0;
    return bjn - ajn;
  };
}
