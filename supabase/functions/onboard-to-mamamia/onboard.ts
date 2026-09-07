import type { Lead, OnboardResult } from "./types.ts";
import type { SessionPayload } from "../_shared/sessionTypes.ts";
import {
  buildCustomerInput,
  buildJobOfferTitle,
  computeArrivalDate,
  extractPlzFromLead,
} from "./mappers.ts";
import { getOrRefreshAgencyToken, mamamiaRequest } from "../_shared/mamamiaClient.ts";
import { loginAsAgency, panelMutateAsCustomer } from "../_shared/mamamiaPanelClient.ts";

// ─── Supabase-like interface (dependency injection for testability) ────────

export interface SupabaseLike {
  fetchLead(token: string): Lead | null | Promise<Lead | null>;
  updateLead(id: string, patch: Partial<Lead>): void | Promise<void>;
  // Multi-Job (Variant A): resolve a specific job of the lead by its
  // lead_jobs.id. The leadId filter IS the ownership check — returns null for
  // an unknown/foreign job_id, so the caller falls back to the lead's default
  // job (never cross-lead). Optional: a SupabaseLike without it simply ignores
  // job_id (→ default), keeping old callers / tests working.
  fetchLeadJob?(
    jobId: string,
    leadId: string,
  ): Promise<{ mamamia_job_offer_id: number } | null>;
  // Multi-Job (Opcja B, Dachs 8899): der NEUESTE 'geplant'-Job des Leads aus
  // lead_jobs (Spiegel via detect-Cron). Einstieg OHNE ?job= landet auf ihm —
  // der Kunde sieht den AKTIVEN Einsatz (neue Bewerbungen) statt des alten
  // gebuchten Jobs. Optional wie fetchLeadJob (alte Fakes kompilieren).
  fetchNewestPlannedJob?(
    leadId: string,
  ): Promise<{ mamamia_job_offer_id: number } | null>;
  // Registry #54 — atomowy claim: JEDEN UPDATE `... where id=$1 and
  // mamamia_customer_id is null and (mamamia_onboarding_started_at is null or
  // < staleBefore)`. true = ten wołający tworzy klienta; false = ktoś inny
  // właśnie to robi (czekamy na jego wynik zamiast zakładać drugiego klienta).
  // Optional: fake bez tej metody = stare zachowanie (bez claimu).
  claimOnboarding?(leadId: string, staleBefore: string): Promise<boolean>;
}

// Claim starszy niż to = padnięty proces (edge fn ubita w trakcie) → wolno przejąć.
const CLAIM_STALE_MS = 2 * 60 * 1000;
// Czekanie na cudzy onboard: onboard trwa 2–10 s (LoginAgency + Locations +
// StoreCustomer + StoreJobOffer + panel push), 25 s to komfortowy margines.
const WAIT_POLL_MS = 1000;
const WAIT_MAX_POLLS = 25;

// ─── Secrets bundle ─────────────────────────────────────────────────────────

export interface OnboardSecrets {
  supabaseUrl: string;
  supabaseServiceKey: string;
  mamamiaEndpoint: string;
  mamamiaAuthEndpoint: string;
  mamamiaAgencyEmail: string;
  mamamiaAgencyPassword: string;
  sessionJwtSecret: string;
  // Panel (Sanctum) base URL, e.g. https://beta.mamamia.app/backend. Used to
  // mirror the portal token onto the Mamamia customer via the panel-only
  // UpdateCustomerToken mutation (same auth path as inviteCaregiver in proxy).
  mamamiaPanelUrl: string;
}

// ─── Options ────────────────────────────────────────────────────────────────

export interface OnboardOptions {
  leadToken: string;
  /** Multi-Job (Variant A): optional lead_jobs.id to scope the session to a
   *  specific job. Omitted (every old token / magic-link without &job) → the
   *  lead's default job (lead.mamamia_job_offer_id) — 100% backward compatible. */
  jobId?: string;
  /** Server-to-server only (lead-regenerate-token): refresh the portal-token
   *  mirror on the Mamamia customer even on a cache hit. The browser never
   *  sets it — a push costs 3 panel round-trips (csrf → LoginAgency →
   *  mutation, no session cache) and must not run on every portal open. */
  mirrorToken?: boolean;
  secrets: OnboardSecrets;
  supabase: SupabaseLike;
  fetchFn?: typeof fetch;
  now?: () => Date;
  /** Test hook — czekanie na cudzy onboard (Registry #54). */
  sleep?: (ms: number) => Promise<void>;
}

