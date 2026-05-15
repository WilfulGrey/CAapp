// Mapper PatientForm (CustomerPortalPage 4-step wizard) → UpdateCustomer input.
// Whitelist enforced again by mamamia-proxy `updateCustomer` action —
// anything not listed there is stripped server-side.

// NOTE: PatientForm type is intentionally duplicated (not imported) so this
// mapper has no circular dep on CustomerPortalPage. Shape must stay in sync.

export interface PatientFormShape {
  anzahl: '1' | '2' | '';
  geschlecht: string; geburtsjahr: string; pflegegrad: string; gewicht: string; groesse: string;
  mobilitaet: string; heben: string; demenz: string; inkontinenz: string; nacht: string;
  p2_geschlecht: string; p2_geburtsjahr: string; p2_pflegegrad: string; p2_gewicht: string; p2_groesse: string;
  p2_mobilitaet: string; p2_heben: string; p2_demenz: string; p2_inkontinenz: string; p2_nacht: string;
  diagnosen: string;
  plz: string; ort: string; haushalt: string; wohnungstyp: string; urbanisierung: string;
  familieNahe: string; pflegedienst: string; internet: string;
  // Pflegedienst follow-up — populated by AngebotCard step 2 when
  // pflegedienst='Ja'/'Geplant'. See buildDayCareFacilityDescription.
  pflegedienstHaeufigkeit: string;
  pflegedienstAufgaben: string;
  tiere: string; unterbringung: string; badezimmer: string; aufgaben: string;
  wunschGeschlecht: string; rauchen: string; sonstigeWuensche: string;
  // Führerschein: 'Ja'/'Nein'/'' — editable in the form, writes driving_license.
  fuehrerschein: string;
  // Getriebe — only shown when fuehrerschein='Ja'. Empty = no preference.
  wunschGetriebe: string;
}

// Mobility label → Mamamia mobility_id (SADASH docs + live-verified in K1).
const MOBILITY_BY_LABEL: Record<string, number> = {
  'Selbstständig mobil': 1,
  'Vollständig mobil': 1,
  'Am Gehstock': 2,
  'Gehfähig mit Hilfe': 3,
  'Rollatorfähig': 3,
  'Rollstuhlfähig': 4,
  'Bettlägerig': 5,
};

// Mamamia panel oferuje "Keine" jako natywną opcję — w bazie zapisana
// jako `care_level: null` (zweryfikowane live na Customer 7658 po
// ręcznym ustawieniu "brak" w panelu, 2026-05-07). Form label "Kein/e"
// → null verbatim. NIE wymyślamy mapowania na 1/0 + sentinel tagi —
// patrz CLAUDE.md "ŚWIĘTA ZASADA NR 1.5".
//
// Sygnatura zwraca:
//   - number 1-5: explicit Pflegegrad
//   - null: "Kein/e" (explicit no Pflegegrad — Mamamia "Keine")
//   - undefined: empty / unparseable label (don't touch field)
function parsePflegegrad(label: string): number | null | undefined {
  if (!label) return undefined;
  if (label === 'Kein/e') return null;
  const m = label.match(/\d/);
  return m ? Number(m[0]) : undefined;
}

function parseYear(year: string): number | null {
  const n = Number(year);
  return Number.isFinite(n) && n > 1900 && n < 2100 ? n : null;
}

function genderToApi(g: string): 'male' | 'female' | null {
  if (g === 'Männlich') return 'male';
  if (g === 'Weiblich') return 'female';
  return null;
}

function yesNoToApi(v: string): 'yes' | 'no' | null {
  if (v === 'Ja') return 'yes';
  if (v === 'Nein') return 'no';
  return null;
}

function yesNoToBool(v: string): boolean | null {
  if (v === 'Ja') return true;
  if (v === 'Nein') return false;
  return null;
}

// Dementia levels: form has Nein/Leichtgradig/Mittelgradig/Schwer.
// Mamamia known: "yes" + "no" persist. Any non-"Nein" → "yes".
function dementiaToApi(v: string): 'yes' | 'no' | null {
  if (!v) return null;
  return v === 'Nein' ? 'no' : 'yes';
}

// Incontinence string → triplet of booleans.
function incontinenceToApi(v: string): {
  incontinence?: boolean;
  incontinence_feces?: boolean;
  incontinence_urine?: boolean;
} {
  if (!v) return {};
  if (v === 'Nein') return { incontinence: false, incontinence_feces: false, incontinence_urine: false };
  if (v === 'Harninkontinenz') return { incontinence: true, incontinence_urine: true, incontinence_feces: false };
  if (v === 'Stuhlinkontinenz') return { incontinence: true, incontinence_feces: true, incontinence_urine: false };
  if (v === 'Beides') return { incontinence: true, incontinence_feces: true, incontinence_urine: true };
  return {};
}

