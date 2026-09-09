/* ─── Abholer: Lead-Mails aus dem Portal-Postfach in die Strecke ──────────
 *
 * Jedes Portal, bei dem wir Leads einkaufen, bekommt eine EIGENE Adresse
 * (pflegehilfe@primundus.de, pflegebund@primundus.de). Die Adresse IST die
 * Quellenangabe: was dort ankommt, kommt von diesem Portal — wir muessen
 * den Absender nicht raten.
 *
 * Diese Postfaecher sind reine EINGAENGE. Von hier wird nie gesendet; der
 * Kundenversand laeuft unveraendert ueber kostenrechner@primundus.de.
 *
 * Getaktet von pg_cron (jede Minute, Migration setup_portal_abholer_cron):
 * derselbe Weg wie detect-caregiver-events und send-scheduled-emails —
 * KEIN eigener Render-Dienst (Entscheidung Michał 01.09.: "mamy już crony").
 * Der Lauf lebt als Route im ohnehin laufenden Kostenrechner, damit der
 * Parser (lib/portal-parser) geteilt bleibt statt kopiert.
 *
 * Ablauf je Lauf:
 *   1. IMAP oeffnen, ALLE UIDs holen — READ-ONLY, wir schreiben keine Flags
 *   2. Abgleich mit portal_mail_log (Registry #47): nur UIDs ohne Eintrag
 *      oder mit Status 'offen' laufen weiter; Erstkontakt eines
 *      (postfach, uidvalidity)-Paars registriert den Bestand als
 *      'altbestand', ohne ihn zu verarbeiten (Seed-Muster Bug #25)
 *   3. Text durch den Parser (lib/portal-parser)
 *   4. POST /api/portal-lead (Loopback) — dort entstehen Lead, Preis, Mail 1
 *   5. Ausgang ins Protokoll: erledigt / uebersprungen / abgelehnt / offen.
 *      abgelehnt und uebersprungen werden zusaetzlich im Admin sichtbar
 *      (Shell-Lead 'manuell_pruefen' bzw. Event) — nichts scheitert still.
 *
 * Frueher war \Seen das Gedaechtnis des Abholers — Zustand, den wir uns
 * mit Menschen im Webmail teilten: zweimal (02.–03.09.) hat ein offener
 * Client Mails als gelesen markiert und der Cron sah sie nie. Jetzt ist
 * das Postfach fuer uns READ-ONLY (fetchOne holt per BODY.PEEK); wer darin
 * liest oder aufraeumt, kann nichts mehr kaputt machen.
 *
 * Beobachtbarkeit: pg_cron-"succeeded" heisst nur "HTTP gefeuert"
 * (Registry #36) und net._http_response rotiert in Stunden. Die Wahrheit
 * steht in den Render-Logs ([portal-abholer]-Zeilen) und in
 * portal_mail_log (Admin: Abschnitt "Postfach" im Portal-Reiter). Nur
 * 'offen' (transiente Fehler) macht den Lauf zu HTTP 500 — dauerhaft
 * abgelehnte Mails werden als 'manuell_pruefen' sichtbar, statt den Lauf
 * jede Minute rot zu halten (die Endlosschleife aus Registry #46).
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* Derselbe Parser, den auch der Testlauf und die Unit-Tests benutzen —
 * der Abholer bringt KEINE zweite Lesart der Portal-Mail mit. */
import { parsePflegehilfe, telefoneAusHtml, waehleTelefone } from '@/lib/portal-parser';
import { parseCsv, csvZuLeadZeile, csvZeileBrauchbar } from '@/lib/portal-csv';
import { PORTALE, vermittlerFuer, postfachPraefix } from '@/lib/portal-lead';
import { zuVerarbeiten, SEED_SENTINEL_UID, versucheFuer, MAX_VERSUCHE, type LogZeile } from '@/lib/portal-mail-log';
import { modellNachricht, pruefeAnfrage, SYSTEM as PFLEGENA_SYSTEM, WERKZEUG as PFLEGENA_WERKZEUG, type MailKopf } from '@/lib/pflegena';
import { flagGiltFuer } from '@/lib/portal-schutz';
import { sendEmail } from '@/lib/email';
import { apiZeilen, helfer24ZuLeadBody, heuteBerlin, HELFER24_EXPORT_URL, type Helfer24Ergebnis } from '@/lib/portal-helfer24';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Postfach { portal: string; user?: string; pass?: string }

interface Konfig {
  imapHost: string;
  basisUrl: string;
  leadKey?: string;
  /** Trockenlauf je Portal: PORTAL_TROCKENLAUF = "1" (alle) oder Domain-Liste. */
  trocken: (portal: string) => boolean;
  trockenWert: string;
}

/* Alles pro Anfrage frisch aus der Env — kein Modul-Zustand, der einen
 * Dashboard-Wechsel (z.B. TROCKENLAUF aus) bis zum Redeploy ueberlebt. */
function konfig(): Konfig {
  return {
    imapHost: process.env.PORTAL_IMAP_HOST || 'imap.ionos.de',
    /* Loopback auf den eigenen Server: die Route und /api/portal-lead
       leben im selben Prozess, kein Umweg uebers oeffentliche Netz.
       PORTAL_LEAD_URL bleibt als Override (z.B. Staging-Sonderfaelle). */
    basisUrl: process.env.PORTAL_LEAD_URL
      || `http://127.0.0.1:${process.env.PORT || '3000'}`,
    leadKey: process.env.PORTAL_LEAD_KEY,
    /* Trockenlauf: liest und parst, postet aber nicht und schreibt NICHTS
       in die Datenbank (auch keinen Seed — der passiert beim
       Scharfschalten). Fuer den ersten Tag: man sieht, was der Parser aus
       echten Mails macht, ohne dass jemand eine Kundenmail bekommt. */
    trocken: (portal) => flagGiltFuer(process.env.PORTAL_TROCKENLAUF, portal),
    trockenWert: process.env.PORTAL_TROCKENLAUF ?? '',
  };
}

/* Die Postfaecher — abgeleitet aus der zentralen Portal-Liste, damit ein
 * neues Portal nicht an einer Stelle vergessen wird. Der Zugang kommt aus
 * der Env, benannt nach dem Portal: pflegehilfe.org → PFLEGEHILFE_USER /
 * PFLEGEHILFE_PASS. Ein Postfach ohne gesetztes Passwort wird
 * uebersprungen, nicht erraten. */
function postfaecher(art: 'portal' | 'vermittler'): Postfach[] {
  return PORTALE.filter((p) => p.abholung === 'imap' && p.art === art).map((p) => {
    const praefix = postfachPraefix(p);
    return {
      portal: p.domain,
      user: process.env[`${praefix}_USER`],
      pass: process.env[`${praefix}_PASS`],
    };
  });
}

function log(...t: unknown[]) { console.log('[portal-abholer]', ...t); }

/* Service-Role-Client fuers Protokoll. BEWUSST ohne anon-Fallback (anders
 * als portal-lead): anon prallt an der RLS-Schreibsperre von
 * portal_mail_log ab und wuerde die Idempotenz still toeten. Fehlt der
 * Zugang ⇒ Feature aus (503), Muster "lieber tot als offen". */
function logDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase-Zugang fehlt — ohne Protokoll kein Abholen');
  /* auth-Optionen sind PFLICHT (OOM #218): ohne sie startet supabase-js
     je Request einen 30s-Refresh-Ticker, der nie wieder aufhoert. */
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* Saemtliche Log-Zeilen eines (postfach, uidvalidity)-Paars.
 *
 * Seitenweise, weil PostgREST JEDE Antwort bei max-rows (Default 1000)
 * kappt — egal was .limit() sagt. Ein still gekuerzter Read liesse UIDs
 * ab Zeile 1001 "neu" aussehen, und /api/portal-lead schickt Mail 1 auch
 * an Bestandskunden erneut: genau die Incident-Klasse, die diese Tabelle
 * beerdigen soll. */
