// Server-side Acceptance→Mamamia sync — die verbindliche Sequenz nach der
// Online-Unterschrift (Michał, 2026-07-22):
//
//   1. UpdateCustomer  — Kontaktdaten aus dem Konfirmationsprozess auf den
//                        Customer (customer_contract)
//   2. StoreConfirmation — verbindlicher Akzept der Bewerbung
//   3. Vertrag (PDF)   — gerendert vom Kostenrechner (/api/contract-pdf, aus
//                        der frisch geschriebenen Acceptance-Row)
//   4. Upload zu Mamamia — StoreFile → UpdateConfirmation(file_tokens) —
//                        ERST wenn Mamamia die Confirmation VERARBEITET hat
//                        (final_confirmation am Job sichtbar); sonst → Cron
//   5. Mails            — macht weiterhin die Bridge, hier NICHT berührt
//
// Aufrufer: sync-acceptance Edge Fn (synchron, von der Bridge getriggert)
// und detect-caregiver-events (Cron-Retry alle 15 Min). Beide teilen dieses
// Modul → identische Guards, keine Drift.
//
// Idempotenz-Anker:
//   - mamamia_confirmed_at / mamamia_confirmation_id  (Phase 1+2 erledigt)
//   - mamamia_pdf_uploaded_at                          (Phase 3+4 erledigt)
//   - final_confirmation-Guard: hat der Kunde für DIESE Pflegekraft schon
//     eine Confirmation (z.B. vom alten Client-Bundle oder SA-Portal), wird
//     sie übernommen — StoreConfirmation feuert NIE doppelt.
//   - skipConfirm: Alt-Bundle-Kompat (metadata.mamamia_accepted === true ⇒
//     der Client hat den Akzept bereits selbst gemacht).

import { mamamiaRequest } from "./mamamiaClient.ts";

// ─── Typen ──────────────────────────────────────────────────────────────────

export interface AcceptanceLead {
  id: string;
  token: string | null;
  mamamia_customer_id: number | null;
}

// Zeile aus lead_application_acceptances (deutsche Roh-Keys aus dem Portal).
export interface AcceptanceRow {
  lead_id: string;
  application_id: number;
  caregiver_id: number | null;
  signatur: string | null;
  contract_patient: Record<string, unknown> | null;
  contract_contact: Record<string, unknown> | null;
  contract_snapshot: Record<string, unknown> | null;
  mamamia_confirmed_at: string | null;
  mamamia_confirmation_id: number | null;
  mamamia_pdf_uploaded_at: string | null;
}

export interface AcceptanceSyncSupabase {
  stampConfirmed(
    leadId: string,
    applicationId: number,
    confirmationId: number | null,
  ): Promise<void>;
  stampPdfUploaded(
    leadId: string,
    applicationId: number,
    sha256: string | null,
  ): Promise<void>;
}

export interface AcceptanceSyncSecrets {
  mamamiaEndpoint: string;
  kostenrechnerUrl: string;
}

export interface AcceptanceSyncOpts {
  lead: AcceptanceLead;
  row: AcceptanceRow;
  /** Alt-Bundle-Kompat: Client hat storeConfirmation bereits selbst gefeuert. */
  skipConfirm?: boolean;
  secrets: AcceptanceSyncSecrets;
  supabase: AcceptanceSyncSupabase;
  getAgencyToken: () => Promise<string>;
  fetchFn?: typeof fetch;
}

export interface AcceptanceSyncResult {
  customer_updated: boolean;
  confirmed: boolean;
  confirmation_id: number | null;
  pdf_uploaded: boolean;
  /** Was dem Cron überlassen wurde (z.B. "pdf: confirmation not processed yet"). */
  deferred: string[];
}

// ─── GraphQL ────────────────────────────────────────────────────────────────

// EIN Read für alles, was die Sequenz braucht: equipments (Preserve gegen
// Association-Wipe, gotcha #3) + final_confirmations aller Jobs (Guard +
// Verarbeitungs-Bramka für den Upload).
const SYNC_CUSTOMER_QUERY = /* GraphQL */ `
  query AcceptanceSyncCustomer($id: Int!) {
    Customer(id: $id) {
      id
      equipments { id }
      patients { id tools { id } }
      job_offers {
        id
        final_confirmation { id caregiver { id } }
      }
    }
  }
`;

interface SyncCustomerData {
  Customer: {
    id: number;
    equipments: Array<{ id: number }> | null;
    patients: Array<{ id: number; tools: Array<{ id: number }> | null }> | null;
    job_offers: Array<{
      id: number;
      final_confirmation: { id: number; caregiver: { id: number } | null } | null;
    }> | null;
  } | null;
}

