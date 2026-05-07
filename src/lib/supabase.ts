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

/** Map care_start_timing to a human-readable label */
export function careStartLabel(timing: string | null): string {
  const map: Record<string, string> = {
    sofort: 'ab sofort',
    '1-2-wochen': 'in 1–2 Wochen',
    '1-monat': 'in ca. 1 Monat',
    spaeter: 'zu einem späteren Zeitpunkt',
  };
  return timing ? (map[timing] ?? timing) : 'ab sofort';
}

/** Format euro amount */
export function formatEuro(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

// ─── Map formularDaten → PatientForm prefill ──────────────────────────────────

type FormularDatenField =
  | 'mobilitaet'
  | 'nachteinsaetze'
  | 'geschlecht'
  | 'deutschkenntnisse'
  | 'fuehrerschein';

const FORMULAR_DATEN_LABELS: Record<FormularDatenField, Record<string, string>> = {
  mobilitaet: {
    rollstuhl:    'Rollstuhlfähig',
    gehfaehig:    'Gehfähig mit Hilfe',
    bettlaegerig: 'Bettlägerig',
    mobil:        'Selbstständig mobil',
  },
  nachteinsaetze: {
    nein:         'Nein',
    gelegentlich: 'Gelegentlich',
    regelmaessig: 'Regelmäßig',
  },
  geschlecht: {
    weiblich:  'Weiblich',
    maennlich: 'Männlich',
    egal:      'Egal',
  },
  deutschkenntnisse: {
    grundlegend:  'Grundlegend',
    kommunikativ: 'Kommunikativ',
    'sehr-gut':   'Gut',
  },
  fuehrerschein: {
    ja:   'Ja',
    nein: 'Nein',
    egal: 'Egal',
  },
};

/**
 * Format an enum value coming from formularDaten as a German display label.
 * - Empty / nullish input → `fallback`
 * - Known enum value → mapped label
 * - Unknown enum value → raw value (so issues surface in QA instead of being silently swallowed)
 */
export function formatFormularDaten(
  field: FormularDatenField,
  raw: unknown,
  fallback = '',
): string {
  if (raw == null || raw === '') return fallback;
  const s = String(raw);
  return FORMULAR_DATEN_LABELS[field][s] ?? s;
}

export interface PatientPrefill {
  anzahl?: '1' | '2';
  pflegegrad?: string;
  mobilitaet?: string;
  nacht?: string;
  wunschGeschlecht?: string;
}

export function prefillPatientFromLead(lead: Lead): PatientPrefill {
  const fd = lead.kalkulation?.formularDaten;
  if (!fd) return {};

  const mob     = String(fd.mobilitaet       ?? '');
  const nacht   = String(fd.nachteinsaetze   ?? '');
  const geschl  = String(fd.geschlecht       ?? '');
  const weitere = String(fd.weitere_personen ?? '');

  return {
    anzahl:           weitere === 'ja' ? '2' : '1',
    pflegegrad:       fd.pflegegrad ? String(fd.pflegegrad) : undefined,
    mobilitaet:       mob    ? (FORMULAR_DATEN_LABELS.mobilitaet[mob]        ?? '')     : undefined,
    nacht:            nacht  ? (FORMULAR_DATEN_LABELS.nachteinsaetze[nacht]  ?? 'Nein') : undefined,
    wunschGeschlecht: geschl ? (FORMULAR_DATEN_LABELS.geschlecht[geschl]     ?? '')     : undefined,
  };
}
