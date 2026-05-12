import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Lead type (matches Supabase leads table) ─────────────────────────────────

export interface LeadKalkulation {
  bruttopreis: number;
  eigenanteil: number;
  'zuschüsse': {
    items: Array<{
      name: string;
      label: string;
      beschreibung: string;
      betrag_monatlich: number;
      betrag_jaehrlich: number;
      typ: string;
      hinweis: string | null;
      in_kalkulation: boolean;
    }>;
    gesamt: number;
  };
  aufschluesselung: Array<{
    kategorie: string;
    antwort: string;
    label: string;
    aufschlag: number;
  }>;
  formularDaten?: {
    pflegegrad: number;
    [key: string]: unknown;
  };
}

export interface Lead {
  id: string;
  email: string;
  vorname: string | null;
  nachname: string | null;
  anrede: string | null;
  anrede_text: string | null;
  telefon: string | null;
  status: string;
  token: string | null;
  token_expires_at: string | null;
  token_used: boolean;
  care_start_timing: string | null;
  kalkulation: LeadKalkulation | null;
  // Stage-B identity for the actual care recipient (only populated after
  // /betreuung-beauftragen flow). Stage-A leads (Marcin's NEW calculator)
  // leave them null and inherit lead.* via the onboard mapper fallback.
  patient_anrede?: string | null;
  patient_vorname?: string | null;
  patient_nachname?: string | null;
  patient_street?: string | null;
  patient_zip?: string | null;
  patient_city?: string | null;
  /** Mamamia caregiver_ids the customer has rejected via "Nein danke".
   *  Seeded into nurseStatuses on portal mount so a decline survives F5 +
   *  cross-device sessions. Updated via the set_declined_caregiver RPC
   *  (token-authenticated, SECURITY DEFINER). */
  declined_caregiver_ids?: number[] | null;
  created_at: string;
  updated_at: string;
}

// ─── Fetch lead by token ───────────────────────────────────────────────────────

export async function fetchLeadByToken(token: string): Promise<{
  lead: Lead | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) return { lead: null, error: error.message };
  if (!data) return { lead: null, error: 'Token nicht gefunden' };

  return { lead: data as Lead, error: null };
}

// ─── Persist a decline (or undo) for a caregiver via the
//     set_declined_caregiver RPC (token-authenticated, SECURITY DEFINER).
//     Returns null on success, error message on failure. Caller is
//     responsible for optimistic local-state updates — RPC just handles
//     the durable side. ────────────────────────────────────────────────────────

