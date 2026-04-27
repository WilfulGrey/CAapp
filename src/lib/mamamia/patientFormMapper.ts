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
  tiere: string; unterbringung: string; aufgaben: string;
  wunschGeschlecht: string; rauchen: string; sonstigeWuensche: string;
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

function parsePflegegrad(label: string): number | null {
  if (!label) return null;
  const m = label.match(/\d/);
  return m ? Number(m[0]) : null;
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

// smoking_household — verified prod enum: yes / no / yes_outside.
// Form question: "Darf die Betreuungsperson rauchen?" — yes/no only.
function smokingHouseholdToApi(v: string): 'yes' | 'no' | null {
  if (v === 'Ja') return 'yes';
  if (v === 'Nein') return 'no';
  // (yes_outside not exposed in form yet — future option.)
  return null;
}

// Lift / heben: Mamamia has `lift_id: Int` — unknown enum.
// Safe default: skip unless we know mapping. Include `features_condition` text later.
function hebenToApi(v: string): number | null {
  // TODO live-discover valid lift_id values. For now omit.
  if (v === 'Ja') return null;
  return null;
}

// Smoking household: form has "Ja"/"Nein" for caregiver smoking preference.
// NOTE: rauchen form field = "Darf die Betreuungsperson rauchen?" (is caregiver ALLOWED to smoke),
// which semantically maps better to `smoking_household` (yes = household accepts smoker).
function rauchenToApi(v: string): 'yes' | 'no' | null {
  return yesNoToApi(v);
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

  const pg = parsePflegegrad(pflegegrad);
  if (pg) p.care_level = pg;

  const mob = MOBILITY_BY_LABEL[mobility];
  if (mob !== undefined) p.mobility_id = mob;

  const na = nachtToApi(nacht);
  if (na) p.night_operations = na;

  const dem = dementiaToApi(demenz);
  if (dem) p.dementia = dem;

  const inc = incontinenceToApi(inkontinenz);
  Object.assign(p, inc);

  if (gewicht) p.weight = gewicht;
  if (groesse) p.height = groesse;

  const lift = hebenToApi(heben);
  if (lift !== null) p.lift_id = lift;

  return p;
}

export interface MappedCustomerPatch {
  // Fields that land on Customer root.
  job_description?: string;
  other_people_in_house?: string;
  has_family_near_by?: 'yes' | 'no';
  internet?: 'yes' | 'no';
  smoking_household?: 'yes' | 'no';
  accommodation?: string;
  location_id?: number;
  location_custom_text?: string;
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
  if (opts.locationId) {
    patch.location_id = opts.locationId;
  } else if (form.plz || form.ort) {
    patch.location_custom_text = `${form.plz} ${form.ort}`.trim();
  }

  // Customer-level enums (verified vs prod DB 2026-04-27).
  const acc = accommodationToApi(form.wohnungstyp);
  if (acc) patch.accommodation = acc;

  // other_people_in_house — derive from anzahl: 2 patients = yes, 1 = no.
  // (Form's `haushalt` field is read-only prefill from formularDaten.)
  if (form.anzahl === '2') patch.other_people_in_house = 'yes';
  else if (form.anzahl === '1') patch.other_people_in_house = 'no';

  const smoke = smokingHouseholdToApi(form.rauchen);
  if (smoke) patch.smoking_household = smoke;

  const fam = yesNoToApi(form.familieNahe);
  if (fam) patch.has_family_near_by = fam;

  const net = yesNoToApi(form.internet);
  if (net) patch.internet = net;

  // Combine free-text fields into job_description (best-fit placeholder).
  const jobDescriptionParts: string[] = [];
  if (form.diagnosen) jobDescriptionParts.push(`Diagnosen: ${form.diagnosen}`);
  if (form.aufgaben) jobDescriptionParts.push(`Aufgaben: ${form.aufgaben}`);
  if (form.sonstigeWuensche) jobDescriptionParts.push(`Sonstige Wünsche: ${form.sonstigeWuensche}`);
  if (jobDescriptionParts.length > 0) {
    patch.job_description = jobDescriptionParts.join('\n\n');
  }

  return patch;
}
