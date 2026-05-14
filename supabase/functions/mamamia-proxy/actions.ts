import { mamamiaRequest } from "../_shared/mamamiaClient.ts";
import { loginAsAgency, panelMutateAsCustomer } from "../_shared/mamamiaPanelClient.ts";
import type { ActionDeps, ActionHandler, ProxyAction, SessionPayload } from "./types.ts";
import {
  GET_CAREGIVER,
  GET_CUSTOMER,
  GET_JOB_OFFER,
  LIST_APPLICATIONS,
  LIST_INVITED_CAREGIVER_IDS,
  LIST_MATCHINGS,
  REJECT_APPLICATION,
  SEARCH_LOCATIONS,
  STORE_CONFIRMATION,
  STORE_REQUEST,
  UPDATE_CUSTOMER,
} from "./operations.ts";

// ─── Helper — run GraphQL with agency token ─────────────────────────────────

async function runGraphQL<T>(
  deps: ActionDeps,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  return await mamamiaRequest<T>({
    endpoint: deps.endpoint,
    token: await deps.getAgencyToken(),
    query,
    variables,
    fetchFn: deps.fetchFn,
  });
}


// ─── Ownership-bound actions (session overrides client variables) ───────────

const getJobOffer: ActionHandler = (session, _variables, deps) =>
  runGraphQL(deps, GET_JOB_OFFER, { id: session.job_offer_id });

const getCustomer: ActionHandler = (session, _variables, deps) =>
  runGraphQL(deps, GET_CUSTOMER, { id: session.customer_id });

const listApplications: ActionHandler = (session, variables, deps) => {
  const { limit, page } = variables as { limit?: number; page?: number };
  return runGraphQL(deps, LIST_APPLICATIONS, {
    job_offer_id: session.job_offer_id,
    limit: limit ?? 20,
    page: page ?? 1,
  });
};

const listMatchings: ActionHandler = (session, variables, deps) => {
  const { limit, page, filters, order_by } = variables as {
    limit?: number;
    page?: number;
    filters?: Record<string, unknown>;
    order_by?: string;
  };
  // Only pass non-empty filters/order_by — Mamamia default if undefined.
  const payload: Record<string, unknown> = {
    job_offer_id: session.job_offer_id,
    limit: limit ?? 20,
    page: page ?? 1,
  };
  if (filters && Object.keys(filters).length > 0) payload.filters = filters;
  if (typeof order_by === "string" && order_by.length > 0) payload.order_by = order_by;
  return runGraphQL(deps, LIST_MATCHINGS, payload);
};

// Returns the set of caregiver IDs that already have an invite Request
// against this customer's job offer. Frontend uses it to render
// status='invited' on first load — without this the portal can't tell
// invited cgs apart from un-invited ones across page refreshes.
//
// We unwrap the GraphQL pagination shape into a flat { caregiver_ids }
// payload so the client doesn't have to relearn it.
const listInvitedCaregiverIds: ActionHandler = async (session, _variables, deps) => {
  const r = await runGraphQL<{
    JobOfferMatchingsWithPagination: {
      total: number;
      data: Array<{ caregiver: { id: number } }>;
    };
  }>(deps, LIST_INVITED_CAREGIVER_IDS, { job_offer_id: session.job_offer_id });
  const ids = r.JobOfferMatchingsWithPagination.data.map(m => m.caregiver.id);
  return { caregiver_ids: ids };
};

// ─── Public/open actions (id from variables) ────────────────────────────────

const getCaregiver: ActionHandler = async (_session, variables, deps) => {
  const id = (variables as { id?: unknown }).id;
  if (typeof id !== "number") throw new Error("id required");
  return await runGraphQL(deps, GET_CAREGIVER, { id });
};

const searchLocations: ActionHandler = (_session, variables, deps) => {
  const { search, limit, page } = variables as {
    search?: string;
    limit?: number;
    page?: number;
  };
  return runGraphQL(deps, SEARCH_LOCATIONS, {
    search: search ?? "",
    limit: limit ?? 10,
    page: page ?? 1,
  });
};

// ─── Ownership check for application-bound mutations ───────────────────────
// Any mutation that targets an Application must first verify the application
// belongs to session.job_offer_id — otherwise a malicious client could reject
// arbitrary applications across tenants.