export async function setDeclinedCaregiver(
  token: string,
  caregiverId: number,
  declined: boolean,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_declined_caregiver', {
    p_token: token,
    p_caregiver_id: caregiverId,
    p_declined: declined,
  });
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format date to "dd.MM.yyyy" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Add N days to a date and format it */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Capitalize first letter of each word */
export function cap(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

/** Build display name from lead */
export function leadDisplayName(lead: Lead): string {
  const parts = [cap(lead.vorname), cap(lead.nachname)].filter(Boolean);
  return parts.join(' ') || lead.email;
}

/** Build greeting (Sehr geehrte Frau X / Sehr geehrter Herr X etc.) */
export function leadGreeting(lead: Lead): string {
  const anrede = lead.anrede_text;
  const nachname = lead.nachname;
  const vorname = lead.vorname;
  if (anrede === 'Frau' && nachname) return `Sehr geehrte Frau ${nachname}`;
  if (anrede === 'Herr' && nachname) return `Sehr geehrter Herr ${nachname}`;
  if (anrede === 'Familie' && nachname) return `Sehr geehrte Familie ${nachname}`;
  if (vorname && nachname) return `Guten Tag ${vorname} ${nachname}`;
  if (vorname) return `Guten Tag ${vorname}`;
  return 'Guten Tag';
}

/** Map care_start_timing to a human-readable label.
 *  Marcin's NEW calculator emits: sofort | 2-4-wochen | 1-2-monate | unklar.
 *  Legacy values (1-2-wochen / 1-monat / spaeter) kept for backward compat
 *  with old leads still in the DB. */
export function careStartLabel(timing: string | null): string {
  const map: Record<string, string> = {
    sofort: 'ab sofort',
    '1-2-wochen': 'in 1–2 Wochen',
    '2-4-wochen': 'in 2–4 Wochen',
    '1-monat': 'in ca. 1 Monat',
    '1-2-monate': 'in 1–2 Monaten',
    spaeter: 'zu einem späteren Zeitpunkt',
    unklar: 'noch unklar',
  };
  return timing ? (map[timing] ?? timing) : 'ab sofort';
}

/** Format euro amount */
export function formatEuro(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

// ─── Map formularDaten → PatientForm prefill ──────────────────────────────────

export interface PatientPrefill {
  anzahl?: '1' | '2';
  pflegegrad?: string;
  mobilitaet?: string;
  nacht?: string;
  // Person 2 carries the SAME calculator answers as Person 1 — the
  // calculator collects one set for the couple as a unit. Set only when
  // betreuung_fuer === 'ehepaar' so single-patient leads stay clean.
  p2_pflegegrad?: string;
  p2_mobilitaet?: string;
  p2_nacht?: string;
  wunschGeschlecht?: string;
  /** Whether other (non-care) people live in the household. Mapped from
   *  calculator's `weitere_personen` (ja/nein) to 'Ja'/'Nein'. */
  haushalt?: string;
}

export function prefillPatientFromLead(lead: Lead): PatientPrefill {
  const fd = lead.kalkulation?.formularDaten;
  if (!fd) return {};

  // Mobilitaet mapping. Marcin's NEW calculator emits one of:
  //   mobil | rollator | rollstuhl | bettlaegerig
  // (legacy values gehfaehig / gehstock kept for old leads).
  const mobMap: Record<string, string> = {
    mobil:         'Selbstständig mobil',
    rollator:      'Rollatorfähig',
    rollstuhl:     'Rollstuhlfähig',
    bettlaegerig:  'Bettlägerig',
    // Legacy aliases — kept for leads created before the calculator
    // copy was reworked. Should never appear in fresh leads.
    gehstock:      'Am Gehstock',
    gehfaehig:     'Gehfähig mit Hilfe',
  };

  // Nachteinsätze mapping. Marcin's NEW calculator emits:
  //   nein | gelegentlich | taeglich | mehrmals
  // Pre-2026-05-01 this map only had {nein, gelegentlich, regelmaessig},
  // so a customer answering "Mehrmals nachts" silently fell through to
  // 'Nein' in the patient-form prefill — confusing handoff.
  //
  // NOTE: 'gelegentlich' maps to 'Bis zu 1 Mal' (NOT 'Gelegentlich').
  // 'Gelegentlich' was the old label but it is NOT a valid AngebotCard
  // CustomSelect option. More importantly, it mapped to 'occasionally'
  // in patientFormMapper — a Mamamia DB enum that the panel dropdown
  // does NOT render (shows "Bitte wählen" even though data is stored).
  // Closest valid panel option is 'Bis zu 1 Mal' → 'up_to_1_time'.
  const nachtMap: Record<string, string> = {
    nein:          'Nein',
    gelegentlich:  'Bis zu 1 Mal', // was 'Gelegentlich' — not a valid form option; maps to unusable 'occasionally'
    taeglich:      'Bis zu 1 Mal',
    mehrmals:      'Mehr als 2',
    regelmaessig:  'Bis zu 1 Mal', // legacy alias
  };

  // Wunschgeschlecht mapping
  const geschlechtMap: Record<string, string> = {
    weiblich: 'Weiblich',
    maennlich: 'Männlich',
    egal:     'Egal',
  };

  const mob = String(fd.mobilitaet ?? '');
  const nacht = String(fd.nachteinsaetze ?? '');
  const geschl = String(fd.geschlecht ?? '');
  // anzahl = how many people need care (= Primundus "betreuung_fuer").
  // NOT weitere_personen, which means "are there OTHER people IN the
  // household who do NOT need care" (e.g. spouse who lives there).
  // Pre-2026-04-28 we used the wrong key here — exact same bug we fixed
  // in supabase/functions/onboard-to-mamamia/mappers.ts buildPatients.
  const betreuungFuer = String(fd.betreuung_fuer ?? '');
  const isCouple = betreuungFuer === 'ehepaar';

  // Resolved labels — computed once, reused for Person 1 + 2.
  // Pflegegrad: kalkulator allows 0 ("Kein/e" — keine offizielle Einstufung).
  // Map to the form's "Kein/e" label so the customer sees their actual
  // calculator pick instead of empty / mm-rehydrate "Pflegegrad 2"
  // (which used to be the onboard fallback for 0).
  const rawPg = fd.pflegegrad;
  const pflegegradLabel: string | undefined =
    rawPg === 0 ? 'Kein/e'
    : (typeof rawPg === 'number' && rawPg >= 1 && rawPg <= 5) ? String(rawPg)
    : undefined;
  const mobilitaetLabel = mob ? (mobMap[mob] ?? '') : undefined;
  const nachtLabel = nacht ? (nachtMap[nacht] ?? 'Nein') : undefined;

  // weitere_personen: 'ja'/'nein' → 'Ja'/'Nein' for the haushalt field.
  // This is price-relevant and must not be left blank.
  const wpRaw = String(fd.weitere_personen ?? '').toLowerCase();
  const haushaltLabel: string | undefined =
    wpRaw === 'ja' ? 'Ja' : wpRaw === 'nein' ? 'Nein' : undefined;

  return {
    anzahl:           isCouple ? '2' : '1',
    pflegegrad:       pflegegradLabel,
    mobilitaet:       mobilitaetLabel,
    nacht:            nachtLabel,
    haushalt:         haushaltLabel,
    // Person 2 inherits Person 1's calculator answers — the calculator
    // doesn't collect them separately, and "couple, both have same
    // Pflegegrad" is a much better default than blank/Pflegegrad 2.
    // User edits Person 2 row in the patient form when reality differs.
    p2_pflegegrad:    isCouple ? pflegegradLabel : undefined,
    p2_mobilitaet:    isCouple ? mobilitaetLabel : undefined,
    p2_nacht:         isCouple ? nachtLabel : undefined,
    wunschGeschlecht: geschl ? (geschlechtMap[geschl] ?? '') : undefined,
  };
}
