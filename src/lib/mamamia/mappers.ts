// Mappers Mamamia GraphQL → existing UI types.
// Adapted from Salead's caregiver-filtering-pipeline.md §5.

import type { Nurse, Assignment } from '../../types';
import type {
  MamamiaCaregiverRef,
  MamamiaCaregiverFull,
  MamamiaJobOffer,
  MamamiaCustomer,
} from './types';

// Deterministic 20-color palette for avatar fallback (Salead pattern).
const COLORS = [
  '#9B1FA1', '#5B4FCF', '#1FA185', '#D4548A', '#C4692A',
  '#3D8B37', '#7B2D8B', '#2D6A8B', '#8B3D2D', '#4A6FA5',
  '#6B2D8B', '#8B6D1F', '#D43D1F', '#4AA1A5', '#B44A8B',
  '#1F5FAB', '#8B7D5B', '#AB1F4A', '#4FA5A1', '#D48B1F',
];

const GERMANY_SKILL_LEVELS: Record<string, { level: string; bars: number }> = {
  level_0: { level: 'A1', bars: 1 },
  level_1: { level: 'A1-A2', bars: 2 },
  level_2: { level: 'A2-B1', bars: 3 },
  level_3: { level: 'B1-B2', bars: 4 },
  level_4: { level: 'B2-C1', bars: 5 },
};

function computeAge(birthDate: string | null, yearOfBirth: number | null, nowYear: number): number {
  if (birthDate) {
    const d = new Date(birthDate);
    const now = new Date(`${nowYear}-01-01`);
    const age = now.getFullYear() - d.getFullYear();
    return age > 0 ? age : 0;
  }
  if (typeof yearOfBirth === 'number' && yearOfBirth > 1900) {
    return nowYear - yearOfBirth;
  }
  return 0;
}

function formatDisplayName(first: string | null, last: string | null): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f && l) return `${f} ${l[0]}.`;
  return f || l || 'Anonym';
}