const ASSERT_APP_BELONGS = /* GraphQL */ `
  query AssertAppBelongs($job_offer_id: Int!) {
    JobOfferApplicationsWithPagination(job_offer_id: $job_offer_id, limit: 100, page: 1) {
      data { id }
    }
  }
`;

async function assertApplicationBelongsToSession(
  deps: ActionDeps,
  session: SessionPayload,
  applicationId: number,
): Promise<void> {
  const res = await mamamiaRequest<{
    JobOfferApplicationsWithPagination: { data: Array<{ id: number }> };
  }>({
    endpoint: deps.endpoint,
    token: await deps.getAgencyToken(),
    query: ASSERT_APP_BELONGS,
    variables: { job_offer_id: session.job_offer_id },
    fetchFn: deps.fetchFn,
  });
  const ids = new Set(res.JobOfferApplicationsWithPagination.data.map((a) => a.id));
  if (!ids.has(applicationId)) {
    throw new Error("forbidden: application not owned by session");
  }
}

const rejectApplication: ActionHandler = async (session, variables, deps) => {
  const v = variables as { application_id?: unknown; reject_message?: unknown };
  const appId = v.application_id;
  if (typeof appId !== "number") throw new Error("application_id required");
  await assertApplicationBelongsToSession(deps, session, appId);
  return await runGraphQL(deps, REJECT_APPLICATION, {
    id: appId,
    reject_message: typeof v.reject_message === "string" ? v.reject_message : null,
  });
};

// ─── Accept: StoreConfirmation ─────────────────────────────────────────────
// Creates binding Confirmation with contract_patient/contract_contact taken
// 1:1 from AngebotPruefenModal step-2 form. Ownership via prefetch of
// JobOfferApplicationsWithPagination(session.job_offer_id) — we verify
// application belongs before we call StoreConfirmation.

const CONTRACT_PATIENT_ALLOWED = new Set([
  "contact_type",
  "is_same_as_first_patient",
  "is_same_as_contact",
  "location_id",
  "location_custom_text",
  "salutation",
  "title",
  "first_name",
  "last_name",
  "phone",
  "email",
  "street_number",
  "zip_code",
  "city",
]);

const CONTRACT_CONTACT_ALLOWED = new Set([
  "is_same_as_first_patient",
  "location_id",
  "location_custom_text",
  "salutation",
  "title",
  "first_name",
  "last_name",
  "phone",
  "email",
  "street_number",
  "zip_code",
  "city",
]);

function pickAllowed(input: unknown, allowed: Set<string>): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

const storeConfirmation: ActionHandler = async (session, variables, deps) => {
  const v = variables as {
    application_id?: unknown;
    message?: unknown;
    is_confirm_binding?: unknown;
    contract_patient?: unknown;
    contract_contact?: unknown;
    patient_contracts?: unknown;
    contract_contacts?: unknown;
    update_customer?: unknown;
    file_tokens?: unknown;
  };
  const appId = v.application_id;
  if (typeof appId !== "number") throw new Error("application_id required");
  await assertApplicationBelongsToSession(deps, session, appId);

  const payload: Record<string, unknown> = {
    application_id: appId,
    message: typeof v.message === "string" ? v.message : null,
    is_confirm_binding: v.is_confirm_binding === true,
    update_customer: v.update_customer === true,
    contract_patient: pickAllowed(v.contract_patient, CONTRACT_PATIENT_ALLOWED),
    contract_contact: pickAllowed(v.contract_contact, CONTRACT_CONTACT_ALLOWED),
    patient_contracts: Array.isArray(v.patient_contracts)
      ? v.patient_contracts.map((p) => pickAllowed(p, CONTRACT_PATIENT_ALLOWED)).filter(Boolean)
      : null,
    contract_contacts: Array.isArray(v.contract_contacts)
      ? v.contract_contacts.map((c) => pickAllowed(c, CONTRACT_CONTACT_ALLOWED)).filter(Boolean)
      : null,
    file_tokens: Array.isArray(v.file_tokens) ? v.file_tokens.filter((t) => typeof t === "string") : null,
  };

  return await runGraphQL(deps, STORE_CONFIRMATION, payload);
};