async function alleLogZeilen(db: SupabaseClient, postfach: string, uidvalidity: number): Promise<LogZeile[]> {
  const zeilen: LogZeile[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await db
      .from('portal_mail_log')
      .select('uid, status, versuche')
      .eq('postfach', postfach)
      .eq('uidvalidity', uidvalidity)
      .order('uid', { ascending: true })
      .range(von, von + 999);
    if (error) throw new Error(`portal_mail_log lesen: ${error.message}`);
    zeilen.push(...((data ?? []) as LogZeile[]));
    if (!data || data.length < 1000) return zeilen;
  }
}

type Ausgang = {
  status: 'erledigt' | 'uebersprungen' | 'abgelehnt' | 'offen';
  grund?: string;
  leadId?: string;
  /** Nur der Vermittler-Zweig setzt das — siehe MAX_VERSUCHE. */
  versuche?: number;
};

async function schreibeLog(db: SupabaseClient, postfach: string, uidvalidity: number, uid: number, ausgang: Ausgang) {
  /* Upsert, nicht insert: 'offen' → 'erledigt'/'abgelehnt' aktualisiert
     die bestehende Zeile des vorigen Takts. */
  const { error } = await db.from('portal_mail_log').upsert({
    postfach,
    uidvalidity,
    uid,
    status: ausgang.status,
    grund: ausgang.grund ?? null,
    lead_id: ausgang.leadId ?? null,
    ...(ausgang.versuche === undefined ? {} : { versuche: ausgang.versuche }),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'postfach,uidvalidity,uid' });
  if (error) throw new Error(`portal_mail_log schreiben (#${uid} → ${ausgang.status}): ${error.message}`);
}

/* Sichtbarkeit statt stillem Verlust (Entscheidung Michał 03.09.): jede
 * Mail, die KEIN echter Lead wird — abgelehnt wie uebersprungen — taucht
 * im Admin auf. Gibt es schon einen Lead mit der Adresse, haengt sie sich
 * als Event daran; sonst entsteht ein Shell-Lead 'manuell_pruefen'.
 *
 * BEWUSST nicht findOrCreateLead: dessen Status-Maschine soll Fehlmails
 * weder hochstufen noch verschlucken. leads.notizen gibt es nicht — die
 * Details (Betreff, Grund, Auszug) traegt das Event.
 *
 * Best-effort: scheitert das Anlegen, bleibt der Log-Status trotzdem
 * gueltig — Idempotenz schlaegt Anzeige. */
