/* ─── Facebook-/Instagram-Leads aus Meta-Sofortformularen ─────────────────
 *
 * Portiert von winterly (lib/meta-leads.ts), angepasst an den Kostenrechner:
 * Versand über lib/email.ts (sendEmail), Mails in lib/meta-leads-mails.ts,
 * Speicher = Tabelle fb_leads (Migration 20261125120000_fb_leads.sql) über den
 * Service-Key.
 *
 * Ablauf je Lauf (POST /api/cron/meta-leads, pg_cron jede Minute):
 *   1. Seiten-Token holen: GET /{META_PAGE_ID}?fields=access_token mit
 *      META_PAGE_TOKEN. META_PAGE_TOKEN darf ein Systemnutzer-Token sein —
 *      Meta verlangt für Formulare und Leads einen Seiten-Token; ist es schon
 *      einer, liefert Meta ihn unverändert zurück.
 *   2. Alle Formulare der Seite, je Formular die neuesten 100 Leads.
 *   3. In fb_leads einfügen, Duplikate ignorieren (id = Lead-ID von Meta).
 *      NUR die frisch eingefügten Zeilen gehen weiter — ein Lead bekommt nie
 *      zwei Mails, alte Leads nie eine.
 *   4. Bestätigung an jeden frischen Lead mit E-Mail (höchstens
 *      BESTAETIGUNG_MAX_ALTER_STUNDEN alt), danach confirm_sent_at.
 *   5. EINE Team-Mail an META_LEADS_TO mit allen frischen Leads, danach
 *      notified_at. Die Bestätigung geht VOR der Team-Mail raus, weil die
 *      Team-Mail sagt, dass sie schon verschickt ist.
 *
 * Umgebung:
 *   META_PAGE_ID      Facebook-Seite mit den Formularen
 *   META_PAGE_TOKEN   Systemnutzer- oder Seiten-Token mit leads_retrieval
 *                     (Geheimnis). Fehlt eins von beiden, liest der Lauf beide aus
 *                     dem Supabase-Vault (RPC get_meta_leads_secrets, Einträge
 *                     meta_page_id / meta_page_token — so auf Prod seit 27.11.2026,
 *                     weil die Render-Env des Prod-Kostenrechners nicht in Martins
 *                     Render-Zugang liegt). Fehlt es auch dort ⇒ inert, {configured:false}.
 *   META_LEADS_TO     Empfänger der Team-Mail, Standard info@primundus.de
 *   META_GRAPH_URL    nur für Tests (Nachbau der Graph API)
 *
 * Tokens stehen nie in einer URL (Authorization-Header) und nie in Logs
 * oder Fehlermeldungen.
 */

import { randomBytes } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from './email';
import { holeBewertungsStand, type BewertungsStand } from './bewertungen-stand';
import {
  BESTAETIGUNG_MAX_ALTER_STUNDEN,
  mailAdresse,
  metaLeadBestaetigung,
  metaLeadTeamMail,
  type BestaetigungsStand,
  type FbLead,
} from './meta-leads-mails';

export type { FbLead } from './meta-leads-mails';

const GRAPH_STANDARD = 'https://graph.facebook.com/v21.0';
const TEAM_STANDARD = 'info@primundus.de';

export const metaLeadsBereit = (env: NodeJS.ProcessEnv = process.env): boolean =>
  !!env.META_PAGE_ID?.trim() && !!env.META_PAGE_TOKEN?.trim();

/** Fehler der Graph API. Die Meldung ist frei von Tokens und URLs. */
export class MetaFehler extends Error {
  constructor(meldung: string) {
    super(meldung);
    this.name = 'MetaFehler';
  }
}

type GraphLead = {
  id: string;
  created_time: string;
  ad_name?: string;
  campaign_name?: string;
  platform?: string;
  field_data?: { name: string; values?: string[] }[];
};

/** Zeile für fb_leads (ohne status/notes/Zeitstempel — die setzt die Datenbank). */
export type FbLeadZeile = FbLead;