// ─── GraphQL mutations ─────────────────────────────────────────────────────
// Bug #13 refactor (2026-05-07): minimal StoreCustomer payload — only fields
// the calculator actually collects (or business defaults that aren't pytania
// do klienta). Customer lands as status='draft'; patient form save flips it
// to 'active' via UpdateCustomer. Contracts (customer_contract /
// invoice_contract / customer_contacts) populated at acceptance time via
// StoreConfirmation. See docs/customer-portal-flow.md §5 ⑤.

const STORE_CUSTOMER = /* GraphQL */ `
  mutation StoreCustomer(
    $first_name: String, $last_name: String, $email: String, $phone: String,
    $location_id: Int, $language_id: Int,
    $care_budget: Float, $monthly_salary: Float, $commission_agent_salary: Float,
    $arrival_at: String,
    $visibility: String,
    $other_people_in_house: String,
    $internet: String,
    $gender: String,
    $patients: [PatientInputType],
    $customer_caregiver_wish: CustomerCaregiverWishInputType
  ) {
    StoreCustomer(
      first_name: $first_name, last_name: $last_name, email: $email, phone: $phone,
      location_id: $location_id, language_id: $language_id,
      care_budget: $care_budget, monthly_salary: $monthly_salary,
      commission_agent_salary: $commission_agent_salary,
      arrival_at: $arrival_at,
      visibility: $visibility,
      other_people_in_house: $other_people_in_house,
      internet: $internet,
      gender: $gender,
      patients: $patients,
      customer_caregiver_wish: $customer_caregiver_wish
    ) { id customer_id status }
  }
`;

const LOCATIONS_QUERY = /* GraphQL */ `
  query Locations($search: String!) {
    Locations(search: $search) { id zip_code location country_code }
  }
`;

// Resolve a Mamamia location_id from a German PLZ. Returns null if no
// match or no PLZ supplied — caller falls back to location_custom_text.
async function lookupLocationId(args: {
  endpoint: string;
  token: string;
  plz: string | null;
  fetchFn: typeof fetch;
}): Promise<number | null> {
  if (!args.plz) return null;
  try {
    const r = await mamamiaRequest<{
      Locations: Array<{ id: number; zip_code: string; location: string; country_code: string }>;
    }>({
      endpoint: args.endpoint,
      token: args.token,
      query: LOCATIONS_QUERY,
      variables: { search: args.plz },
      fetchFn: args.fetchFn,
    });
    // Prefer DE matches; otherwise take the first.
    const de = r.Locations.find(l => l.country_code === "DE");
    return (de ?? r.Locations[0])?.id ?? null;
  } catch (_) {
    // Lookup failure is non-fatal — fallback to custom_text.
    return null;
  }
}

const STORE_JOB_OFFER = /* GraphQL */ `
  mutation StoreJobOffer(
    $customer_id: Int, $service_agency_id: Int,
    $title: String, $description: String,
    $salary_offered: Float, $salary_commission: Float,
    $visibility: String,
    $arrival_at: String
  ) {
    StoreJobOffer(
      customer_id: $customer_id, service_agency_id: $service_agency_id,
      title: $title, description: $description,
      salary_offered: $salary_offered, salary_commission: $salary_commission,
      visibility: $visibility,
      arrival_at: $arrival_at
    ) { id job_offer_id title status }
  }
`;

// Panel-only mutation (nie ma jej na agency /graphql) — mirror portalowego
// tokenu na rekord klienta w Mamamii, żeby zespół MM mógł wejść po tokenie do
// portalu klienta (?token=…) i pomóc wypełnić formularz pacjenta.
const UPDATE_CUSTOMER_TOKEN = /* GraphQL */ `
  mutation UpdateCustomerToken($id: Int!, $token: String) {
    UpdateCustomerToken(id: $id, token: $token) { id token }
  }
`;

// Primundus ServiceAgency id w Mamamia — per-tenant, zawsze z env.
//   beta.mamamia.app:           id = 18 (Primundus beta, used by STAGING)
//   backend.prod.mamamia.app:   id = 3  (Primundus prod, used by PROD)
// IDs są per-tenant — beta i prod to oddzielne bazy. Dla switch'a
// środowiska: query `{ ServiceAgency { id name } }` żeby potwierdzić
// aktualny id (singleton — zwraca rekord przypisany do zalogowanego
// agency user'a).
//
// MUST be set as Supabase secret per environment:
//   prod:    MAMAMIA_AGENCY_ID=3
//   staging: MAMAMIA_AGENCY_ID=18
// Throw on missing per Święta zasada nr 1 (NO SOFT FALLBACKS) — wrong
// agency_id silently routes new customers to wrong tenant.
//
// Read lazily (NOT at module load) so test files can import this module
// without needing the env var, and so cold-start errors surface in the
// onboard request handler (visible to the caller) rather than blowing
// up the function before any traffic arrives.
export function loadPrimundusAgencyId(): number {
  const raw = Deno.env.get("MAMAMIA_AGENCY_ID");
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error(
      "MAMAMIA_AGENCY_ID env var required (3 for prod Mamamia tenant, 18 for staging/beta tenant)",
    );
  }
  return parsed;
}