async function registriereFehlmail(
  db: SupabaseClient,
  portal: string,
  uid: number | string,
  mail: Pick<ParsedMail, 'subject' | 'from'>,
  roh: string,
  art: 'abgelehnt' | 'uebersprungen',
  grund?: string,
  email?: string,
  name?: string,
): Promise<string | undefined> {
  try {
    /* Envelope-From ist bei Portal-Mails der PORTAL-Absender: Fehlmails
       ohne Kundenadresse sammeln sich als Events auf EINEM Shell-Lead,
       statt die Liste zu fluten. Gewollt. */
    const adresse = email || mail.from?.value?.[0]?.address || `unbekannt@${portal}`;
    const vermittler = vermittlerFuer(portal);
    /* Beim Portal ist die Absenderadresse der PORTAL-Absender: Fehlmails
       sammeln sich auf EINEM Shell-Lead statt die Liste zu fluten.
       Beim VERMITTLER ist dieselbe Adresse die von JEDEM seiner echten
       Leads — der Lookup wuerde eine Fehlmail zu Familie A an den Lead von
       Familie B haengen. Dort also immer ein eigener Shell-Lead; die
       Antworten im Thread faengt schon threadTreffer ab, es bleibt wenig
       uebrig. */
    let leadId: string | undefined;
    if (!vermittler) {
      const { data: vorhanden } = await db
        .from('leads')
        .select('id')
        .eq('email', adresse)
        .order('created_at', { ascending: false })
        .limit(1);
      leadId = vorhanden?.[0]?.id;
    }
    if (!leadId) {
      const { data: neu, error } = await db
        .from('leads')
        .insert({
          email: adresse,
          status: 'manuell_pruefen',
          source: `portal:${portal}`,
          ...(vermittler ? { vermittler: vermittler.domain } : {}),
          vorname: name || undefined,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      leadId = neu?.id;
    }
    if (leadId) {
      const { error } = await db.from('lead_events').insert({
        lead_id: leadId,
        event_type: art === 'abgelehnt' ? 'portal_mail_fehler' : 'portal_mail_uebersprungen',
        metadata: {
          postfach: portal,
          uid,
          betreff: mail.subject ?? '',
          grund: grund ?? '',
          // Kappe wie beim zusatz-Archiv (Registry #42): Inhalt kommt von aussen.
          auszug: (roh || '').slice(0, 500),
          /* Abgelehnte Mails komplett aufheben (Michał 04.09., Trageser uid 40:
             die Mail war nach dem Lauf aus dem Postfach verschwunden, unser
             500-Zeichen-Auszug war die einzige Kopie — ohne Kundendaten). */
          ...(art === 'abgelehnt' ? { volltext: roh || '' } : {}),
          at: new Date().toISOString(),
        },
      });
      if (error) throw new Error(error.message);
    }
    return leadId;
  } catch (e: any) {
    log(`  ⚠ ${portal} #${uid} Fehlmail nicht im Admin registriert: ${e.message}`);
    return undefined;
  }
}

/* ─── Vermittler: Prosa statt Formular ───────────────────────────────────
 *
 * Ein Portal liefert Felder, ein Vermittler schreibt einen Brief. Der
 * Regelparser findet darin nichts (nicht einmal "E-Mail:"), deshalb liest
 * ein Modell die Anfrage — und lib/pflegena.ts prueft, was zurueckkommt.
 *
 * Der Netzaufruf steht hier, das Fachliche dort (Muster Pria).
 */

const MODELL = process.env.PFLEGENA_MODELL || 'claude-sonnet-5';

/* Trockenlauf schreibt NICHTS ins Protokoll — beim Portal ist das gratis,
 * beim Vermittler waere es ein bezahlter Modellaufruf pro Minute und Mail.
 * Nur fuer die Lebensdauer des Prozesses; ein Neustart darf ruhig einmal
 * neu lesen. */
const trockenGesehen = new Set<string>();

type ModellErgebnis =
  | { ok: true; roh: any }
  | { ok: false; dauerhaft: boolean; grund: string };

async function frageModell(betreff: string, text: string): Promise<ModellErgebnis> {
  const key = process.env.ANTHROPIC_API_KEY;
  /* Fehlender Schluessel ist ein Konfigurationsfehler, kein Urteil ueber
     diese Mail — sonst waere die Anfrage nach einer Key-Rotation dauerhaft
     abgelehnt (dieselbe Regel wie beim Eingang: "401 Key rotiert" ist
     transient). */
  if (!key) return { ok: false, dauerhaft: false, grund: 'ANTHROPIC_API_KEY fehlt' };

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELL,
        max_tokens: 1000,
        system: [{ type: 'text', text: PFLEGENA_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: modellNachricht(betreff, text) }],
        tools: [PFLEGENA_WERKZEUG],
        tool_choice: { type: 'tool', name: PFLEGENA_WERKZEUG.name },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e: any) {
    return { ok: false, dauerhaft: false, grund: `Modell nicht erreichbar: ${e?.message ?? e}` };
  }

  if (!res.ok) {
    const rumpf = (await res.text().catch(() => '')).slice(0, 300);
    /* Nur 400 ist ein Urteil ueber DIESE Mail (z.B. zu lang). Alles andere
       — 401/403 Schluessel, 429 Limit, 5xx/529 Ueberlast — ist die Lage,
       nicht der Inhalt. */
    const dauerhaft = res.status === 400;
    return { ok: false, dauerhaft, grund: `Modell HTTP ${res.status}: ${rumpf}` };
  }

  const daten: any = await res.json().catch(() => null);
  const block = (daten?.content || []).find((b: any) => b.type === 'tool_use');
  if (!block) return { ok: false, dauerhaft: false, grund: 'Modell hat kein Werkzeug aufgerufen' };
  const u = daten.usage || {};
  log(`  [modell] ↑${u.input_tokens} (cache ${u.cache_read_input_tokens || 0}) ↓${u.output_tokens}`);
  return { ok: true, roh: block.input };
}

/* Antwort in einem Thread, den wir schon kennen?
 *
 * Der Vermittler schreibt in denselben Faden zurueck ("Danke", "ja, machen
 * wir", Nachtraege). Ohne diese Pruefung liefe jede solche Mail durch das
 * Modell und wuerde bestenfalls ein Shell-Lead. Mit ihr haengt sie als
 * Ereignis am RICHTIGEN Lead — und kostet nichts. */
async function threadTreffer(db: SupabaseClient, mail: ParsedMail): Promise<string | undefined> {
  const ids = [
    ...(typeof mail.inReplyTo === 'string' ? [mail.inReplyTo] : []),
    ...(Array.isArray(mail.references) ? mail.references : (mail.references ? [mail.references] : [])),
  ].map((x) => String(x).trim()).filter(Boolean);
  if (!ids.length) return undefined;
  const { data } = await db
    .from('leads')
    .select('id')
    .in('quelle_nachricht_id', ids)
    .order('created_at', { ascending: false })
    .limit(1);
  return (data as { id: string }[] | null)?.[0]?.id;
}

/* Eine Vermittler-Mail verarbeiten. Gibt PostErgebnis zurueck wie der
 * Portal-Weg, damit arbeiteAb keinen zweiten Ausgang kennen muss. */
async function verarbeiteVermittler(
  cfg: Konfig,
  portal: string,
  provisionProTag: number,
  mail: ParsedMail,
  roh: string,
  db: SupabaseClient,
): Promise<PostErgebnis> {
  const von = mail.from?.value?.[0];
  const absender = String(von?.address ?? '').trim().toLowerCase();
  if (!absender) return { ok: false, dauerhaft: true, grund: 'Mail ohne Absenderadresse' };

  /* Zweiter Riegel hinter der Server-Suche. IMAP SEARCH FROM prueft den
     ROHEN Kopfzeilentext, also auch den Anzeigenamen — eine fremde Mail mit
     "pflegena.com" im Namen kaeme durch. In einem Postfach, das nur uns
     gehoert, waere das egal; in `info@primundus.de` liegt die Post der
     Kunden. Kein Shell-Lead, kein Modellaufruf: angesehen, als nicht unsere
     erkannt, nie wieder anfassen. */
  if (!absender.endsWith(`@${portal}`)) {
    log(`  – ${portal}: Absender ${absender} gehoert nicht zur Quelle — uebergangen`);
    return { ok: true, duplikat: `fremder Absender (${absender})` };
  }

  const treffer = await threadTreffer(db, mail);
  if (treffer) {
    await logEventAufLead(db, treffer, 'vermittler_antwort', {
      betreff: mail.subject ?? null,
      message_id: mail.messageId ?? null,
      auszug: roh.slice(0, 500),
    });
    log(`  ${portal}: Antwort im Thread → Ereignis auf Lead ${treffer}, kein Modellaufruf`);
    /* BEWUSST nicht `uebersprungen`: dieser Zweig laeuft in arbeiteAb durch
       registriereFehlmail und legte einen Shell-Lead an — bei einem
       Vermittler fuer JEDE Antwort im Thread einen. Das Ereignis haengt
       schon am richtigen Lead; hier zaehlt nur, dass die Mail erledigt ist. */
    return { ok: true, lead_id: treffer, duplikat: 'Antwort im Thread — kein neues Angebot' };
  }

  const antwort = await frageModell(mail.subject ?? '', roh);
  if (!antwort.ok) return { ok: false, dauerhaft: antwort.dauerhaft, grund: antwort.grund, email: absender };

  const kopf: MailKopf = {
    von: absender,
    vonName: von?.name ?? null,
    betreff: mail.subject ?? null,
    messageId: mail.messageId ?? null,
    datum: mail.date ?? null,
    text: roh,
  };
  const gelesen = pruefeAnfrage(antwort.roh, kopf, provisionProTag);
  if (!gelesen.ok) return { ok: false, dauerhaft: true, grund: gelesen.grund, email: absender, name: von?.name };

  /* Laut ins Log, damit ein Auseinanderlaufen von Prompt und pricing_config
     auffaellt, statt still zur Annahme zu werden (Muster Portal-Parser). */
  if (gelesen.unbekannt.length) log(`  ⚠ nicht zugeordnet (${portal}): ${gelesen.unbekannt.join(' | ')}`);
  for (const h of gelesen.hinweise) log(`  ⚠ ${portal}: ${h}`);

  if (cfg.trocken(portal)) {
    log(`  [trocken] ${absender} — ${Object.keys(gelesen.body.angaben).length} Felder gelesen`);
    return { ok: true, trocken: true };
  }
  return posteLead(cfg, { ...gelesen.body, hinweise: gelesen.hinweise }, absender, gelesen.body.name || undefined);
}

/* Ereignis auf einen bestehenden Lead — best effort, wie registriereFehlmail. */
async function logEventAufLead(db: SupabaseClient, leadId: string, typ: string, metadata: Record<string, unknown>) {
  const { error } = await db.from('lead_events').insert({ lead_id: leadId, event_type: typ, metadata });
  if (error) log(`  ⚠ Ereignis ${typ} nicht geschrieben: ${error.message}`);
}

/* Eine Vermittler-Mail, die der Automat nicht beantwortet hat, dem Team
 * zeigen — im Volltext, damit jemand von Hand antworten kann. Best-effort:
 * scheitert der Versand, bleibt der Log-Status gueltig. */
async function weiterleitenAnTeam(
  portal: string,
  uid: number | string,
  mail: Pick<ParsedMail, 'subject' | 'from'>,
  roh: string,
  grund?: string,
) {
  const von = mail.from?.value?.[0];
  const absender = von?.address ?? 'unbekannt';
  const betreff = mail.subject ?? '(ohne Betreff)';
  const text = [
    `Eine Anfrage von ${portal} konnte nicht automatisch beantwortet werden.`,
    ``,
    `Grund:     ${grund ?? 'unbekannt'}`,
    `Absender:  ${von?.name ? `${von.name} <${absender}>` : absender}`,
    `Betreff:   ${betreff}`,
    `Postfach:  ${portal} #${uid}`,
    ``,
    `Der Partner wartet auf eine Antwort in seinem Thread — bitte von Hand`,
    `beantworten. Der volle Mailtext:`,
    ``,
    `----------------------------------------------------------------`,
    roh,
  ].join('\n');
  await sendEmail('info@primundus.de', {
    subject: `Vermittler-Anfrage unbeantwortet: ${betreff}`,
    text,
    html: `<pre style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;font-size:13px;">${
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }</pre>`,
  }).catch((e) => log(`  ⚠ ${portal} #${uid} Weiterleitung an das Team fehlgeschlagen: ${e?.message ?? e}`));
}

/* Ergebnis eines Eingangs-Versuchs — eine Form fuer Mail- und API-Weg. */
interface PostErgebnis {
  ok: boolean;
  /** Fehler: true = deterministisch (kein Retry), false = transient. */
  dauerhaft?: boolean;
  grund?: string;
  email?: string;
  name?: string;
  uebersprungen?: boolean;
  trocken?: boolean;
  lead_id?: string;
  angenommen?: string[];
  /** Grund, wenn der Eingang ein Duplikat meldete (Lead existiert, keine Mail 1). */
  duplikat?: string;
}

async function verarbeite(
  cfg: Konfig,
  portal: string,
  roh: string,
  /* CSV-Anhang, falls vorhanden: synthetischer Text ist dann die
     DATEN-Quelle; der Mailtext liefert den Einwilligungs-Zeitstempel
     (der steht nur dort, wenn ueberhaupt) und dient als Fallback. */
  csv?: { text: string; zusatz: Record<string, string> },
  /** Datum der Mail — Zeitpunkt der Lieferung, wenn die Mail keinen
      Einwilligungs-Zeitstempel traegt. */
  mailDatum?: Date,
  /** Kundennummern aus dem HTML-Teil (Festnetz + Mobil) — lib/portal-parser.ts. */
  telefone: string[] = [],
): Promise<PostErgebnis> {
  const textErgebnis = parsePflegehilfe(roh);
  const ergebnis = csv ? parsePflegehilfe(csv.text) : textErgebnis;
  const { kontakt, angaben, unbekannt } = ergebnis;

  /* Die Einwilligung ist KEIN Gate mehr (Entscheidung Michał 04.09., nach
     drei abgelehnten echten Direktmails, Registry #51): ein bezahlter Lead
     wird nie wegen eines nicht gefundenen Zeitstempels weggeworfen. Findet
     der Parser den Stempel des Portals, bezeugen wir ihn; sonst bezeugen wir,
     was wir wissen — Lieferung per Mail vom Portal, Datum der Mail — wie bei
     der Partner-API (lib/portal-helfer24.ts). */
  const lieferDatum = (mailDatum ?? new Date()).toISOString();
  const einwilligung = textErgebnis.einwilligung ?? {
    text:
      `Lead per Mail von Verbund Pflegehilfe (${portal}) geliefert am ${lieferDatum}` +
      (ergebnis.portal_lead_id ? ` (Anfragen-Nr. ${ergebnis.portal_lead_id})` : '') +
      '; Kundeneinwilligung liegt gemäß Partnervereinbarung beim Portal (Zeitstempel in der Mail nicht gefunden).',
    zeitpunkt: lieferDatum,
  };

  if (!kontakt.email) {
    return { ok: false as const, dauerhaft: true, grund: 'keine Kundenadresse gefunden', name: kontakt.name || undefined };
  }

  /* Ein Vorlagenwechsel beim Portal faellt sonst nicht auf: der Parser
     laesst Unverstandenes weg, die Annahme greift, und der Kunde bekommt
     stillschweigend geratene Angaben. Deshalb laut ins Log. */
  if (unbekannt.length) {
    log(`  ⚠ nicht zugeordnet (${portal}): ${unbekannt.join(' | ')}`);
  }

  if (cfg.trocken(portal)) {
    log(`  [trocken] ${kontakt.email} — ${Object.keys(angaben).length} Felder gelesen`);
    return { ok: true as const, trocken: true };
  }

  /* Eine Wahrheit fuer telefon/telefon_2 (Registry #56): CSV-Nummer, sonst
     HTML, sonst Text-Parse; die zweite HTML-Nummer wird telefon_2. */
  const { telefon, telefon_2 } = waehleTelefone(
    csv ? kontakt.telefon : undefined, textErgebnis.kontakt.telefon, telefone,
  );

  return posteLead(cfg, {
      portal,
      name: kontakt.name,
      email: kontakt.email,
      telefon,
      telefon_2,
      angaben,
      care_start_timing: ergebnis.care_start_timing,
      portal_lead_id: ergebnis.portal_lead_id,
      plz: kontakt.plz || undefined,
      ort: kontakt.ort || undefined,
      details: ergebnis.details,
      einwilligung,
      /* Das Alter pruefen die Schutzregeln im Endpunkt. Der Zeitpunkt der
         Einwilligung ist der belastbarste Datumswert der Mail. */
      erstellt_am: einwilligung.zeitpunkt,
      /* Spalten ohne Zuhause bei uns (Krankheiten, Gewicht, Beziehung …)
         — landen append-only im Ereignislog, nichts geht verloren. */
      zusatz: csv?.zusatz,
    }, kontakt.email, kontakt.name || undefined);
}

/* Der Weg in den Eingang — EINER fuer Mail- und API-Portale, damit die
 * Klassifizierung der Antwort (dauerhaft / transient / uebersprungen /
 * Duplikat) nicht zweimal existiert. */
async function posteLead(cfg: Konfig, body: Record<string, unknown>, email: string, name?: string): Promise<PostErgebnis> {
  const antwort = await fetch(`${cfg.basisUrl}/api/portal-lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-portal-key': cfg.leadKey as string },
    body: JSON.stringify(body),
  });

  const daten = await antwort.json().catch(() => ({}));
  if (!antwort.ok) {
    /* 400 = Validierungs-Verdikt des Endpunkts (unbekanntes Portal,
       kaputte E-Mail, fehlende Einwilligung) — deterministisch, ein Retry
       aendert nichts. Alles andere (401 Key rotiert, 5xx, Netz) ist
       transient: naechster Takt versucht es erneut. */
    return {
      ok: false as const,
      dauerhaft: antwort.status === 400,
      grund: `HTTP ${antwort.status}: ${daten?.error ?? ''}`,
      email,
      name,
    };
  }
  /* Der Endpunkt antwortet auch beim bewussten Ueberspringen mit 200
     (zu alt, Status nicht ansprechbar, Bestandskunde). Das ist ERLEDIGT,
     nicht Fehler — aber seit 03.09. im Admin sichtbar (Shell-Lead/Event). */
  if (daten?.uebersprungen) {
    return { ok: true as const, uebersprungen: true, grund: daten.grund, email, name };
  }
  /* Duplikat: Lead existiert, keine Mail 1 (Registry #50). Kein Fehler,
     kein Shell-Lead — der Grund wandert ins Protokoll. */
  return {
    ok: true as const,
    lead_id: daten?.lead_id,
    angenommen: daten?.angenommene_felder ?? [],
    duplikat: daten?.duplikat === true ? String(daten?.grund ?? 'Duplikat') : undefined,
  };
}

/* Die neuen Mails eines Postfachs abarbeiten — neu heisst: ohne Eintrag
 * in portal_mail_log (oder dort 'offen').
 *
 * getMailboxLock statt mailboxOpen: es waehlt die INBOX und haelt sie fuer
 * die Dauer unserer Befehle — die von ImapFlow empfohlene Form fuer eine
 * Folge zusammengehoeriger Befehle. */
async function arbeiteAb(cfg: Konfig, portal: string, client: ImapFlow, db: SupabaseClient) {
  /* Ein Vermittler-Postfach wird anders gelesen: Modell statt Regelparser,
     hoechstens eine Mail je Takt (jede kostet Geld und Zeit) und ein
     Versuchszaehler gegen die Endlosschleife. */
  const vermittler = vermittlerFuer(portal);
  /* liegengeblieben zaehlt NUR transiente Fehler ('offen') — der Lauf
     antwortet damit HTTP 500, der naechste Takt versucht es erneut.
     Dauerhaft abgelehnte Mails bekommen einen eigenen Zaehler: sie sind
     im Admin sichtbar und sollen den Lauf nicht ewig rot halten. */
  let liegengeblieben = 0;
  let verarbeitet = 0;
  let abgelehnt = 0;
  const sperre = await client.getMailboxLock('INBOX');
  try {
    const mb = client.mailbox;
    const uidvalidity = mb && typeof mb === 'object' ? Number(mb.uidValidity) : NaN;
    /* Ohne UIDVALIDITY ist eine UID kein Schluessel (der Server darf UIDs
       nach einem Wechsel neu vergeben) — dann lieber gar nichts tun. */
    if (!Number.isFinite(uidvalidity) || uidvalidity <= 0) {
      throw new Error('UIDVALIDITY fehlt — Protokoll waere nicht eindeutig');
    }

    /* ALLE UIDs, nicht die ungelesenen: \Seen gehoert wieder den Menschen.
       search() liefert `false`, wenn die Mailbox die Suche ablehnt — das
       ist kein "nichts da", sondern ein Fehler, den wir sehen wollen.
       {uid:true} ist PFLICHT (Registry #41: search lieferte sonst
       SEQUENZ-Nummern und \Seen traf eine fremde UID). Leeres Postfach:
       Suche ueberspringen, manche Server moegen 1:* auf 0 Mails nicht. */
    /* Ein Portal-Postfach gehoert uns allein — dort ist jede Mail unsere.
       Das Vermittler-Postfach ist die HAUPTADRESSE der Firma: Kundenpost,
       BCC-Kopien unserer eigenen Mails, Team-Benachrichtigungen. Deshalb
       fragt der Server hier nur nach Post des Absenders (IMAP SEARCH FROM)
       — nicht nur, damit wir Fremdes nicht anfassen, sondern weil der
       Erstlauf sonst JEDE Mail des Postfachs als `altbestand` ins Protokoll
       schreiben wuerde (bei den Portalen sind das Dutzende, hier Zehn-
       tausende in EINEM Insert). */
    const alle = mb && typeof mb === 'object' && mb.exists === 0
      ? []
      : await client.search(
        vermittler ? { from: vermittler.domain } : { uid: '1:*' },
        { uid: true },
      );
    if (alle === false) throw new Error('IMAP-Suche fehlgeschlagen');

    const zeilen = await alleLogZeilen(db, portal, uidvalidity);
    if (zeilen.length === 0) {
      /* Erstkontakt dieses (postfach, uidvalidity)-Paars — Erstlauf oder
         UIDVALIDITY-Wechsel des Servers. Bestand registrieren, NICHT
         verarbeiten (Seed-Muster Bug #25): sonst bekaeme die halbe
         Historie erneut Mail 1. Der Sentinel (uid=0) markiert auch ein
         LEERES Postfach als initialisiert — ohne ihn wuerde die erste
         echte Mail im naechsten Takt als altbestand verschluckt. */
      if (cfg.trocken(portal)) {
        log(`${portal}: [trocken] Erstlauf — ${alle.length} Mail(s) wuerden als altbestand registriert`);
        return { liegengeblieben, verarbeitet, abgelehnt };
      }
      const bestand = alle.length
        ? alle.map((uid) => ({ postfach: portal, uidvalidity, uid, status: 'altbestand', grund: 'beim Erstlauf vorgefunden' }))
        : [{ postfach: portal, uidvalidity, uid: SEED_SENTINEL_UID, status: 'altbestand', grund: 'postfach leer initialisiert' }];
      /* ponytail: ein Insert reicht — beim Portal haelt das Postfach Dutzende
         Mails, beim Vermittler begrenzt der Absenderfilter oben die Menge auf
         seine eigene Post. Ab ~5k Zeilen braeuchte es Chunks. */
      const { error } = await db.from('portal_mail_log').insert(bestand);
      if (error) throw new Error(`Seed fehlgeschlagen: ${error.message}`);
      log(`${portal}: Erstlauf — ${alle.length} Mail(s) als altbestand registriert (uidvalidity ${uidvalidity})`);
      return { liegengeblieben, verarbeitet, abgelehnt };
    }

    const alleOffenen = zuVerarbeiten(alle, zeilen);
    /* Beim Vermittler kostet jede Mail einen Modellaufruf (5-15 s) plus das
       Onboarding im Eingang (bis 25 s). Zwei davon sprengen den Minutentakt,
       und `laeuft` laesst den naechsten Takt dann ganz ausfallen — auch fuer
       die bezahlten Portale. Eine pro Takt sind 60/h, weit ueber dem
       Aufkommen eines Vermittlers. */
    const offene = vermittler ? alleOffenen.slice(0, 1) : alleOffenen;
    if (!offene.length) return { liegengeblieben, verarbeitet, abgelehnt };
    log(`${portal}: ${offene.length} Mail(s) zu verarbeiten (${alleOffenen.length} offen, ${alle.length} im Postfach)`);

    for (const uid of offene) {
      /* Trockenlauf schreibt nichts ins Protokoll, also kaeme dieselbe Mail
         in JEDEM Takt wieder — beim Portal gratis, beim Vermittler ein
         bezahlter Modellaufruf pro Minute. */
      if (vermittler && cfg.trocken(portal) && trockenGesehen.has(`${portal}#${uid}`)) continue;
      /* Aufgeben statt ewig bezahlen: eine Mail, die fuenfmal transient
         gescheitert ist, wird abgelehnt — sichtbar im Admin und per
         Team-Mail, nicht still. */
      if (vermittler && versucheFuer(uid, zeilen) >= MAX_VERSUCHE) {
        const grund = `nach ${MAX_VERSUCHE} Versuchen aufgegeben`;
        log(`  – ${portal} #${uid} ${grund}`);
        await schreibeLog(db, portal, uidvalidity, uid, { status: 'abgelehnt', grund });
        abgelehnt++;
        continue;
      }
      const nachricht = await client.fetchOne(uid, { source: true }, { uid: true });
      if (nachricht === false) {
        // Mail zwischen Suche und Abruf verschwunden — kein Grund, den
        // ganzen Durchgang abzubrechen.
        log(`  – ${portal} #${uid} nicht mehr abrufbar`);
        continue;
      }
      if (!nachricht.source) { log(`  – ${portal} #${uid} ohne Inhalt`); continue; }
      const mail = await simpleParser(nachricht.source);
      /* Manche Portale schicken nur HTML. Tags rausnehmen reicht: der
         Parser sucht "Label: Wert" zeilenweise. */
      const html = typeof mail.html === 'string' ? mail.html.replace(/<[^>]+>/g, ' ') : '';
      const roh = mail.text || html;
      /* Festnetz + Mobil stehen NUR im HTML-Teil (Registry #56). */
      const telefone = typeof mail.html === 'string' ? telefoneAusHtml(mail.html) : [];

      /* CSV-Anhang = volle Datenquelle (siehe lib/portal-csv.ts). Eine
         unlesbare CSV bricht nichts — dann traegt der Mailtext allein. */
      let csv: { text: string; zusatz: Record<string, string> } | undefined;
      const csvAnhang = mail.attachments.find(
        (a) => a.contentType === 'text/csv' || (a.filename ?? '').toLowerCase().endsWith('.csv'),
      );
      if (csvAnhang) {
        try {
          const zeilen2 = parseCsv(csvAnhang.content.toString('utf8'));
          if (zeilen2.length >= 2 && csvZeileBrauchbar(zeilen2[0], zeilen2[1])) {
            csv = csvZuLeadZeile(zeilen2[0], zeilen2[1]);
            if (!csv.zusatz.RequestNumber) log(`  ⚠ ${portal} #${uid} CSV ohne RequestNumber — portal_lead_id fehlt`);
          } else if (zeilen2.length >= 2) {
            // Handverstuemmelte CSV (Zeile zu 1 Feld verklumpt) — lieber der
            // vollstaendige Mailtext als ein leerer Spaltensalat.
            log(`  ⚠ ${portal} #${uid} CSV-Zeile unbrauchbar (${zeilen2[1].length}/${zeilen2[0].length} Spalten) — nehme Mailtext`);
          }
        } catch (e: any) {
          log(`  ⚠ ${portal} #${uid} CSV-Anhang unlesbar (${e.message}) — nehme Mailtext`);
        }
      }

      let ausgang: Ausgang;
      try {
        const ergebnis = vermittler
          ? await verarbeiteVermittler(cfg, portal, vermittler.provisionProTag, mail, roh, db)
          : await verarbeite(cfg, portal, roh, csv, mail.date, telefone);
        if (!ergebnis.ok) {
          if (ergebnis.dauerhaft) {
            const leadId = await registriereFehlmail(db, portal, uid, mail, csv ? `${roh}\n\n--- CSV ---\n${csv.text}` : roh, 'abgelehnt', ergebnis.grund, ergebnis.email, ergebnis.name);
            ausgang = { status: 'abgelehnt', grund: ergebnis.grund, leadId };
            /* Beim Portal reicht der Admin-Eintrag: der Kunde hat seine
               Anfrage ohnehin an mehrere Anbieter gegeben. Ein Vermittler
               wartet auf eine Antwort IN SEINEM THREAD — der haeufigste
               stille Ausfall waere eine Anfrage, die das Modell faelschlich
               nicht als solche erkennt. Deshalb geht sie an das Team. */
            if (vermittler) await weiterleitenAnTeam(portal, uid, mail, roh, ergebnis.grund);
          } else {
            ausgang = { status: 'offen', grund: ergebnis.grund };
          }
        } else if (ergebnis.uebersprungen) {
          const leadId = await registriereFehlmail(db, portal, uid, mail, roh, 'uebersprungen', ergebnis.grund, ergebnis.email, ergebnis.name);
          ausgang = { status: 'uebersprungen', grund: ergebnis.grund, leadId };
        } else if (ergebnis.trocken) {
          log(`  · ${portal} #${uid} Trockenlauf, nichts angelegt`);
          // Nur im Prozessgedaechtnis: das Protokoll bleibt im Trockenlauf
          // unberuehrt, aber ein zweiter Modellaufruf fuer dieselbe Mail
          // waere reine Verbrennung.
          if (vermittler) trockenGesehen.add(`${portal}#${uid}`);
          verarbeitet++;
          continue;
        } else {
          ausgang = { status: 'erledigt', leadId: ergebnis.lead_id, grund: ergebnis.duplikat };
          log(`  ✓ ${portal} #${uid} Lead ${ergebnis.lead_id}` +
              (ergebnis.duplikat ? ` (${ergebnis.duplikat})` : '') +
              (ergebnis.angenommen?.length ? ` (angenommen: ${ergebnis.angenommen.join(', ')})` : ''));
        }
      } catch (e: any) {
        /* Absturz mitten im Durchgang: als 'offen' protokollieren, der
           naechste Takt versucht es erneut. */
        ausgang = { status: 'offen', grund: e.message };
      }

      /* Nur beim Vermittler mitzaehlen: bei den bezahlten Portalen wuerde
         ein gemeinsamer Deckel eine fuenfminuetige Stoerung von
         /api/portal-lead in einen dauerhaft abgelehnten Lead verwandeln. */
      if (vermittler && ausgang.status === 'offen') {
        ausgang.versuche = versucheFuer(uid, zeilen) + 1;
      }

      if (ausgang.status === 'offen') log(`  ✗ ${portal} #${uid} offen (Versuch ${ausgang.versuche ?? '?'}): ${ausgang.grund} — naechster Takt versucht erneut`);
      if (ausgang.status === 'abgelehnt') log(`  ✗ ${portal} #${uid} abgelehnt: ${ausgang.grund}${ausgang.leadId ? ` — im Admin als ${ausgang.leadId}` : ''}`);
      if (ausgang.status === 'uebersprungen') log(`  – ${portal} #${uid} uebersprungen: ${ausgang.grund}`);

      try {
        await schreibeLog(db, portal, uidvalidity, uid, ausgang);
      } catch (e: any) {
        /* Ein 'erledigt' ohne Log-Zeile heisst: naechster Takt schickt
           Mail 1 erneut — dieselbe Fehlerklasse wie frueher ein
           gescheitertes \Seen. Laut werden und den Lauf rot faerben. */
        log(`  ✗ ${portal} #${uid} PROTOKOLL-SCHREIBFEHLER nach '${ausgang.status}': ${e.message}`);
        liegengeblieben++;
        continue;
      }

      if (ausgang.status === 'offen') liegengeblieben++;
      else if (ausgang.status === 'abgelehnt') abgelehnt++;
      else verarbeitet++;
    }
  } finally {
    sperre.release();
  }
  return { liegengeblieben, verarbeitet, abgelehnt };
}

