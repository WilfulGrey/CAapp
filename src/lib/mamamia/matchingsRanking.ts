// Client-side ranking for Mamamia matchings ("Passende Pflegekräfte" section).
//
// Mamamia returns matchings unordered — frontend ranks. Das Portal zeigt
// max 5 pending Pflegekräfte (plus zweimal „5 weitere"), daher entscheidet
// diese Reihenfolge welche der Kunde zuerst sieht.
//
// Hierarchie seit Registry #166 (14.11.2026, Martin: „Wir brauchen die besten
// mit Foto und viele Jahre Erfahrung"), jedes Kriterium ist ein Tie-Breaker
// für das nächste:
//
//   1. **Foto vorhanden** DESC (avatar_retouched_promo / avatar_retouched /
//      avatar). Bild > Initialen-Platzhalter.
//   2. **Jahre Erfahrung** DESC — dieselbe Zahl wie auf der Zeile
//      (`jahreErfahrung`: care_experience, sonst hp_total_days / 365).
//   3. **Einsätze bei uns** (hp_total_jobs) DESC. Bis Registry #166 stand die
//      Stufe aus den Einsätzen an erster Stelle und die Jahre zählten gar
//      nicht — im Prod-Pool (4.731 Kräfte, 14.11.) haben fast alle 0 Einsätze,
//      also entschied faktisch die Reihenfolge von Mamamia.
//   4. **Weiblich zuerst** DESC. User-Spec: Mehrheit der Kundschaft
//      bevorzugt weibliche Pflegekräfte; explizite Wahl nicht gefragt.
//   5. **Alter ≤ 60** DESC (year_of_birth ≥ nowYear-60). Unbekanntes
//      Geburtsjahr wird wie >60 behandelt. Der harte Filter „über 60 nur,
//      wenn sonst keine fünf da sind" bleibt in CustomerPortalPage.
//   6. available_from ASC (Sofort = top).
//   7. last_contact_at DESC.
//
// Defensive handling:
//   - hp_total_jobs / care_experience / hp_total_days null/undefined → 0.
//   - Avatar mit null aws_url → kein Foto.
//   - year_of_birth null → wie >60 behandelt.
//
// Die Angebotsmail sortiert mit einer Kopie (`send-scheduled-emails/empfehlung.ts`
// `rangVergleich`) — Änderungen dort mitziehen.

import type { MamamiaMatching } from './types';
import { jahreErfahrung } from './badge';

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

  const hasPhoto = (m: MamamiaMatching): number =>
    (m.caregiver.avatar_retouched_promo?.aws_url || m.caregiver.avatar_retouched?.aws_url || m.caregiver.avatar?.aws_url) ? 1 : 0;

  const isFemale = (m: MamamiaMatching): number =>
    m.caregiver.gender === 'female' ? 1 : 0;

  const isYoung = (m: MamamiaMatching): number => {
    const yob = m.caregiver.year_of_birth;
    if (!yob) return 0; // unbekanntes Alter → defensiv wie >60
    return (nowYear - yob) <= 60 ? 1 : 0;
  };

  return (a: MamamiaMatching, b: MamamiaMatching) => {
    // 1. Foto vorhanden.
    const ap = hasPhoto(a);
    const bp = hasPhoto(b);
    if (ap !== bp) return bp - ap;

    // 2. Jahre Erfahrung.
    const aj = jahreErfahrung(a.caregiver);
    const bj = jahreErfahrung(b.caregiver);
    if (aj !== bj) return bj - aj;

    // 3. Einsätze bei uns.
    const ae = a.caregiver.hp_total_jobs ?? 0;
    const be = b.caregiver.hp_total_jobs ?? 0;
    if (ae !== be) return be - ae;

    // 4. Weiblich zuerst.
    const af = isFemale(a);
    const bf = isFemale(b);
    if (af !== bf) return bf - af;

    // 5. Alter ≤ 60.
    const ay = isYoung(a);
    const by = isYoung(b);
    if (ay !== by) return by - ay;

    // 6. available_from closest to "now".
    const av = availMs(a.caregiver.available_from);
    const bv = availMs(b.caregiver.available_from);
    if (av !== bv) return av - bv;

    // 7. Most-recently active.
    const ac = contactMs(a.caregiver.last_contact_at);
    const bc = contactMs(b.caregiver.last_contact_at);
    if (ac !== bc) return bc - ac; // beide -Infinity ergäbe NaN
    return 0;
  };
}
