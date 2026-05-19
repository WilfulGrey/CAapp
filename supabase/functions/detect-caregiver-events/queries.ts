// GraphQL queries dla detect-caregiver-events.
//
// Lokalne kopie zamiast importu z mamamia-proxy/operations.ts żeby uniknąć
// cross-folder coupling — ta funkcja działa server-side z agency token i
// nie współdzieli sesji z proxy.

export interface CaregiverNode {
  id: number;
  first_name: string | null;
  last_name: string | null;
  year_of_birth: number | null;
  care_experience: number | null;
  hp_caregiver_id: number | null;
  hp_total_jobs: number | null;
  hp_total_days: number | null;
  hp_avg_mission_days: number | null;
  avatar_retouched: { aws_url: string | null } | null;
  about_de: string | null;
}

export interface ApplicationNode {
  id: number;
  caregiver_id: number | null;
  caregiver: CaregiverNode | null;
}

export interface InterestNode {
  id: number;
  caregiver_id: number | null;
  rejected_at: string | null;
  caregiver: CaregiverNode | null;
}

// hp_caregiver_id MUSI być w każdej query Caregiver — memory note (Mamamia
// Laravel resolver nie eager-loaduje hp_* pól bez tego).
const CAREGIVER_FRAGMENT = /* GraphQL */ `
  id
  first_name
  last_name
  year_of_birth
  care_experience
  hp_caregiver_id
  hp_total_jobs
  hp_total_days
  hp_avg_mission_days
  avatar_retouched { aws_url }
  about_de
`;

export const LIST_APPLICATIONS = /* GraphQL */ `
  query DetectListApplications($job_offer_id: Int!, $limit: Int, $page: Int) {
    JobOfferApplicationsWithPagination(job_offer_id: $job_offer_id, limit: $limit, page: $page) {
      total
      data {
        id
        caregiver_id
        caregiver {
          ${CAREGIVER_FRAGMENT}
        }
      }
    }
  }
`;

export const LIST_INTERESTS_FOR_OFFER = /* GraphQL */ `
  query DetectListInterests($id: Int!) {
    JobOffer(id: $id) {
      id
      interests {
        id
        caregiver_id
        rejected_at
        caregiver {
          ${CAREGIVER_FRAGMENT}
        }
      }
    }
  }
`;

export interface ListApplicationsResponse {
  JobOfferApplicationsWithPagination: {
    total: number;
    data: ApplicationNode[];
  };
}

export interface ListInterestsResponse {
  JobOffer: {
    id: number;
    interests: InterestNode[] | null;
  } | null;
}
