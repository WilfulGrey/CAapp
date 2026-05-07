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

// ─── Mamamia → German translation maps ───────────────────────────────────
// Mamamia returns enum keys (e.g. "high_school") and English-language
// labels (e.g. "Polish", "cooking", "Wheelchair") on Caregiver lookup
// tables. The portal UI is German, so we translate at the mapper boundary
// and fall back to the original string when an unknown value appears.

// Caregiver.nationality.nationality — English country adjectives in prod
// (verified beta sample 2026-04-29). Common cases hand-translated; rare
// values fall through unchanged so we never surprise-mistranslate.
const NATIONALITY_DE: Record<string, string> = {
  Polish: 'Polnisch',
  Bulgarian: 'Bulgarisch',
  Romanian: 'Rumänisch',
  Slovak: 'Slowakisch',
  Czech: 'Tschechisch',
  Hungarian: 'Ungarisch',
  Ukrainian: 'Ukrainisch',
  Russian: 'Russisch',
  Lithuanian: 'Litauisch',
  Latvian: 'Lettisch',
  Estonian: 'Estnisch',
  German: 'Deutsch',
  Croatian: 'Kroatisch',
  Slovenian: 'Slowenisch',
  Serbian: 'Serbisch',
  'Bosnian and Herzegovinian': 'Bosnisch',
  Belarusian: 'Belarussisch',
  Moldovan: 'Moldauisch',
  Albanian: 'Albanisch',
  Macedonian: 'Mazedonisch',
};

// Caregiver.education enum — verified beta values: high_school, studies,
// (also seen in prod sweep): primary_school, vocational, higher.
const EDUCATION_DE: Record<string, string> = {
  primary_school: 'Grundschule',
  high_school: 'Gymnasium / Abitur',
  vocational: 'Berufsausbildung',
  studies: 'Studium',
  higher: 'Hochschule',
};

// Caregiver.driving_license enum — verified beta:
//   no, yes (legacy), yes_automatic, yes_manual, yes_automatic_manual.
// Modal renders "Ja (Automatik / Schaltung / Beide)" so the gearbox info
// from the same enum field surfaces (Mamamia stores it inline, not in
// driving_license_gearbox which is a separate field for caregiver-wish).
const DRIVING_GEARBOX_DE: Record<string, string> = {
  yes_automatic: 'Automatik',
  yes_manual: 'Schaltung',
  yes_automatic_manual: 'Automatik & Schaltung',
};

// Caregiver.mobilities[].mobility — English labels on Mamamia.
// "Akzeptierte Mobilität" chips show what mobility levels CG accepts.
const MOBILITY_DE: Record<string, string> = {
  Mobile: 'Mobil',
  'Walking stick': 'Gehstock',
  Walker: 'Rollator',
  Wheelchair: 'Rollstuhl',
  Bedridden: 'Bettlägerig',
};

// Caregiver.personalities[].personality — values from beta sample.
// Mapping covers the prod-most-common; unknown values pass through.
const PERSONALITY_DE: Record<string, string> = {
  friendly: 'freundlich',
  patient: 'geduldig',
  calm: 'ruhig',
  energetic: 'energiegeladen',
  empathetic: 'einfühlsam',
  reliable: 'zuverlässig',
  cheerful: 'fröhlich',
  serious: 'ernst',
  honest: 'ehrlich',
  responsible: 'verantwortungsvoll',
  open: 'offen',
  caring: 'fürsorglich',
  attentive: 'aufmerksam',
  organized: 'organisiert',
  flexible: 'flexibel',
  hardworking: 'fleißig',
  confident: 'selbstbewusst',
  dynamic: 'dynamisch',
  independent: 'selbstständig',
  warm: 'herzlich',
};