/* Ein Postfach einmal abarbeiten: verbinden, abgleichen, schliessen. */
async function holeAb(cfg: Konfig, { portal, user, pass }: Postfach, db: SupabaseClient) {
  if (!user || !pass) {
    log(`${portal}: kein Zugang gesetzt — uebersprungen`);
    return { liegengeblieben: 0, verarbeitet: 0, abgelehnt: 0 };
  }

  const client = new ImapFlow({
    host: cfg.imapHost, port: 993, secure: true,
    auth: { user, pass }, logger: false,
    /* Der Lauf dauert Sekunden — ImapFlow braucht die Verbindung nicht
       nebenbei im IDLE zu halten. */
    disableAutoIdle: true,
    /* Im langlebigen Server heilt sich eine haengende Session nicht durch
       Prozessende (wie beim frueheren Cron-Skript) — der Socket muss sich
       selbst aufgeben, sonst blockiert `laeuft` alle folgenden Takte. */
    socketTimeout: 30_000,
  });

  /* Ohne Listener macht ImapFlow aus einem Verbindungsabbruch ein
     uncaught 'error' — der Node-Prozess des Kostenrechners stirbt. Das
     Fenster dafuer war bisher ~1 s je Mail; mit Modellaufruf und
     Onboarding sind es bis zu 40 s. */
  client.on('error', (e: any) => log(`${portal}: IMAP-Fehler: ${e?.message ?? e}`));

  await client.connect();
  try {
    return await arbeiteAb(cfg, portal, client, db);
  } finally {
    try { await client.logout(); } catch { /* schon zu */ }
  }
}

