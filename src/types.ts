export interface Assignment {
  startDate: string;
  endDate: string;
  postalCode: string;
  city: string;
  patientCount: number;
  mobility: string;
}

export interface Nurse {
  /** Mamamia Caregiver.id — used by useCaregiver to fetch full profile when modal opens. */
  caregiverId?: number;
  name: string;
  age: number;
  experience: string;
  availability: string;
  availableSoon: boolean;
  language: {
    level: string;
    bars: number;
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