// Night operations enum — verified vs Mamamia prod DB (2026-04-27):
//   "no" | "up_to_1_time" | "1_2_times" | "more_than_2" | "occasionally"
// PatientForm dropdown options ['Nein','Bis zu 1 Mal','1–2 Mal','Mehr als 2']
// map 1:1; older 'Gelegentlich'/'Regelmäßig' values kept for legacy drafts.
function nachtToApi(v: string): string | null {
  if (!v) return null;
  if (v === 'Nein') return 'no';
  if (v === 'Bis zu 1 Mal') return 'up_to_1_time';
  if (v === '1–2 Mal' || v === '1-2 Mal') return '1_2_times';
  if (v === 'Mehr als 2') return 'more_than_2';
  // Legacy values from older drafts (still valid prod enum).
  if (v === 'Gelegentlich') return 'occasionally';
  if (v === 'Regelmäßig') return 'up_to_1_time';
  return null;
}

// accommodation (wohnungstyp) enum — verified prod 2026-04-27.
function accommodationToApi(v: string): string | null {
  if (!v) return null;
  if (v === 'Einfamilienhaus') return 'single_family_house';
  if (v === 'Wohnung in Mehrfamilienhaus' || v === 'Wohnung') return 'apartment';
  if (v === 'Andere' || v === 'Sonstiges') return 'other';
  return null;
}

// urbanization_id (urbanisierung) — Mamamia lookup verified 2026-04-28:
//   1 = Village, 2 = City, 3 = Big city
function urbanizationIdToApi(v: string): number | null {
  if (v === 'Großstadt') return 3;
  if (v === 'Kleinstadt') return 2;
  if (v === 'Dorf/Land' || v === 'Dorf') return 1;
  return null;
}

// day_care_facility (pflegedienst) — boolean enum on Mamamia.
//   "Geplant" treated as "yes" because Mamamia has no third option.
function dayCareFacilityToApi(v: string): 'yes' | 'no' | null {
  if (v === 'Ja' || v === 'Geplant') return 'yes';
  if (v === 'Nein') return 'no';
  return null;
}

// Pflegedienst frequency — DE → en/pl translation table for the locales.
// AngebotCard ships these exact labels (Wie oft kommt der Pflegedienst?).
const PFLEGEDIENST_FREQ_TRANSLATIONS: Record<string, { en: string; pl: string }> = {
  '1× pro Woche': { en: 'Once a week', pl: '1× w tygodniu' },
  '2× pro Woche': { en: 'Twice a week', pl: '2× w tygodniu' },
  '3× pro Woche': { en: 'Three times a week', pl: '3× w tygodniu' },
  'Täglich': { en: 'Daily', pl: 'Codziennie' },
  'Mehrmals täglich': { en: 'Several times a day', pl: 'Kilka razy dziennie' },
};

// Pflegedienst tasks — DE → en/pl translation table. Match the exact
// checkbox labels rendered in AngebotCard so we can locate translations
// without parsing.
const PFLEGEDIENST_TASK_TRANSLATIONS: Record<string, { en: string; pl: string }> = {
  'Grundpflege (Körperpflege, Anziehen)': {
    en: 'Basic care (personal hygiene, dressing)',
    pl: 'Pielęgnacja podstawowa (higiena, ubieranie)',
  },
  'Medikamentengabe': { en: 'Medication administration', pl: 'Podawanie leków' },
  'Wundversorgung': { en: 'Wound care', pl: 'Opatrywanie ran' },
  'Injektionen / Blutzucker': { en: 'Injections / blood sugar', pl: 'Iniekcje / pomiar cukru' },
  'Behandlungspflege (z.B. Verbandwechsel)': {
    en: 'Treatment care (e.g. dressing changes)',
    pl: 'Pielęgnacja medyczna (np. zmiana opatrunków)',
  },
};

// Internal separator for the pflegedienstAufgaben form-state string. The
// task labels themselves contain commas inside parens (e.g.
// "Grundpflege (Körperpflege, Anziehen)"), so a plain `, ` separator can't
// be split back unambiguously. AngebotCard joins/splits with `; `; this
// mapper does the same.
const PFLEGEDIENST_TASKS_SEP = '; ';

