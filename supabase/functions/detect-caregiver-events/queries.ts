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
  germany_skill: string | null;   // level_0..level_4 → Deutsch-Level (CEFR)
  hp_caregiver_id: number | null;
  hp_total_jobs: number | null;
  hp_total_days: number | null;
  hp_avg_mission_days: number | null;
  avatar_retouched: { aws_url: string | null } | null;
  // Neuer Promo-Avatar — höchste Priorität in der Foto-Queue
  // (promo → retouched). Optional, damit bestehende Test-Fixtures ohne das
  // Feld weiter kompilieren; die Query selektiert es, Runtime liefert es.
  avatar_retouched_promo?: { aws_url: string | null } | null;
  // Roh-Avatar — LETZTER Foto-Fallback (promo → retouched → avatar), exakt wie
  // im Portal (mappers.ts). Viele Pflegekräfte haben (noch) kein retouched/
  // promo-Foto; ohne diesen Fallback zeigt die Mail dann nur Initialen
  // (Martin, 18.08.: „warum haben wir häufig keine Fotos").
  avatar?: { aws_url: string | null } | null;
  about_de: string | null;
}

export interface ApplicationNode {
  id: number;
  caregiver_id: number | null;
  // NICHT selektiert: JobOfferApplicationsWithPagination kennt rejected_at
  // auf prod nicht — die Selektion brach dort JEDE Abfrage (11.-13.07.:
  // keine Bewerbungs-Erkennung, keine Kundenmails). Panel-Ablehnungen
  // erkennt der Sweep ueber das Fehlen der Application; Portal-Rejects
  // stoppen ueber lead_events. Feld bleibt optional fuer den Sweep-Check.
  rejected_at?: string | null;
  // Konditionen der Bewerbung — für Mail B (Bewerbung) ans Kunden-Postfach.
  salary: number | null;          // Monatssatz €/Monat
  arrival_at: string | null;      // Anreisedatum (ISO)
  departure_at: string | null;    // vorauss. Abreisedatum (ISO)
  arrival_fee: number | null;     // Anreisekosten €
  departure_fee: number | null;   // Abreisekosten €
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
  germany_skill
  hp_caregiver_id
  hp_total_jobs
  hp_total_days
  hp_avg_mission_days
  avatar_retouched_promo { aws_url }
  avatar_retouched { aws_url }
  avatar { aws_url }
  about_de
`;

export const LIST_APPLICATIONS = /* GraphQL */ `
  query DetectListApplications($job_offer_id: Int!, $limit: Int, $page: Int) {
    JobOfferApplicationsWithPagination(job_offer_id: $job_offer_id, limit: $limit, page: $page) {
      total
      data {
        id
        caregiver_id
        salary
        arrival_at
        departure_at
        arrival_fee
        departure_fee
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

// K5 — Bewerbung ablehnen (gleiche Mutation wie im mamamia-proxy, hier
// server-side mit Agency-Token für das automatische Ablehnen nach 48h
// ohne Kundenreaktion). Lokale Kopie bewusst (kein cross-folder import).
export const REJECT_APPLICATION = /* GraphQL */ `
  mutation RejectApplication($id: Int, $reject_message: String) {
    RejectApplication(id: $id, reject_message: $reject_message) {
      id
      rejected_at
      reject_message
    }
  }
`;

export interface RejectApplicationResponse {
  RejectApplication: {
    id: number;
    rejected_at: string | null;
    reject_message: string | null;
  } | null;
}
