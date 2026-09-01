/* ─── Abholer: Lead-Mails aus dem Portal-Postfach in die Strecke ──────────
 *
 * Jedes Portal, bei dem wir Leads einkaufen, bekommt eine EIGENE Adresse
 * (pflegehilfe@primundus.de, pflegebund@primundus.de). Die Adresse IST die
 * Quellenangabe: was dort ankommt, kommt von diesem Portal — wir muessen
 * den Absender nicht raten.
 *
 * Diese Postfaecher sind reine EINGAENGE. Von hier wird nie gesendet; der
 * Kundenversand laeuft unveraendert ueber kostenrechner@primundus.de
 * (SMTP-Konfiguration der Edge Function).
 *
 * TEMPO IST DER GANZE PUNKT. Das Portal gibt dieselbe Anfrage an bis zu
 * drei Anbieter gleichzeitig; wer zuerst antwortet, gewinnt. Deshalb
 * KEIN Abfrage-Takt, sondern IMAP IDLE: eine stehende Verbindung, ueber
 * die der Server die neue Mail von sich aus meldet. Zwischen Eingang und
 * unserer Kundenmail liegen damit Sekunden statt Minuten.
 *
 * (Ein Render-Cron kaeme dafuer nicht in Frage: er startet je Lauf einen
 * frischen Container samt npm install — allein das dauert laenger als der
 * Vorsprung, um den es hier geht.)
 *
 * Ablauf:
 *   1. Verbindung je Postfach aufbauen und offen halten
 *   2. Bei "neue Mail" (und einmal beim Start): UNGELESENE holen
 *   3. Text durch den Parser (lib/portal-parser)
 *   4. POST /api/portal-lead — dort entstehen Lead, Preis, Mail 1
 *   5. Mail als gelesen markieren, damit sie nicht zweimal laeuft
 *
 * Schritt 5 passiert NUR nach einer verstandenen Antwort des Endpunkts.
 * Faellt der Dienst vorher aus, bleibt die Mail ungelesen und der naechste
 * Start holt sie erneut — lieber ein zweiter Versuch als ein verlorener
 * Lead. Gegen die Dublette schuetzt findOrCreateLead ueber die E-Mail.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/* Derselbe Parser, den auch der Testlauf und die Unit-Tests benutzen —
 * der Abholer bringt KEINE zweite Lesart der Portal-Mail mit. */
import { parsePflegehilfe } from '../../lib/portal-parser';

/* Die Postfaecher. Schluessel ist die Portal-Domain, die der Endpunkt
 * erwartet (muss zu ERLAUBTE_PORTALE in api/portal-lead passen). Ein
 * Postfach ohne gesetztes Passwort wird uebersprungen, nicht erraten. */
interface Postfach { portal: string; user?: string; pass?: string }

const POSTFAECHER: Postfach[] = [
  { portal: 'pflegehilfe.org', user: process.env.PFLEGEHILFE_USER, pass: process.env.PFLEGEHILFE_PASS },
  { portal: 'pflegebund.eu',   user: process.env.PFLEGEBUND_USER,   pass: process.env.PFLEGEBUND_PASS },
];

const IMAP_HOST = process.env.PORTAL_IMAP_HOST || 'imap.ionos.de';
const BASIS_URL = process.env.PORTAL_LEAD_URL;
const LEAD_KEY = process.env.PORTAL_LEAD_KEY;

/* Trockenlauf: liest und parst, postet aber nicht. Fuer den ersten
 * Scharfschalt-Tag gedacht — man sieht, was der Parser aus echten Mails
 * macht, ohne dass jemand eine Kundenmail bekommt. */
const TROCKEN = process.env.PORTAL_TROCKENLAUF === '1';

/* Wiederanlauf nach Verbindungsverlust: erst schnell (der haeufigste Fall
 * ist ein kurzer Aussetzer), dann immer traeger, damit ein laenger totes
 * Postfach nicht im Sekundentakt gegen die Wand laeuft. */
const START_WARTEZEIT_MS = 5_000;
const MAX_WARTEZEIT_MS = 5 * 60_000;

function log(...t: unknown[]) { console.log(new Date().toISOString(), ...t); }