/** Der Teil der Datenbank, den der Lauf braucht. Tests reichen eine Attrappe herein. */
export interface FbLeadsSpeicher {
  /** Fügt ein, ignoriert vorhandene ids, liefert NUR die neu eingefügten Zeilen. */
  neueEinfuegen(zeilen: FbLeadZeile[]): Promise<FbLead[]>;
  markieren(ids: string[], feld: 'notified_at' | 'confirm_sent_at', wann: string): Promise<void>;
}

export function supabaseSpeicher(db: SupabaseClient): FbLeadsSpeicher {
  return {
    async neueEinfuegen(zeilen) {
      const { data, error } = await db
        .from('fb_leads')
        .upsert(zeilen, { onConflict: 'id', ignoreDuplicates: true })
        .select('id, form_id, form_name, ad_name, campaign_name, platform, created_time, name, email, phone, fields, rechner_token');
      if (error) throw new Error(`fb_leads einfügen: ${error.message}`);
      return (data ?? []) as FbLead[];
    },
    async markieren(ids, feld, wann) {
      if (!ids.length) return;
      const { error } = await db.from('fb_leads').update({ [feld]: wann }).in('id', ids);
      if (error) throw new Error(`fb_leads ${feld}: ${error.message}`);
    },
  };
}

/* Service-Key wie lib/lead-management.ts: fb_leads ist per RLS zu (keine Policies). */
function standardSpeicher(): FbLeadsSpeicher {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('meta-leads: SUPABASE_SERVICE_ROLE_KEY fehlt');
  /* auth-Optionen sind PFLICHT (OOM #218): ohne sie startet supabase-js je
     Client einen Refresh-Ticker, der nie wieder aufhört. */
  return supabaseSpeicher(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

/** Meta-Zugang (Seite + Token). Felder fehlen, wenn die Quelle nichts hat. */
export type MetaZugang = { seite?: string; token?: string };

/* Zugang aus dem Supabase-Vault (RPC get_meta_leads_secrets, nur service_role,
   Migration 20261127190000). Grund: die Render-Env des Prod-Kostenrechners
   verwaltet Michał; der Vault lässt sich über die Management-API füllen.
   Jeder Fehler ⇒ leer ⇒ Route bleibt inert (Staging hat keine Einträge). */
async function zugangAusVault(env: NodeJS.ProcessEnv): Promise<MetaZugang> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return {};
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc('get_meta_leads_secrets');
    if (error || !data) return {};
    const d = data as { pageId?: string; pageToken?: string };
    return { seite: d.pageId || undefined, token: d.pageToken || undefined };
  } catch {
    return {};
  }
}

/** Entfernt jede Spur der Tokens aus einem Text (Meldungen von Meta, Netzfehler). */
function ohneTokens(text: string, tokens: string[]): string {
  let t = text;
  for (const tok of tokens) if (tok && tok.length >= 8) t = t.split(tok).join('***');
  return t.replace(/access_token=[^&\s]+/gi, 'access_token=***');
}

async function graphGet<T>(
  basis: string,
  pfad: string,
  params: Record<string, string>,
  token: string,
  geheim: string[],
): Promise<T> {
  const url = `${basis}/${pfad}?${new URLSearchParams(params)}`;
  let r: Response;
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch {
    // Netzfehler können die URL enthalten — nichts davon weitergeben.
    throw new MetaFehler('Meta: Graph API nicht erreichbar');
  }
  const d = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!r.ok || d.error) {
    const meldung = d.error?.message ? ohneTokens(String(d.error.message), geheim) : `HTTP ${r.status}`;
    throw new MetaFehler(`Meta: ${meldung}${d.error?.code ? ` (Code ${d.error.code})` : ''}`);
  }
  return d;
}

const nimm = (f: Record<string, string>, ...keys: string[]): string | null => {
  for (const k of keys) if (f[k]?.trim()) return f[k].trim();
  return null;
};

/* Meta benennt die Felder nach der Sprache, in der das Formular angelegt wurde:
   das deutsche Formular „Primundus_Anfrage_DE (Stuhl, 27.11.)“ liefert
   „e-mail-adresse“, „vollständiger_name“, „telefonnummer“ (Graph API 27.11.2026)
   statt email / full_name / phone_number. Erst die bekannten Namen, dann ein
   Teilwort im Feldnamen. */