// Build the day_care_facility_description string + 4 locales from the
// Pflegedienst follow-up answers. Mamamia panel form requires this when
// day_care_facility=yes — pre-2026-05-05 we shipped 'yes' without a
// description and Mamamia rejected the customer as incomplete.
// Returns null when the customer answered Nein (or the follow-ups are
// blank), so callers can skip the field entirely.
export function buildDayCareFacilityDescription(
  haeufigkeit: string,
  aufgaben: string,
): { de: string; en: string; pl: string } | null {
  const haeu = haeufigkeit.trim();
  const tasks = aufgaben
    .split(PFLEGEDIENST_TASKS_SEP)
    .map(s => s.trim())
    .filter(Boolean);
  if (!haeu && tasks.length === 0) return null;

  // Final description joins with `, ` for agency readability — no risk of
  // re-splitting because the consumer is free-text panel UI, not us.
  const tasksDe = tasks.join(', ');
  const tasksEn = tasks
    .map(t => PFLEGEDIENST_TASK_TRANSLATIONS[t]?.en ?? t)
    .join(', ');
  const tasksPl = tasks
    .map(t => PFLEGEDIENST_TASK_TRANSLATIONS[t]?.pl ?? t)
    .join(', ');

  const haeuEn = PFLEGEDIENST_FREQ_TRANSLATIONS[haeu]?.en ?? haeu;
  const haeuPl = PFLEGEDIENST_FREQ_TRANSLATIONS[haeu]?.pl ?? haeu;

  // Format: "{frequency}: {tasks}" — keeps the agency-readable string
  // compact and predictable. When only frequency is set (or only tasks),
  // drop the colon to avoid stray ": …" / "…: " strings.
  const join = (h: string, t: string) =>
    h && t ? `${h}: ${t}` : (h || t);

  return {
    de: join(haeu, tasksDe),
    en: join(haeuEn, tasksEn),
    pl: join(haeuPl, tasksPl),
  };
}

// pets (tiere) — pets enum + 3 boolean flags. Form distinguishes pet
// type while Mamamia tracks them separately.
function petsToApi(v: string): {
  pets?: string;
  is_pet_dog?: boolean;
  is_pet_cat?: boolean;
  is_pet_other?: boolean;
} {
  if (!v || v === 'Keine') return { pets: 'no', is_pet_dog: false, is_pet_cat: false, is_pet_other: false };
  if (v === 'Hund') return { pets: 'yes', is_pet_dog: true, is_pet_cat: false, is_pet_other: false };
  if (v === 'Katze') return { pets: 'yes', is_pet_dog: false, is_pet_cat: true, is_pet_other: false };
  if (v === 'Andere') return { pets: 'yes', is_pet_dog: false, is_pet_cat: false, is_pet_other: true };
  return {};
}

// caregiver_accommodated (unterbringung) — verified prod 2026-04-28.
function caregiverAccommodatedToApi(v: string): string | null {
  if (v === 'Zimmer in den Räumlichkeiten') return 'room_premises';
  if (v === 'Gesamter Bereich') return 'area_premises';
  if (v === 'Zimmer extern') return 'room_other_premises';
  if (v === 'Bereich extern') return 'area_other_premises';
  return null;
}

// Lift / heben: Mamamia lifts lookup: 1=Yes, 2=No, 3=legacy.
// "Heben erforderlich?" Ja → patient needs hoist → lift_id=1.
// Nein → no hoist needed → lift_id=2.
function liftIdToApi(v: string): number | null {
  if (v === 'Ja') return 1;
  if (v === 'Nein') return 2;
  return null;
}

// Dementia gradation (Leichtgradig/Mittelgradig/Schwer) is lost on
// Mamamia.dementia (yes/no enum). Capture it in dementia_description
// instead, so the agency sees the severity. 4-locale set.
function dementiaDescriptionFromForm(v: string): {
  de: string;
  en: string;
  pl: string;
} | null {
  if (!v) return null;
  if (v === 'Nein') {
    return {
      de: 'Keine Demenzdiagnose.',
      en: 'No dementia diagnosis.',
      pl: 'Brak rozpoznania demencji.',
    };
  }
  const grad: Record<string, { de: string; en: string; pl: string }> = {
    Leichtgradig: { de: 'leichtgradig', en: 'mild', pl: 'łagodna' },
    Mittelgradig: { de: 'mittelgradig', en: 'moderate', pl: 'umiarkowana' },
    Schwer: { de: 'schwer', en: 'severe', pl: 'ciężka' },
  };
  const g = grad[v];
  if (!g) return null;
  return {
    de: `Demenzdiagnose: ${g.de}.`,
    en: `Dementia diagnosis: ${g.en}.`,
    pl: `Rozpoznana demencja: ${g.pl}.`,
  };
}