// Best-effort push tokenu portalu na klienta w Mamamii (panel-only mutation,
// sesja agency Sanctum — ta sama ścieżka co inviteCaregiver). Cel: zespół MM
// może otworzyć portal klienta po tokenie i pomóc wypełnić formularz pacjenta.
// NIGDY nie rzuca — awaria panelu nie może zablokować wejścia do portalu.
async function pushCustomerToken(args: {
  panelBaseUrl: string;
  agencyEmail: string;
  agencyPassword: string;
  customerId: number;
  token: string;
  fetchFn: typeof fetch;
}): Promise<void> {
  try {
    const session = await loginAsAgency(
      { baseUrl: args.panelBaseUrl, fetchFn: args.fetchFn },
      args.agencyEmail,
      args.agencyPassword,
    );
    const res = await panelMutateAsCustomer<{ UpdateCustomerToken: { id: number; token: string | null } }>(
      { baseUrl: args.panelBaseUrl, fetchFn: args.fetchFn },
      session,
      UPDATE_CUSTOMER_TOKEN,
      { id: args.customerId, token: args.token },
      "UpdateCustomerToken",
    );
    // Log what Mamamia ECHOED BACK, not what we sent — that is the only proof
    // the value landed. "No error" alone doesn't distinguish a stored token
    // from a silently ignored one.
    console.log(
      `[onboard] token mirrored for customer ${args.customerId}: stored=${(res?.UpdateCustomerToken?.token ?? "").slice(0, 8)}… sent=${args.token.slice(0, 8)}…`,
    );
  } catch (e) {
    console.warn(
      `[onboard] pushCustomerToken failed for customer ${args.customerId}: ${(e as Error).message}`,
    );
  }
}

// Multi-Job (Variant A): pick the session's job_offer_id. With no jobId
// (every old token / link without &job) it's the lead's default job —
// identical to pre-multi-job behaviour. With a jobId we scope to that
// lead_jobs row IF it belongs to the lead (ownership via leadId); an
// unknown/foreign job_id falls back to the default (safe — never cross-lead;
// robust — stale deep-links don't break the portal).
async function resolveScopedJobOfferId(
  supabase: SupabaseLike,
  leadId: string,
  defaultJobOfferId: number,
  jobId: string | undefined,
): Promise<number> {
  // Opcja B (Dachs 8899, 2026-07-22): Einstieg OHNE expliziten ?job= landet
  // auf dem AKTIVEN Job = neuester 'geplant' aus lead_jobs. Kunden mit einem
  // einzigen Job verhalten sich identisch (ihr Job ist der neueste geplant;
  // nach der Buchung gibt es keinen geplanten → Default). Multi-Job-Kunden
  // sehen den neuen Einsatz mit seinen Bewerbungen statt des alten gebuchten
  // (der über ?view=jobs / ?job= weiterhin erreichbar ist). Fail-soft: jeder
  // Fehler ⇒ bisheriger Default — der Portal-Eintritt darf NIE brechen.
  if (!jobId) {
    if (!supabase.fetchNewestPlannedJob) return defaultJobOfferId;
    try {
      const planned = await supabase.fetchNewestPlannedJob(leadId);
      if (planned && Number.isInteger(planned.mamamia_job_offer_id)) {
        return planned.mamamia_job_offer_id;
      }
    } catch (e) {
      console.warn(
        `[onboard] fetchNewestPlannedJob failed for lead ${leadId}: ${(e as Error).message} — falling back to default job`,
      );
    }
    return defaultJobOfferId;
  }
  if (!supabase.fetchLeadJob) return defaultJobOfferId;
  // Best-effort: job_id only selects WHICH job to show. A lookup failure
  // (lead_jobs not yet migrated on this env, transient DB error, …) must NOT
  // break portal entry — onboard is the gateway. Any problem → degrade to the
  // lead's default job. Old tokens (no job_id) never reach here.
  try {
    const leadJob = await supabase.fetchLeadJob(jobId, leadId);
    if (leadJob && Number.isInteger(leadJob.mamamia_job_offer_id)) {
      return leadJob.mamamia_job_offer_id;
    }
    console.warn(
      `[onboard] job_id ${jobId} not found for lead ${leadId} — falling back to default job`,
    );
  } catch (e) {
    console.warn(
      `[onboard] fetchLeadJob failed for ${jobId}/${leadId}: ${(e as Error).message} — falling back to default job`,
    );
  }
  return defaultJobOfferId;
}

