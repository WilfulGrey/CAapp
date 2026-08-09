// Shared Multi-Job sync helpers: derive lead_jobs rows from a Mamamia
// Customer's job_offers. Single source of truth for the status mapping,
// used by BOTH:
//   - mamamia-proxy  (on-demand sync inside listLeadJobs, when the customer
//     opens the "Alle meine Einsätze" overview), and
//   - detect-caregiver-events (background cron, every 15 min per active lead).
// Keeping the derivation here means tuning the mapping (e.g. adding a
// cancellation → storniert case) updates both call sites at once.

// final_confirmation-Selektion: id + created_at + final_confirmed_at +
// caregiver { id first_name last_name } sind live-verifiziert (SA-Portal
// fragt die Felder täglich ab; created_at per Sonde 2026-08-05 auf BEIDEN
// Tenants: beta Confirmation 667, prod Confirmation 4005). KEINE weiteren
// Felder ergänzen ohne Prod-Test — Lehre vom 11.07. (rejected_at brach
// jede Abfrage).
export const GET_CUSTOMER_JOB_OFFERS = /* GraphQL */ `
  query GetCustomerJobOffers($id: Int!) {
    Customer(id: $id) {
      id
      job_offers {
        id
        status
        arrival_at
        departure_at
        final_confirmation { id created_at final_confirmed_at caregiver { id first_name last_name } }
      }
    }
  }
`;

// Per-job application count. Mamamia does NOT populate JobOffer.applications_count
// (nor the nested `applications` relation) when reached via Customer.job_offers —
// both come back null/empty. The only reliable source is this top-level
// paginated query's `total`, so the sync fetches it per (geplant) job.
export const GET_JOB_OFFER_APPLICATION_COUNT = /* GraphQL */ `
  query LeadJobApplicationCount($job_offer_id: Int!) {
    JobOfferApplicationsWithPagination(job_offer_id: $job_offer_id, limit: 1, page: 1) {
      total
    }
  }
`;

export type RawJobOffer = {
  id?: number | null;
  status?: string | null;
  arrival_at?: string | null;
  departure_at?: string | null;
  final_confirmation?:
    | {
      id?: number | null;
      // Buchungszeitpunkt (Anlage der Confirmation) — der Frische-Anker des
      // Annahme-Detektors. final_confirmed_at kommt auf BEIDEN Tenants als
      // null zurück (Panel-Buchung UND Portal-Akzept; Sonde 2026-08-05) und
      // bleibt nur als Fallback selektiert, falls mamamia es je stempelt.
      created_at?: string | null;
      final_confirmed_at?: string | null;
      caregiver?: { id?: number | null; first_name?: string | null; last_name?: string | null } | null;
    }
    | null;
};

// One row ready to upsert into lead_jobs (mirror of a Mamamia JobOffer).
// 'laufend' is NOT produced here — the frontend derives it from
// (gebucht + anreise <= today < abreise). pflegekraft/bewerbungen feed the
// overview cards (Design-Paritaet): a booked job shows the caregiver, a
// planned one the application count.
export interface LeadJobUpsertRow {
  mamamia_job_offer_id: number;
  status: string;
  anreise: string | null;
  abreise: string | null;
  pflegekraft: string | null;
  bewerbungen: number | null;
}

// "Anna T." from the booked caregiver, or null. Trim so a missing last name
// doesn't leave a trailing space.
function caregiverName(jo: RawJobOffer): string | null {
  const c = jo.final_confirmation?.caregiver;
  if (!c) return null;
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return name.length > 0 ? name : null;
}

// yyyy-mm-dd "today" (UTC) — the comparison anchor for departure/abreise.
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Defensive lead_jobs.status derivation from a Mamamia JobOffer. KNOWN cases
// only; an unmapped JobOffer.status returns null → the caller SKIPS the job and
// LOGS the raw value, so we tune from real data (esp. cancellation → storniert)
// rather than mislabeling a job as active.
export function deriveLeadJobStatus(
  jo: RawJobOffer,
  today: string,
): { status: string | null; raw: string | null } {
  const raw = jo.status ?? null;
  const dep = (jo.departure_at ?? "").slice(0, 10);
  if (dep && dep < today) return { status: "abgeschlossen", raw };
  if (jo.final_confirmation?.id || jo.status === "on_job") return { status: "gebucht", raw };
  if (jo.status === "search") return { status: "geplant", raw };
  return { status: null, raw }; // unmapped (incl. cancellation) → skip + log
}

// Pure transform: a customer's raw job_offers → upsertable rows + the list of
// skipped (unmapped) offers so the caller can log them. No I/O.
export function buildLeadJobRows(
  offers: RawJobOffer[],
  today: string,
): { rows: LeadJobUpsertRow[]; skipped: Array<{ id: number; raw: string | null }> } {
  const rows: LeadJobUpsertRow[] = [];
  const skipped: Array<{ id: number; raw: string | null }> = [];
  for (const jo of offers) {
    if (typeof jo.id !== "number") continue;
    const { status, raw } = deriveLeadJobStatus(jo, today);
    if (!status) {
      skipped.push({ id: jo.id, raw });
      continue;
    }
    rows.push({
      mamamia_job_offer_id: jo.id,
      status,
      anreise: jo.arrival_at ? jo.arrival_at.slice(0, 10) : null,
      abreise: jo.departure_at ? jo.departure_at.slice(0, 10) : null,
      pflegekraft: caregiverName(jo),
      // Filled per-job by enrichBewerbungen() — buildLeadJobRows is pure (no I/O).
      bewerbungen: null,
    });
  }
  return { rows, skipped };
}

// Fill `bewerbungen` for the planned ("geplant") jobs by calling `fetchCount`
// (a per-job GET_JOB_OFFER_APPLICATION_COUNT, supplied by each caller using its
// own GraphQL runner). Only geplant jobs get a count — booked/laufend cards show
// the caregiver instead, abgeschlossen/storniert show nothing. Per-job
// best-effort: one failing count leaves that job's bewerbungen null, never aborts
// the whole sync. Mutates rows in place.
export async function enrichBewerbungen(
  rows: LeadJobUpsertRow[],
  fetchCount: (jobOfferId: number) => Promise<number | null>,
): Promise<void> {
  for (const row of rows) {
    if (row.status !== "geplant") continue;
    try {
      row.bewerbungen = await fetchCount(row.mamamia_job_offer_id);
    } catch {
      // best-effort — leave null
    }
  }
}