// ─── Invite caregiver ──────────────────────────────────────────────────────
// Mutation: StoreRequest(caregiver_id, job_offer_id, message).
//
// This is the mutation Mamamia's own panel UI fires when an agency admin
// clicks "wyślij zaproszenie" on a customer's matching list. Verified live
// on beta 2026-04-28 by inspecting DevTools network log on a real panel
// session — operationName="StoreRequest", returns Request{id, ...}.
//
// Auth model: panel /graphql + agency-only session cookie. Mamamia's
// panel-side policy accepts a service-agency admin owning the customer
// directly, provided customer.status='active' (which our onboard payload
// achieves by setting Customer.arrival_at — see onboard-to-mamamia/mappers.ts).
//
// **Known limitation on preprod (Bug #17, 2026-05-12)**: the agency-admin
// account hardcoded behind MAMAMIA_AGENCY_EMAIL/PASSWORD on preprod tenant
// does NOT have permission to invoke StoreRequest. Live diagnosis showed
// Mamamia returns HTTP 200 + GraphQL `Unauthorized` (extensions.category=
// "authorization") for both `StoreRequest` (Bearer + panel-session) and
// `ImpersonateCustomer(customer_id)` — same policy gate. The same
// credentials work on beta. Resolution requires Mamamia ops to grant the
// preprod agency user matching permissions, OR a different agency cred
// with elevated role.
//
// Why not SendInvitationCaregiver: that mutation is customer-side
// (auth.user must be the customer), used by Mamamia's customer portal.
// It is unrelated to the agency-side invite flow we need.
const inviteCaregiver: ActionHandler = async (session, variables, deps) => {
  const id = (variables as { caregiver_id?: unknown }).caregiver_id;
  if (typeof id !== "number") throw new Error("caregiver_id required");
  const message = (variables as { message?: unknown }).message;
  if (!deps.panelBaseUrl || !deps.agencyEmail || !deps.agencyPassword) {
    throw new Error("panel auth not configured");
  }
  const panelSession = await loginAsAgency(
    { baseUrl: deps.panelBaseUrl, fetchFn: deps.fetchFn },
    deps.agencyEmail,
    deps.agencyPassword,
  );
  return await panelMutateAsCustomer(
    { baseUrl: deps.panelBaseUrl, fetchFn: deps.fetchFn },
    panelSession,
    STORE_REQUEST,
    {
      caregiver_id: id,
      job_offer_id: session.job_offer_id,
      message: typeof message === "string" ? message : null,
    },
    "StoreRequest",
  );
};


// ─── Mutations — strict allowlist + ownership ───────────────────────────────

const UPDATE_CUSTOMER_ALLOWED = new Set([
  "first_name",
  "last_name",
  "email",
  "phone",
  "location_id",
  "location_custom_text",
  "urbanization_id",
  "job_description",
  "accommodation",
  "caregiver_accommodated",
  "other_people_in_house",
  "has_family_near_by",
  "smoking_household",
  "internet",
  "day_care_facility",
  "day_care_facility_description",
  "day_care_facility_description_de",
  "day_care_facility_description_en",
  "day_care_facility_description_pl",
  "caregiver_time_off",
  "pets",
  "is_pet_dog",
  "is_pet_cat",
  "is_pet_other",
  "equipment_ids",
  "patients",
  "customer_caregiver_wish",
  // Bug #13l (2026-05-07, beta Mamamia): mamamia panel "Lokalizacja opieki"
  // reads from customer_contract.location_id (NOT just Customer.location_id
  // top level). Patient form save propaguje resolved location_id na
  // customer_contract żeby panel renderował.
  //
  // Bug #16 (2026-05-12, prod Mamamia switch): pierwotnie pisaliśmy
  // `patient_contracts: [...]` + `invoice_contract: {...}` (beta-only
  // schema extension z N contracts per customer + contact_type discriminator).
  // Prod ma legacy singular schema: `customer_contract` 1:1 z customer.
  // Refactor na singular — universal, działa na obu środowiskach.
  "customer_contract",
]);

// Whitelist for the nested customer_caregiver_wish object — keep tight
// so we never leak unintended wish fields from a malicious client body.
const WISH_ALLOWED = new Set([
  "gender",
  "germany_skill",
  "driving_license",
  "driving_license_gearbox",
  "smoking",
  "shopping",
  "tasks",
  "tasks_de",
  "other_wishes",
  "other_wishes_de",
]);