// Schmaler UpdateCustomer — NUR customer_contract (+ Preserve-Pflichten).
// patients: NICHT-leere Stubs {id, tool_ids} sind Pflicht — der BETA-Tenant
// lehnt ein leeres Array mit "Das Feld patients ist erforderlich" ab
// (live 2026-07-22, Customer 8312), während preprod [] toleriert (Proxy-
// Notiz 2026-05-14). Stubs mit tool_ids preserven zugleich die Tools
// (gotcha #3/#13b) — funktioniert auf BEIDEN Tenants.
const UPDATE_CUSTOMER_CONTRACT = /* GraphQL */ `
  mutation UpdateCustomerContract(
    $id: Int
    $equipment_ids: [Int]
    $patients: [PatientInputType]
    $customer_contract: CustomerContractInputType
  ) {
    UpdateCustomer(
      id: $id
      equipment_ids: $equipment_ids
      patients: $patients
      customer_contract: $customer_contract
    ) { id customer_id }
  }
`;

const STORE_CONFIRMATION = /* GraphQL */ `
  mutation StoreConfirmation(
    $application_id: Int
    $is_confirm_binding: Boolean
    $contract_patient: ContractPatientInputType
    $contract_contact: ContractContactInputType
  ) {
    StoreConfirmation(
      application_id: $application_id
      is_confirm_binding: $is_confirm_binding
      contract_patient: $contract_patient
      contract_contact: $contract_contact
    ) { id application_id is_confirm_binding }
  }
`;

const UPDATE_CONFIRMATION_FILES = /* GraphQL */ `
  mutation UpdateConfirmation($id: Int, $application_id: Int, $is_confirm_binding: Boolean, $file_tokens: [String]) {
    UpdateConfirmation(id: $id, application_id: $application_id, is_confirm_binding: $is_confirm_binding, file_tokens: $file_tokens) {
      id
      signed_contract { id original_name }
    }
  }
`;

// ─── Mapping Deutsch → Mamamia (Port 1:1 vom Client contractForMamamia) ─────

// Mamamia-Validierung (live gelernt, Fall Diesmann 15.07.): salutation ist
// ein Enum 'Mr.'/'Mrs.' — alles andere (Divers, leer) ⇒ null.
const SALUTATION_TOKEN: Record<string, string> = {
  Herr: "Mr.",
  Frau: "Mrs.",
  "Mr.": "Mr.",
  "Mrs.": "Mrs.",
};

function clean(s: unknown): string | null {
  const t = String(s ?? "").trim();
  return t || null;
}

function sal(s: unknown): string | null {
  return SALUTATION_TOKEN[String(s ?? "").trim()] ?? null;
}

// einsatzort ist im Formular EIN Feld; Kunden tippen "PLZ, Ort" ODER
// "PLZ Ort" ohne Komma → beides parsen (sonst landet alles in zip_code).
export function splitEinsatzort(raw: unknown): { zip: string | null; city: string | null } {
  const ort = String(raw ?? "").trim();
  const commaSplit = ort.split(",");
  const spaceMatch = /^(\d{4,5})\s+(.+)$/.exec(ort);
  if (commaSplit.length > 1) {
    return { zip: clean(commaSplit[0]), city: clean(commaSplit.slice(1).join(",")) };
  }
  if (spaceMatch) {
    return { zip: clean(spaceMatch[1]), city: clean(spaceMatch[2]) };
  }
  return { zip: clean(ort), city: null };
}

export function mapContractPatient(de: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!de) return null;
  const { zip, city } = splitEinsatzort(de.einsatzort);
  return {
    salutation: sal(de.anrede),
    first_name: clean(de.vorname),
    last_name: clean(de.nachname),
    street_number: clean(de.strasse),
    zip_code: zip,
    city,
    phone: clean(de.telefon),
    email: clean(de.email),
  };
}

export function mapContractContact(de: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!de) return null;
  return {
    salutation: sal(de.anrede),
    first_name: clean(de.vorname),
    last_name: clean(de.nachname),
    phone: clean(de.telefon),
    email: clean(de.email),
  };
}

