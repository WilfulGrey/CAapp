// Shared Multi-Job sync helpers: derive lead_jobs rows from a Mamamia
// Customer's job_offers. Single source of truth for the status mapping,
// used by BOTH:
//   - mamamia-proxy  (on-demand sync inside listLeadJobs, when the customer
//     opens the "Alle meine Einsätze" overview), and
//   - detect-caregiver-events (background cron, every 15 min per active lead).
// Keeping the derivation here means tuning the mapping (e.g. adding a
// cancellation → storniert case) updates both call sites at once.

export const GET_CUSTOMER_JOB_OFFERS = /* GraphQL */ `
  query GetCustomerJobOffers($id: Int!) {
    Customer(id: $id) {
      id
      job_offers {
        id
        status
        arrival_at
        departure_at
        applications_count
        final_confirmation { id caregiver { first_name last_name } }
      }
    }
  }
`;

export type RawJobOffer = {
  id?: number | null;
  status?: string | null;
  arrival_at?: string | null;
  departure_at?: string | null;
  applications_count?: number | null;
  final_confirmation?:
    | { id?: number | null; caregiver?: { first_name?: string | null; last_name?: string | null } | null }
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
      bewerbungen: typeof jo.applications_count === "number" ? jo.applications_count : null,
    });
  }
  return { rows, skipped };
}