function pickAllowedWish(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (WISH_ALLOWED.has(k)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Mamamia gotcha: UpdateCustomer treats omitted association inputs as
// "wipe to empty". We learned this the hard way after the in-portal
// patient form save (proxy.updateCustomer) silently zeroed out:
//   • Customer.equipments  (TV / bathroom / kitchen / others)
//   • Patient.tools        (rollator / walking stick / hoist)
//   • customer_caregiver_wish.germany_skill  (desired language level)
//   • customer_caregiver_wish.driving_license (license requirement)
// — all populated by the onboard mapper, all wiped on first
// UpdateCustomer call because the client doesn't carry them in its
// patch. Fix: re-fetch current values and re-pass them whenever the
// caller didn't explicitly provide their own.
const PRESERVE_QUERY = /* GraphQL */ `
  query PreserveAssociations($id: Int!) {
    Customer(id: $id) {
      equipments { id }
      patients { id tools { id } }
      customer_caregiver_wish {
        germany_skill
        driving_license
      }
    }
  }
`;

interface PreserveData {
  Customer: {
    equipments: Array<{ id: number }>;
    patients: Array<{ id: number; tools: Array<{ id: number }> }>;
    customer_caregiver_wish: {
      germany_skill: string | null;
      driving_license: string | null;
    } | null;
  };
}

const updateCustomer: ActionHandler = async (session, variables, deps) => {
  const patch: Record<string, unknown> = { id: session.customer_id };
  for (const [k, v] of Object.entries(variables)) {
    if (k === "customer_caregiver_wish") {
      const wish = pickAllowedWish(v);
      if (wish) patch.customer_caregiver_wish = wish;
    } else if (UPDATE_CUSTOMER_ALLOWED.has(k)) {
      patch[k] = v;
    }
  }

  // Mamamia preprod backend regression (verified 2026-05-14 via bisection):
  // UpdateCustomer resolver NPE's when `patients` is null or omitted. An
  // empty array passes through fine. Always default to [] so partial saves
  // that don't touch patients (e.g. customer-only changes) still go through.
  if (!("patients" in patch)) {
    patch.patients = [];
  }

  // Mamamia preprod backend regression (verified 2026-05-14 via Tragefwkdf
  // repro): customer_caregiver_wish.driving_license = "no" triggers the
  // same generic "Internal server error" NPE in UpdateCustomer resolver.
  // Every other value ("yes", "not_important", omitted) works, regardless
  // of whether driving_license_gearbox is set. Drop the "no" value so the
  // rest of the save (patient data, wish.germany_skill etc.) goes through.
  // The customer's "no driver needed" preference is lost — Mamamia keeps
  // the previous wish.driving_license. Remove this when Mamamia patches
  // their resolver.
  const wishPatchEarly = patch.customer_caregiver_wish as
    | Record<string, unknown>
    | undefined;
  if (wishPatchEarly && wishPatchEarly.driving_license === "no") {
    delete wishPatchEarly.driving_license;
    // Gearbox is irrelevant when license requirement is dropped — wipe too
    // so we don't end up with `gearbox: 'manual', driving_license: omitted`.
    delete wishPatchEarly.driving_license_gearbox;
    // If wish became empty after removing the only field, drop entirely.
    if (Object.keys(wishPatchEarly).length === 0) {
      delete patch.customer_caregiver_wish;
    }
  }

  // ── Preserve associations + wish scalars the caller didn't touch ──
  // Always re-fetch current Customer.equipments, per-patient tools, and
  // customer_caregiver_wish scalars (germany_skill, driving_license) and
  // pass them back unless the caller explicitly supplied their own.
  const needsEquipmentPreserve = !("equipment_ids" in patch);
  const patientPatches = Array.isArray(patch.patients) ? patch.patients : null;
  const needsToolPreserve = !!patientPatches && patientPatches.some((p) =>
    p && typeof p === "object" && !("tool_ids" in (p as Record<string, unknown>))
  );
  const wishPatch = patch.customer_caregiver_wish as Record<string, unknown> | undefined;
  const needsWishPreserve = !!wishPatch && (
    !("germany_skill" in wishPatch) || !("driving_license" in wishPatch)
  );

  if (needsEquipmentPreserve || needsToolPreserve || needsWishPreserve) {
    try {
      const current = await runGraphQL<PreserveData>(deps, PRESERVE_QUERY, {
        id: session.customer_id,
      });

      if (needsEquipmentPreserve) {
        patch.equipment_ids = current.Customer.equipments.map((e) => e.id);
      }

      if (needsToolPreserve && patientPatches) {
        const toolsByPatientId = new Map<number, number[]>();
        for (const p of current.Customer.patients) {
          toolsByPatientId.set(p.id, p.tools.map((t) => t.id));
        }
        patch.patients = patientPatches.map((p) => {
          if (!p || typeof p !== "object") return p;
          const pp = p as Record<string, unknown>;
          if ("tool_ids" in pp) return pp;
          const id = typeof pp.id === "number" ? pp.id : null;
          if (id == null) return pp;
          const existing = toolsByPatientId.get(id);
          if (!existing) return pp;
          return { ...pp, tool_ids: existing };
        });
      }

      if (needsWishPreserve && wishPatch) {
        const cw = current.Customer.customer_caregiver_wish;
        if (cw) {
          if (!("germany_skill" in wishPatch) && cw.germany_skill) {
            wishPatch.germany_skill = cw.germany_skill;
          }
          if (!("driving_license" in wishPatch) && cw.driving_license) {
            wishPatch.driving_license = cw.driving_license;
          }
        }
      }
    } catch (e) {
      // Preserve fetch failed — log but proceed; better to apply the
      // user's update than to block the save on a defensive read.
      console.warn("updateCustomer preserve fetch failed:", (e as Error).message);
    }
  }

  return runGraphQL(deps, UPDATE_CUSTOMER, patch);
};

// ─── generateJobDescription — AI-generated care situation summary ──────────
//
// Calls Anthropic Messages API (claude-haiku-3-5) to produce a 2–3 sentence
// human-readable summary of the care situation. Used as `job_description` on
// the Mamamia customer record, replacing the mechanical auto-summary.
//
// Requires ANTHROPIC_API_KEY secret. When missing, returns { description: null }
// so the frontend falls back to the mechanical summary without breaking the
// save flow. Errors are swallowed for the same reason.

interface JobDescriptionInput {
  // Patient 1
  geschlecht?: string;
  geburtsjahr?: string;
  pflegegrad?: string;
  mobilitaet?: string;
  heben?: string;
  demenz?: string;
  inkontinenz?: string;
  nacht?: string;
  diagnosen?: string;
  // Patient 2 (couple flow)
  anzahl?: string;
  p2_geschlecht?: string;
  p2_geburtsjahr?: string;
  p2_pflegegrad?: string;
  p2_mobilitaet?: string;
  p2_demenz?: string;
  // Situation
  ort?: string;
  wohnungstyp?: string;
  urbanisierung?: string;
  familieNahe?: string;
  pflegedienst?: string;
  haushalt?: string;
  aufgaben?: string;
  sonstigeWuensche?: string;
}

function buildPatientDataText(v: JobDescriptionInput): string {
  const lines: string[] = [];
  const couple = v.anzahl === '2';

  // --- Person 1 ---
  const label1 = couple ? 'Person 1' : 'Patient/in';
  if (v.geschlecht) lines.push(`${label1} – Geschlecht: ${v.geschlecht}`);
  if (v.geburtsjahr) {
    const alter = new Date().getFullYear() - Number(v.geburtsjahr);
    if (alter > 0 && alter < 120) lines.push(`${label1} – Alter: ca. ${alter} Jahre`);
  }
  if (v.pflegegrad) lines.push(`${label1} – Pflegegrad: ${v.pflegegrad}`);
  if (v.mobilitaet) lines.push(`${label1} – Mobilität: ${v.mobilitaet}`);
  if (v.heben && v.heben !== 'Nein') lines.push(`${label1} – Heben/Transfer erforderlich`);
  if (v.demenz && v.demenz !== 'Nein') lines.push(`${label1} – Demenz: ${v.demenz}`);
  if (v.inkontinenz && v.inkontinenz !== 'Nein') lines.push(`${label1} – Inkontinenz: ${v.inkontinenz}`);
  if (v.nacht && v.nacht !== 'Nein') lines.push(`${label1} – Nachteinsätze: ${v.nacht}`);
  if (v.diagnosen) lines.push(`${label1} – Diagnosen: ${v.diagnosen}`);

  // --- Person 2 ---
  if (couple) {
    if (v.p2_geschlecht) lines.push(`Person 2 – Geschlecht: ${v.p2_geschlecht}`);
    if (v.p2_geburtsjahr) {
      const alter2 = new Date().getFullYear() - Number(v.p2_geburtsjahr);
      if (alter2 > 0 && alter2 < 120) lines.push(`Person 2 – Alter: ca. ${alter2} Jahre`);
    }
    if (v.p2_pflegegrad) lines.push(`Person 2 – Pflegegrad: ${v.p2_pflegegrad}`);
    if (v.p2_mobilitaet) lines.push(`Person 2 – Mobilität: ${v.p2_mobilitaet}`);
    if (v.p2_demenz && v.p2_demenz !== 'Nein') lines.push(`Person 2 – Demenz: ${v.p2_demenz}`);
  }

  // --- Wohnsituation ---
  if (v.ort) lines.push(`Wohnort: ${v.ort}${v.urbanisierung ? ` (${v.urbanisierung})` : ''}`);
  if (v.wohnungstyp) lines.push(`Wohnsituation: ${v.wohnungstyp}`);
  if (v.familieNahe === 'Ja') lines.push(`Familie in der Nähe: Ja`);
  if (v.haushalt === 'Ja') lines.push(`Weitere Personen im Haushalt: Ja`);
  if (v.pflegedienst && v.pflegedienst !== 'Nein') lines.push(`Pflegedienst: ${v.pflegedienst}`);

  // --- Aufgaben / Wünsche ---
  if (v.aufgaben) lines.push(`Gewünschte Aufgaben: ${v.aufgaben}`);
  if (v.sonstigeWuensche) lines.push(`Sonstige Wünsche: ${v.sonstigeWuensche}`);

  return lines.join('\n');
}

const SYSTEM_PROMPT = `Du fasst Pflegesituationen für Pflegekräfte zusammen.
Schreibe 2–3 natürliche Sätze – klar, menschlich, ehrlich, keine Floskeln.
Die Pflegekraft soll wissen: wen sie betreut, was die Hauptaufgaben sind und wie der Alltag aussieht.
Besonderheiten (Demenz, Nachteinsätze, Pflegedienst) nur erwähnen wenn relevant.
Keine Aufzählungen. Keine Überschriften. Nur Fließtext.
Gib ausschließlich den Beschreibungstext aus — keine Einleitung, keine Erläuterung.`;

const generateJobDescription: ActionHandler = async (_session, variables, deps) => {
  if (!deps.anthropicApiKey) {
    return { description: null };
  }

  const input = variables as JobDescriptionInput;
  const dataText = buildPatientDataText(input);

  if (!dataText.trim()) {
    return { description: null };
  }

  try {
    const text = await callAnthropicForText(
      deps.anthropicApiKey,
      SYSTEM_PROMPT,
      `Pflegesituation:\n${dataText}`,
      deps.fetchFn,
    );
    return { description: text };
  } catch (e) {
    console.error('generateJobDescription failed:', (e as Error).message);
    return { description: null };
  }
};

// ─── generateCaregiverAbout — AI-generated caregiver introduction ───────────
//
// Produces a 3–4 sentence professional German introduction for the caregiver
// profile modal ("Über die Pflegekraft"). Built from real Mamamia fields:
// first name, experience, language level, nationality, personality traits,
// assignments count, nurse qualification. Falls back to null on failure so
// the modal shows its existing mechanical fallback text.

async function callAnthropicForText(
  apiKey: string,
  system: string,
  userContent: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 350,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    console.error('Anthropic error:', res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const body = await res.json() as { content?: Array<{ type: string; text: string }> };
  return body.content?.find(b => b.type === 'text')?.text?.trim() ?? null;
}

interface CaregiverAboutInput {
  firstName?: string;
  experienceYears?: string;
  assignments?: number;
  languageLevel?: string;
  nationality?: string;
  personalities?: string[];
  hobbies?: string[];
  furtherHobbies?: string;
  isNurse?: boolean;
  qualifications?: string;
  education?: string;
  drivingLicense?: string;
  recentAssignments?: string[];  // e.g. ["München, 3 Mon., Rollstuhl"]
  motivation?: string;
}

const CAREGIVER_ABOUT_SYSTEM = `Du schreibst eine warmherzige, persönliche Vorstellung einer Pflegekraft für eine pflegesuchende Familie in Deutschland.

PFLICHT: Schreibe IMMER in der dritten Person. Niemals "Ich" verwenden. Beispiel: "Klaudia ist..." oder "Sie bringt..." — nie "Ich bin...".
Verwende nur den Vornamen.
MAXIMAL 3 Sätze. Kurz, dicht, vertrauensbildend — kein Geschwafel.

Verdichte das Wichtigste:
- Satz 1: Wer sie ist + Herkunft + Erfahrung.
- Satz 2: Was sie pflegerisch mitbringt (Deutsch, Führerschein, Qualifikationen, ggf. letzte Einsätze).
- Satz 3: Persönlichkeit und was die Familie an ihr schätzen wird.

Kein Marketingsprech. Keine leeren Phrasen. Nur Infos nutzen die tatsächlich vorliegen.
Ausgabe: ausschließlich der fertige Fließtext — keine Überschrift, keine Liste, kein Kommentar.`;

const generateCaregiverAbout: ActionHandler = async (_session, variables, deps) => {
  if (!deps.anthropicApiKey) return { about: null };

  const v = variables as CaregiverAboutInput;
  if (!v.firstName) return { about: null };

  const lines: string[] = [];
  lines.push(`Vorname: ${v.firstName}`);
  if (v.nationality) lines.push(`Nationalität: ${v.nationality}`);
  if (v.experienceYears) lines.push(`Erfahrung: ${v.experienceYears} in der 24h-Seniorenpflege`);
  if (typeof v.assignments === 'number' && v.assignments > 0) {
    lines.push(`Abgeschlossene Einsätze in Deutschland: ${v.assignments}`);
  }
  if (v.languageLevel) lines.push(`Deutschkenntnisse: ${v.languageLevel}`);
  if (v.drivingLicense) lines.push(`Führerschein: ${v.drivingLicense}`);
  if (v.recentAssignments?.length) lines.push(`Letzte Einsätze: ${v.recentAssignments.join(' | ')}`);
  if (v.isNurse) lines.push(`Ausbildung: Ausgebildete Pflegefachkraft`);
  if (v.education) lines.push(`Bildung: ${v.education}`);
  if (v.qualifications) lines.push(`Qualifikationen / Pflegeschwerpunkte: ${v.qualifications}`);
  if (v.personalities?.length) lines.push(`Persönlichkeit: ${v.personalities.join(', ')}`);
  if (v.hobbies?.length) lines.push(`Hobbys: ${v.hobbies.join(', ')}`);
  if (v.furtherHobbies) lines.push(`Weitere Interessen: ${v.furtherHobbies}`);
  if (v.motivation) lines.push(`Eigene Worte / Motivation: ${v.motivation}`);

  try {
    const about = await callAnthropicForText(
      deps.anthropicApiKey,
      CAREGIVER_ABOUT_SYSTEM,
      lines.join('\n'),
      deps.fetchFn,
    );
    return { about };
  } catch (e) {
    console.error('generateCaregiverAbout failed:', (e as Error).message);
    return { about: null };
  }
};

// ─── Dispatcher ────────────────────────────────────────────────────────────

export const ACTIONS: Record<ProxyAction, ActionHandler> = {
  getJobOffer,
  getCustomer,
  listApplications,
  listMatchings,
  listInvitedCaregiverIds,
  getCaregiver,
  searchLocations,
  updateCustomer,
  rejectApplication,
  storeConfirmation,
  inviteCaregiver,
  generateJobDescription,
  generateCaregiverAbout,
};

export function isKnownAction(name: string): name is ProxyAction {
  return name in ACTIONS;
}

// Re-export for tests
export type { ActionDeps, ActionHandler, SessionPayload };