// customer_contract = Vertragspartner (AG). Der Browser liefert AG nur
// EINKOMPONIERT im Snapshot (contract.ag: name zusammengesetzt, strasse, ort,
// telefon, email); bei agGleich (snapshot.le === null) ist AG == LE und wir
// haben die DISKRETEN Felder aus contract_patient — die gewinnen.
// Composed name: Split an der LETZTEN Leerstelle (buildVertragsDaten setzt
// `${vorname} ${nachname}` zusammen — kein Anrede/Titel-Präfix im Ist-Stand).
export function buildCustomerContract(row: AcceptanceRow): Record<string, unknown> | null {
  const snap = row.contract_snapshot;
  const agGleich = !!snap && snap.le === null;
  if (agGleich || !snap) {
    // AG == LE (oder kein Snapshot: bestes verfügbares = LE-Daten).
    const p = mapContractPatient(row.contract_patient);
    return p;
  }
  const ag = (snap.ag ?? null) as Record<string, unknown> | null;
  if (!ag) return mapContractPatient(row.contract_patient);
  const name = String(ag.name ?? "").trim();
  let first: string | null = null;
  let last: string | null = null;
  if (name) {
    const idx = name.lastIndexOf(" ");
    if (idx > 0) {
      first = name.slice(0, idx).trim() || null;
      last = name.slice(idx + 1).trim() || null;
    } else {
      last = name;
    }
  }
  const { zip, city } = splitEinsatzort(ag.ort);
  return {
    // salutation: nicht verfügbar (Composed-Form ohne Anrede) → weglassen.
    first_name: first,
    last_name: last,
    street_number: clean(ag.strasse),
    zip_code: zip,
    city,
    phone: clean(ag.telefon),
    email: clean(ag.email),
  };
}

// ─── PDF: holen + prüfen + hochladen ───────────────────────────────────────

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// StoreFile (GraphQL-multipart-request-spec) als Agentur — Muster 1:1 aus
// mamamia-proxy storeFileAsAgency, hier mit Uint8Array statt base64.
async function storeFileAsAgency(
  endpoint: string,
  agencyToken: string,
  bytes: Uint8Array,
  filename: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const form = new FormData();
  form.append(
    "operations",
    JSON.stringify({
      query:
        "mutation($for: String!, $type: String, $title: String, $file: Upload) { StoreFile(for: $for, type: $type, title: $title, file: $file) { id token } }",
      variables: { for: "confirmation_signed_contract", type: "attachment", title: filename, file: null },
    }),
  );
  form.append("map", JSON.stringify({ "0": ["variables.file"] }));
  form.append("0", new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }), filename);
  const res = await fetchFn(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${agencyToken}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  const fileToken = body?.data?.StoreFile?.token;
  if (!res.ok || !fileToken) {
    throw new Error(`StoreFile failed (${res.status}): ${JSON.stringify(body?.errors ?? body).slice(0, 300)}`);
  }
  return fileToken as string;
}

// ─── Hauptsequenz ──────────────────────────────────────────────────────────