/* ─── API-Portale (pflege-helfer24.de) ──────────────────────────────────
 *
 * Gleiche Strecke, anderer Eingang: statt Postfach ein GET auf die
 * Partner-API. Gedaechtnis ist portal_api_log (portal, extern_id) — die
 * Lead-UUID der API passt nicht in den bigint-Schluessel von
 * portal_mail_log. Statusse und Bedeutung wie dort.
 *
 * Erstlauf (kein Eintrag fuer das Portal): ALLE Leads holen und die von
 * VOR heute (Berlin) als altbestand registrieren — in EINEM Insert mit
 * dem Sentinel '__seed__', damit ein Absturz mittendrin beim naechsten
 * Takt nicht die halbe Historie als "neu" durchlaesst. Entscheidung
 * Michał 04.09.: "pomijaj wszystkie starsze leady niż z dzisiaj". Was
 * heute geliefert wurde, laeuft sofort normal durch.
 *
 * Danach: Fenster 7 Tage (?timestamp) — ein Lead, der waehrend eines
 * Ausfalls kam, holt sich der Lauf danach selbst. Aeltere kommen nur bei
 * einer Aenderung (Rechnung, Status) wieder und laufen dann durch die
 * Schutzregeln (60-Tage-Grenze) wie jeder andere.
 *
 * Ein GET-Fehler (401 Token rotiert, 429, Timeout) faerbt den Lauf NICHT
 * rot — nichts liegt, sichtbar wird er ueber den __api__-Sentinel. */
