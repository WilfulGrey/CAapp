// Shared Multi-Job sync helpers: derive lead_jobs rows from a Mamamia
// Customer's job_offers. Single source of truth for the status mapping,
// used by BOTH:
//   - mamamia-proxy  (on-demand sync inside listLeadJobs, when the customer
//     opens the "Alle meine Einsätze" overview), and
//   - detect-caregiver-events (background cron, every 15 min per active lead).
// Keeping the derivation here means tuning the mapping (e.g. adding a
// cancellation → storniert case) updates both call sites at once.

// One Customer fetch serves two purposes for detect-caregiver-events: the
// job_offers (multi-job scan set + lead_jobs mirror) AND the identity fields
// for the reverse-sync (team edits in Mamamia → leads, see buildLeadIdentityPatch).
// The identity fields are harmless for mamamia-proxy's listLeadJobs (it ignores
// them). Op name stays GetCustomerJobOffers so existing test-mock routing holds.
export const GET_CUSTOMER_JOB_OFFERS = /* GraphQL */ `
  query GetCustomerJobOffers($id: Int!) {
    Customer(id: $id) {
      id
      first_name
      last_name
      email
      phone
      customer_contract {
        first_name
        last_name
        phone
        email
        zip_code
        city
        street_number
      }
      job_offers {
        id
        status
        arrival_at
        departure_at
        final_confirmation { id caregiver { first_name last_name } }
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

// ─── Reverse-sync: Mamamia Customer → leads identity ─────────────────────────
// After onboarding (one-way lead → Mamamia), the ops team manages the customer
// in Mamamia. When they fill/correct a field there (e.g. enter the real patient,
// who was unknown at onboard), nothing pulls it back → the kostenrechner admin
// (which reads `leads`) stays stale. buildLeadIdentityPatch maps the current
// Mamamia Customer back onto the `leads` columns the admin shows.
//
// Mamamia's model (VERIFIED LIVE on customer 7737):
//   Customer top-level   = the CONTACT person / Osoba Kontaktowa (the orderer our
//                          lead represents — John Smith on 7737).
//   customer_contract    = the CARE RECIPIENT / patient + the Einsatzort/address
//                          (Hans Kloss, Kassel on 7737).
// We must NOT conflate the two: the contact is NOT the patient.

// The Mamamia Customer fields the reverse-sync reads (selected by
// GET_CUSTOMER_JOB_OFFERS above). All optional/nullable — Mamamia may omit any.
export interface CustomerContract {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  zip_code?: string | null;
  city?: string | null;
  street_number?: string | null;
}

export interface CustomerIdentity {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  customer_contract?: CustomerContract | null;
}

// The subset of `leads` columns the reverse-sync touches. A LeadRow (detect's
// shape) is structurally assignable to this.
export interface LeadIdentity {
  patient_vorname?: string | null;
  patient_nachname?: string | null;
  email?: string | null;
  telefon?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  patient_street?: string | null;
  patient_zip?: string | null;
  patient_city?: string | null;
}

// Build the leads patch for a team edit on the Mamamia Customer. Mamamia is the
// source of truth: a column is included ONLY when the Mamamia value is present
// (non-empty after trim) AND differs from the current lead value. Returns ONLY
// the changed columns — an empty object means there's nothing to update. Pure
// (no I/O), so it's unit-testable.
//
// Mapping (Mamamia → leads), per the verified model above:
//   Customer.first_name / last_name            → vorname / nachname                  (the CONTACT)
//   Customer.email / phone                      → email / telefon                     (the contact)
//   customer_contract.first_name / last_name    → patient_vorname / patient_nachname  (the PATIENT)
//   customer_contract.street_number/zip/city    → patient_street / patient_zip / patient_city (Einsatzort)
export function buildLeadIdentityPatch(
  customer: CustomerIdentity,
  lead: LeadIdentity,
): Partial<LeadIdentity> {
  const patch: Partial<LeadIdentity> = {};
  const cc = customer.customer_contract ?? null;

  const consider = (col: keyof LeadIdentity, raw: string | null | undefined): void => {
    if (typeof raw !== "string") return;
    const next = raw.trim();
    if (next.length === 0) return;
    const current = typeof lead[col] === "string" ? (lead[col] as string).trim() : "";
    if (next === current) return;
    patch[col] = next;
  };

  // Customer top-level = the CONTACT person (Osoba Kontaktowa) — the orderer our
  // lead represents. (NOT the patient: verified live on 7737, Customer = John Smith.)
  consider("vorname", customer.first_name);
  consider("nachname", customer.last_name);
  consider("email", customer.email);
  consider("telefon", customer.phone);

  // customer_contract = the care recipient (the PATIENT) + Einsatzort. Skipped
  // entirely when there's no contract yet. (7737: customer_contract = Hans Kloss.)
  if (cc) {
    consider("patient_vorname", cc.first_name);
    consider("patient_nachname", cc.last_name);
    consider("patient_street", cc.street_number);
    consider("patient_zip", cc.zip_code);
    consider("patient_city", cc.city);
  }

  return patch;
}