export async function syncAcceptance(opts: AcceptanceSyncOpts): Promise<AcceptanceSyncResult> {
  const { lead, row, secrets, supabase, getAgencyToken } = opts;
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const result: AcceptanceSyncResult = {
    customer_updated: false,
    confirmed: !!row.mamamia_confirmed_at,
    confirmation_id: row.mamamia_confirmation_id,
    pdf_uploaded: !!row.mamamia_pdf_uploaded_at,
    deferred: [],
  };

  if (!lead.mamamia_customer_id) {
    result.deferred.push("no mamamia_customer_id on lead");
    return result;
  }
  if (result.confirmed && result.pdf_uploaded) return result; // nichts zu tun

  const agencyToken = await getAgencyToken();

  // EIN Read: equipments (Preserve) + final_confirmations (Guard/Bramka).
  const cust = await mamamiaRequest<SyncCustomerData>({
    endpoint: secrets.mamamiaEndpoint,
    token: agencyToken,
    query: SYNC_CUSTOMER_QUERY,
    variables: { id: lead.mamamia_customer_id },
    fetchFn,
  });
  const equipmentIds = (cust.Customer?.equipments ?? []).map((e) => e.id);
  // Patient-Stubs: id + tool_ids (Preserve). Beta verlangt non-empty patients.
  const patientStubs = (cust.Customer?.patients ?? []).map((p) => ({
    id: p.id,
    tool_ids: (p.tools ?? []).map((t) => t.id),
  }));
  const finalConfirmations = (cust.Customer?.job_offers ?? [])
    .map((j) => j?.final_confirmation)
    .filter((fc): fc is { id: number; caregiver: { id: number } | null } => !!fc);

  // ── 1. UpdateCustomer: Kontaktdaten (customer_contract) ──
  // Idempotent (gleiche Daten ⇒ gleicher Zustand) → läuft auch im Retry
  // erneut, kein eigener Stempel nötig.
  const customerContract = buildCustomerContract(row);
  if (customerContract) {
    await mamamiaRequest({
      endpoint: secrets.mamamiaEndpoint,
      token: agencyToken,
      query: UPDATE_CUSTOMER_CONTRACT,
      variables: {
        id: lead.mamamia_customer_id,
        customer_contract: customerContract,
        // Non-empty Stubs (Beta-Pflicht) + tool_ids-Preserve (gotcha #13b).
        patients: patientStubs,
        // equipments MÜSSEN zurückgereicht werden (omitted ⇒ Wipe, gotcha #3).
        equipment_ids: equipmentIds,
      },
      fetchFn,
    });
    result.customer_updated = true;
  }

  // ── 2. StoreConfirmation (Akzept) — mit Guards ──
  if (!result.confirmed) {
    // Guard A: existiert bereits eine final_confirmation für DIESE Pflegekraft
    // (alter Client / SA-Portal / früherer Retry nach verlorener Response)?
    const adopted = row.caregiver_id != null
      ? finalConfirmations.find((fc) => fc.caregiver?.id === row.caregiver_id)
      : undefined;
    if (adopted) {
      result.confirmed = true;
      result.confirmation_id = adopted.id;
    } else if (opts.skipConfirm) {
      // Alt-Bundle hat akzeptiert, aber Mamamia hat die Confirmation noch
      // nicht verarbeitet (final_confirmation fehlt noch) → NICHT doppeln,
      // Cron übernimmt sobald sie sichtbar ist.
      result.deferred.push("confirm: client already accepted, awaiting processing");
    } else {
      const conf = await mamamiaRequest<{
        StoreConfirmation: { id: number; application_id: number } | null;
      }>({
        endpoint: secrets.mamamiaEndpoint,
        token: agencyToken,
        query: STORE_CONFIRMATION,
        variables: {
          application_id: row.application_id,
          is_confirm_binding: true,
          contract_patient: mapContractPatient(row.contract_patient),
          contract_contact: mapContractContact(row.contract_contact),
        },
        fetchFn,
      });
      result.confirmed = true;
      result.confirmation_id = conf.StoreConfirmation?.id ?? null;
    }
    if (result.confirmed) {
      await supabase.stampConfirmed(row.lead_id, row.application_id, result.confirmation_id);
    }
  }

  // ── 3+4. Vertrag rendern (Kostenrechner) + zu Mamamia hochladen ──
  // BRAMKA (Michał): Upload ERST wenn Mamamia die Confirmation VERARBEITET
  // hat — d.h. final_confirmation ist am Job sichtbar. Direkt nach
  // StoreConfirmation ist sie das oft noch nicht → dann übernimmt der Cron.
  if (result.confirmed && !result.pdf_uploaded) {
    const confirmationId = result.confirmation_id
      ?? (row.caregiver_id != null
        ? finalConfirmations.find((fc) => fc.caregiver?.id === row.caregiver_id)?.id ?? null
        : null);
    const processed = confirmationId != null
      && finalConfirmations.some((fc) => fc.id === confirmationId);
    if (!processed) {
      result.deferred.push("pdf: confirmation not processed yet (final_confirmation missing)");
      return result;
    }
    if (!lead.token) {
      result.deferred.push("pdf: lead token missing");
      return result;
    }

    const pdfUrl = `${secrets.kostenrechnerUrl.replace(/\/$/, "")}/api/contract-pdf/${lead.id}?token=${encodeURIComponent(lead.token)}`;
    const pdfRes = await fetchFn(pdfUrl);
    if (!pdfRes.ok) {
      result.deferred.push(`pdf: contract-pdf HTTP ${pdfRes.status}`);
      return result;
    }
    const bytes = new Uint8Array(await pdfRes.arrayBuffer());
    // Magic-Byte-Gate: der HTML-Fallback des Renderers darf NIE als
    // "Dienstleistungsvertrag-signiert.pdf" in Mamamia landen.
    if (!isPdfBytes(bytes)) {
      result.deferred.push("pdf: render returned non-PDF (HTML fallback?) — retry later");
      return result;
    }

    const fileToken = await storeFileAsAgency(
      secrets.mamamiaEndpoint,
      agencyToken,
      bytes,
      "Dienstleistungsvertrag-signiert.pdf",
      fetchFn,
    );
    await mamamiaRequest({
      endpoint: secrets.mamamiaEndpoint,
      token: agencyToken,
      query: UPDATE_CONFIRMATION_FILES,
      variables: {
        id: confirmationId,
        application_id: row.application_id,
        is_confirm_binding: true,
        file_tokens: [fileToken],
      },
      fetchFn,
    });
    result.pdf_uploaded = true;
    await supabase.stampPdfUploaded(row.lead_id, row.application_id, await sha256Hex(bytes));
  }

  return result;
}
