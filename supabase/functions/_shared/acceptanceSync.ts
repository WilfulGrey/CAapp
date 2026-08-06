// Server-side Acceptance→Mamamia sync — die verbindliche Sequenz nach der
// Online-Unterschrift (Michał, 2026-07-22):
//
//   1. UpdateCustomer  — die DREI Personen aus dem Konfirmationsprozess:
//                        LE→patient_contracts[patient_contact],
//                        AG→invoice_contract[contract_contact],
//                        KP→customer_contacts[]
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
  /** sha256 des KANONISCHEN PDFs (beim Akzept von der Bridge gestempelt). */
  pdf_sha256: string | null;
  /** Alarm-Einmaligkeit (optional — Retry-Chain und Cron lesen ihn). */
  mamamia_sync_alerted_at?: string | null;
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
  /** Storage-Zugriff auf den Kanon-Bucket `contracts` (Bridge legt ihn an). */
  supabaseUrl: string;
  supabaseServiceKey: string;
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
  /** Injectable für Tests — echte Backoff-Pausen zwischen Confirm-Retries. */
  sleepFn?: (ms: number) => Promise<void>;
}

export interface AcceptanceSyncResult {
  customer_updated: boolean;
  confirmed: boolean;
  confirmation_id: number | null;
  pdf_uploaded: boolean;
  /** Was dem Cron überlassen wurde (z.B. "pdf: confirmation not processed yet"). */
  deferred: string[];
  /**
   * StoreConfirmation fehlgeschlagen (Alarm-Policy Michał 2026-07-21):
   * permanent=true ⇒ Mamamia hat den Akzept DETERMINISTISCH abgelehnt
   * (GraphQL-Fehler, z.B. Bewerbung von der Agentur zurückgezogen) —
   * Retry ändert nichts, Alarm SOFORT. permanent=false ⇒ transient
   * (Netz/HTTP), interne Retries ausgeschöpft — Cron versucht weiter,
   * Alarm nach 5 Min. Feld fehlt, wenn Confirm gar nicht dran war
   * (schon bestätigt / skipConfirm / Adoption) oder gelungen ist.
   */
  confirm_error?: { message: string; permanent: boolean };
}

// ─── GraphQL ────────────────────────────────────────────────────────────────

// EIN Read für alles, was die Sequenz braucht: equipments (Preserve gegen
// Association-Wipe, gotcha #3) + final_confirmations aller Jobs (Guard +
// Verarbeitungs-Bramka für den Upload) + location_id des bestehenden
// Contracts (kanonische "Lokalizacja opieki" aus dem Patientenbogen,
// Bug #13d — wird in die neue patient_contact-Row übernommen, da Mamamia
// die Contract-Liste beim Schreiben ERSETZT).
const SYNC_CUSTOMER_QUERY = /* GraphQL */ `
  query AcceptanceSyncCustomer($id: Int!) {
    Customer(id: $id) {
      id
      equipments { id }
      patients { id tools { id } }
      customer_contract { location_id }
      job_offers {
        id
        # application_id: Original-Bewerbung der Confirmation — für den
        # Datei-Upload bei Adoptions-Rows (Panel-Buchung, echte Application
        # von mamamia nach Verarbeitung entfernt; UpdateConfirmation
        # VERLANGT application_id und validiert es — Confirmation-ID wird
        # abgelehnt). Feld-Kombination live verifiziert 2026-08-06 (beta;
        # selber Typ Confirmation, den StoreConfirmation seit #396 liefert).
        final_confirmation { id application_id caregiver { id } }
      }
    }
  }
`;

interface SyncCustomerData {
  Customer: {
    id: number;
    equipments: Array<{ id: number }> | null;
    patients: Array<{ id: number; tools: Array<{ id: number }> | null }> | null;
    customer_contract: { location_id: number | null } | null;
    job_offers: Array<{
      id: number;
      final_confirmation: { id: number; application_id?: number | null; caregiver: { id: number } | null } | null;
    }> | null;
  } | null;
}

// Schmaler UpdateCustomer — die DREI Personen aus dem Konfirmationsformular
// in Mamamias NATIVE Slots (live verifiziert 2026-07-21, Customer 8394 beta
// + Validation-Probe prod — beide Tenants haben die Args inzwischen, der
// Bug-#16-Drift ist von Mamamia aufgeholt):
//   - patient_contracts[{contact_type:"patient_contact"}]  = LE (Person +
//     Einsatzadresse — speist die Panel-"Lokalizacja opieki")
//   - invoice_contract{contact_type:"contract_contact"}    = AG (Vertragspartner)
//   - customer_contacts[]                                  = KP (Kontaktperson)
// NIE das Singular-Feld customer_contract schreiben: es adressiert die ERSTE
// Row der Plural-Liste und Mamamia typt sie als patient_contact — AG-Daten
// darin landen im Pacjent-/Care-Location-Slot (Ursprungs-Bug, Customer 8394:
// "3 różne osoby w formularzu, do mamamia trafiły tylko jedne").
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
    $patient_contracts: [CustomerContractInputType]
    $invoice_contract: CustomerContractInputType
    $customer_contacts: [CustomerContactInputType]
  ) {
    UpdateCustomer(
      id: $id
      equipment_ids: $equipment_ids
      patients: $patients
      patient_contracts: $patient_contracts
      invoice_contract: $invoice_contract
      customer_contacts: $customer_contacts
    ) { id customer_id }
  }