const API_SENTINEL = '__api__';
const SEED_SENTINEL = '__seed__';
const API_FENSTER_TAGE = 7;
/* Portale, deren letzter Abruf scheiterte — nur dann wird der Sentinel nach
 * einem guten Abruf wieder auf 'erledigt' gesetzt. Sonst schriebe jeder
 * Takt eine Zeile, und der Admin (Realtime auf portal_api_log) laedt
 * jede Minute die ganze Lead-Liste neu.
 *
 * Modulzustand ueberlebt keinen Neustart: faellt der Prozess ZWISCHEN
 * Fehler und Heilung (Deploy nach Token-Rotation, 04.09. live gesehen),
 * stuende der Sentinel fuer immer auf 'offen', obwohl das API laengst
 * antwortet. Deshalb prueft der ERSTE gute Abruf je Prozess den Sentinel
 * einmal in der Tabelle (ein SELECT je Prozessleben, nicht je Takt). */
const apiZuletztFehler = new Set<string>();
const sentinelGeprueft = new Set<string>();

type ApiAusgang = { status: 'erledigt' | 'uebersprungen' | 'abgelehnt' | 'offen'; grund?: string; leadId?: string };

async function schreibeApiLog(db: SupabaseClient, portal: string, externId: string, ausgang: ApiAusgang) {
  const { error } = await db.from('portal_api_log').upsert({
    portal,
    extern_id: externId,
    status: ausgang.status,
    grund: ausgang.grund ?? null,
    lead_id: ausgang.leadId ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'portal,extern_id' });
  if (error) throw new Error(`portal_api_log schreiben (${externId} → ${ausgang.status}): ${error.message}`);
}