// customer_caregiver_wish.gender (wunschGeschlecht) — preferred caregiver
// gender. NOT the patient gender (that comes from anrede).
function wishGenderToApi(v: string): 'female' | 'male' | 'not_important' | null {
  if (v === 'Weiblich') return 'female';
  if (v === 'Männlich') return 'male';
  if (v === 'Egal') return 'not_important';
  return null;
}

// customer_caregiver_wish.smoking — caregiver smoking preference (yes
// means "smoking caregiver is OK"). Form question is "Darf die
// Betreuungsperson rauchen?". Default to "yes_outside" for Ja since
// that's the prod-most-common positive answer (5169 vs 142 plain "yes").
function wishSmokingToApi(v: string): 'yes_outside' | 'no' | null {
  if (v === 'Ja' || v === 'Ja (nur Draußen)') return 'yes_outside';
  if (v === 'Nein') return 'no';
  return null;
}

// driving_license itself is set by the calculator (formularDaten →
// onboard). The patient form lets the customer specify the gearbox
// preference (Automatik / Schaltung / Egal), which Mamamia stores as
// customer_caregiver_wish.driving_license_gearbox. "Egal" maps to
// 'automatic' — same permissive default the onboard pass writes.
function wishDrivingGearboxToApi(v: string): 'automatic' | 'manual' | null {
  if (v === 'Schaltung') return 'manual';
  if (v === 'Automatik') return 'automatic';
  // 'Egal' → 'automatic' (permissive — any licensed cg can drive auto)
  if (v === 'Egal') return 'automatic';
  return null;
}

// Bucket strings (e.g. "71-80 kg" / "171-180 cm") map to Mamamia panel's
// internal bucket strings. For middle ranges Mamamia stores the bare
// bucket without unit ("71-80", "171-180"). For edge buckets Mamamia
// uses non-uniform conventions (verified live 2026-05-12 on Customer
// 8454 via DevTools after manual panel picks):
//   weight  "Unter 50 kg"  → "40-50"   (closed range, not "<50" / "less_50")
//   weight  "Über 100 kg"  → "> 100"   (with space, NOT "100+" / ">100")
//   height  "Unter 151 cm" → "140-150" (closed range, not "<151" / "less_151")
//   height  "Über 190 cm"  → "190+"    (NO space, plus suffix, NOT "> 190")
// Sending the wrong edge string makes Mamamia silently store nothing —
// patient form save appears to succeed but weight/height stay blank in
// the panel.
//
// Defense: en-dash "–" → ASCII hyphen "-" for legacy localStorage drafts
// saved with en-dash form options pre-2026-05-07.
const WEIGHT_EDGE: Record<string, string> = {
  'Unter 50': '40-50',
  'Über 100': '> 100',
};
const HEIGHT_EDGE: Record<string, string> = {
  'Unter 151': '140-150',
  'Über 190': '190+',
};
function normalizeBucket(s: string): string {
  const stripped = s.replace(/–/g, '-').replace(/\s*(?:kg|cm)$/, '');
  return WEIGHT_EDGE[stripped] ?? HEIGHT_EDGE[stripped] ?? stripped;
}

// Tool ids derived from mobility — mirrors
// supabase/functions/onboard-to-mamamia/mappers.ts:mapToolIds. Patient
// form has no "Pomoce" multi-select; tool_ids derive from mobility_id
// every save so they stay in sync when user changes mobility (otherwise
// proxy.PRESERVE_QUERY re-injects stale tools — verified 2026-05-07
// on Customer 7655 patient[1]: mobility_id=1 mobile + tools=[4,6]
// hoist+bed because couple-onboard set [4,6] for both, then patient
// form changed mobility but tools weren't refreshed).
//   bedridden (5)  → [4 Patient hoist, 6 Care bed]
//   wheelchair (4) → [3 Wheelchair]
//   walker (3)     → [2 Rollator]
//   walking-stick (2) → [1 Walking stick]
//   mobile (1) → [] (independent — no mobility aid; auto-adding
//                Gehstock falsifies the customer's choice)
// NEVER include id 7 (Others) — selecting it triggers a required
// "Jakie inne narzędzia są używane?" free-text we cannot fill.
function deriveToolIds(mobilityId: number): number[] {
  switch (mobilityId) {
    case 5: return [4, 6];
    case 4: return [3];
    case 3: return [2];
    case 2: return [1];
    default: return [];
  }
}

