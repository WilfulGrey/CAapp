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
import { parsePflegehilfe } from '@/lib/portal-parser';
import { parseCsv, csvZuLeadZeile, csvZeileBrauchbar } from '@/lib/portal-csv';
import { PORTALE } from '@/lib/portal-lead';
import { zuVerarbeiten, SEED_SENTINEL_UID, type LogZeile } from '@/lib/portal-mail-log';
import { flagGiltFuer } from '@/lib/portal-schutz';
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
function postfaecher(): Postfach[] {
  return PORTALE.filter((p) => p.abholung === 'imap').map(({ domain }) => {
    const praefix = domain.split('.')[0].toUpperCase();
    return {
      portal: domain,
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
      .select('uid, status')
      .eq('postfach', postfach)
      .eq('uidvalidity', uidvalidity)
      .order('uid', { ascending: true })
      .range(von, von + 999);
    if (error) throw new Error(`portal_mail_log lesen: ${error.message}`);
    zeilen.push(...((data ?? []) as LogZeile[]));
    if (!data || data.length < 1000) return zeilen;
  }
}

type Ausgang = { status: 'erledigt' | 'uebersprungen' | 'abgelehnt' | 'offen'; grund?: string; leadId?: string };

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
    const { data: vorhanden } = await db
      .from('leads')
      .select('id')
      .eq('email', adresse)
      .order('created_at', { ascending: false })
      .limit(1);
    let leadId: string | undefined = vorhanden?.[0]?.id;
    if (!leadId) {
      const { data: neu, error } = await db
        .from('leads')
        .insert({
          email: adresse,
          status: 'manuell_pruefen',
          source: `portal:${portal}`,
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
     DATEN-Quelle; der Mailtext liefert weiterhin die Einwilligung
     (die steht nur dort) und dient als Fallback. */
  csv?: { text: string; zusatz: Record<string, string> },
): Promise<PostErgebnis> {
  const textErgebnis = parsePflegehilfe(roh);
  const ergebnis = csv ? parsePflegehilfe(csv.text) : textErgebnis;
  const { kontakt, angaben, unbekannt } = ergebnis;
  const einwilligung = textErgebnis.einwilligung;

  /* Ohne Einwilligungsnachweis legt der Endpunkt nichts an — das hier
     abzufangen spart einen Aufruf und macht den Grund im Log sichtbar.
     dauerhaft: die Mail wird davon nie besser — abgelehnt, kein Retry
     (frueher hielt genau so eine Mail den Lauf ewig auf 500, Registry #46). */
  if (!einwilligung?.text || !einwilligung?.zeitpunkt) {
    return { ok: false as const, dauerhaft: true, grund: 'kein Einwilligungsnachweis in der Mail', email: kontakt.email || undefined, name: kontakt.name || undefined };
  }
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

  return posteLead(cfg, {
      portal,
      name: kontakt.name,
      email: kontakt.email,
      telefon: kontakt.telefon,
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
    const alle = mb && typeof mb === 'object' && mb.exists === 0
      ? []
      : await client.search({ uid: '1:*' }, { uid: true });
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
      // ponytail: ein Insert reicht — die Postfaecher halten Dutzende Mails; ab ~5k braeuchte es Chunks.
      const { error } = await db.from('portal_mail_log').insert(bestand);
      if (error) throw new Error(`Seed fehlgeschlagen: ${error.message}`);
      log(`${portal}: Erstlauf — ${alle.length} Mail(s) als altbestand registriert (uidvalidity ${uidvalidity})`);
      return { liegengeblieben, verarbeitet, abgelehnt };
    }

    const offene = zuVerarbeiten(alle, zeilen);
    if (!offene.length) return { liegengeblieben, verarbeitet, abgelehnt };
    log(`${portal}: ${offene.length} Mail(s) zu verarbeiten (${alle.length} im Postfach)`);

    for (const uid of offene) {
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
        const ergebnis = await verarbeite(cfg, portal, roh, csv);
        if (!ergebnis.ok) {
          if (ergebnis.dauerhaft) {
            const leadId = await registriereFehlmail(db, portal, uid, mail, roh, 'abgelehnt', ergebnis.grund, ergebnis.email, ergebnis.name);
            ausgang = { status: 'abgelehnt', grund: ergebnis.grund, leadId };
          } else {
            ausgang = { status: 'offen', grund: ergebnis.grund };
          }
        } else if (ergebnis.uebersprungen) {
          const leadId = await registriereFehlmail(db, portal, uid, mail, roh, 'uebersprungen', ergebnis.grund, ergebnis.email, ergebnis.name);
          ausgang = { status: 'uebersprungen', grund: ergebnis.grund, leadId };
        } else if (ergebnis.trocken) {
          log(`  · ${portal} #${uid} Trockenlauf, nichts angelegt`);
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

      if (ausgang.status === 'offen') log(`  ✗ ${portal} #${uid} offen: ${ausgang.grund} — naechster Takt versucht erneut`);
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
 * jede Minute die ganze Lead-Liste neu. Modulzustand: nach einem Neustart
 * kostet es genau einen ueberfluessigen Schreibvorgang. */
const apiZuletztFehler = new Set<string>();

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
  if (!trocken && (apiZuletztFehler.has(portal) || erstlauf)) {
    await schreibeApiLog(db, portal, API_SENTINEL, { status: 'erledigt', grund: `Abruf ok (${zeilen.length} Zeilen)` });
    apiZuletztFehler.delete(portal);
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
    for (const postfach of postfaecher()) {
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