async function apiExport(token: string, seit?: Date): Promise<Record<string, string>[]> {
  const url = seit ? `${HELFER24_EXPORT_URL}?timestamp=${Math.floor(seit.getTime() / 1000)}` : HELFER24_EXPORT_URL;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    /* Ohne Timeout hielte ein haengendes API `laeuft` fuer immer — und
       damit auch alle Mail-Portale (die IMAP-Seite hat socketTimeout). */
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return apiZeilen(await r.json());
}

/* Protokoll-Status der IDs in der Hand — in Bloecken, weil `in.(…)` in der
 * URL landet (PostgREST/Gateway kappen bei ~8 KB). */
async function apiLogStatus(db: SupabaseClient, portal: string, ids: string[]): Promise<Map<string, string>> {
  const status = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db
      .from('portal_api_log')
      .select('extern_id, status')
      .eq('portal', portal)
      .in('extern_id', ids.slice(i, i + 100));
    if (error) throw new Error(`portal_api_log lesen: ${error.message}`);
    for (const z of data ?? []) status.set(z.extern_id, z.status);
  }
  return status;
}

async function holeApiAb(cfg: Konfig, portal: string, db: SupabaseClient) {
  let liegengeblieben = 0;
  let verarbeitet = 0;
  let abgelehnt = 0;
  const leer = { liegengeblieben, verarbeitet, abgelehnt };

  // ponytail: ein API-Portal, ein Token-Name — bei einem zweiten API-Portal wird daraus eine Ableitung wie bei postfaecher().
  const token = process.env.PFLEGEHELFER24_API_TOKEN;
  if (!token) {
    log(`${portal}: kein Zugang gesetzt — uebersprungen`);
    return leer;
  }
  const trocken = cfg.trocken(portal);

  const { data: schonMal, error: leseErr } = await db
    .from('portal_api_log').select('extern_id').eq('portal', portal).limit(1);
  if (leseErr) throw new Error(`portal_api_log lesen: ${leseErr.message}`);
  const erstlauf = !schonMal || schonMal.length === 0;

  const zeilen = await apiExport(token, erstlauf ? undefined : new Date(Date.now() - API_FENSTER_TAGE * 86_400_000));
  // GET ok ⇒ Sentinel wieder gruen, falls er nach einem Ausfall auf 'offen' stand.
  if (!trocken) {
    let heilen = apiZuletztFehler.has(portal) || erstlauf;
    if (!heilen && !sentinelGeprueft.has(portal)) {
      const { data: s } = await db
        .from('portal_api_log').select('status').eq('portal', portal).eq('extern_id', API_SENTINEL).maybeSingle();
      heilen = s?.status === 'offen';
    }
    sentinelGeprueft.add(portal);
    if (heilen) {
      await schreibeApiLog(db, portal, API_SENTINEL, { status: 'erledigt', grund: `Abruf ok (${zeilen.length} Zeilen)` });
      apiZuletztFehler.delete(portal);
    }
  }

  const ergebnisse = zeilen
    .map((z) => helfer24ZuLeadBody(z))
    .filter((e): e is Helfer24Ergebnis => {
      if (e) return true;
      log(`  ⚠ ${portal}: Zeile ohne "Lead ID" — uebersprungen`);
      return false;
    });

  let kandidaten = ergebnisse;
  if (erstlauf) {
    const heute = heuteBerlin();
    const alt = ergebnisse.filter((e) => !e.lieferTag || e.lieferTag < heute);
    kandidaten = ergebnisse.filter((e) => e.lieferTag && e.lieferTag >= heute);
    if (trocken) {
      log(`${portal}: [trocken] Erstlauf — ${alt.length} Lead(s) wuerden als altbestand registriert, ${kandidaten.length} von heute wuerden laufen`);
    } else {
      const bestand = [
        { portal, extern_id: SEED_SENTINEL, status: 'altbestand', grund: 'Inbetriebnahme' },
        ...alt.map((e) => ({ portal, extern_id: e.extern_id, status: 'altbestand', grund: `vor Inbetriebnahme (Liefer Datum ${e.lieferTag ?? '?'})` })),
      ];
      // ponytail: ein Insert reicht — Hunderte Zeilen, keine Tausende.
      const { error } = await db.from('portal_api_log').insert(bestand);
      if (error) throw new Error(`Seed fehlgeschlagen: ${error.message}`);
      log(`${portal}: Erstlauf — ${alt.length} Lead(s) von vor heute als altbestand registriert, ${kandidaten.length} von heute laufen`);
    }
  }

  const status = trocken ? new Map<string, string>() : await apiLogStatus(db, portal, kandidaten.map((e) => e.extern_id));
  const offene = kandidaten.filter((e) => { const s = status.get(e.extern_id); return s === undefined || s === 'offen'; });
  if (!offene.length) return { liegengeblieben, verarbeitet, abgelehnt };
  log(`${portal}: ${offene.length} Lead(s) zu verarbeiten (${zeilen.length} in der Antwort)`);

  for (const e of offene) {
    const kennung = e.extern_id;
    const kontakt = { email: String(e.body.email ?? ''), name: String(e.body.name ?? '') || undefined };
    const pseudoMail = { subject: `Lead ${kennung}` } as Pick<ParsedMail, 'subject' | 'from'>;
    const auszug = JSON.stringify(e.body.zusatz ?? {});
    if (e.unbekannt.length) log(`  ⚠ nicht zugeordnet (${portal}): ${e.unbekannt.join(' | ')}`);

    let ausgang: ApiAusgang;
    try {
      if (e.uebersprungen) {
        if (trocken) { log(`  · ${portal} ${kennung} Trockenlauf — wuerde uebersprungen: ${e.uebersprungen}`); verarbeitet++; continue; }
        const leadId = await registriereFehlmail(db, portal, kennung, pseudoMail, auszug, 'uebersprungen', e.uebersprungen, kontakt.email || undefined, kontakt.name);
        ausgang = { status: 'uebersprungen', grund: e.uebersprungen, leadId };
      } else if (trocken) {
        log(`  [trocken] ${portal} ${kennung} ${kontakt.email} — ${Object.keys(e.body.angaben as object).length} Felder gelesen`);
        verarbeitet++;
        continue;
      } else {
        const ergebnis = await posteLead(cfg, e.body, kontakt.email, kontakt.name);
        if (!ergebnis.ok) {
          if (ergebnis.dauerhaft) {
            const leadId = await registriereFehlmail(db, portal, kennung, pseudoMail, auszug, 'abgelehnt', ergebnis.grund, ergebnis.email, ergebnis.name);
            ausgang = { status: 'abgelehnt', grund: ergebnis.grund, leadId };
          } else {
            ausgang = { status: 'offen', grund: ergebnis.grund };
          }
        } else if (ergebnis.uebersprungen) {
          const leadId = await registriereFehlmail(db, portal, kennung, pseudoMail, auszug, 'uebersprungen', ergebnis.grund, ergebnis.email, ergebnis.name);
          ausgang = { status: 'uebersprungen', grund: ergebnis.grund, leadId };
        } else {
          ausgang = { status: 'erledigt', leadId: ergebnis.lead_id, grund: ergebnis.duplikat };
          log(`  ✓ ${portal} ${kennung} Lead ${ergebnis.lead_id}` +
              (ergebnis.duplikat ? ` (${ergebnis.duplikat})` : '') +
              (ergebnis.angenommen?.length ? ` (angenommen: ${ergebnis.angenommen.join(', ')})` : ''));
        }
      }
    } catch (err: any) {
      ausgang = { status: 'offen', grund: err.message };
    }

    if (ausgang.status === 'offen') log(`  ✗ ${portal} ${kennung} offen: ${ausgang.grund} — naechster Takt versucht erneut`);
    if (ausgang.status === 'abgelehnt') log(`  ✗ ${portal} ${kennung} abgelehnt: ${ausgang.grund}${ausgang.leadId ? ` — im Admin als ${ausgang.leadId}` : ''}`);
    if (ausgang.status === 'uebersprungen') log(`  – ${portal} ${kennung} uebersprungen: ${ausgang.grund}`);

    try {
      await schreibeApiLog(db, portal, kennung, ausgang);
    } catch (err: any) {
      log(`  ✗ ${portal} ${kennung} PROTOKOLL-SCHREIBFEHLER nach '${ausgang.status}': ${err.message}`);
      liegengeblieben++;
      continue;
    }
    if (ausgang.status === 'offen') liegengeblieben++;
    else if (ausgang.status === 'abgelehnt') abgelehnt++;
    else verarbeitet++;
  }
  return { liegengeblieben, verarbeitet, abgelehnt };
}

