export interface Assignment {
  startDate: string;
  endDate: string;
  postalCode: string;
  city: string;
  patientCount: number;
  mobility: string;
}

export interface Nurse {
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
}
