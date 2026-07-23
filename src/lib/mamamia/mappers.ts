// Mappers Mamamia GraphQL → existing UI types.
// Adapted from Salead's caregiver-filtering-pipeline.md §5.

import type { Nurse, Assignment } from '../../types';
import type {
  MamamiaCaregiverRef,
  MamamiaCaregiverFull,
  MamamiaJobOffer,
  MamamiaCustomer,
} from './types';
import { STANDARD_NIGHT_OPS_DE } from './patientFormMapper';

// Deterministic 20-color palette for avatar fallback (Salead pattern).
const COLORS = [
  '#9B1FA1', '#5B4FCF', '#1FA185', '#D4548A', '#C4692A',
  '#3D8B37', '#7B2D8B', '#2D6A8B', '#8B3D2D', '#4A6FA5',
  '#6B2D8B', '#8B6D1F', '#D43D1F', '#4AA1A5', '#B44A8B',
  '#1F5FAB', '#8B7D5B', '#AB1F4A', '#4FA5A1', '#D48B1F',
];

// Primundus nutzt im Portal eine vereinfachte 3-Stufen-Skala (Grund / Mittel /
// Gut) statt der 5 GER-Niveaus, weil das für Kunden besser einzuordnen ist.
// Mamamias 5 germany_skill-Stufen werden hier zusammengeführt:
//   A1 / A1-A2          → Grund     (1 Punkt)
//   A2-B1               → Mittel    (2 Punkte)
//   B1-B2 / B2-C1       → Gut       (3 Punkte)
const GERMANY_SKILL_LEVELS: Record<string, { level: string; bars: number }> = {
  level_0: { level: 'Grund',  bars: 1 },
  level_1: { level: 'Grund',  bars: 1 },
  level_2: { level: 'Mittel', bars: 2 },
  level_3: { level: 'Gut',    bars: 3 },
  level_4: { level: 'Gut',    bars: 3 },
};

// Eine 3-Stufen-Bucket-Identifizierung — Single Source of Truth für jeden
// Code-Pfad, der die Mamamia-5-Stufen auf unsere 3 Portal-Stufen reduzieren
// muss (Anzeige, Sortierung, Preis-Aufpreis-Berechnung).
export type GermanySkillBucket = 'grund' | 'mittel' | 'gut';

export function germanySkillBucket(level: string | null | undefined): GermanySkillBucket | null {
  switch (level) {
    case 'level_0':
    case 'level_1':
      return 'grund';
    case 'level_2':
      return 'mittel';
    case 'level_3':
    case 'level_4':
      return 'gut';
    default:
      return null;
  }
}

// Strikte 1:1-Zuordnung des Kostenrechner-Sprachtiers auf die EXAKTE
// Mamamia-germany_skill-Stufe (Preis-Tier-Modell — je Tier genau eine Stufe,
// kein "mind."-Bereich):
//   grundlegend → level_1    kommunikativ → level_2    sehr-gut → level_4
// Quelle der Form-Werte: project 3/components/calculator/MultiStepForm.tsx
// Step 6 ("deutschkenntnisse": grundlegend | kommunikativ | sehr-gut).
// level_0 (A1) und level_3 (B1) entsprechen KEINEM Kostenrechner-Tier — sie
// erreichen das Portal nur über agency-manuelle Jobs (dort ist deutschWish
// null, der Filter also aus). Preise (0/150/450 €/Mo) leben in `pricing_config`
// (hier bewusst nicht dupliziert).
export function requiredGermanyLevelForWish(
  deutschkenntnisse: string | null | undefined,
): string | null {
  const v = (deutschkenntnisse ?? '').toLowerCase().trim();
  if (v === 'grundlegend') return 'level_1';
  if (v === 'kommunikativ') return 'level_2';
  if (v === 'sehr-gut' || v === 'sehr_gut') return 'level_4';
  return null;
}

// Erfüllt die germany_skill einer Pflegekraft den Kostenrechner-Sprachwunsch?
// STRIKT: exakt die Stufe des gewählten Tiers. Ein "kommunikativ"-Kunde soll
// weder eine stärkere level_4-Kraft sehen (im Vertrag plötzlich +450 €/Mo)
// noch eine schwächere level_0/level_3, die nicht zum bezahlten Tier passt.
// Unbekannter Wunsch (null) ODER unbekannte Stufe (null) → anzeigen (nicht auf
// fehlenden Daten wegfiltern).
export function matchesGermanyWish(
  caregiverSkill: string | null | undefined,
  deutschWish: string | null | undefined,
): boolean {
  const required = requiredGermanyLevelForWish(deutschWish);
  if (!required) return true;
  if (!caregiverSkill) return true;
  return caregiverSkill === required;
}

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
// Labels intentionally aligned with patient-form vocabulary so CG profile
// and patient requirement read the same terms (verified Mamamia enum values).
const MOBILITY_DE: Record<string, string> = {
  Mobile: 'Selbstständig mobil',
  'Walking stick': 'Am Gehstock',
  Walker: 'Rollatorfähig',
  Wheelchair: 'Rollstuhlfähig',
  Bedridden: 'Bettlägerig',
};

