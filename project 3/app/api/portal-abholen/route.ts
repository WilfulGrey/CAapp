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
 *   1. IMAP oeffnen, UNGELESENE Mails holen
 *   2. Text durch den Parser (lib/portal-parser)
 *   3. POST /api/portal-lead (Loopback) — dort entstehen Lead, Preis, Mail 1
 *   4. Mail als gelesen markieren, damit sie nicht zweimal laeuft
 *
 * Schritt 4 passiert NUR nach einer verstandenen Antwort des Endpunkts.
 * Bricht der Lauf vorher ab, bleibt die Mail ungelesen und der naechste
 * Lauf holt sie erneut — lieber ein zweiter Versuch als ein verlorener
 * Lead. Gegen die Dublette schuetzt findOrCreateLead ueber die E-Mail.
 *
 * Beobachtbarkeit: pg_cron-"succeeded" heisst nur "HTTP gefeuert"
 * (Registry #36) und net._http_response rotiert in Stunden. Die Wahrheit
 * steht in den Render-Logs des Kostenrechners ([portal-abholer]-Zeilen);
 * liegengebliebene Mails machen den Lauf zu HTTP 500 und bleiben zudem
 * ungelesen im Postfach sichtbar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/* Derselbe Parser, den auch der Testlauf und die Unit-Tests benutzen —
 * der Abholer bringt KEINE zweite Lesart der Portal-Mail mit. */
import { parsePflegehilfe } from '@/lib/portal-parser';
import { parseCsv, csvZuLeadZeile } from '@/lib/portal-csv';
import { PORTALE } from '@/lib/portal-lead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Postfach { portal: string; user?: string; pass?: string }

interface Konfig {
  imapHost: string;
  basisUrl: string;
  leadKey?: string;
  trocken: boolean;
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
    /* Trockenlauf: liest und parst, postet aber nicht. Fuer den ersten
       Scharfschalt-Tag — man sieht, was der Parser aus echten Mails macht,
       ohne dass jemand eine Kundenmail bekommt. */
    trocken: process.env.PORTAL_TROCKENLAUF === '1',
  };
}

/* Die Postfaecher — abgeleitet aus der zentralen Portal-Liste, damit ein
 * neues Portal nicht an einer Stelle vergessen wird. Der Zugang kommt aus
 * der Env, benannt nach dem Portal: pflegehilfe.org → PFLEGEHILFE_USER /
 * PFLEGEHILFE_PASS. Ein Postfach ohne gesetztes Passwort wird
 * uebersprungen, nicht erraten. */
function postfaecher(): Postfach[] {
  return PORTALE.map(({ domain }) => {
    const praefix = domain.split('.')[0].toUpperCase();
    return {
      portal: domain,
      user: process.env[`${praefix}_USER`],
      pass: process.env[`${praefix}_PASS`],
    };
  });
}

function log(...t: unknown[]) { console.log('[portal-abholer]', ...t); }