`;

// Stadt-Dropdown na wierszach osób w panelu MM czyta location_id z katalogu
// Locations — czysty tekst zip/city go NIE wypełnia. Rozwiązujemy location_id
// DOKŁADNIE tą samą metodą co główna lokalizacja klienta (Bug #13d, proxy
// searchLocations): LocationsWithPagination(search: PLZ) → pierwszy trafiony
// country_code=DE. Selekcja pól: `location` (NIE `name` — pola name nie ma,
// błędna selekcja wygląda jak pusty wynik; przejechałem się 2026-07-21).
const LOCATIONS_QUERY = /* GraphQL */ `
  query AcceptanceSyncLocations($search: String, $limit: Int, $page: Int) {
    LocationsWithPagination(search: $search, limit: $limit, page: $page) {
      data { id location zip_code country_code }
    }
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

// agGleich: der Kunde hat im Portal-Formular "AG == LE" gewählt (Snapshot
// trägt dann le === null). Fehlt der Snapshot ganz (Legacy-Rows), kennen wir
// nur die LE-Daten → ebenfalls Spiegel-Semantik.
export function isAgGleich(row: AcceptanceRow): boolean {
  const snap = row.contract_snapshot;
  return !snap || snap.le === null;
}

// Vertragspartner (AG) für invoice_contract. Der Browser liefert AG nur
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

// Best-effort: PLZ → location_id. Brak trafienia / błąd sieci ⇒ null (wiersz
// idzie z samym tekstem zip/city — panel pokaże Stadt do ręcznego wyboru).
async function resolveLocationId(
  zip: unknown,
  ctx: { endpoint: string; token: string; fetchFn: typeof fetch },
): Promise<number | null> {
  const z = String(zip ?? "").trim();
  if (!/^\d{4,5}$/.test(z)) return null;
  try {
    const res = await mamamiaRequest<{
      LocationsWithPagination: {
        data: Array<{ id: number; zip_code: string | null; country_code: string | null }> | null;
      } | null;
    }>({
      endpoint: ctx.endpoint,
      token: ctx.token,
      query: LOCATIONS_QUERY,
      variables: { search: z, limit: 5, page: 1 },
      fetchFn: ctx.fetchFn,
    });
    const rows = res.LocationsWithPagination?.data ?? [];
    return rows.find((l) => l.country_code === "DE")?.id ?? null;
  } catch {
    return null;
  }
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

// ─── Fehlerklassifikation + Confirm-Retry ──────────────────────────────────

// Permanent = die Anfrage hat Mamamia ERREICHT und wurde GraphQL-seitig
// abgelehnt (mamamiaRequest hängt dann `graphqlErrors` an den Error) —
// identischer Payload ⇒ identisches Ergebnis, Wiederholen ist sinnlos.
// Alles andere (fetch-Throw, HTTP !ok, fehlendes data-Feld) = transient.
// Bewusst KEINE Message-Pattern-Heuristik (Święta zasada nr 1.5).
function isPermanentMamamiaError(e: unknown): boolean {
  return !!(e as { graphqlErrors?: unknown } | null)?.graphqlErrors;
}

// Kurze interne Retries NUR für transiente Confirm-Fehler — "jakieś retry
// przez 5 minut i potem od razu alarm" (Michał 2026-07-21). Muss ins
// 25s-Timeout der Bridge passen: 3 Versuche, Pausen 2s + 4s.
const CONFIRM_TRANSIENT_RETRIES = 2;
const CONFIRM_RETRY_DELAYS_MS = [2000, 4000];

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Hauptsequenz ──────────────────────────────────────────────────────────

export async function syncAcceptance(opts: AcceptanceSyncOpts): Promise<AcceptanceSyncResult> {
  const { lead, row, secrets, supabase, getAgencyToken } = opts;
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const sleep = opts.sleepFn ?? defaultSleep;
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
    .filter((fc): fc is { id: number; application_id?: number | null; caregiver: { id: number } | null } => !!fc);

  // ── 1. UpdateCustomer: die DREI Personen aus dem Konfirmationsformular ──
  // LE → patient_contracts[patient_contact] (+ location_id-Übernahme aus dem
  // bestehenden Contract, denn Mamamia ERSETZT die Liste beim Schreiben),
  // AG → invoice_contract[contract_contact], KP → customer_contacts[].
  // Idempotent (gleiche Daten ⇒ gleicher Zustand) → läuft auch im Retry
  // erneut, kein eigener Stempel nötig.
  const carriedLocationId = cust.Customer?.customer_contract?.location_id ?? null;
  const lePatient = mapContractPatient(row.contract_patient);
  const agContract = buildCustomerContract(row);
  const kpContact = mapContractContact(row.contract_contact);
  // location_id per Row z JEJ własnego PLZ (metoda 1:1 jak główna lokalizacja
  // klienta) — AG mieszka niekoniecznie pod adresem opieki. Fallback dla LE:
  // location_id przeniesione z istniejącego contractu (zapis patient formy).
  const locCtx = { endpoint: secrets.mamamiaEndpoint, token: agencyToken, fetchFn };
  const leLocationId = (await resolveLocationId(lePatient?.zip_code, locCtx)) ?? carriedLocationId;
  const agZip = String(agContract?.zip_code ?? "").trim();
  const agLocationId = agZip && agZip === String(lePatient?.zip_code ?? "").trim()
    ? leLocationId
    : await resolveLocationId(agZip, locCtx);
  if (lePatient || agContract || kpContact) {
    const variables: Record<string, unknown> = {
      id: lead.mamamia_customer_id,
      // Non-empty Stubs (Beta-Pflicht) + tool_ids-Preserve (gotcha #13b).
      patients: patientStubs,
      // equipments MÜSSEN zurückgereicht werden (omitted ⇒ Wipe, gotcha #3).
      equipment_ids: equipmentIds,
    };
    // is_same_as_*-Flagi IMMER explizit setzen: ohne sie defaultet Mamamia
    // auf is_same_as_first_patient=true und SPIEGELT die Patientendaten in
    // die Row (live 2026-07-21, Customer 8394: Zenobia wurde beim nächsten
    // UpdateCustomer durch "Test Signature" überschrieben, Panel-Checkbox
    // "Die Daten sind die gleichen wie die des Patienten" blieb an).
    if (lePatient) {
      variables.patient_contracts = [{
        contact_type: "patient_contact",
        is_same_as_first_patient: false,
        is_same_as_contact: false,
        ...lePatient,
        ...(leLocationId != null ? { location_id: leLocationId } : {}),
      }];
    }
    if (agContract) {
      variables.invoice_contract = {
        contact_type: "contract_contact",
        // agGleich = Kunde hat "AG == LE" gewählt → Spiegel-Flag ehrlich TRUE
        // (Panel-Checkbox an, Mamamia hält die Row mit dem Patienten synchron).
        // Separater AG → false, sonst überschreibt der Spiegel die AG-Person.
        is_same_as_first_patient: isAgGleich(row),
        is_same_as_contact: false,
        ...agContract,
        // Stadt-Dropdown der Vertrags-/Rechnungsperson = IHRE PLZ (34117,
        // nicht die Care-Location 34123 — Feedback Michał 2026-07-21).
        ...(agLocationId != null ? { location_id: agLocationId } : {}),
      };
    }
    if (kpContact) {
      variables.customer_contacts = [{ is_same_as_first_patient: false, ...kpContact }];
    }
    await mamamiaRequest({
      endpoint: secrets.mamamiaEndpoint,
      token: agencyToken,
      query: UPDATE_CUSTOMER_CONTRACT,
      variables,
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
      // StoreConfirmation mit Klassifikation + kurzen internen Retries
      // (Alarm-Policy 2026-07-21). Fehler wird NICHT geworfen, sondern
      // strukturiert zurückgegeben — die Bridge alarmiert bei permanent
      // SOFORT (Kunde glaubt sonst an eine Buchung, die es nicht gibt,
      // z.B. weil die Agentur die Bewerbung zurückgezogen hat).
      let conf: { StoreConfirmation: { id: number; application_id: number } | null } | null = null;
      let confErr: { message: string; permanent: boolean } | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          conf = await mamamiaRequest<{
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
          confErr = null;
          break;
        } catch (e) {
          const permanent = isPermanentMamamiaError(e);
          confErr = { message: (e as Error).message.slice(0, 300), permanent };
          if (permanent || attempt >= CONFIRM_TRANSIENT_RETRIES) break;
          await sleep(CONFIRM_RETRY_DELAYS_MS[attempt] ?? 4000);
        }
      }
      if (confErr) {
        result.confirm_error = confErr;
        result.deferred.push(
          `confirm: ${confErr.permanent ? "PERMANENT" : "transient"} error — ${confErr.message}`,
        );
        // Ohne Confirm kein PDF (Sequenz 2 vor 3+4) — Cron/Alarm übernehmen.
        return result;
      }
      result.confirmed = true;
      result.confirmation_id = conf!.StoreConfirmation?.id ?? null;
    }
    if (result.confirmed) {
      await supabase.stampConfirmed(row.lead_id, row.application_id, result.confirmation_id);
    }
  }

  // ── 3+4. KANONISCHER Vertrag (Storage) + Upload zu Mamamia ──
  // Michał: „1 PDF — do klienta, do nas i na serwer. Ten sam, niezmieniany
  // plik." Die Bridge rendert beim Akzept GENAU EINMAL und legt die Bytes in
  // contracts/<lead>/<app>.pdf — wir laden EXAKT diese Bytes zu Mamamia hoch.
  // Fallback (Alt-Buchungen vor dem Kanon / Chromium-Ausfall beim Akzept):
  // Render via Kostenrechner — der Endpoint liest inzwischen selbst
  // Bucket-first, rendert also nur, wenn wirklich kein Kanon existiert.
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

    let bytes: Uint8Array | null = null;
    let source: "storage" | "render" = "storage";
    const objectUrl = `${secrets.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/contracts/${lead.id}/${row.application_id}.pdf`;
    try {
      const objRes = await fetchFn(objectUrl, {
        headers: {
          Authorization: `Bearer ${secrets.supabaseServiceKey}`,
          apikey: secrets.supabaseServiceKey,
        },
      });
      if (objRes.ok) bytes = new Uint8Array(await objRes.arrayBuffer());
    } catch {
      bytes = null; // Storage-Hickser ⇒ Fallback unten
    }

    if (!bytes || !isPdfBytes(bytes)) {
      source = "render";
      if (!lead.token) {
        result.deferred.push("pdf: no canonical file and lead token missing");
        return result;
      }
      const pdfUrl = `${secrets.kostenrechnerUrl.replace(/\/$/, "")}/api/contract-pdf/${lead.id}?token=${encodeURIComponent(lead.token)}`;
      const pdfRes = await fetchFn(pdfUrl);
      if (!pdfRes.ok) {
        result.deferred.push(`pdf: contract-pdf HTTP ${pdfRes.status}`);
        return result;
      }
      bytes = new Uint8Array(await pdfRes.arrayBuffer());
      // Magic-Byte-Gate: der HTML-Fallback des Renderers darf NIE als
      // "Dienstleistungsvertrag-signiert.pdf" in Mamamia landen.
      if (!isPdfBytes(bytes)) {
        result.deferred.push("pdf: render returned non-PDF (HTML fallback?) — retry later");
        return result;
      }
    }

    // Integrität: Kanon-Bytes müssen zur beim Akzept gestempelten sha256
    // passen — sonst NICHT hochladen (Tamper-Evidence, kein stilles Ersetzen).
    if (source === "storage" && row.pdf_sha256) {
      const sha = await sha256Hex(bytes);
      if (sha !== row.pdf_sha256) {
        result.deferred.push("pdf: storage bytes do not match pdf_sha256 — not uploading");
        return result;
      }
    }
    if (!bytes) {
      result.deferred.push("pdf: no bytes available");
      return result;
    }

    const fileToken = await storeFileAsAgency(
      secrets.mamamiaEndpoint,
      agencyToken,
      bytes,
      "Dienstleistungsvertrag-signiert.pdf",
      fetchFn,
    );
    // application_id: mamamias Validator VERLANGT das Feld („erforderlich")
    // UND validiert es gegen Applications („ungültig" für IDs, die nie eine
    // Application waren) — beides live gelernt, staging 2026-08-06, app=667.
    // Adoptions-Rows (Vertrag nachträglich nach Panel-Buchung) ankern auf der
    // Confirmation-ID ⇒ die ORIGINAL-Bewerbung der Confirmation mitschicken
    // (final_confirmation.application_id; soft-deleted IDs akzeptiert mamamia,
    // nie-existente nicht). Echte Rows: weiterhin row.application_id.
    const isAdoptionAnchor = row.application_id === confirmationId;
    const uploadApplicationId = isAdoptionAnchor
      ? finalConfirmations.find((fc) => fc.id === confirmationId)?.application_id ?? null
      : row.application_id;
    if (uploadApplicationId == null) {
      result.deferred.push("pdf: adoption row without original application_id on confirmation — cannot attach file");
      return result;
    }
    await mamamiaRequest({
      endpoint: secrets.mamamiaEndpoint,
      token: agencyToken,
      query: UPDATE_CONFIRMATION_FILES,
      variables: {
        id: confirmationId,
        application_id: uploadApplicationId,
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