async function verarbeite(portal: string, roh: string) {
  const ergebnis = parsePflegehilfe(roh);
  const { kontakt, angaben, einwilligung, unbekannt } = ergebnis;

  /* Ohne Einwilligungsnachweis legt der Endpunkt nichts an — das hier
     abzufangen spart einen Aufruf und macht den Grund im Log sichtbar. */
  if (!einwilligung?.text || !einwilligung?.zeitpunkt) {
    return { ok: false, grund: 'kein Einwilligungsnachweis in der Mail' };
  }
  if (!kontakt.email) {
    return { ok: false, grund: 'keine Kundenadresse gefunden' };
  }

  /* Ein Vorlagenwechsel beim Portal faellt sonst nicht auf: der Parser
     laesst Unverstandenes weg, die Annahme greift, und der Kunde bekommt
     stillschweigend geratene Angaben. Deshalb laut ins Log. */
  if (unbekannt.length) {
    log(`  ⚠ nicht zugeordnet (${portal}): ${unbekannt.join(' | ')}`);
  }

  if (TROCKEN) {
    log(`  [trocken] ${kontakt.email} — ${Object.keys(angaben).length} Felder gelesen`);
    return { ok: true, trocken: true };
  }

  const antwort = await fetch(`${BASIS_URL}/api/portal-lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-portal-key': LEAD_KEY as string },
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
    }),
  });

  const daten = await antwort.json().catch(() => ({}));
  if (!antwort.ok) return { ok: false, grund: `HTTP ${antwort.status}: ${daten?.error ?? ''}` };
  /* Der Endpunkt antwortet auch beim bewussten Ueberspringen mit 200
     (zu alt, Status nicht ansprechbar). Das ist ERLEDIGT, nicht Fehler —
     die Mail darf als gelesen weg. */
  if (daten?.uebersprungen) return { ok: true, uebersprungen: true, grund: daten.grund };
  return { ok: true, lead_id: daten?.lead_id, angenommen: daten?.angenommene_felder ?? [] };
}

/* Die ungelesenen Mails EINES Postfachs abarbeiten. Wird beim Start
 * einmal gerufen (was ueber Nacht ankam) und danach bei jeder Meldung
 * des Servers. */
async function arbeiteAb(portal: string, client: ImapFlow) {
  /* Der Lock ist Pflicht, nicht Zierde: ImapFlow haelt die Verbindung von
     sich aus im IDLE, und waehrend IDLE laeuft, nimmt sie keine Befehle
     entgegen ("Connection not available"). getMailboxLock beendet das
     IDLE, fuehrt unsere Befehle aus und laesst es danach wieder anlaufen. */
  const sperre = await client.getMailboxLock('INBOX');
  try {
    await arbeiteMailsAb(portal, client);
  } finally {
    sperre.release();
  }
}

async function arbeiteMailsAb(portal: string, client: ImapFlow) {
  /* search() liefert `false`, wenn die Mailbox die Suche ablehnt — das
     ist kein "nichts da", sondern ein Fehler, den wir sehen wollen. */
  const ungelesen = await client.search({ seen: false });
  if (ungelesen === false) throw new Error('IMAP-Suche fehlgeschlagen');
  if (!ungelesen.length) return;
  log(`${portal}: ${ungelesen.length} neue Mail(s)`);

  for (const uid of ungelesen) {
    const nachricht = await client.fetchOne(uid, { source: true });
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

    let ergebnis;
    try {
      ergebnis = await verarbeite(portal, roh);
    } catch (e: any) {
      /* Absturz mitten im Durchgang: NICHT als gelesen markieren. Der
         naechste Anlauf versucht es erneut. */
      log(`  ✗ ${portal} #${uid} Fehler: ${e.message} — bleibt ungelesen`);
      continue;
    }

    if (!ergebnis.ok) {
      log(`  ✗ ${portal} #${uid} nicht verarbeitet: ${ergebnis.grund} — bleibt ungelesen`);
      continue;
    }

    if (ergebnis.uebersprungen) log(`  – ${portal} #${uid} uebersprungen: ${ergebnis.grund}`);
    else if (ergebnis.trocken)  log(`  · ${portal} #${uid} Trockenlauf, nichts angelegt`);
    else log(`  ✓ ${portal} #${uid} Lead ${ergebnis.lead_id}` +
             (ergebnis.angenommen?.length ? ` (angenommen: ${ergebnis.angenommen.join(', ')})` : ''));

    // Erst jetzt — die Mail ist verarbeitet und darf nicht wiederkommen.
    if (!TROCKEN) await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
  }
}

