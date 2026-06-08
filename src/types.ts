export interface Assignment {
  startDate: string;
  endDate: string;
  postalCode: string;
  city: string;
  patientCount: number;
  /** Human-readable assignment length, derived from start/end dates
   *  (e.g. "3 Monate", "6 Wochen"). */
  duration: string;
}

export interface Nurse {
  /** Mamamia Caregiver.id — used by useCaregiver to fetch full profile when modal opens. */
  caregiverId?: number;
  name: string;
  age: number;
  experience: string;
  /** Numeric years of care experience, parsed from `care_experience` or
   *  derived from `hp_total_days`. Used by nurseLevel badge formula
   *  (score = experienceYears + history.assignments). */
  experienceYears: number;
  availability: string;
  availableSoon: boolean;
  language: {
    level: string;
    bars: number;
    /** 3-Stufen-Bucket der Mamamia-germany_skill (level_0..4) — Single
     *  Source of Truth für Filter und Aufpreis-Berechnung im Portal. */
    bucket?: import('./lib/mamamia/mappers').GermanySkillBucket | null;
  };
  color: string;
  addedTime: string;
  isLive: boolean;
  gender: 'female' | 'male';
  image?: string;
  history?: {
    assignments: number;
    avgDurationMonths: number;
  };
  detailedAssignments?: Assignment[];
  /** URL zur Referenzen-PDF der Pflegekraft — eine Datei, die eine oder
   *  mehrere Empfehlungen früherer Familien enthalten kann. Wird im
   *  Profil-Modal als prominenter Link gerendert und in den Listen-Karten
   *  als kleines Icon-Badge angezeigt, sofern vorhanden. Quelle: Mamamia
   *  Caregiver-Feld (Backend-Anbindung folgt in separatem PR — bis dahin
   *  nur in Preview/Tests befüllt). */
  referencePdfUrl?: string | null;
  // Real Caregiver profile fields (from Mamamia GET_CAREGIVER).
  // Optional because Matching cards initially only have a caregiver subset;
  // populated when the modal opens and useCaregiver fetches the full profile.
  profile?: {
    nationality?: string;
    yearOfBirth?: number;
    weight?: string;
    height?: string;
    maritalStatus?: string;
    drivingLicense?: boolean;
    /** Gearbox label appended to "Ja" — "Automatik", "Schaltung", "Beide".
     *  Comes from Mamamia's `driving_license` enum: yes_automatic /
     *  yes_manual / yes_automatic_manual. */
    drivingLicenseGearbox?: string;
    isNurse?: boolean;
    smoking?: 'no' | 'yes' | 'yes_outside';
    education?: string;
    qualifications?: string;
    motivation?: string;
    aboutDe?: string;
    furtherHobbies?: string;
    hobbies: string[];
    personalities: string[];
    acceptedMobilities: string[];
    otherLanguages: { name: string; level: string }[];
  };
}
