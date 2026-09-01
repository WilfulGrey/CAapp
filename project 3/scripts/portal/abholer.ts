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
 * Laeuft als Cron-Job jede Minute. Das Portal gibt dieselbe Anfrage an bis
 * zu drei Anbieter, wer zuerst antwortet gewinnt — eine Minute Vorlauf
 * faellt dabei nicht ins Gewicht, und ein Skript, das startet, arbeitet und
 * endet, hat keine Verbindung, die wegbrechen kann.
 *
 * Ablauf je Lauf:
 *   1. IMAP oeffnen, UNGELESENE Mails holen
 *   2. Text durch den Parser (lib/portal-parser)
 *   3. POST /api/portal-lead — dort entstehen Lead, Preis, Mail 1
 *   4. Mail als gelesen markieren, damit sie nicht zweimal laeuft
 *
 * Schritt 4 passiert NUR nach einer verstandenen Antwort des Endpunkts.
 * Bricht der Lauf vorher ab, bleibt die Mail ungelesen und der naechste
 * Lauf holt sie erneut — lieber ein zweiter Versuch als ein verlorener
 * Lead. Gegen die Dublette schuetzt findOrCreateLead ueber die E-Mail.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/* Derselbe Parser, den auch der Testlauf und die Unit-Tests benutzen —
 * der Abholer bringt KEINE zweite Lesart der Portal-Mail mit. */
import { parsePflegehilfe } from '../../lib/portal-parser';
import { PORTALE } from '../../lib/portal-lead';

interface Postfach { portal: string; user?: string; pass?: string }

/* Die Postfaecher — abgeleitet aus der zentralen Portal-Liste, damit ein
 * neues Portal nicht an einer Stelle vergessen wird. Der Zugang kommt aus
 * der Env, benannt nach dem Portal: pflegehilfe.org → PFLEGEHILFE_USER /
 * PFLEGEHILFE_PASS. Ein Postfach ohne gesetztes Passwort wird
 * uebersprungen, nicht erraten. */
const POSTFAECHER: Postfach[] = PORTALE.map(({ domain }) => {
  const praefix = domain.split('.')[0].toUpperCase();
  return {
    portal: domain,
    user: process.env[`${praefix}_USER`],
    pass: process.env[`${praefix}_PASS`],
  };
});

const IMAP_HOST = process.env.PORTAL_IMAP_HOST || 'imap.ionos.de';
const BASIS_URL = process.env.PORTAL_LEAD_URL;
const LEAD_KEY = process.env.PORTAL_LEAD_KEY;

/* Trockenlauf: liest und parst, postet aber nicht. Fuer den ersten
 * Scharfschalt-Tag gedacht — man sieht, was der Parser aus echten Mails
 * macht, ohne dass jemand eine Kundenmail bekommt. */
const TROCKEN = process.env.PORTAL_TROCKENLAUF === '1';


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
/* Die ungelesenen Mails eines Postfachs abarbeiten.
 *
 * getMailboxLock statt mailboxOpen: es waehlt die INBOX und haelt sie fuer
 * die Dauer unserer Befehle — die von ImapFlow empfohlene Form fuer eine
 * Folge zusammengehoeriger Befehle. */
async function arbeiteAb(portal: string, client: ImapFlow): Promise<number> {
  /* Zaehlt die Mails, die NICHT verarbeitet werden konnten. Der Lauf endet
     damit mit Exit-Code 1 — sonst zeigt Render lauter gruene Laeufe, waehrend
     jede Minute derselbe bezahlte Lead liegen bleibt. */
  let liegengeblieben = 0;
  const sperre = await client.getMailboxLock('INBOX');
  try {
    /* search() liefert `false`, wenn die Mailbox die Suche ablehnt — das
       ist kein "nichts da", sondern ein Fehler, den wir sehen wollen. */
    const ungelesen = await client.search({ seen: false });
    if (ungelesen === false) throw new Error('IMAP-Suche fehlgeschlagen');
    if (!ungelesen.length) return 0;
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

      // Erst jetzt — die Mail ist verarbeitet und darf nicht wiederkommen.
      if (!TROCKEN) await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    }
  } finally {
    sperre.release();
  }
  return liegengeblieben;
}

/* Ein Postfach einmal leeren: verbinden, abarbeiten, schliessen. */
async function holeAb({ portal, user, pass }: Postfach): Promise<number> {
  if (!user || !pass) { log(`${portal}: kein Zugang gesetzt — uebersprungen`); return 0; }

  const client = new ImapFlow({
    host: IMAP_HOST, port: 993, secure: true,
    auth: { user, pass }, logger: false,
    /* Der Lauf dauert Sekunden und endet dann — ImapFlow braucht die
       Verbindung nicht nebenbei im IDLE zu halten. */
    disableAutoIdle: true,
  });

  await client.connect();
  try {
    return await arbeiteAb(portal, client);
  } finally {
    try { await client.logout(); } catch { /* schon zu */ }
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

  let fehler = 0;
  for (const postfach of POSTFAECHER) {
    /* Ein kaputtes Postfach darf das andere nicht aufhalten: faellt
       Pflegehilfe aus, sollen Pflegebund-Leads trotzdem laufen. */
    try { fehler += await holeAb(postfach); }
    catch (e: any) { fehler++; log(`${postfach.portal}: Postfach-Fehler: ${e.message}`); }
  }

  log('Abholer fertig');
  /* Exit-Code, damit Render einen kaputten Lauf als fehlgeschlagen zeigt
     statt ihn still zu schlucken — auch dann, wenn nur EINE Mail liegen
     blieb: bei einem Takt von einer Minute waeren das sonst 60 verschluckte
     Fehler pro Stunde, waehrend derselbe bezahlte Lead nie durchgeht.
     Ungelesene Mails laufen im naechsten Lauf erneut. */
  process.exit(fehler ? 1 : 0);
}

main().catch((e) => { log('Abholer abgebrochen:', e.message); process.exit(1); });