/* Ein Postfach dauerhaft beobachten.
 *
 * Die Verbindung kann jederzeit wegbrechen (Serverneustart, Timeout,
 * Netz). Das ist der Normalfall, kein Ausnahmefall: wir bauen sie mit
 * wachsendem Abstand neu auf, statt den Dienst sterben zu lassen — ein
 * totes Postfach heisst verlorene, bezahlte Leads. */
async function beobachte({ portal, user, pass }: Postfach) {
  if (!user || !pass) { log(`${portal}: kein Zugang gesetzt — nicht beobachtet`); return; }

  let wartezeit = START_WARTEZEIT_MS;

  for (;;) {
    const client = new ImapFlow({
      host: IMAP_HOST, port: 993, secure: true,
      auth: { user, pass }, logger: false,
      /* Standard sind 15 s, bis ImapFlow nach einem Befehl wieder ins IDLE
         geht — in diesem Fenster meldet der Server nichts und eine Mail
         bliebe bis zu 15 s liegen. Hier zaehlt jede Sekunde: das Portal
         gibt dieselbe Anfrage an drei Anbieter. */
      autoIdleDelay: 1_000,
    });

    try {
      await client.connect();
      await client.mailboxOpen('INBOX');   // SELECTED — Voraussetzung fuers Auto-IDLE
      log(`${portal}: verbunden, wartet auf neue Mails`);
      wartezeit = START_WARTEZEIT_MS;   // Verbindung stand — Abstand zuruecksetzen

      /* Ein Durchgang laeuft nie zweimal gleichzeitig: trifft waehrend
         der Verarbeitung eine weitere Mail ein, wird sie an den
         laufenden Durchgang angehaengt statt parallel gestartet. */
      let laeuft: Promise<void> = Promise.resolve();
      const anstossen = () => {
        laeuft = laeuft
          .then(() => arbeiteAb(portal, client))
          .catch((e) => log(`${portal}: Durchgang fehlgeschlagen: ${e.message}`));
        return laeuft;
      };

      // Was ueber Nacht ankam, bevor wir auf Meldungen warten.
      await anstossen();

      client.on('exists', anstossen);

      /* Kein eigenes client.idle(): ImapFlow haelt die Verbindung selbst
         im IDLE und meldet neue Post als "exists". Wir warten hier nur
         darauf, dass die Verbindung endet — dann greift der Wiederanlauf. */
      await new Promise<never>((_, ende) => {
        client.on('close', () => ende(new Error('Verbindung geschlossen')));
        client.on('error', (e: any) => ende(e));
      });
    } catch (e: any) {
      log(`${portal}: Verbindung verloren (${e.message}) — neuer Versuch in ${Math.round(wartezeit / 1000)}s`);
    } finally {
      try { await client.logout(); } catch { /* schon zu */ }
    }

    await new Promise((r) => setTimeout(r, wartezeit));
    wartezeit = Math.min(wartezeit * 2, MAX_WARTEZEIT_MS);
  }
}

/* In eine Funktion gefasst statt Top-Level-await: das Projekt baut nach
   CommonJS, dort gibt es kein await auf Modulebene. */
async function main() {
  if (!BASIS_URL || (!LEAD_KEY && !TROCKEN)) {
    console.error('PORTAL_LEAD_URL und PORTAL_LEAD_KEY muessen gesetzt sein.');
    process.exit(1);
  }

  log(`Abholer startet${TROCKEN ? ' (TROCKENLAUF)' : ''} — Ziel ${BASIS_URL}`);

  /* Jedes Postfach bekommt seine eigene Verbindung und seine eigene
     Wiederanlauf-Schleife: faellt Pflegehilfe aus, laufen Pflegebund-Leads
     weiter. Kein Promise.all — keine der Schleifen endet je regulaer. */
  for (const postfach of POSTFAECHER) {
    beobachte(postfach).catch((e) =>
      log(`${postfach.portal}: endgueltig aufgegeben: ${e.message}`),
    );
  }

  /* Sauber schliessen, wenn Render den Dienst stoppt (Deploy, Neustart).
     Was gerade in Arbeit ist, bleibt ungelesen und laeuft nach dem
     Neustart erneut. */
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => { log(`${signal} — Abholer beendet sich`); process.exit(0); });
  }
}

main().catch((e) => { log('Abholer abgebrochen:', e.message); process.exit(1); });