// ─── Main flow ─────────────────────────────────────────────────────────────

export async function onboardLead(opts: OnboardOptions): Promise<OnboardResult & { lead_id: string; email: string }> {
  const {
    leadToken, jobId, mirrorToken, secrets, supabase, fetchFn = globalThis.fetch, now = () => new Date(),
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  } = opts;

  // 1. Lookup lead
  const lead = await supabase.fetchLead(leadToken);
  if (!lead) {
    throw new Error("lead token expired or invalid");
  }

  // 2. Validate token not expired (defense in depth; fetchLead should filter too)
  if (lead.token_expires_at) {
    const expiresAt = new Date(lead.token_expires_at).getTime();
    if (expiresAt < now().getTime()) {
      throw new Error("lead token expired or invalid");
    }
  }

  // 3. Cache hit?
  if (lead.mamamia_customer_id && lead.mamamia_job_offer_id) {
    // Token rotated (lead-regenerate-token, any source) → refresh the mirror on
    // the Mamamia customer, otherwise MM staff keep the token from the FIRST
    // portal visit and their "open the customer's portal" link is dead.
    if (mirrorToken) {
      await pushCustomerToken({
        panelBaseUrl: secrets.mamamiaPanelUrl,
        agencyEmail: secrets.mamamiaAgencyEmail,
        agencyPassword: secrets.mamamiaAgencyPassword,
        customerId: lead.mamamia_customer_id,
        token: leadToken,
        fetchFn,
      });
    }
    return {
      customer_id: lead.mamamia_customer_id,
      job_offer_id: await resolveScopedJobOfferId(
        supabase, lead.id, lead.mamamia_job_offer_id, jobId,
      ),
      lead_id: lead.id,
      email: lead.email,
    };
  }

  // 3b. Claim (Registry #54): przeglądarka (redirect z kalkulatora) i
  //     send-scheduled-emails (Empfehlungs-Mail) wołają onboard w tej samej
  //     sekundzie; bez claimu oba robią cache-miss → DWÓCH klientów w MM
  //     (prod 2026-09-07: 10693 + 10694, MM nie ma delete). Przegrany czeka
  //     na wynik zwycięzcy i zwraca go jak cache-hit.
  if (supabase.claimOnboarding) {
    const staleBefore = new Date(now().getTime() - CLAIM_STALE_MS).toISOString();
    const claimed = await supabase.claimOnboarding(lead.id, staleBefore);
    if (!claimed) {
      const done = await waitForOnboarded(supabase, leadToken, sleep);
      if (!done) throw new Error("onboarding in progress");
      console.log(`[onboard] lead ${lead.id}: joined concurrent onboard → customer ${done.mamamia_customer_id}`);
      return {
        customer_id: done.mamamia_customer_id,
        job_offer_id: await resolveScopedJobOfferId(
          supabase, done.id, done.mamamia_job_offer_id, jobId,
        ),
        lead_id: done.id,
        email: done.email,
      };
    }
  }

  try {
    return await createCustomerAndJob({ lead, leadToken, jobId, secrets, supabase, fetchFn, now });
  } catch (e) {
    // Błąd → zwolnij claim, żeby odświeżenie strony mogło spróbować od razu
    // (inaczej 2 min blokady z "onboarding in progress").
    if (supabase.claimOnboarding) {
      try { await supabase.updateLead(lead.id, { mamamia_onboarding_started_at: null }); } catch { /* best-effort */ }
    }
    throw e;
  }
}

async function waitForOnboarded(
  supabase: SupabaseLike,
  leadToken: string,
  sleep: (ms: number) => Promise<void>,
): Promise<(Lead & { mamamia_customer_id: number; mamamia_job_offer_id: number }) | null> {
  for (let i = 0; i < WAIT_MAX_POLLS; i++) {
    await sleep(WAIT_POLL_MS);
    const l = await supabase.fetchLead(leadToken);
    if (l?.mamamia_customer_id && l.mamamia_job_offer_id) {
      return l as Lead & { mamamia_customer_id: number; mamamia_job_offer_id: number };
    }
  }
  return null;
}