async function verarbeite(
  cfg: Konfig,
  portal: string,
  roh: string,
  /* CSV-Anhang, falls vorhanden: synthetischer Text ist dann die
     DATEN-Quelle; der Mailtext liefert weiterhin die Einwilligung
     (die steht nur dort) und dient als Fallback. */
  csv?: { text: string; zusatz: Record<string, string> },
) {
  const textErgebnis = parsePflegehilfe(roh);
  const ergebnis = csv ? parsePflegehilfe(csv.text) : textErgebnis;
  const { kontakt, angaben, unbekannt } = ergebnis;
  const einwilligung = textErgebnis.einwilligung;

  /* Ohne Einwilligungsnachweis legt der Endpunkt nichts an — das hier
     abzufangen spart einen Aufruf und macht den Grund im Log sichtbar. */
  if (!einwilligung?.text || !einwilligung?.zeitpunkt) {
    return { ok: false as const, grund: 'kein Einwilligungsnachweis in der Mail' };
  }
  if (!kontakt.email) {
    return { ok: false as const, grund: 'keine Kundenadresse gefunden' };
  }

  /* Ein Vorlagenwechsel beim Portal faellt sonst nicht auf: der Parser
     laesst Unverstandenes weg, die Annahme greift, und der Kunde bekommt
     stillschweigend geratene Angaben. Deshalb laut ins Log. */
  if (unbekannt.length) {
    log(`  ⚠ nicht zugeordnet (${portal}): ${unbekannt.join(' | ')}`);
  }

  if (cfg.trocken) {
    log(`  [trocken] ${kontakt.email} — ${Object.keys(angaben).length} Felder gelesen`);
    return { ok: true as const, trocken: true };
  }

  const antwort = await fetch(`${cfg.basisUrl}/api/portal-lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-portal-key': cfg.leadKey as string },
    body: JSON.stringify({
      portal,
      name: kontakt.name,
      email: kontakt.email,
      telefon: kontakt.telefon,
      angaben,
      care_start_timing: ergebnis.care_start_timing,
      portal_lead_id: ergebnis.portal_lead_id,
      einwilligung,
      /* Das Alter pruefen die Schutzregeln im Endpunkt. Der Zeitpunkt der
         Einwilligung ist der belastbarste Datumswert der Mail. */
      erstellt_am: einwilligung.zeitpunkt,
      /* Spalten ohne Zuhause bei uns (Krankheiten, Gewicht, Beziehung …)
         — landen append-only im Ereignislog, nichts geht verloren. */
      zusatz: csv?.zusatz,
    }),
  });

  const daten = await antwort.json().catch(() => ({}));
  if (!antwort.ok) return { ok: false as const, grund: `HTTP ${antwort.status}: ${daten?.error ?? ''}` };
  /* Der Endpunkt antwortet auch beim bewussten Ueberspringen mit 200
     (zu alt, Status nicht ansprechbar). Das ist ERLEDIGT, nicht Fehler —
     die Mail darf als gelesen weg. */
  if (daten?.uebersprungen) return { ok: true as const, uebersprungen: true, grund: daten.grund };
  return { ok: true as const, lead_id: daten?.lead_id, angenommen: daten?.angenommene_felder ?? [] };
}

/* Die ungelesenen Mails eines Postfachs abarbeiten.
 *
 * getMailboxLock statt mailboxOpen: es waehlt die INBOX und haelt sie fuer
 * die Dauer unserer Befehle — die von ImapFlow empfohlene Form fuer eine
 * Folge zusammengehoeriger Befehle. */
async function arbeiteAb(cfg: Konfig, portal: string, client: ImapFlow) {
  /* Zaehlt die Mails, die NICHT verarbeitet werden konnten. Der Lauf
     antwortet damit HTTP 500 — sonst saehe alles gruen aus, waehrend jede
     Minute derselbe bezahlte Lead liegen bleibt. */
  let liegengeblieben = 0;
  let verarbeitet = 0;
  const sperre = await client.getMailboxLock('INBOX');
  try {
    /* search() liefert `false`, wenn die Mailbox die Suche ablehnt — das
       ist kein "nichts da", sondern ein Fehler, den wir sehen wollen.
       {uid:true} ist PFLICHT: ohne sie liefert search SEQUENZ-Nummern,
       waehrend messageFlagsAdd unten mit {uid:true} echte UIDs erwartet —
       das \\Seen traf dann eine nicht existierende UID (no-op) und
       DIESELBE Mail lief jede Minute erneut (Zauner-Test 01.09.: seq #1,
       echte uid 14; beim Test auf frischer Mailbox fiel es nicht auf,
       weil dort uid == seq). */
    const ungelesen = await client.search({ seen: false }, { uid: true });
    if (ungelesen === false) throw new Error('IMAP-Suche fehlgeschlagen');
    if (!ungelesen.length) return { liegengeblieben, verarbeitet };
    log(`${portal}: ${ungelesen.length} neue Mail(s)`);

    for (const uid of ungelesen) {
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
          const zeilen = parseCsv(csvAnhang.content.toString('utf8'));
          if (zeilen.length >= 2) csv = csvZuLeadZeile(zeilen[0], zeilen[1]);
        } catch (e: any) {
          log(`  ⚠ ${portal} #${uid} CSV-Anhang unlesbar (${e.message}) — nehme Mailtext`);
        }
      }

      let ergebnis;
      try {
        ergebnis = await verarbeite(cfg, portal, roh, csv);
      } catch (e: any) {
        /* Absturz mitten im Durchgang: NICHT als gelesen markieren. Der
           naechste Anlauf versucht es erneut. */
        log(`  ✗ ${portal} #${uid} Fehler: ${e.message} — bleibt ungelesen`);
        liegengeblieben++;
        continue;
      }

      if (!ergebnis.ok) {
        log(`  ✗ ${portal} #${uid} nicht verarbeitet: ${ergebnis.grund} — bleibt ungelesen`);
        liegengeblieben++;
        continue;
      }

      if (ergebnis.uebersprungen) log(`  – ${portal} #${uid} uebersprungen: ${ergebnis.grund}`);
      else if (ergebnis.trocken)  log(`  · ${portal} #${uid} Trockenlauf, nichts angelegt`);
      else log(`  ✓ ${portal} #${uid} Lead ${ergebnis.lead_id}` +
               (ergebnis.angenommen?.length ? ` (angenommen: ${ergebnis.angenommen.join(', ')})` : ''));
      verarbeitet++;

      // Erst jetzt — die Mail ist verarbeitet und darf nicht wiederkommen.
      if (!cfg.trocken) await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    }
  } finally {
    sperre.release();
  }
  return { liegengeblieben, verarbeitet };
}