const suche = (f: Record<string, string>, test: (name: string) => boolean): string | null => {
  for (const [k, v] of Object.entries(f)) if (test(k.toLowerCase()) && v?.trim()) return v.trim();
  return null;
};

/** Meta-Lead → Zeile für fb_leads. */
export function zuZeile(l: GraphLead, form: { id: string; name?: string }): FbLeadZeile {
  const fields: Record<string, string> = {};
  for (const f of l.field_data || []) fields[f.name] = (f.values || []).join(', ');
  const vor = nimm(fields, 'first_name');
  const nach = nimm(fields, 'last_name');
  return {
    id: l.id,
    form_id: form.id,
    form_name: form.name || null,
    ad_name: l.ad_name || null,
    campaign_name: l.campaign_name || null,
    platform: l.platform || null,
    created_time: new Date(l.created_time).toISOString(),
    name:
      nimm(fields, 'full_name', 'name', 'vollständiger_name') ||
      [vor, nach].filter(Boolean).join(' ') ||
      suche(fields, (k) => k.includes('name')),
    email: nimm(fields, 'email', 'work_email', 'e-mail-adresse', 'e-mail') || suche(fields, (k) => k.includes('mail')),
    phone:
      nimm(fields, 'phone_number', 'phone', 'work_phone_number', 'telefonnummer') ||
      suche(fields, (k) => k.includes('telefon') || k.includes('phone')),
    fields,
  };
}

export type MetaLeadsErgebnis =
  | { configured: false; inserted: 0 }
  | {
      configured: true;
      forms: number;
      fetched: number;
      inserted: number;
      confirmations: number;
      withoutConfirmation: number;
      teamMail: 'verschickt' | 'fehlgeschlagen' | 'keine';
    };

export interface MetaLeadsOptionen {
  speicher?: FbLeadsSpeicher;
  env?: NodeJS.ProcessEnv;
  jetzt?: () => Date;
  senden?: typeof sendEmail;
  /** Sterne für die Bestätigung (Standard: live von primundus.de, Ersatzwert wie alle Mails). */
  bewertung?: () => Promise<BewertungsStand>;
  /** Zugang, wenn META_PAGE_ID/META_PAGE_TOKEN in der Env fehlen (Standard: Supabase-Vault). */
  zugang?: () => Promise<MetaZugang>;
  /** Schlüssel für den Kostenrechner je neuem Lead (Standard: 24 Zufallsbytes, Registry #172). */
  rechnerToken?: () => string;
}