// Standard placeholder for `night_operations_description` when the
// patient form reports any night work (calculator-side question doesn't
// surface details, but Mamamia panel UI shows the description field as
// empty if not populated). Generic enough to be true regardless of the
// actual mix of overnight tasks.
function standardNightOpsDescription(no: string): {
  de: string;
  en: string;
  pl: string;
} | null {
  if (no === 'no') return null;
  return {
    de:
      'Konkrete nächtliche Aufgaben werden direkt mit der Pflegekraft abgestimmt — typischerweise Toilettenbegleitung, Lagerung oder Beruhigung.',
    en:
      'Specific night-time tasks will be coordinated directly with the caregiver — typically toilet assistance, repositioning, or reassurance.',
    pl:
      'Konkretne zadania nocne będą uzgadniane bezpośrednio z opiekunką — zazwyczaj towarzyszenie do toalety, zmiana pozycji lub uspokojenie.',
  };
}

// Standard placeholder for `lift_description` when the patient form
// reports lifting is required (Heben erforderlich = Ja → lift_id=1).
// Mamamia panel "Kiedy potrzebne jest podnoszenie?" shows empty without
// it. Skipped for lift_id=2 (No — no lift needed).
function standardLiftDescription(liftId: number): {
  de: string;
  en: string;
  pl: string;
} | null {
  if (liftId !== 1) return null;
  return {
    de:
      'Konkrete Hilfe beim Transfer (z.B. Aufstehen, Umsetzen, Bett↔Rollstuhl) wird direkt mit der Pflegekraft abgestimmt.',
    en:
      'Specific transfer assistance (e.g. standing up, repositioning, bed↔wheelchair) will be coordinated with the caregiver.',
    pl:
      'Konkretna pomoc przy transferze (np. wstawanie, zmiana pozycji, łóżko↔wózek) będzie uzgadniana z opiekunką.',
  };
}

// Build a single patient object for UpdateCustomer.patients[].
// Threading existing `patientId` is critical — Mamamia SILENTLY DROPS fields
// like night_operations and incontinence when patient is new (no id) inside
// UpdateCustomer. With id, the same fields persist correctly.
function buildPatient(
  gender: string,
  year: string,
  pflegegrad: string,
  mobility: string,
  nacht: string,
  heben: string,
  demenz: string,
  inkontinenz: string,
  gewicht: string,
  groesse: string,
  patientId?: number,
): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (typeof patientId === 'number') p.id = patientId;

  const g = genderToApi(gender);
  if (g) p.gender = g;

  const y = parseYear(year);
  if (y) p.year_of_birth = y;

  // care_level: 1-5 = Pflegegrad N; null = "Keine" (explicit no PG);
  // undefined = field untouched. Mamamia akceptuje null natywnie.
  const pg = parsePflegegrad(pflegegrad);
  if (pg !== undefined) p.care_level = pg;

  const mob = MOBILITY_BY_LABEL[mobility];
  if (mob !== undefined) {
    p.mobility_id = mob;
    // Derive tool_ids every save so they stay in sync when mobility
    // changes (proxy PRESERVE_QUERY would otherwise re-inject stale tools
    // from a previous mobility — Bug #13b on Customer 7655 patient[1]).
    p.tool_ids = deriveToolIds(mob);
  }

  const na = nachtToApi(nacht);
  if (na) p.night_operations = na;

  const dem = dementiaToApi(demenz);
  if (dem) p.dementia = dem;

  const inc = incontinenceToApi(inkontinenz);
  Object.assign(p, inc);

  // weight/height bucket — normalize en-dash to ASCII hyphen so Mamamia
  // panel dropdown matches its enum (verified 2026-05-07 on Customer 7653).
  if (gewicht) p.weight = normalizeBucket(gewicht);
  if (groesse) p.height = normalizeBucket(groesse);

  const lift = liftIdToApi(heben);
  if (lift !== null) {
    p.lift_id = lift;
    // lift_description: base + _de only. Mamamia backend AI translator
    // auto-fills _en/_pl from the German source — sending them ourselves
    // causes inconsistent state (verified live on customer 8528, 2026-05-15).
    // Base + _de matches what the Mamamia panel sends on manual agent save.
    const ldesc = standardLiftDescription(lift);
    if (ldesc) {
      p.lift_description = ldesc.de;
      p.lift_description_de = ldesc.de;
    }
  }

  // dementia_description: base + _de only. Captures gradation
  // (leichtgradig/mittelgradig/schwer) that Mamamia.dementia (yes/no)
  // doesn't carry on its own. See lift_description comment.
  const demDesc = dementiaDescriptionFromForm(demenz);
  if (demDesc) {
    p.dementia_description = demDesc.de;
    p.dementia_description_de = demDesc.de;
  }

  // night_operations_description: base + _de only.
  if (na) {
    const ndesc = standardNightOpsDescription(na);
    if (ndesc) {
      p.night_operations_description = ndesc.de;
      p.night_operations_description_de = ndesc.de;
    }
  }

  return p;
}