// Assignment length from start/end dates → human-readable German label.
export function formatAssignmentDuration(arrival: string, departure: string): string {
  const days = Math.max(
    1,
    Math.round((new Date(departure).getTime() - new Date(arrival).getTime()) / 86_400_000),
  );
  if (days < 14) return `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
  if (days < 60) {
    const w = Math.round(days / 7);
    return `${w} ${w === 1 ? 'Woche' : 'Wochen'}`;
  }
  const m = Math.round(days / 30.44);
  return `${m} ${m === 1 ? 'Monat' : 'Monate'}`;
}

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
  // Prod-Werte (2026-06, Live-Stichprobe) — vorher fehlten sie → englisch sichtbar.
  helpful: 'hilfsbereit',
  sympathetic: 'mitfühlend',
  relaxed: 'entspannt',
  sociable: 'gesellig',
  humorous: 'humorvoll',
  tolerant: 'tolerant',
  loving: 'liebevoll',
  punctual: 'pünktlich',
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
  // Prod-Werte (2026-06, Live-Stichprobe) — Mamamia nutzt z. T. andere Keys
  // als das alte Beta-Sample (film_cinema statt cinema, garden statt
  // gardening, sports statt sport) + zusätzliche, die vorher englisch erschienen.
  film_cinema: 'Kino',
  riding_bicycle: 'Radfahren',
  garden: 'Gärtnern',
  hiking: 'Wandern',
  sports: 'Sport',
  board_games: 'Brettspiele',
  video_games: 'Videospiele',
  fishing: 'Angeln',
  singing: 'Singen',
  theater: 'Theater',
  nature: 'Natur',
  animals: 'Tiere',
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

// Unbekannte Enum-Werte wenigstens lesbar machen: Unterstriche → Leerzeichen,
// jedes Wort groß. So erscheint nie ein roher Key wie "riding_bicycle" im
// Portal, falls Mamamia einen neuen Wert einführt, den die Map (noch) nicht hat.
function prettifyEnum(v: string): string {
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function translate(map: Record<string, string>, value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return map[value] ?? prettifyEnum(value);
}

// Sprachniveau (level_0..4) → deutsches Label. Für ANDERE Sprachen als Deutsch
// (z. B. "Polski (level_4)"). Vorher wurde das rohe "level_4" angezeigt.
const LANG_LEVEL_DE: Record<string, string> = {
  level_0: 'Grundkenntnisse',
  level_1: 'Grundkenntnisse',
  level_2: 'Gut',
  level_3: 'Sehr gut',
  level_4: 'Fließend',
};
function translateLangLevel(level: string | null | undefined): string {
  if (!level) return '';
  return LANG_LEVEL_DE[level] ?? prettifyEnum(level);
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

// Reference PDFs live in Caregiver.certificates as File uploads named
// `Referenz_*.pdf` (one PDF can bundle several recommendations). We show
// ONLY the newest matching file, and ONLY when one exists — so the badge
// appears exclusively for caregivers who actually have a reference.
// Returns undefined when there's no match → Nurse.referencePdfUrl stays
// undefined → MatchCard/AppCard/modal render nothing (guarded by &&).
const REFERENCE_FILE_RE = /^Referenz_.*\.pdf$/i;
function pickNewestReferenceUrl(
  cg: MamamiaCaregiverRef | MamamiaCaregiverFull,
): string | undefined {
  const certs = cg.certificates;
  if (!Array.isArray(certs) || certs.length === 0) return undefined;
  const refs = certs.filter(
    (f) => f && f.aws_url && REFERENCE_FILE_RE.test(f.original_name ?? ''),
  );
  if (refs.length === 0) return undefined;
  // Newest by created_at (ISO/date strings sort lexically when same format;
  // missing created_at sorts last so a dated file always wins).
  refs.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  return refs[0].aws_url ?? undefined;
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
    // beta tenant uses 'finish', preprod uses 'finished'/'completed'. Accept
    // any finish-like status or null — date filter below excludes in-progress.
    const completedStatuses = new Set(['finish', 'finished', 'completed', 'done', 'success']);
    for (const a of cg.hp_recent_assignments) {
      if (!a.arrival_date || !a.departure_date) continue;
      if (a.status && !completedStatuses.has(a.status)) continue;
      if (a.departure_date.slice(0, 10) >= todayIso) continue;
      detailedAssignments.push({
        startDate: a.arrival_date,
        endDate: a.departure_date,
        postalCode: a.postal_code ?? '—',
        city: a.city ?? '—',
        patientCount: a.patients_count ?? 1,
        duration: formatAssignmentDuration(a.arrival_date, a.departure_date),
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
      acceptedMobilities: [...new Set(
        (full.mobilities ?? [])
          .map(m => m.mobility)
          .filter((x): x is string => Boolean(x))
          .map(m => translate(MOBILITY_DE, m) ?? m),
      )],
      otherLanguages: (full.languagables ?? [])
        .filter(l => l.language?.name && l.language.name.toLowerCase() !== 'german')
        .map(l => ({ name: l.language!.name!, level: translateLangLevel(l.level) || '—' })),
    };
  }

  // Numeric years (Math.floor of parsed care_experience or hp_total_days/365).
  // Used by nurseLevel badge formula. 0 when unknown.
  const experienceYearsNum = experienceYears ? Math.max(0, parseInt(experienceYears, 10) || 0) : 0;

  return {
    caregiverId: cg.id,
    name: formatDisplayName(cg.first_name, cg.last_name),
    age,
    experience,
    experienceYears: experienceYearsNum,
    availability: formatAvailability(cg.available_from, opts.nowIso),
    availableSoon: (() => {
      if (!cg.available_from) return true;
      const diff = (new Date(cg.available_from).getTime() - new Date(opts.nowIso).getTime()) / (24 * 60 * 60 * 1000);
      return diff <= 14;
    })(),
    language: { ...skill, bucket: germanySkillBucket(cg.germany_skill ?? null) },
    color: COLORS[cg.id % COLORS.length],
    addedTime: formatAddedTime(cg.last_contact_at, opts.nowIso),
    isLive: isLiveNow(cg.is_active_user, cg.last_login_at, opts.nowIso),
    gender: cg.gender ?? 'female',
    // Foto-Queue: Promo-Retusche → KI-Retusche → Roh-Avatar → (undefined =
    // Initialen). Promo zuerst; Roh-Fallback, damit Pflegekräfte ohne Retusche
    // (oft erfahrene) nicht ohne Foto erscheinen.
    image: cg.avatar_retouched_promo?.aws_url ?? cg.avatar_retouched?.aws_url ?? cg.avatar?.aws_url ?? undefined,
    referencePdfUrl: pickNewestReferenceUrl(cg),
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

import type {
  MamamiaApplication,
  MamamiaMatching,
  MamamiaAcceptedApplicationRow,
  MamamiaAcceptedApplications,
  MamamiaCustomerJobOffer,
} from './types';

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
  /** true = aus contract_snapshot rekonstruierte "accepted"-App (Mamamia
   *  liefert sie nicht mehr). Der Caller leitet diese jeden Render neu ab,
   *  damit die Platzhalter-Karte aufs volle Profil upgradet, sobald
   *  getCaregiver lädt. */
  synthetic?: boolean;
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

/** Parst "EUR 83,00" → 83 (number). Wird beim Synthetisieren der
 *  accepted Application aus contract_snapshot gebraucht: das Snapshot
 *  speichert nur den formatierten Tagessatz-String, nicht den
 *  numerischen Wert. Robust gegen "83", "83.00", "EUR 83", "EUR 83,00 €",
 *  "1.234,56 EUR". Fallback 0 bei nicht-parsbarem Input. */
function parseTagessatzString(s: string | null | undefined): number {
  if (!s) return 0;
  // Entferne alles außer Ziffern, Komma, Punkt
  const cleaned = s.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;
  // Letztes Trennzeichen (Komma oder Punkt) ist Dezimaltrenner — alles
  // davor sind Tausender. Bei "1.234,56" → Dezimal=",", Tausender=".".
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    // Deutsche Schreibweise: Punkte raus, Komma → Punkt
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Englisch / kein Dezimaltrenner: Kommas raus
    normalized = cleaned.replace(/,/g, '');
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Rekonstruiert eine UIApplication aus einer akzeptierten
 *  lead_application_acceptances-Zeile + dem (asynchron geladenen)
 *  Mamamia-Caregiver-Profil. Wird gebraucht, weil Mamamia die akzeptierte
 *  Application aus listApplications entfernt — ohne Synthese würde
 *  BookedScreen nicht rendern und das Portal zeigte "X offene
 *  Bewerbungen" obwohl die Annahme längst gemacht ist (Bug 11.06.2026).
 *
 *  Caregiver-Profil noch nicht geladen (z. B. getCaregiver bei Mamamia-Hiccup
 *  nicht erreichbar)? Dann wird eine PLATZHALTER-Karte gebaut (Name aus
 *  `fallbackName`, sonst "Ihre Pflegekraft") statt `null`. So bleibt der
 *  gebuchte BookedScreen inkl. Vertrags-PDF IMMER sichtbar — der Kunde fällt
 *  nie in den Annahme-/HTML-Flow zurück. Sobald das Profil nachlädt, leitet der
 *  Aufrufer die Karte neu ab und ersetzt den Platzhalter durchs volle Profil.
 */
export function synthesizeAcceptedApplicationFromSnapshot(
  row: MamamiaAcceptedApplicationRow,
  caregiver: MamamiaCaregiverFull | null,
  opts: { nowIso: string; nowYear: number },
  fallbackName?: string,
): UIApplication {
  const snap = row.contract_snapshot;
  // Tagessatz aus dem Snapshot ist als String "EUR 83,00" gespeichert —
  // wir parsen zurück zu number und rechnen auf monatliche Kosten hoch
  // (×30, gleicher Faktor wie buildVertragsDaten beim Schreiben).
  const tagessatz = parseTagessatzString((snap?.tagessatz as string) ?? null);
  const monatlicheKosten = tagessatz * 30;
  const nurse: Nurse = caregiver
    ? mapCaregiverToNurse(caregiver, opts)
    : {
        caregiverId: row.caregiver_id ?? undefined,
        name: fallbackName?.trim() || 'Ihre Pflegekraft',
        age: 0, experience: '', experienceYears: 0,
        availability: '', availableSoon: false,
        language: { level: '', bars: 0 },
        color: '#8B7355', addedTime: '', isLive: false, gender: 'female', image: undefined,
      };
  return {
    id: String(row.application_id),
    nurse,
    agencyName: 'Pflegeagentur',
    appliedAt: '—',
    status: 'accepted',
    message: '',
    offer: {
      monatlicheKosten,
      anreisedatum: (snap?.vertragsbeginn as string) ?? '—',
      abreisedatum: (snap?.voraussAbreise as string) ?? '—',
      // Standard-Werte: der Snapshot speichert die Spesen nicht separat;
      // 125 € pro Strecke ist die Konvention (zzgl.-Hinweis im Portal).
      anreisekosten: 125,
      abreisekosten: 125,
      reisetage: 'Halb',
      feiertagszuschlag: tagessatz, // doppelter Tagessatz = 1× extra
      kuendigungsfrist: 'Täglich kündbar',
      submittedAt: (snap?.datum as string) ?? '—',
    },
  };
}

/** Wählt den Job für die Gebucht-Ableitung aus Customer.job_offers:
 *  bevorzugt der zur Session gehörende Job (session.job_offer_id), sonst der
 *  erste mit final_confirmation + caregiver. null, wenn der Proxy die
 *  job_offers (noch) nicht liefert (alte Version / Schema-Drift) oder kein
 *  Job bestätigt ist — dann ändert sich am heutigen Verhalten NICHTS. */
export function pickFinalConfirmedJob(
  jobs: MamamiaCustomerJobOffer[] | null | undefined,
  sessionJobOfferId: number | null | undefined,
): MamamiaCustomerJobOffer | null {
  if (!Array.isArray(jobs)) return null;
  const confirmed = jobs.filter(
    (j) => typeof j?.final_confirmation?.caregiver?.id === 'number',
  );
  if (confirmed.length === 0) return null;
  // Multi-Job (Opcja B, Dachs 8899): STRENG auf den Session-Job scoped —
  // die Bestätigung eines ANDEREN (alten) Jobs darf den aktiven Job nicht
  // kapern (sonst BookedScreen der alten PK im Kontext des neuen Einsatzes).
  // Fallback auf confirmed[0] NUR wenn die Session keinen Job kennt
  // (alte Session-JWTs / Proxy-Übergangsversion — fail-soft wie bisher).
  if (sessionJobOfferId != null) {
    return confirmed.find((j) => j.id === sessionJobOfferId) ?? null;
  }
  return confirmed[0];
}

/** Gebucht-Ableitung aus dem Mamamia-Stand (Fix Hagedorn 2026-07-15).
 *  Akzeptiert die AGENTUR die Bewerbung im SA-Portal, entsteht keine
 *  lead_application_acceptances-Zeile und Mamamia entfernt die Bewerbung aus
 *  listApplications — das Portal wäre blind und zeigte weiter Onboarding.
 *  Der einzige Beleg ist JobOffer.final_confirmation. Wir bauen daraus über
 *  denselben Baustein wie beim contract_snapshot-Pfad
 *  (synthesizeAcceptedApplicationFromSnapshot, snapshot=null) eine
 *  synthetische accepted-Application und überschreiben die Konditionen mit
 *  den Job-Daten (salary_offered = Monatskosten; Tagessatz = Monat/30,
 *  Kundenportal-Konvention). Kein Vertrags-PDF vorhanden → BookedScreen
 *  zeigt seinen „Vertrag wird vorbereitet"-Zustand. */
export function synthesizeAcceptedApplicationFromFinalConfirmation(
  job: MamamiaCustomerJobOffer,
  caregiver: MamamiaCaregiverFull | null,
  opts: { nowIso: string; nowYear: number },
): UIApplication | null {
  const fc = job.final_confirmation;
  const cg = fc?.caregiver;
  if (!fc || typeof cg?.id !== 'number') return null;
  const fallbackName = `${cg.first_name ?? ''} ${cg.last_name ?? ''}`.trim();
  const base = synthesizeAcceptedApplicationFromSnapshot(
    {
      application_id: fc.id,
      caregiver_id: cg.id,
      accepted_at: fc.final_confirmed_at ?? '',
      contract_snapshot: null,
    },
    caregiver,
    opts,
    fallbackName || undefined,
  );
  const monatlicheKosten = job.salary_offered ?? 0;
  const tagessatz = monatlicheKosten > 0 ? Math.round(monatlicheKosten / 30) : 0;
  return {
    ...base,
    // 'fc-'-Präfix: Confirmation-IDs leben in einem anderen Nummernraum als
    // Application-IDs — eine Kollision mit einer echten (offenen) Bewerbung
    // im applications-State wird so ausgeschlossen.
    id: `fc-${fc.id}`,
    offer: {
      ...base.offer,
      monatlicheKosten,
      anreisedatum: formatMamamiaDate(job.arrival_at ?? null) ?? '—',
      abreisedatum: formatMamamiaDate(job.departure_at ?? null) ?? '—',
      feiertagszuschlag: tagessatz,
      submittedAt: formatMamamiaDate(fc.final_confirmed_at ?? null) ?? '—',
    },
  };
}

/** Persistenz-Merge für den applications-State (extrahiert aus dem
 *  CustomerPortalPage-Effect, damit alle Pfade testbar sind). Drei Pfade:
 *    1) Portal-Annahme, Application noch in listApplications → patchen.
 *    2) Portal-Annahme, Application weg → Synthese aus contract_snapshot.
 *    3) KEINE Portal-Annahme, aber Mamamia-final_confirmation (die Annahme
 *       kam agentur-seitig — Fix Hagedorn) → Synthese aus dem Job-Stand.
 *  lead_application_acceptances hat VORRANG: sobald Pfad 1/2 greifen, läuft
 *  Pfad 3 nicht (keine Doppel-Synthese). Synthetische Apps werden jeden Lauf
 *  verworfen + frisch abgeleitet, damit die Platzhalter-Karte aufs volle
 *  Profil upgradet, sobald getCaregiver lädt. */
export function applyAcceptedOverlay(
  prev: UIApplication[],
  args: {
    acceptances: MamamiaAcceptedApplications | null;
    confirmedJob: MamamiaCustomerJobOffer | null;
    caregiverProfile: MamamiaCaregiverFull | null;
    firstAcceptedCaregiverId: number | null;
    opts: { nowIso: string; nowYear: number };
  },
): UIApplication[] {
  const { acceptances, confirmedJob, caregiverProfile, firstAcceptedCaregiverId, opts } = args;
  const base = prev.filter((a) => !a.synthetic);
  const acceptedIds = new Set(acceptances?.application_ids ?? []);

  if (acceptedIds.size > 0) {
    // ── Portal-Annahme-Pfad (hat Vorrang) ──
    const presentIds = new Set(base.map((a) => Number(a.id)));
    // Pfad 1: vorhandene (Mamamia-)Apps auf accepted patchen
    const patched = base.map((a) =>
      acceptedIds.has(Number(a.id)) ? { ...a, status: 'accepted' as const } : a,
    );
    // Pfad 2: fehlende accepted-Apps aus contract_snapshot synthetisieren.
    // synthesize liefert NIE null — ohne geladenes Profil kommt eine
    // Platzhalter-Karte, damit BookedScreen inkl. Vertrags-PDF sichtbar
    // bleibt (Mamamia-Hiccup ≠ Rückfall in den HTML-Flow).
    //
    // Multi-Job-Gate (Opcja B, Dachs 8899, 2026-07-22): Acceptance-Rows sind
    // LEAD-weit — die Synthese läuft aber nur, wenn der Akzept zum AKTIVEN
    // (Session-)Job gehört. Signal: die final_confirmation DES SESSION-JOBS
    // trägt dieselbe Pflegekraft. Sonst gehört die Buchung zu einem anderen
    // (alten) Einsatz → kein BookedScreen-Hijack im Kontext des neuen Jobs
    // (der alte bleibt über ?view=jobs erreichbar). Bewusste Mini-Lücke:
    // Reload in den ~1-2 Min zwischen StoreConfirmation und Mamamias
    // final_confirmation zeigt kurz den normalen Portal-Zustand — heilt
    // sich, sobald Mamamia verarbeitet hat (Retry-Chain lädt ohnehin binnen
    // ~2 Min alles nach). Im Accept-Moment selbst hält der optimistische
    // Local-State den BookedScreen ohne Synthese.
    const fcCaregiverId = confirmedJob?.final_confirmation?.caregiver?.id;
    const additions: UIApplication[] = [];
    for (const row of acceptances?.rows ?? []) {
      if (presentIds.has(row.application_id)) continue;
      if (typeof fcCaregiverId !== 'number' || fcCaregiverId !== row.caregiver_id) continue;
      const profile = row.caregiver_id === firstAcceptedCaregiverId ? caregiverProfile : null;
      additions.push({
        ...synthesizeAcceptedApplicationFromSnapshot(row, profile ?? null, opts),
        synthetic: true,
      });
    }
    return [...patched, ...additions];
  }

  // ── Pfad 3: Mamamia-final_confirmation ohne Portal-Annahme ──
  const cgId = confirmedJob?.final_confirmation?.caregiver?.id;
  if (!confirmedJob || typeof cgId !== 'number') return base;
  // Schon eine accepted-App da (z. B. optimistisches Update nach Annahme im
  // Portal, bevor der Acceptance-Refetch durch ist) → keine Doppel-Synthese.
  if (base.some((a) => a.status === 'accepted')) return base;
  // Liefert Mamamia die Bewerbung derselben Pflegekraft (noch) in
  // listApplications, patchen wir sie statt eine Doppel-Karte zu bauen.
  if (base.some((a) => a.nurse.caregiverId === cgId)) {
    return base.map((a) =>
      a.nurse.caregiverId === cgId ? { ...a, status: 'accepted' as const } : a,
    );
  }
  const profile = cgId === firstAcceptedCaregiverId ? caregiverProfile : null;
  const synthetic = synthesizeAcceptedApplicationFromFinalConfirmation(confirmedJob, profile, opts);
  return synthetic ? [...base, { ...synthetic, synthetic: true }] : base;
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

// weight/height in Mamamia store as bare buckets for middle ranges
// ("61-70" / "161-170") and non-uniform edges for the extremes
// (weight: "40-50" / "> 100"; height: "140-150" / "190+"). Form expects
// suffix-annotated labels ("Unter 50 kg" / "Über 100 kg" / "61-70 kg",
// "Unter 151 cm" / "Über 190 cm" / "161-170 cm").
//
// Edge mapping verified live 2026-05-12 on Customer 8454 via DevTools
// after manual panel picks (see patientFormMapper.ts WEIGHT_EDGE / HEIGHT_EDGE
// for the forward direction).
//
// Bug #13 (2026-05-07): pre-refactor the onboard injected DEFAULT_WEIGHT /
// DEFAULT_HEIGHT and we used pair-detection sentinel suppression to hide
// them. After Bug #13 onboard ships nothing for weight/height — Mamamia
// returns null until patient form save. No sentinel needed: null → ''.
function mamamiaWeightToForm(w: string | null | undefined): string {
  if (!w) return '';
  if (w === '40-50') return 'Unter 50 kg';
  if (w === '> 100') return 'Über 100 kg';
  return w.endsWith('kg') ? w : `${w} kg`;
}
function mamamiaHeightToForm(h: string | null | undefined): string {
  if (!h) return '';
  if (h === '140-150') return 'Unter 151 cm';
  if (h === '190+') return 'Über 190 cm';
  return h.endsWith('cm') ? h : `${h} cm`;
}

// Mamamia customer_caregiver_wish.germany_skill enum (verified prod 2026-04-28).
// Reverse mapping na label do display w AngebotCard step 4 (read-only field).
// % distribution z prod sweep:
//   level_0  → "A1"          (1% active)
//   level_1  → "A2"          (1% — calculator "grundlegend" od 2026-05-12)
//   level_2  → "mind. A2"    (22% — calculator "kommunikativ" od 2026-05-12)
//   level_3  → "mind. B1"    (50% — calculator NIE używa od 2026-05-12,
//                             tylko manual panel pick przez agency)
//   level_4  → "mind. C1"    (8% — calculator "sehr-gut")
//   not_important → "Egal"
// Bug #13g: AngebotCard step 4 displayed hardcoded "mind. B1" — replace
// with this helper to read real value from mmCustomer.
export function germanySkillLabel(level: string | null | undefined): string {
  if (!level) return '';
  // Portal nutzt die 3 Stufen Grund / Mittel / Gut. Mamamias level_0/1 fallen
  // in „Grund", level_2 in „Mittel", level_3/4 in „Gut" (siehe mappers.ts
  // GERMANY_SKILL_LEVELS). Hier als Mindestwunsch ausgedrückt.
  if (level === 'level_0' || level === 'level_1') return 'ab Grund';
  if (level === 'level_2') return 'ab Mittel';
  if (level === 'level_3' || level === 'level_4') return 'ab Gut';
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
  if (s === 'yes' || s === 'yes_outside' || s === 'not_important') return 'Ja (nur Draußen)';
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
  haushalt?: string;
  badezimmer?: string;
  tiere?: string;
  wunschGeschlecht?: string; rauchen?: string; fuehrerschein?: string;
  // Customer-side gearbox preference, restored from
  // customer_caregiver_wish.driving_license_gearbox so the form re-opens
  // with the user's previously-saved Automatik / Schaltung pick.
  wunschGetriebe?: string;
  aufgaben?: string; sonstigeWuensche?: string;
  phone?: string;
  // SA-Abgleich (2026-07-08): Rückspiegelung der neuen Fragen.
  nachtDetail?: string; p2_nachtDetail?: string;
  einkaeufe?: string;
  raucherhaushalt?: string;
}

function mamamiaPatientToForm(
  p: NonNullable<MamamiaCustomer['patients']>[number],
): {
  geschlecht?: string; geburtsjahr?: string; pflegegrad?: string;
  gewicht?: string; groesse?: string;
  mobilitaet?: string; heben?: string; demenz?: string;
  inkontinenz?: string; nacht?: string; nachtDetail?: string;
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
    nachtDetail: mamamiaNightDescToForm(
      p.night_operations_description_de ?? p.night_operations_description,
    ),
  };
}

// „Was ist in der Nacht zu machen?" — nur echten Nutzertext zurückspiegeln.
// Der Standard-Platzhalter (Mapper-Fallback wenn das Feld leer blieb) darf
// nicht als scheinbare Nutzereingabe im Formular auftauchen.
function mamamiaNightDescToForm(desc: string | null | undefined): string {
  const t = desc?.trim();
  if (!t || t === STANDARD_NIGHT_OPS_DE) return '';
  return t;
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
    // In draft state, Mamamia sets lift_id=2 ("Nein") as a schema default
    // during onboarding — the customer never chose this. Suppress it so the
    // portal shows a blank "Heben erforderlich?" instead of a misleading "Nein".
    if (isDraft) p1.heben = '';
    Object.assign(out, p1);
  }
  // Patient 2 — same fields, p2_* keys.
  if (patients[1]) {
    const p2 = mamamiaPatientToForm(patients[1]);
    if (isDraft) p2.heben = '';
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
    out.p2_nachtDetail = p2.nachtDetail;
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
  // other_people_in_house → haushalt: 'Ja'/'Nein' (price-relevant)
  if (cust.other_people_in_house === 'yes') out.haushalt = 'Ja';
  else if (cust.other_people_in_house === 'no') out.haushalt = 'Nein';

  // equipments → badezimmer: id=2 = Own Bathroom.
  // GET_CUSTOMER fetches equipments { id equipment }; id=1 = TV, id=2 = Bathroom.
  // Only pre-fill 'Ja' when bathroom equipment is explicitly present.
  // An absent/empty list is treated as unknown → '' → "Bitte wählen" in the form.
  if (Array.isArray(cust.equipments) && cust.equipments.length > 0) {
    out.badezimmer = cust.equipments.some(e => e.id === 2) ? 'Ja' : 'Nein';
  }

  if (cust.has_family_near_by === 'yes') out.familieNahe = 'Ja';
  else if (cust.has_family_near_by === 'no') out.familieNahe = 'Nein';
  // 'not_important' has no form equivalent → leave empty.

  if (cust.internet === 'yes') out.internet = 'Ja';
  else if (cust.internet === 'no') out.internet = 'Nein';

  // Raucherhaushalt (SA-Abgleich) — 1:1-Rückabbildung von smoking_household.
  if (cust.smoking_household === 'yes') out.raucherhaushalt = 'Ja';
  else if (cust.smoking_household === 'yes_outside') out.raucherhaushalt = 'Ja, nur draußen';
  else if (cust.smoking_household === 'no') out.raucherhaushalt = 'Nein';

  // Prefer Customer.phone but fall back to customer_contract.phone — the
  // panel writes only to contract when an agent edits, so a customer who
  // has only contract.phone (manual panel edit) still round-trips into
  // the form cleanly.
  const phoneValue = cust.phone || cust.customer_contract?.phone;
  if (phoneValue) out.phone = phoneValue;

  if (cust.day_care_facility === 'yes') out.pflegedienst = 'Ja';
  else if (cust.day_care_facility === 'no') out.pflegedienst = 'Nein';

  // Pflegedienst frequency+tasks — Bug #13k (2026-05-07): czytane z
  // dedykowanych pól `day_care_facility_description{,_de}` zamiast
  // parsowania `Pflegedienst:` segment z job_description.
  // Format pisany przez patientFormMapper: `{frequency}: {tasks}` lub
  // sam `{frequency}` / `{tasks}` (bez colonu) gdy tylko jedno wpisane.
  // Fallback do legacy job_description segment dla customers utworzonych
  // pre-Bug-#13k (workaround #2 sprzed schematu update).
  if (cust.day_care_facility === 'yes') {
    const desc = cust.day_care_facility_description_de
      ?? cust.day_care_facility_description
      ?? null;
    if (desc) {
      const colonIdx = desc.indexOf(':');
      if (colonIdx >= 0) {
        out.pflegedienstHaeufigkeit = desc.slice(0, colonIdx).trim();
        out.pflegedienstAufgaben = desc.slice(colonIdx + 1).trim();
      } else {
        out.pflegedienstHaeufigkeit = desc.trim();
      }
    } else if (cust.job_description) {
      // Legacy fallback: parse `Pflegedienst: …` segment from
      // job_description (pre-Bug-#13k workaround). Customers saved
      // their pflegedienst this way before schema changed; reading them
      // back keeps the form populated.
      const segments = cust.job_description.split(' | ');
      const pflegedienstSeg = segments.find(s => s.startsWith('Pflegedienst: '));
      if (pflegedienstSeg) {
        const inner = pflegedienstSeg.slice('Pflegedienst: '.length);
        const colonIdx = inner.indexOf(':');
        if (colonIdx >= 0) {
          out.pflegedienstHaeufigkeit = inner.slice(0, colonIdx).trim();
          out.pflegedienstAufgaben = inner.slice(colonIdx + 1).trim();
        } else {
          out.pflegedienstHaeufigkeit = inner.trim();
        }
      }
    }
  }

  out.tiere = mamamiaPetsToForm(
    cust.pets, cust.is_pet_dog, cust.is_pet_cat, cust.is_pet_other,
  );

  // Address z customer_contract (singular, 1:1). Bug #16 (2026-05-12) refactor
  // — beta miała plural customer_contracts[] z contact_type='patient_contact'
  // discriminator. Prod ma singular. Singular field istnieje w obu środowiskach
  // (na becie zwraca pierwszy z plural).
  const contract = cust.customer_contract;
  if (contract?.zip_code) out.plz = contract.zip_code;
  if (contract?.city) out.ort = contract.city;

  // Caregiver-wish (preferences).
  const wish = cust.customer_caregiver_wish;
  if (wish) {
    out.wunschGeschlecht = mamamiaWishGenderToForm(wish.gender);
    out.rauchen = mamamiaWishSmokingToForm(wish.smoking);
    // Einkäufe (SA-Abgleich): 'no' NICHT als „Nein" zurückspiegeln — der
    // Mapper schreibt 'no' auch als stillen Default für Unbeantwortet;
    // das Formular soll dann weiterhin leer aussehen.
    if (wish.shopping === 'yes') out.einkaeufe = 'Ja';
    else if (wish.shopping === 'occasionally') out.einkaeufe = 'Gelegentlich';
    out.aufgaben = wish.tasks ?? '';
    out.sonstigeWuensche = wish.other_wishes ?? '';
    // Bug #13: onboard ships nothing for driving_license_gearbox; Mamamia
    // returns null until patient form save explicitly writes 'automatic'
    // / 'manual'. Reverse mapper emits the user's saved pick — no
    // suppression needed (pre-Bug-#13 we suppressed 'automatic' as the
    // onboard default, that's gone now).
    // Wish enum reverse: "yes" → "Ja" (customer requires license), anything
    // else ("not_important" is what onboard + the form's "Nein" pick both
    // map to; "no" was a historic mis-mapping that crashed the Mamamia
    // resolver — see patientFormMapper) → "Nein" in the UI.
    if (wish.driving_license) {
      out.fuehrerschein = wish.driving_license === 'yes' ? 'Ja' : 'Nein';
    }
    if (wish.driving_license_gearbox === 'manual') {
      out.wunschGetriebe = 'Schaltung';
    } else if (wish.driving_license_gearbox === 'automatic') {
      out.wunschGetriebe = 'Automatik';
    }
  }

  return out;
}