/* Ein Postfach einmal leeren: verbinden, abarbeiten, schliessen. */
async function holeAb(cfg: Konfig, { portal, user, pass }: Postfach) {
  if (!user || !pass) {
    log(`${portal}: kein Zugang gesetzt — uebersprungen`);
    return { liegengeblieben: 0, verarbeitet: 0 };
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
    return await arbeiteAb(cfg, portal, client);
  } finally {
    try { await client.logout(); } catch { /* schon zu */ }
  }
}

/* Nur ein Durchgang zugleich: pg_cron feuert jede Minute, und ein
 * haengender IMAP-Server soll keine Laeufe stapeln. Ein uebersprungener
 * Takt ist egal — die Mails bleiben ungelesen liegen. */
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
  if (!cfg.leadKey && !cfg.trocken) {
    return NextResponse.json({ error: 'PORTAL_LEAD_KEY fehlt' }, { status: 503 });
  }

  if (laeuft) {
    log('Takt uebersprungen — voriger Lauf arbeitet noch');
    return NextResponse.json({ ok: false, beschaeftigt: true }, { status: 429 });
  }
  laeuft = true;

  let liegengeblieben = 0;
  let verarbeitet = 0;
  try {
    for (const postfach of postfaecher()) {
      /* Ein kaputtes Postfach darf das andere nicht aufhalten: faellt
         Pflegehilfe aus, sollen Pflegebund-Leads trotzdem laufen. */
      try {
        const r = await holeAb(cfg, postfach);
        liegengeblieben += r.liegengeblieben;
        verarbeitet += r.verarbeitet;
      } catch (e: any) {
        liegengeblieben++;
        log(`${postfach.portal}: Postfach-Fehler: ${e.message}`);
      }
    }
  } finally {
    laeuft = false;
  }

  /* HTTP 500 auch dann, wenn nur EINE Mail liegen blieb — sonst waeren das
     60 verschluckte Fehler pro Stunde, waehrend derselbe bezahlte Lead nie
     durchgeht. Ungelesene Mails laufen im naechsten Takt erneut. */
  const zusammenfassung = { ok: liegengeblieben === 0, trocken: cfg.trocken, verarbeitet, liegengeblieben };
  if (liegengeblieben) log('Lauf mit Fehlern:', JSON.stringify(zusammenfassung));
  return NextResponse.json(zusammenfassung, { status: liegengeblieben ? 500 : 200 });
}