async function createCustomerAndJob(args: {
  lead: Lead;
  leadToken: string;
  jobId?: string;
  secrets: OnboardSecrets;
  supabase: SupabaseLike;
  fetchFn: typeof fetch;
  now: () => Date;
}): Promise<OnboardResult & { lead_id: string; email: string }> {
  const { lead, leadToken, jobId, secrets, supabase, fetchFn, now } = args;

  // 4. Login as agency (cached)
  const agencyToken = await getOrRefreshAgencyToken({
    authEndpoint: secrets.mamamiaAuthEndpoint,
    email: secrets.mamamiaAgencyEmail,
    password: secrets.mamamiaAgencyPassword,
    fetchFn,
  });

  // 5. Resolve location_id — primarily from lead.patient_zip (set during
  //    Primundus stage-B "Betreuung beauftragen" form), with formularDaten
  //    fallback. Lookup is best-effort: in MVP stage B never runs, so PLZ is
  //    null and we ship StoreCustomer without location_id; patient form save
  //    propagates location via UpdateCustomer (Bug #13 refactor).
  const plz = extractPlzFromLead(lead);
  const locationId = await lookupLocationId({
    endpoint: secrets.mamamiaEndpoint,
    token: agencyToken,
    plz,
    fetchFn,
  });

  // 6. StoreCustomer — minimal payload (Bug #13: no UX-fake defaults)
  const nowISO = now().toISOString();
  const customerInput = buildCustomerInput(lead, locationId, nowISO);

  const customerResp = await mamamiaRequest<{
    StoreCustomer: { id: number; customer_id: string; status: string };
  }>({
    endpoint: secrets.mamamiaEndpoint,
    token: agencyToken,
    query: STORE_CUSTOMER,
    variables: customerInput as unknown as Record<string, unknown>,
    fetchFn,
  });

  const mamamiaCustomerId = customerResp.StoreCustomer.id;
  const careBudget = lead.kalkulation?.bruttopreis ?? null;
  const fd = lead.kalkulation?.formularDaten ?? {};

  // 7. StoreJobOffer — arrival_at must match Customer.arrival_at (set above)
  const arrivalAt = computeArrivalDate(lead.care_start_timing, nowISO);
  const title = buildJobOfferTitle(lead);

  const joResp = await mamamiaRequest<{
    StoreJobOffer: { id: number; job_offer_id: string; title: string; status: string };
  }>({
    endpoint: secrets.mamamiaEndpoint,
    token: agencyToken,
    query: STORE_JOB_OFFER,
    variables: {
      customer_id: mamamiaCustomerId,
      service_agency_id: loadPrimundusAgencyId(),
      title,
      // Portal-Leads (Registry #43): der Kontextblock aus der Portal-Mail
      // (Beziehung, Lebenssituation, Dauer, Zimmer, Gewicht, Krankheiten …)
      // — die Agentur sieht die Details ab der ersten Minute im Job.
      description: typeof fd?.portal_details === "string" && fd.portal_details
        ? `Auto-created from Primundus kostenrechner\n\n${fd.portal_details}`
        : "Auto-created from Primundus kostenrechner",
      salary_offered: careBudget,
      salary_commission: 10,    // Primundus default commission, panel rejects 0 (300 → 10 wg decyzji 2026-05-11)
      visibility: "public",
      arrival_at: arrivalAt,
    },
    fetchFn,
  });

  const mamamiaJobOfferId = joResp.StoreJobOffer.id;

  // 7. Persist cache in Supabase
  await supabase.updateLead(lead.id, {
    mamamia_customer_id: mamamiaCustomerId,
    mamamia_job_offer_id: mamamiaJobOfferId,
    mamamia_user_token: agencyToken,
    mamamia_onboarded_at: now().toISOString(),
  });

  // 8. Mirror the portal token onto the Mamamia customer (best-effort, panel-only)
  //    so MM staff can open the customer's portal and help fill the patient form.
  await pushCustomerToken({
    panelBaseUrl: secrets.mamamiaPanelUrl,
    agencyEmail: secrets.mamamiaAgencyEmail,
    agencyPassword: secrets.mamamiaAgencyPassword,
    customerId: mamamiaCustomerId,
    token: leadToken,
    fetchFn,
  });

  return {
    customer_id: mamamiaCustomerId,
    job_offer_id: await resolveScopedJobOfferId(
      supabase, lead.id, mamamiaJobOfferId, jobId,
    ),
    lead_id: lead.id,
    email: lead.email,
  };
}

// Build session payload ready for JWT signing (used by handler after onboarding)
export function sessionPayloadFromResult(
  result: OnboardResult & { lead_id: string; email: string },
): SessionPayload {
  return {
    customer_id: result.customer_id,
    job_offer_id: result.job_offer_id,
    lead_id: result.lead_id,
    email: result.email,
  };
}