function formatAvailability(availableFromIso: string | null, nowIso: string): string {
  if (!availableFromIso) return 'Sofort';
  const from = new Date(availableFromIso);
  const now = new Date(nowIso);
  const diffDays = Math.floor((from.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'Sofort';
  if (diffDays <= 14) {
    const months = ['Jan', 'Feb', 'März', 'April', 'Mai', 'Juni', 'Juli', 'Aug', 'Sept', 'Okt', 'Nov', 'Dez'];
    return `ab ${from.getDate()}. ${months[from.getMonth()]}`;
  }
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `ab ${from.getDate()}. ${months[from.getMonth()]}`;
}

function isLiveNow(isActiveUser: boolean | null, lastLoginIso: string | null, nowIso: string): boolean {
  if (!isActiveUser || !lastLoginIso) return false;
  const last = new Date(lastLoginIso);
  const now = new Date(nowIso);
  const diffMin = (now.getTime() - last.getTime()) / (60 * 1000);
  return diffMin <= 30;
}

function formatAddedTime(lastContactIso: string | null, nowIso: string): string {
  if (!lastContactIso) return 'kürzlich';
  const last = new Date(lastContactIso);
  const now = new Date(nowIso);
  const diffMs = now.getTime() - last.getTime();
  const mins = diffMs / (60 * 1000);
  const hrs = mins / 60;
  const days = hrs / 24;
  const weeks = days / 7;
  if (mins < 5) return 'gerade eben';
  if (hrs < 1) return `vor ${Math.floor(mins)} Min.`;
  if (hrs < 24) return `vor ${Math.floor(hrs)} Std.`;
  if (days < 2) return 'gestern';
  if (days < 7) return `vor ${Math.floor(days)} Tagen`;
  return `vor ${Math.floor(weeks)} Wo.`;
}

export function mapCaregiverToNurse(
  cg: MamamiaCaregiverRef | MamamiaCaregiverFull,
  opts: { nowIso: string; nowYear: number },
): Nurse {
  const skill = GERMANY_SKILL_LEVELS[cg.germany_skill ?? ''] ?? { level: '—', bars: 0 };
  const age = computeAge(cg.birth_date, cg.year_of_birth, opts.nowYear);
  const experienceYears = typeof cg.care_experience === 'string' && cg.care_experience.length > 0
    ? cg.care_experience
    : cg.hp_total_days
      ? String(Math.max(1, Math.floor(cg.hp_total_days / 365)))
      : '';
  const experience = experienceYears ? `${experienceYears} J. Erfahrung` : '—';

  const avgWeeks = cg.hp_avg_mission_days
    ? Number((Math.abs(cg.hp_avg_mission_days) / 7).toFixed(1))
    : 0;
  // UI currently stores avgDurationMonths — convert weeks→months (~4.3 weeks/month).
  const avgMonths = avgWeeks ? Number((avgWeeks / 4.3).toFixed(1)) : 0;

  const detailedAssignments: Assignment[] = [];
  if ('hp_recent_assignments' in cg && cg.hp_recent_assignments) {
    const todayIso = opts.nowIso.slice(0, 10);
    for (const a of cg.hp_recent_assignments) {
      if (!a.arrival_date || !a.departure_date) continue;
      if (a.status !== 'finish') continue;
      if (a.departure_date.slice(0, 10) >= todayIso) continue;
      detailedAssignments.push({
        startDate: a.arrival_date,
        endDate: a.departure_date,
        postalCode: a.postal_code ?? '—',
        city: a.city ?? '—',
        patientCount: 1,
        mobility: '—',
      });
      if (detailedAssignments.length >= 3) break;
    }
  }

  // Real Caregiver profile fields — only present when GET_CAREGIVER ran
  // (i.e. cg has the full type, not the matching ref). Anything missing
  // stays undefined; the modal renders "—" for absent fields rather than
  // making something up (CLAUDE.md §1).
  let profile: Nurse['profile'];
  if ('hobbies' in cg || 'personalities' in cg || 'nationality' in cg) {
    const full = cg as MamamiaCaregiverFull;
    profile = {
      nationality: full.nationality?.nationality ?? undefined,
      yearOfBirth: full.year_of_birth ?? undefined,
      weight: full.weight ?? undefined,
      height: full.height ?? undefined,
      maritalStatus: full.marital_status ?? undefined,
      drivingLicense: full.driving_license != null
        ? full.driving_license !== 'no'
        : undefined,
      isNurse: full.is_nurse ?? undefined,
      smoking: full.smoking ?? undefined,
      education: full.education ?? undefined,
      qualifications: full.qualifications ?? undefined,
      motivation: full.motivation ?? undefined,
      aboutDe: full.about_de ?? undefined,
      furtherHobbies: full.further_hobbies ?? undefined,
      hobbies: (full.hobbies ?? [])
        .map(h => h.hobby).filter((x): x is string => Boolean(x)),
      personalities: (full.personalities ?? [])
        .map(p => p.personality).filter((x): x is string => Boolean(x)),
      acceptedMobilities: (full.mobilities ?? [])
        .map(m => m.mobility).filter((x): x is string => Boolean(x)),
      otherLanguages: (full.languagables ?? [])
        .filter(l => l.language?.name && l.language.name.toLowerCase() !== 'german')
        .map(l => ({ name: l.language!.name!, level: l.level ?? '—' })),
    };
  }

  return {
    caregiverId: cg.id,
    name: formatDisplayName(cg.first_name, cg.last_name),
    age,
    experience,
    availability: formatAvailability(cg.available_from, opts.nowIso),
    availableSoon: (() => {
      if (!cg.available_from) return true;
      const diff = (new Date(cg.available_from).getTime() - new Date(opts.nowIso).getTime()) / (24 * 60 * 60 * 1000);
      return diff <= 14;
    })(),
    language: skill,
    color: COLORS[cg.id % COLORS.length],
    addedTime: formatAddedTime(cg.last_contact_at, opts.nowIso),
    isLive: isLiveNow(cg.is_active_user, cg.last_login_at, opts.nowIso),
    gender: cg.gender ?? 'female',
    image: cg.avatar_retouched?.aws_url ?? undefined,
    history: cg.hp_total_jobs
      ? {
        assignments: cg.hp_total_jobs,
        avgDurationMonths: avgMonths,
      }
      : undefined,
    detailedAssignments: detailedAssignments.length > 0 ? detailedAssignments : undefined,
    profile,
  };
}

// ─── MamamiaApplication / MamamiaMatching → UI Application/Nurse ─────────

import type { MamamiaApplication, MamamiaMatching } from './types';

// UI's Application type (duplicated here for decoupling from CustomerPortalPage).
// NOTE: must match shape expected by AppCard / AngebotPruefenModal.
export interface UIApplication {
  id: string;
  nurse: Nurse;
  agencyName: string;
  appliedAt: string;
  status: 'new' | 'accepted' | 'declined';
  message: string;
  offer: {
    monatlicheKosten: number;
    anreisedatum: string;
    abreisedatum: string;
    anreisekosten: number;
    abreisekosten: number;
    reisetage: string;
    feiertagszuschlag: number;
    kuendigungsfrist: string;
    submittedAt: string;
  };
  isInvited?: boolean;
}

function fmtRelativeTime(iso: string | null, nowIso: string): string {
  if (!iso) return 'kürzlich';
  const diff = new Date(nowIso).getTime() - new Date(iso).getTime();
  const mins = diff / 60000;
  const hrs = mins / 60;
  if (mins < 60) return `vor ${Math.max(1, Math.floor(mins))} Min.`;
  if (hrs < 24) return `vor ${Math.floor(hrs)} Std.`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'gestern';
  return `vor ${days} Tagen`;
}

export function mapApplicationToUI(
  app: MamamiaApplication,
  nurseOverride: Nurse | null,
  opts: { nowIso: string; nowYear: number },
): UIApplication {
  const nurse = nurseOverride ?? mapCaregiverToNurse(app.caregiver, opts);
  return {
    id: String(app.id),
    nurse,
    // AnonymousApplication strips agency identity — show generic label.
    agencyName: 'Pflegeagentur',
    appliedAt: fmtRelativeTime(app.active_until_at, opts.nowIso),
    status: 'new',
    message: app.message ?? '',
    offer: {
      monatlicheKosten: app.salary ?? 0,
      anreisedatum: formatMamamiaDate(app.arrival_at) ?? '—',
      abreisedatum: formatMamamiaDate(app.departure_at) ?? '—',
      anreisekosten: app.arrival_fee ?? 0,
      abreisekosten: app.departure_fee ?? 0,
      reisetage: app.holiday_surcharge ? 'Halb' : 'Halb',
      feiertagszuschlag: app.holiday_surcharge ?? 0,
      kuendigungsfrist: 'Täglich kündbar',
      submittedAt: formatMamamiaDate(app.active_until_at) ?? '—',
    },
  };
}

export function mapMatchingToNurse(
  m: MamamiaMatching,
  opts: { nowIso: string; nowYear: number },
): Nurse {
  return mapCaregiverToNurse(m.caregiver, opts);
}

// ─── Presentational helpers for JobOffer/Customer display ────────────────

export function formatMamamiaDate(iso: string | null): string | null {
  if (!iso) return null;
  // Mamamia returns "2026-05-01 00:00:00" or ISO — take the date part.
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function jobOfferArrivalDisplay(jo: MamamiaJobOffer | null): string | null {
  return formatMamamiaDate(jo?.arrival_at ?? null);
}

export function customerDisplayName(cust: MamamiaCustomer | null): string | null {
  if (!cust) return null;
  const f = (cust.first_name ?? '').trim();
  const l = (cust.last_name ?? '').trim();
  const full = [f, l].filter(Boolean).join(' ');
  return full || cust.email || null;
}