export interface CaregiverWishPatch {
  gender?: 'female' | 'male' | 'not_important';
  smoking?: 'yes_outside' | 'no';
  shopping?: 'yes' | 'no' | 'occasionally';
  // Wish enum: "yes" = customer requires license, "not_important" = doesn't
  // care. Literal "no" is not a valid Mamamia value (would mean "I require
  // a caregiver WITHOUT a license") and crashes the resolver — see
  // mapper comment near where this is written.
  driving_license?: 'yes' | 'not_important';
  driving_license_gearbox?: 'automatic' | 'manual';
  tasks?: string;
  tasks_de?: string;
  other_wishes?: string;
  other_wishes_de?: string;
}

// MAMAMIA_WISH_ALLOWED in mamamia-proxy/actions.ts must include 'shopping'
// for this to actually reach Mamamia. Update there in tandem.

// Auto-summary for `Customer.job_description`. Patient form doesn't have
// a "krótki opis sytuacji" free-text — but Mamamia panel + caregiver
// listings render this prominently. Generate a one-liner from the form
// data so the agency / caregivers get a quick picture.
//
// Mamamia UpdateCustomer mutation only exposes `$job_description` (single
// string, no locale variants — verified 2026-05-05 via Bug #9 attempt
// that broke all updateCustomer calls). Stick to DE.
function buildJobDescriptionSummary(form: PatientFormShape): string {
  const parts: string[] = [];

  // Headline: 24h-Betreuung + Pflegegrad
  const pg = parsePflegegrad(form.pflegegrad);
  if (pg === null) {
    parts.push('24-Stunden-Betreuung gesucht. Kein offizieller Pflegegrad.');
  } else if (pg) {
    parts.push(`24-Stunden-Betreuung gesucht. Pflegegrad ${pg}.`);
  } else {
    parts.push('24-Stunden-Betreuung gesucht.');
  }

  // Anzahl + Mobilität
  const couple = form.anzahl === '2';
  const mobLabel = form.mobilitaet ? form.mobilitaet.toLowerCase() : null;
  if (couple) {
    parts.push('Ehepaar — beide Personen benötigen Betreuung.');
  }
  if (mobLabel) {
    parts.push(`Mobilität: ${mobLabel}.`);
  }

  // Demenz (gradation if available)
  if (form.demenz && form.demenz !== 'Nein') {
    parts.push(`Demenzdiagnose: ${form.demenz.toLowerCase()}.`);
  }

  // Inkontinenz
  if (form.inkontinenz && form.inkontinenz !== 'Nein') {
    parts.push(`Inkontinenz: ${form.inkontinenz.toLowerCase()}.`);
  }

  // Nachteinsätze
  if (form.nacht && form.nacht !== 'Nein') {
    parts.push(`Nächtliche Unterstützung: ${form.nacht.toLowerCase()}.`);
  }

  return parts.join(' ');
}

export interface MappedCustomerPatch {
  // Fields that land on Customer root.
  // job_description: base + _de mirror what the Mamamia panel sends on
  // manual agent save. Mamamia backend AI translator handles _en/_pl
  // from the German source automatically.
  job_description?: string;
  job_description_de?: string;
  other_people_in_house?: string;
  has_family_near_by?: 'yes' | 'no';
  internet?: 'yes' | 'no';
  accommodation?: string;
  location_id?: number;
  location_custom_text?: string;
  // ── Newly mapped (post-2026-04-28 audit) ──
  urbanization_id?: number;
  day_care_facility?: 'yes' | 'no';
  // Bug #13k (2026-05-07): mutation accepts dedicated description fields
  // (verified live via introspection + Customer 7659 sanity).
  // Base + _de only — _en/_pl auto-filled by Mamamia AI translator.
  day_care_facility_description?: string;
  day_care_facility_description_de?: string;
  pets?: string;
  is_pet_dog?: boolean;
  is_pet_cat?: boolean;
  is_pet_other?: boolean;
  caregiver_accommodated?: string;
  // Equipment ids ([Int]) — populated with sensible default (TV + Bathroom)
  // since the patient form doesn't ask. Mamamia panel "Wyposażenie
  // zakwaterowania" is a required-looking multi-select; an empty list
  // surfaces as missing config to the agency.
  equipment_ids?: number[];
  // Bug #13l + Bug #16: Mamamia panel "Lokalizacja opieki" reads z
  // customer_contract.location_id (NIE z Customer.location_id top-level).
  // Beta miała plural patient_contracts + invoice_contract — prod ma
  // singular customer_contract (1:1). Refactor 2026-05-12 na singular
  // który działa na obu środowiskach.
  customer_contract?: { location_id?: number };
  customer_caregiver_wish?: CaregiverWishPatch;
  // Patient array.
  patients?: Array<Record<string, unknown>>;
}