/* Nur ein Durchgang zugleich: pg_cron feuert jede Minute, und ein
 * haengender IMAP-Server soll keine Laeufe stapeln. Ein uebersprungener
 * Takt ist egal — die Mails stehen nicht im Protokoll und laufen im
 * naechsten Takt. */
let laeuft = false;

export async function POST(request: NextRequest) {
  const erwarteterKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!erwarteterKey) {
    // Nicht konfiguriert ⇒ Feature aus. Lieber tot als offen.
    return NextResponse.json({ error: 'nicht konfiguriert' }, { status: 503 });
  }
  const geliefert = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(geliefert);
  const b = Buffer.from(erwarteterKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'nicht berechtigt' }, { status: 401 });
  }

  const cfg = konfig();
  if (!cfg.leadKey && !PORTALE.every((p) => cfg.trocken(p.domain))) {
    return NextResponse.json({ error: 'PORTAL_LEAD_KEY fehlt' }, { status: 503 });
  }

  let db: SupabaseClient;
  try {
    db = logDb();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  if (laeuft) {
    log('Takt uebersprungen — voriger Lauf arbeitet noch');
    return NextResponse.json({ ok: false, beschaeftigt: true }, { status: 429 });
  }
  laeuft = true;

  let liegengeblieben = 0;
  let verarbeitet = 0;
  let abgelehnt = 0;
  try {
    for (const postfach of postfaecher('portal')) {
      /* Ein kaputtes Postfach darf das andere nicht aufhalten: faellt
         Pflegehilfe aus, sollen Pflegebund-Leads trotzdem laufen. */
      try {
        const r = await holeAb(cfg, postfach, db);
        liegengeblieben += r.liegengeblieben;
        verarbeitet += r.verarbeitet;
        abgelehnt += r.abgelehnt;
      } catch (e: any) {
        liegengeblieben++;
        log(`${postfach.portal}: Postfach-Fehler: ${e.message}`);
      }
    }
    /* API-Portale NACH den Postfaechern: ein haengendes Fremd-API darf die
       Mail-Portale nicht verzoegern (der GET hat zusaetzlich ein Timeout,
       damit `laeuft` nie haengen bleibt). */
    for (const { domain } of PORTALE.filter((p) => p.abholung === 'api')) {
      try {
        const r = await holeApiAb(cfg, domain, db);
        liegengeblieben += r.liegengeblieben;
        verarbeitet += r.verarbeitet;
        abgelehnt += r.abgelehnt;
      } catch (e: any) {
        /* Bewusst NICHT liegengeblieben (Registry #36/#46): nichts "liegt",
           die Leads bleiben im 7-Tage-Fenster; ein Dauer-500 jede Minute
           sieht niemand. Sichtbar wird der Ausfall ueber den __api__-
           Sentinel in portal_api_log (Admin: "Offen"). */
        log(`${domain}: API-Fehler: ${e.message}`);
        apiZuletztFehler.add(domain);
        await schreibeApiLog(db, domain, API_SENTINEL, { status: 'offen', grund: `API-Abruf: ${e.message}` }).catch(() => {});
      }
    }
    /* Vermittler ZULETZT — nach den Postfaechern UND nach dem API-Portal.
       Ein Modellaufruf plus Onboarding dauert bis zu 40 s; stuende er
       vorne, verzoegerte er in jedem Takt die bezahlten, zeitkritischen
       Quellen (das Portal gibt dieselbe Anfrage an bis zu drei Anbieter). */
    for (const postfach of postfaecher('vermittler')) {
      try {
        const r = await holeAb(cfg, postfach, db);
        liegengeblieben += r.liegengeblieben;
        verarbeitet += r.verarbeitet;
        abgelehnt += r.abgelehnt;
      } catch (e: any) {
        liegengeblieben++;
        log(`${postfach.portal}: Postfach-Fehler: ${e.message}`);
      }
    }
  } finally {
    laeuft = false;
  }

  /* HTTP 500 auch dann, wenn nur EINE Mail offen blieb — sonst waeren das
     60 verschluckte Fehler pro Stunde, waehrend derselbe bezahlte Lead nie
     durchgeht. Offene Mails laufen im naechsten Takt erneut; dauerhaft
     abgelehnte NICHT — sie stehen im Admin und im Protokoll. */
  const zusammenfassung = { ok: liegengeblieben === 0, trocken: cfg.trockenWert, verarbeitet, abgelehnt, liegengeblieben };
  if (liegengeblieben) log('Lauf mit Fehlern:', JSON.stringify(zusammenfassung));
  return NextResponse.json(zusammenfassung, { status: liegengeblieben ? 500 : 200 });
}