// Caregiver.hobbies[].hobby — values from beta sample.
const HOBBY_DE: Record<string, string> = {
  cooking: 'Kochen',
  reading: 'Lesen',
  gardening: 'Gärtnern',
  music: 'Musik',
  cinema: 'Kino',
  travel: 'Reisen',
  family: 'Familie',
  sport: 'Sport',
  walking: 'Spazierengehen',
  swimming: 'Schwimmen',
  painting: 'Malen',
  knitting: 'Stricken',
  sewing: 'Nähen',
  baking: 'Backen',
  dancing: 'Tanzen',
  yoga: 'Yoga',
  pets: 'Tiere',
  crossword: 'Kreuzworträtsel',
  handicraft: 'Handarbeit',
  photography: 'Fotografie',
};

// Caregiver.marital_status — English enum from beta sample.
const MARITAL_DE: Record<string, string> = {
  single: 'Ledig',
  married: 'Verheiratet',
  divorced: 'Geschieden',
  widowed: 'Verwitwet',
  separated: 'Getrennt lebend',
  partnership: 'In Partnerschaft',
};

function translate(map: Record<string, string>, value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return map[value] ?? value;
}

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
    // weight/height come as buckets ("81-90", "171-180") — append units so
    // the user reads "81-90 kg" / "171-180 cm" instead of bare numbers.
    const weightLabel = full.weight ? `${full.weight} kg` : undefined;
    const heightLabel = full.height ? `${full.height} cm` : undefined;
    profile = {
      nationality: translate(NATIONALITY_DE, full.nationality?.nationality),
      yearOfBirth: full.year_of_birth ?? undefined,
      weight: weightLabel,
      height: heightLabel,
      maritalStatus: translate(MARITAL_DE, full.marital_status),
      // driving_license enum: no | yes | yes_automatic | yes_manual |
      // yes_automatic_manual. Anything starting with "yes" → has license.
      drivingLicense: full.driving_license != null
        ? full.driving_license !== 'no'
        : undefined,
      drivingLicenseGearbox: full.driving_license
        ? DRIVING_GEARBOX_DE[full.driving_license]
        : undefined,
      isNurse: full.is_nurse ?? undefined,
      smoking: full.smoking ?? undefined,
      education: translate(EDUCATION_DE, full.education),
      qualifications: full.qualifications ?? undefined,
      motivation: full.motivation ?? undefined,
      aboutDe: full.about_de ?? undefined,
      furtherHobbies: full.further_hobbies ?? undefined,
      hobbies: (full.hobbies ?? [])
        .map(h => h.hobby)
        .filter((x): x is string => Boolean(x))
        .map(h => translate(HOBBY_DE, h) ?? h),
      personalities: (full.personalities ?? [])
        .map(p => p.personality)
        .filter((x): x is string => Boolean(x))
        .map(p => translate(PERSONALITY_DE, p) ?? p),
      acceptedMobilities: (full.mobilities ?? [])
        .map(m => m.mobility)
        .filter((x): x is string => Boolean(x))
        .map(m => translate(MOBILITY_DE, m) ?? m),
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

// ─── Reverse mapper: Mamamia Customer → PatientForm ────────────────────────
//
// The wizard needs to seed itself from the *real* Mamamia state so it
// stays in sync with what the agency / panel admin / earlier saves
// actually persisted. Without this, the only prefill source is the
// stage-A formularDaten — which can lag by hours, days, or be wrong
// outright if anyone edited the customer outside the portal.
//
// Returns Partial<PatientForm> — the AngebotCard merges this with
// localStorage drafts and stage-A prefill in order of priority:
//   draft (user mid-edit)  >  Mamamia state  >  formularDaten prefill
//
// Each helper returns '' when the upstream value is missing/unmapable
// so the form's CustomSelect renders the "Bitte wählen" placeholder
// instead of a misleading default.

const MAMAMIA_GENDER_TO_FORM: Record<string, string> = {
  male: 'Männlich',
  female: 'Weiblich',
};

const MAMAMIA_MOBILITY_TO_FORM: Record<number, string> = {
  1: 'Selbstständig mobil',
  2: 'Am Gehstock',
  3: 'Rollatorfähig',
  4: 'Rollstuhlfähig',
  5: 'Bettlägerig',
};

const MAMAMIA_NIGHT_OPS_TO_FORM: Record<string, string> = {
  no: 'Nein',
  up_to_1_time: 'Bis zu 1 Mal',
  '1_2_times': '1–2 Mal',
  more_than_2: 'Mehr als 2',
  occasionally: 'Bis zu 1 Mal', // legacy bucket — closest match
};

const MAMAMIA_ACCOMMODATION_TO_FORM: Record<string, string> = {
  single_family_house: 'Einfamilienhaus',
  apartment: 'Wohnung in Mehrfamilienhaus',
  other: 'Andere',
};

const MAMAMIA_CAREGIVER_ACCOMMODATED_TO_FORM: Record<string, string> = {
  room_premises: 'Zimmer in den Räumlichkeiten',
  area_premises: 'Gesamter Bereich',
  room_other_premises: 'Zimmer extern',
  area_other_premises: 'Bereich extern',
};

const MAMAMIA_URBANIZATION_TO_FORM: Record<number, string> = {
  1: 'Dorf/Land',
  2: 'Kleinstadt',
  3: 'Großstadt',
};

function mamamiaIncontinenceToForm(
  inc: boolean | null | undefined,
  feces: boolean | null | undefined,
  urine: boolean | null | undefined,
): string {
  if (inc === false || (inc == null && feces == null && urine == null)) {
    return inc === false ? 'Nein' : '';
  }
  if (feces && urine) return 'Beides';
  if (feces) return 'Stuhlinkontinenz';
  if (urine) return 'Harninkontinenz';
  if (inc === true) return 'Beides'; // unspecified flavour — best-fit
  return '';
}

function mamamiaDementiaToForm(
  dementia: 'yes' | 'no' | null | undefined,
  description: string | null | undefined,
): string {
  if (dementia === 'no') return 'Nein';
  if (dementia !== 'yes') return '';
  // dementia=yes — try to recover gradation from description text.
  // Our backend onboard writes "Demenzdiagnose: leichtgradig|mittelgradig|schwer."
  const desc = (description ?? '').toLowerCase();
  if (desc.includes('leichtgradig')) return 'Leichtgradig';
  if (desc.includes('mittelgradig')) return 'Mittelgradig';
  if (desc.includes('schwer')) return 'Schwer';
  // dementia=yes but no recognisable gradation → default to middle bucket.
  return 'Mittelgradig';
}

function mamamiaPetsToForm(
  pets: string | null | undefined,
  isDog: boolean | null | undefined,
  isCat: boolean | null | undefined,
  isOther: boolean | null | undefined,
): string {
  if (pets === 'no') return 'Keine';
  if (pets === 'yes') {
    if (isDog) return 'Hund';
    if (isCat) return 'Katze';
    if (isOther) return 'Andere';
    return 'Andere'; // fallback when pets=yes but no flag set
  }
  // 'no_information' / null / unknown → empty so user picks consciously.
  return '';
}

// weight/height in Mamamia store as bare buckets ("61-70" / "161-170").
// Form expects suffix ("61-70 kg" / "161-170 cm").
//
// Bug #13 (2026-05-07): pre-refactor the onboard injected DEFAULT_WEIGHT /
// DEFAULT_HEIGHT and we used pair-detection sentinel suppression to hide
// them. After Bug #13 onboard ships nothing for weight/height — Mamamia
// returns null until patient form save. No sentinel needed: null → ''.
function mamamiaWeightToForm(w: string | null | undefined): string {
  if (!w) return '';
  return w.endsWith('kg') ? w : `${w} kg`;
}
function mamamiaHeightToForm(h: string | null | undefined): string {
  if (!h) return '';
  return h.endsWith('cm') ? h : `${h} cm`;
}

// Mamamia customer_caregiver_wish.germany_skill enum (verified prod 2026-04-28):
//   level_0  → "A1"  (1% active)
//   level_1  → "A2"  (1% — manual panel pick)
//   level_2  → "A1-A2" (22% — calculator "grundlegend")
//   level_3  → "B1-B2" (50% — calculator "kommunikativ")
//   level_4  → "C1+"  (8% — calculator "sehr-gut")
//   not_important → "Egal"
// Bug #13g: AngebotCard step 4 displayed hardcoded "mind. B1" — replace
// with this helper to read real value from mmCustomer.
export function germanySkillLabel(level: string | null | undefined): string {
  if (!level) return '';
  if (level === 'level_0') return 'A1';
  if (level === 'level_1') return 'A2';
  if (level === 'level_2') return 'mind. A2';
  if (level === 'level_3') return 'mind. B1';
  if (level === 'level_4') return 'mind. C1';
  if (level === 'not_important') return 'Egal';
  return '';
}

function mamamiaWishGenderToForm(g: string | null | undefined): string {
  if (g === 'male') return 'Männlich';
  if (g === 'female') return 'Weiblich';
  if (g === 'not_important') return 'Egal';
  return '';
}

// rauchen form is binary Ja/Nein. Mamamia wish.smoking has 4 values —
// collapse 'yes' / 'yes_outside' / 'not_important' to 'Ja' (caregiver
// allowed to smoke), 'no' to 'Nein'.
function mamamiaWishSmokingToForm(s: string | null | undefined): string {
  if (s === 'no') return 'Nein';
  if (s === 'yes' || s === 'yes_outside' || s === 'not_important') return 'Ja';
  return '';
}

export interface PatientFormPrefill {
  anzahl?: '1' | '2';
  geschlecht?: string; geburtsjahr?: string; pflegegrad?: string;
  gewicht?: string; groesse?: string;
  mobilitaet?: string; heben?: string; demenz?: string;
  inkontinenz?: string; nacht?: string;
  p2_geschlecht?: string; p2_geburtsjahr?: string; p2_pflegegrad?: string;
  p2_gewicht?: string; p2_groesse?: string;
  p2_mobilitaet?: string; p2_heben?: string; p2_demenz?: string;
  p2_inkontinenz?: string; p2_nacht?: string;
  plz?: string; ort?: string;
  wohnungstyp?: string; urbanisierung?: string; unterbringung?: string;
  familieNahe?: string; pflegedienst?: string; internet?: string;
  // Pflegedienst follow-up — parsed back from
  // customer.day_care_facility_description so the form re-opens with the
  // user's previously-saved frequency + tasks.
  pflegedienstHaeufigkeit?: string;
  pflegedienstAufgaben?: string;
  tiere?: string;
  wunschGeschlecht?: string; rauchen?: string;
  // Customer-side gearbox preference, restored from
  // customer_caregiver_wish.driving_license_gearbox so the form re-opens
  // with the user's previously-saved Automatik / Schaltung pick.
  wunschGetriebe?: string;
  aufgaben?: string; sonstigeWuensche?: string;
}

function mamamiaPatientToForm(
  p: NonNullable<MamamiaCustomer['patients']>[number],
): {
  geschlecht?: string; geburtsjahr?: string; pflegegrad?: string;
  gewicht?: string; groesse?: string;
  mobilitaet?: string; heben?: string; demenz?: string;
  inkontinenz?: string; nacht?: string;
} {
  // Pflegegrad: Mamamia natywnie wspiera "Keine" jako `care_level: null`
  // (zweryfikowane live na Customer 7658 po ręcznym ustawieniu "brak"
  // w panelu, 2026-05-07). Mapowanie 1:1 — null → "Kein/e",
  // 1-5 → "Pflegegrad N", undefined/0 → "" (no prefill).
  let pflegegrad = '';
  if (p.care_level === null) pflegegrad = 'Kein/e';
  else if (typeof p.care_level === 'number' && p.care_level >= 1 && p.care_level <= 5) {
    pflegegrad = `Pflegegrad ${p.care_level}`;
  }

  return {
    geschlecht: p.gender ? (MAMAMIA_GENDER_TO_FORM[p.gender] ?? '') : '',
    geburtsjahr: p.year_of_birth ? String(p.year_of_birth) : '',
    pflegegrad,
    gewicht: mamamiaWeightToForm(p.weight),
    groesse: mamamiaHeightToForm(p.height),
    mobilitaet: p.mobility_id ? (MAMAMIA_MOBILITY_TO_FORM[p.mobility_id] ?? '') : '',
    heben: p.lift_id === 1 ? 'Ja' : p.lift_id === 2 ? 'Nein' : '',
    demenz: mamamiaDementiaToForm(p.dementia, p.dementia_description),
    inkontinenz: mamamiaIncontinenceToForm(
      p.incontinence, p.incontinence_feces, p.incontinence_urine,
    ),
    nacht: p.night_operations
      ? (MAMAMIA_NIGHT_OPS_TO_FORM[p.night_operations] ?? '')
      : '',
  };
}

export function mapMamamiaCustomerToPatientForm(
  cust: MamamiaCustomer | null,
): PatientFormPrefill {
  if (!cust) return {};
  const out: PatientFormPrefill = {};

  // Bug #13: onboard ships nothing for patient.gender / weight / height /
  // dementia / incontinence_* / smoking / wish.smoking / wish.tasks /
  // wish.shopping / wish.driving_license_gearbox. Mamamia returns null
  // for these until patient form save (UpdateCustomer); reverse mapper
  // emits '' naturally. Pre-Bug-#13 we needed sentinel-suppression for
  // weight/height pair, patientGenderKnown opt, and gearbox-automatic —
  // all gone now (see git history of this file ca. 2026-05-07).
  //
  // Schema-level Mamamia defaults (NOT from us, but UI-visible if surfaced):
  //   - pets="no_information" → already mapped to '' by mamamiaPetsToForm
  //   - caregiver_accommodated="room_premises" → suppressed below when
  //     Customer.status='draft' (= patient form not saved yet).

  const isDraft = cust.status === 'draft';

  // anzahl from patients.length (1 or 2). 0/missing → leave undefined so
  // the formularDaten prefill or default '1' wins.
  const patients = cust.patients ?? [];
  if (patients.length >= 1) out.anzahl = patients.length >= 2 ? '2' : '1';

  // Patient 1
  if (patients[0]) {
    const p1 = mamamiaPatientToForm(patients[0]);
    Object.assign(out, p1);
  }
  // Patient 2 — same fields, p2_* keys.
  if (patients[1]) {
    const p2 = mamamiaPatientToForm(patients[1]);
    out.p2_geschlecht = p2.geschlecht;
    out.p2_geburtsjahr = p2.geburtsjahr;
    out.p2_pflegegrad = p2.pflegegrad;
    out.p2_gewicht = p2.gewicht;
    out.p2_groesse = p2.groesse;
    out.p2_mobilitaet = p2.mobilitaet;
    out.p2_heben = p2.heben;
    out.p2_demenz = p2.demenz;
    out.p2_inkontinenz = p2.inkontinenz;
    out.p2_nacht = p2.nacht;
  }

  // Customer-level enums
  if (cust.accommodation) {
    out.wohnungstyp = MAMAMIA_ACCOMMODATION_TO_FORM[cust.accommodation] ?? '';
  }
  if (cust.urbanization_id != null) {
    out.urbanisierung = MAMAMIA_URBANIZATION_TO_FORM[cust.urbanization_id] ?? '';
  }
  if (cust.caregiver_accommodated) {
    // Mamamia auto-defaults to "room_premises" at schema level when
    // StoreCustomer ships without caregiver_accommodated (Bug #13:
    // we now ship without it). Suppress when Customer is still 'draft'
    // (= patient form not saved yet) so the user picks consciously.
    // Same trade-off as Bug #11 weight/height: a user who genuinely picks
    // "Zimmer in den Räumlichkeiten" sees empty on first reload — but
    // post-save Customer flips to 'active' and the value surfaces.
    const isSchemaDefault = isDraft && cust.caregiver_accommodated === 'room_premises';
    if (!isSchemaDefault) {
      out.unterbringung =
        MAMAMIA_CAREGIVER_ACCOMMODATED_TO_FORM[cust.caregiver_accommodated] ?? '';
    }
  }
  if (cust.has_family_near_by === 'yes') out.familieNahe = 'Ja';
  else if (cust.has_family_near_by === 'no') out.familieNahe = 'Nein';
  // 'not_important' has no form equivalent → leave empty.

  if (cust.internet === 'yes') out.internet = 'Ja';
  else if (cust.internet === 'no') out.internet = 'Nein';

  if (cust.day_care_facility === 'yes') out.pflegedienst = 'Ja';
  else if (cust.day_care_facility === 'no') out.pflegedienst = 'Nein';

  // Pflegedienst frequency+tasks live on `job_description` (the writable
  // free-text field), formatted as `Pflegedienst: {frequency}: {tasks}`.
  // Other parts of job_description ("Diagnosen: …") are separated by ` | `.
  // Pull out just the Pflegedienst segment and split on the first colon
  // to restore frequency + tasks selectors.
  if (cust.day_care_facility === 'yes' && cust.job_description) {
    const segments = cust.job_description.split(' | ');
    const pflegedienstSeg = segments.find(s => s.startsWith('Pflegedienst: '));
    if (pflegedienstSeg) {
      const inner = pflegedienstSeg.slice('Pflegedienst: '.length);
      const colonIdx = inner.indexOf(':');
      if (colonIdx >= 0) {
        out.pflegedienstHaeufigkeit = inner.slice(0, colonIdx).trim();
        out.pflegedienstAufgaben = inner.slice(colonIdx + 1).trim();
      } else {
        // No inner colon — frequency-only or tasks-only legacy entry. Surface
        // on Häufigkeit so user data isn't lost.
        out.pflegedienstHaeufigkeit = inner.trim();
      }
    }
  }

  out.tiere = mamamiaPetsToForm(
    cust.pets, cust.is_pet_dog, cust.is_pet_cat, cust.is_pet_other,
  );

  // Address from the patient_contact contract row (street_number /
  // zip_code / city are filled by Primundus stage-B form).
  const patientContract = cust.customer_contracts?.find(
    c => c.contact_type === 'patient_contact',
  );
  if (patientContract?.zip_code) out.plz = patientContract.zip_code;
  if (patientContract?.city) out.ort = patientContract.city;

  // Caregiver-wish (preferences).
  const wish = cust.customer_caregiver_wish;
  if (wish) {
    out.wunschGeschlecht = mamamiaWishGenderToForm(wish.gender);
    out.rauchen = mamamiaWishSmokingToForm(wish.smoking);
    out.aufgaben = wish.tasks ?? '';
    out.sonstigeWuensche = wish.other_wishes ?? '';
    // Bug #13: onboard ships nothing for driving_license_gearbox; Mamamia
    // returns null until patient form save explicitly writes 'automatic'
    // / 'manual'. Reverse mapper emits the user's saved pick — no
    // suppression needed (pre-Bug-#13 we suppressed 'automatic' as the
    // onboard default, that's gone now).
    if (wish.driving_license_gearbox === 'manual') {
      out.wunschGetriebe = 'Schaltung';
    } else if (wish.driving_license_gearbox === 'automatic') {
      out.wunschGetriebe = 'Automatik';
    }
  }

  return out;
}