export function mapPatientFormToUpdateCustomerInput(
  form: PatientFormShape,
  opts: { locationId?: number | null; existingPatientIds?: number[] } = {},
): MappedCustomerPatch {
  const patch: MappedCustomerPatch = {};
  const ids = opts.existingPatientIds ?? [];

  // Patient 1 always present.
  const patients: Array<Record<string, unknown>> = [
    buildPatient(
      form.geschlecht,
      form.geburtsjahr,
      form.pflegegrad,
      form.mobilitaet,
      form.nacht,
      form.heben,
      form.demenz,
      form.inkontinenz,
      form.gewicht,
      form.groesse,
      ids[0],
    ),
  ];

  // Patient 2 when "anzahl=2".
  if (form.anzahl === '2') {
    patients.push(buildPatient(
      form.p2_geschlecht,
      form.p2_geburtsjahr,
      form.p2_pflegegrad,
      form.p2_mobilitaet,
      form.p2_nacht,
      form.p2_heben,
      form.p2_demenz,
      form.p2_inkontinenz,
      form.p2_gewicht,
      form.p2_groesse,
      ids[1],
    ));
  }

  patch.patients = patients;

  // Location — prefer explicit id from autocomplete; else custom text "PLZ Ort".
  // Bug #13l + Bug #16: Mamamia panel "Lokalizacja opieki" czyta z
  // customer_contract.location_id. Singular field na obu środowiskach
  // (beta + prod). Patrz comment w MappedCustomerPatch type.
  if (opts.locationId) {
    patch.location_id = opts.locationId;
    patch.customer_contract = { location_id: opts.locationId };
  } else if (form.plz || form.ort) {
    patch.location_custom_text = `${form.plz} ${form.ort}`.trim();
  }

  // ── Customer-level fields ────────────────────────────────────────────
  const acc = accommodationToApi(form.wohnungstyp);
  if (acc) patch.accommodation = acc;

  const urb = urbanizationIdToApi(form.urbanisierung);
  if (urb !== null) patch.urbanization_id = urb;

  const dcf = dayCareFacilityToApi(form.pflegedienst);
  if (dcf) patch.day_care_facility = dcf;
  // pflegedienst description: serialize frequency + tasks and stash on
  // `job_description` (the only writable free-text field on UpdateCustomer
  // — the dedicated day_care_facility_description column is read-only via
  // GraphQL). See `MappedCustomerPatch` comment for context.

  const petsObj = petsToApi(form.tiere);
  if (petsObj.pets) {
    patch.pets = petsObj.pets;
    patch.is_pet_dog = petsObj.is_pet_dog;
    patch.is_pet_cat = petsObj.is_pet_cat;
    patch.is_pet_other = petsObj.is_pet_other;
  }

  const cga = caregiverAccommodatedToApi(form.unterbringung);
  if (cga) patch.caregiver_accommodated = cga;

  // other_people_in_house — from form.haushalt ('Ja'/'Nein'), NOT from anzahl.
  // anzahl = how many people need care; haushalt = are there OTHER non-care
  // people in the household (maps from calculator's weitere_personen: ja/nein).
  if (form.haushalt === 'Ja') patch.other_people_in_house = 'yes';
  else if (form.haushalt === 'Nein') patch.other_people_in_house = 'no';

  const fam = yesNoToApi(form.familieNahe);
  if (fam) patch.has_family_near_by = fam;

  const net = yesNoToApi(form.internet);
  if (net) patch.internet = net;

  // ── customer_caregiver_wish nested ───────────────────────────────────
  // wunschGeschlecht / rauchen / aufgaben / sonstigeWuensche all live
  // here — they are caregiver preferences, NOT customer attributes.
  // Pre-2026-04-28 audit they leaked into smoking_household + job_description.
  const wish: CaregiverWishPatch = {};
  const wg = wishGenderToApi(form.wunschGeschlecht);
  if (wg) wish.gender = wg;
  const ws = wishSmokingToApi(form.rauchen);
  if (ws) wish.smoking = ws;
  // Mamamia `customer_caregiver_wish.driving_license` is the CUSTOMER'S
  // REQUIREMENT toward the caregiver:
  //   "yes"           = customer requires a caregiver with a license
  //   "not_important" = customer doesn't care either way
  //   ("no" would mean "I require a caregiver WITHOUT a license" — nonsense;
  //    not a real enum value, Mamamia resolver NPE's on it.)
  // UI label "Nein" means "I don't need a driver", which semantically maps
  // to "not_important", not to a literal "no" requirement. This matches the
  // onboard mapper (mapDrivingLicense in onboard-to-mamamia/mappers.ts).
  if (form.fuehrerschein === 'Ja') wish.driving_license = 'yes';
  else if (form.fuehrerschein === 'Nein') wish.driving_license = 'not_important';
  const wgear = form.fuehrerschein === 'Ja' ? wishDrivingGearboxToApi(form.wunschGetriebe) : undefined;
  if (wgear) wish.driving_license_gearbox = wgear;
  if (form.aufgaben) {
    wish.tasks = form.aufgaben;
    wish.tasks_de = form.aufgaben;
  }
  if (form.sonstigeWuensche) {
    wish.other_wishes = form.sonstigeWuensche;
    wish.other_wishes_de = form.sonstigeWuensche;
  }
  // Mamamia panel "Czy opiekun musi robić zakupy?" is a mandatory-looking
  // dropdown but the patient form doesn't ask. Default 'no' (prod-most-
  // common at 43%) so the agency doesn't see an empty field. Customer
  // can update via panel if needed.
  wish.shopping = 'no';
  if (Object.keys(wish).length > 0) {
    patch.customer_caregiver_wish = wish;
  }

  // ── equipment_ids: derived from form.badezimmer (Eigenes Badezimmer).
  // id=1 = Own TV (always included — assumed standard).
  // id=2 = Own Bathroom — included only when customer answers 'Ja'.
  // Mamamia panel "Wyposażenie zakwaterowania" shows "Bitte wählen" when
  // equipment_ids is empty; TV ensures the field is never blank.
  const equipIds = [1]; // own TV always
  if (form.badezimmer === 'Ja') equipIds.push(2);
  patch.equipment_ids = equipIds;

  // ── Pflegedienst description — dedicated fields (Bug #13k) ────────────
  // Mamamia panel "Jak często i jakie zadania wykonuje Pflegedienst?" is
  // backed by `day_care_facility_description{,_de,_en,_pl}`. Schema
  // accepts these args on UpdateCustomer (verified live 2026-05-07 on
  // Customer 7659). Send 3 locales — Mamamia stores them independently.
  // The no-locale `day_care_facility_description` mirrors `_de` so panel
  // language fallback works.
  if (dcf === 'yes') {
    const desc = buildDayCareFacilityDescription(
      form.pflegedienstHaeufigkeit ?? '',
      form.pflegedienstAufgaben ?? '',
    );
    if (desc) {
      // base + _de only; _en/_pl auto-filled by Mamamia AI translator.
      patch.day_care_facility_description = desc.de;
      patch.day_care_facility_description_de = desc.de;
    }
  }

  // ── job_description: auto-summary + medical diagnoses ─────────────────
  // Auto-summary gives caregivers / agency a quick picture of the
  // situation since the form doesn't have a "krótki opis sytuacji"
  // free-text. Diagnosen append. Pflegedienst details NO longer pakowane
  // tutaj — siedzą na dedykowanych polach (Bug #13k).
  const jobParts: string[] = [];
  jobParts.push(buildJobDescriptionSummary(form));
  if (form.diagnosen) {
    jobParts.push(`Diagnosen: ${form.diagnosen}`);
  }
  // Send to both base and _de — matches what the Mamamia panel sends
  // on a manual agent save (verified live on customer 8528, 2026-05-15).
  // Mamamia backend AI translator fills _en/_pl from the German source.
  const jobDescription = jobParts.join(' | ');
  patch.job_description = jobDescription;
  patch.job_description_de = jobDescription;

  return patch;
}
