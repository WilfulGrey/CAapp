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

/** Build display name from lead */
export function leadDisplayName(lead: Lead): string {
  const parts = [lead.vorname, lead.nachname].filter(Boolean);
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