/** 24 Zufallsbytes als base64url (32 Zeichen, passt zu FB_TOKEN_MUSTER in lib/fb-kontakt.ts). */
export function neuerRechnerToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Holt die neuesten Leads aller Formulare der Seite, speichert neue und verschickt die Mails. */
export async function syncMetaLeads(opt: MetaLeadsOptionen = {}): Promise<MetaLeadsErgebnis> {
  const env = opt.env ?? process.env;
  let seite = env.META_PAGE_ID?.trim() || '';
  let grundToken = env.META_PAGE_TOKEN?.trim() || '';
  if (!metaLeadsBereit(env)) {
    const v = await (opt.zugang ?? (() => zugangAusVault(env)))();
    seite ||= v.seite?.trim() || '';
    grundToken ||= v.token?.trim() || '';
  }
  if (!seite || !grundToken) return { configured: false, inserted: 0 };
  const senden = opt.senden ?? sendEmail;
  const jetzt = opt.jetzt ?? (() => new Date());
  const basis = (env.META_GRAPH_URL || GRAPH_STANDARD).replace(/\/$/, '');
  const geheim = [grundToken];

  const page = await graphGet<{ access_token?: string }>(basis, seite, { fields: 'access_token' }, grundToken, geheim);
  const token = page.access_token || grundToken;
  geheim.push(token);

  const forms = await graphGet<{ data?: { id: string; name?: string }[] }>(
    basis, `${seite}/leadgen_forms`, { fields: 'id,name', limit: '100' }, token, geheim,
  );
  const zeilen = new Map<string, FbLeadZeile>();
  for (const form of forms.data ?? []) {
    const leads = await graphGet<{ data?: GraphLead[] }>(
      basis, `${form.id}/leads`, { fields: 'id,created_time,field_data,ad_name,campaign_name,platform', limit: '100' }, token, geheim,
    );
    // Registry #172: jeder neue Lead bekommt einen Schlüssel für den Kostenrechner; vorhandene Zeilen behalten ihren (ignoreDuplicates).
    for (const l of leads.data ?? []) zeilen.set(l.id, { ...zuZeile(l, form), rechner_token: (opt.rechnerToken ?? neuerRechnerToken)() });
  }
  const formsAnzahl = forms.data?.length ?? 0;
  const basisErgebnis = { configured: true as const, forms: formsAnzahl, fetched: zeilen.size };
  if (!zeilen.size) {
    return { ...basisErgebnis, inserted: 0, confirmations: 0, withoutConfirmation: 0, teamMail: 'keine' };
  }

  const speicher = opt.speicher ?? standardSpeicher();
  const frisch = (await speicher.neueEinfuegen(Array.from(zeilen.values())))
    .slice()
    .sort((a, b) => a.created_time.localeCompare(b.created_time));
  if (!frisch.length) {
    return { ...basisErgebnis, inserted: 0, confirmations: 0, withoutConfirmation: 0, teamMail: 'keine' };
  }

  // Zeitstempel sind Protokoll: ein Fehler beim Setzen darf die übrigen Mails nicht aufhalten.
  const markiere = async (ids: string[], feld: 'notified_at' | 'confirm_sent_at') => {
    try {
      await speicher.markieren(ids, feld, jetzt().toISOString());
    } catch (e) {
      console.error('[meta-leads]', e instanceof Error ? e.message : String(e));
    }
  };

  // 4. Bestätigungen — nur frisch eingefügte Leads, nur mit E-Mail, nur nicht zu alt.
  const grenze = jetzt().getTime() - BESTAETIGUNG_MAX_ALTER_STUNDEN * 3600000;
  const eintraege: Array<{ lead: FbLead; bestaetigung: BestaetigungsStand }> = [];
  let bewertung: BewertungsStand | undefined;
  for (const lead of frisch) {
    let stand: BestaetigungsStand;
    if (!lead.email?.includes('@')) stand = 'keine_email';
    else if (new Date(lead.created_time).getTime() < grenze) stand = 'zu_alt';
    else {
      bewertung ??= await (opt.bewertung ?? holeBewertungsStand)();
      const r = await senden(lead.email.trim(), metaLeadBestaetigung(lead, bewertung)).catch(() => ({ success: false }));
      stand = r.success ? 'verschickt' : 'fehlgeschlagen';
      if (r.success) await markiere([lead.id], 'confirm_sent_at');
      else console.error('[meta-leads] Bestätigung fehlgeschlagen für Lead', lead.id);
    }
    eintraege.push({ lead, bestaetigung: stand });
  }

  // 5. Team-Mail.
  const einer = frisch.length === 1 ? frisch[0] : null;
  const replyTo = einer ? mailAdresse(einer.email) : null;
  const an = env.META_LEADS_TO?.trim() || TEAM_STANDARD;
  const team = await senden(an, metaLeadTeamMail(eintraege), undefined, replyTo ? { replyTo } : undefined)
    .catch(() => ({ success: false }));
  if (team.success) await markiere(frisch.map((l) => l.id), 'notified_at');
  else console.error('[meta-leads] Team-Mail fehlgeschlagen für', frisch.length, 'Lead(s):', frisch.map((l) => l.id).join(', '));

  const confirmations = eintraege.filter((e) => e.bestaetigung === 'verschickt').length;
  return {
    ...basisErgebnis,
    inserted: frisch.length,
    confirmations,
    withoutConfirmation: eintraege.length - confirmations,
    teamMail: team.success ? 'verschickt' : 'fehlgeschlagen',
  };
}
