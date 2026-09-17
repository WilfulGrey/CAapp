// Kundenbewertungen für primundus.de/erfahrungen — pure Logik.
//
// Die Seite primundus.de/erfahrungen (anderes Repo) liest und schreibt über
// /api/bewertungen dieses Kostenrechners. Ablauf:
//   1. POST /api/bewertungen            → Zeile „unbestaetigt“ + Bestätigungsmail
//   2. GET  /api/bewertungen/bestaetigen → „bestaetigt“ + Team-Mail mit Freigabe-Links
//   3. GET  /api/bewertungen/moderation  → Seite mit EINEM Knopf (GET ändert nichts,
//      Mail-Scanner öffnen Links von selbst); POST derselben URL wendet an
//   4. GET  /api/bewertungen            → nur „veroeffentlicht“, öffentlich, gecacht
//
// Hier steht nur pure Logik (keine Next-/Supabase-Importe), damit root-vitest
// sie testen kann: src/__tests__/bewertungen.test.ts. Die Routen bleiben dünn.
//
// Umgebungsvariablen (Render, Kostenrechner — jeweils staging UND prod setzen):
//   BEWERTUNG_TEAM_AN     Empfänger der Freigabe-Mail, kommagetrennt.
//                         Standard: info@primundus.de (Martin, 17.09.2026)
//   BEWERTUNG_API_BASIS   Basis-URL für Links in den Mails (Bestätigen, Moderation).
//                         Standard: NEXT_PUBLIC_SITE_URL, sonst
//                         https://kostenrechner.primundus.de. (Der Umweg über
//                         NEXT_PUBLIC_SITE_URL verhindert, dass Staging-Mails
//                         auf Prod zeigen, wo der Token nicht existiert.)
//   BEWERTUNG_CORS_EXTRA  Zusätzlich erlaubte Origins, kommagetrennt,
//                         z. B. http://localhost:3000. primundus.de und
//                         www.primundus.de sind immer erlaubt.
//   BEWERTUNG_HASH_SALT   Salz für ip_hash = sha256(Salz + IP). Fehlt es, gilt
//                         ein fester Ersatzwert aus dem Code: das Limit
//                         funktioniert, aber der Hash ist für jeden mit
//                         Codezugang per Wörterbuch auf die IP zurückrechenbar.
//                         In Prod setzen.
//   TURNSTILE_SECRET_KEY  Cloudflare Turnstile. Gesetzt ⇒ turnstile_token ist
//                         Pflicht und wird geprüft. Fehlt ⇒ keine Prüfung,
//                         turnstile_ok bleibt null.

import { createHash, randomBytes } from 'crypto';
import { anzeigeDatum, berlinDatum, istObjekt, normText, normZeile, type BewertungStatus, type Herkunft, type ModerationsAktion } from './bewertungen-basis';

// Gemeinsame, Node-freie Teile (auch für die Admin-Seite im Browser).
export {
  AKTIONEN,
  aktionAus,
  berlinDatum,
  berlinDatumZeit,
  berlinTagText,
  HERKUNFT,
  istObjekt,
  moderationsPlan,
  normText,
  normZeile,
  STATUS,
} from './bewertungen-basis';
export type { BewertungStatus, Herkunft, ModerationsAktion, ModerationsPlan } from './bewertungen-basis';

// ─── Grenzen und feste Werte ─────────────────────────────────────────────

export const ERFAHRUNGEN_URL = 'https://primundus.de/erfahrungen';
export const STANDARD_API_BASIS = 'https://kostenrechner.primundus.de';
export const STANDARD_TEAM_AN = 'info@primundus.de';
export const STANDARD_ORIGINS = ['https://primundus.de', 'https://www.primundus.de'];
export const QUELLE = 'primundus.de/erfahrungen';

const SEKUNDE = 1000;
const STUNDE = 3600 * SEKUNDE;
const TAG = 24 * STUNDE;

/** Schneller ausgefüllt ⇒ Bot. */
export const MIN_AUSFUELLZEIT_MS = 4 * SEKUNDE;
/** Formular länger offen ⇒ verwerfen (alte Seite, Replay). */
export const MAX_FORMULAR_ALTER_MS = TAG;
/** So lange gilt der Bestätigungslink. */
export const LINK_GUELTIG_MS = 7 * TAG;
/** Mehr Bewertungen je IP-Hash in 24 h werden abgewiesen (die vierte). */
export const IP_LIMIT_24H = 3;
export const IP_FENSTER_MS = TAG;
/** Eine aktive Bewertung je E-Mail-Adresse in diesem Zeitraum. */
export const EMAIL_SPERRE_MS = 30 * TAG;
export const MAX_LISTE = 200;

export const TEXT_MIN = 20;
export const TEXT_MAX = 2000;
export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const ORT_MAX = 60;
export const EMAIL_MAX = 254;

/** Diese Status zählen für die E-Mail-Sperre (abgelehnt nicht). */
export const AKTIVE_STATUS: readonly BewertungStatus[] = ['unbestaetigt', 'bestaetigt', 'veroeffentlicht'];

/** Fester Ersatz, wenn BEWERTUNG_HASH_SALT fehlt. Siehe Kopfkommentar. */
const ERSATZ_SALZ = 'primundus-bewertungen-ohne-salt-v1';

export const FEHLER = {
  anfrage: 'Ungültige Anfrage.',
  sterne: 'Bitte wählen Sie 1 bis 5 Sterne.',
  textKurz: 'Bitte schreiben Sie mindestens 20 Zeichen.',
  textLang: 'Bitte kürzen Sie Ihre Bewertung auf höchstens 2000 Zeichen.',
  textLink: 'Bitte keine Links in der Bewertung.',
  name: 'Bitte geben Sie Ihren Namen an (2 bis 60 Zeichen).',
  nameLink: 'Bitte keine Links im Namen.',
  ort: 'Bitte geben Sie den Ort mit höchstens 60 Zeichen an.',
  ortLink: 'Bitte keine Links im Ort.',
  email: 'Bitte geben Sie eine gültige E-Mail-Adresse an.',
  einwilligung: 'Bitte bestätigen Sie die Einwilligung.',
  turnstile: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte laden Sie die Seite neu.',
  limitIp: 'Von Ihrem Internetanschluss wurden in den letzten 24 Stunden bereits 3 Bewertungen abgegeben. Bitte versuchen Sie es morgen noch einmal.',
  limitEmail: 'Mit dieser E-Mail-Adresse wurde in den letzten 30 Tagen bereits eine Bewertung abgegeben.',
  server: 'Die Bewertung konnte gerade nicht gespeichert werden. Bitte versuchen Sie es in einigen Minuten noch einmal.',
} as const;

// ─── Zeitfalle und Honeypot ──────────────────────────────────────────────

export type VerwerfGrund = 'honeypot' | 'ohne_zeit' | 'zukunft' | 'zu_schnell' | 'zu_alt';

/**
 * Grund zum stillen Verwerfen (Antwort 202 ohne Speichern) oder null.
 * Reihenfolge: Honeypot, dann Startzeit.
 */
export function verwerfGrund(body: Record<string, unknown>, jetztMs: number): VerwerfGrund | null {
  const website = body.website;
  if (website !== undefined && website !== null && (typeof website !== 'string' || website.trim() !== '')) {
    return 'honeypot';
  }
  const start = body.gestartet_ms;
  if (typeof start !== 'number' || !Number.isFinite(start)) return 'ohne_zeit';
  if (start > jetztMs) return 'zukunft';
  const dauer = jetztMs - start;
  if (dauer < MIN_AUSFUELLZEIT_MS) return 'zu_schnell';
  if (dauer > MAX_FORMULAR_ALTER_MS) return 'zu_alt';
  return null;
}

// ─── Link-Erkennung ──────────────────────────────────────────────────────

const PROTOKOLL_ODER_WWW = /https?:\/\/|www\./i;
// Domain wie wort.de: nur kleingeschriebene gängige Endungen, danach kein
// Buchstabe. So bleiben „gut.Die“, „gut.der“, „z.B.“, „a.M.“ und Datumsangaben
// frei. Vor der Domain kein @ (E-Mail-Adressen im Text sind kein Link).
const DOMAIN = /(^|[^\w@.-])[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.(de|com|net|org|info|eu|at|ch|io|biz|ru|pl|nl|co|uk|xyz|top|shop|online|site|app|me|tv|cc|us)(?![a-z0-9])/;

export function enthaeltLink(text: string): boolean {
  return PROTOKOLL_ODER_WWW.test(text) || DOMAIN.test(text);
}

// ─── Eingabe prüfen ──────────────────────────────────────────────────────

export interface BewertungEingabe {
  sterne: number;
  text: string;
  name: string;
  ort: string | null;
  email: string;
}

export type PruefErgebnis =
  | { ok: true; daten: BewertungEingabe }
  | { ok: false; fehler: Record<string, string> };

const EMAIL_MUSTER = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function pruefeEingabe(body: unknown): PruefErgebnis {
  if (!istObjekt(body)) return { ok: false, fehler: { _: FEHLER.anfrage } };
  const fehler: Record<string, string> = {};

  const sterne = body.sterne;
  if (typeof sterne !== 'number' || !Number.isInteger(sterne) || sterne < 1 || sterne > 5) {
    fehler.sterne = FEHLER.sterne;
  }

  const text = typeof body.text === 'string' ? normText(body.text) : '';
  if (text.length < TEXT_MIN) fehler.text = FEHLER.textKurz;
  else if (text.length > TEXT_MAX) fehler.text = FEHLER.textLang;
  else if (enthaeltLink(text)) fehler.text = FEHLER.textLink;

  const name = typeof body.name === 'string' ? normZeile(body.name) : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) fehler.name = FEHLER.name;
  else if (enthaeltLink(name)) fehler.name = FEHLER.nameLink;

  let ort: string | null = null;
  if (typeof body.ort === 'string') {
    ort = normZeile(body.ort) || null;
    if (ort && ort.length > ORT_MAX) fehler.ort = FEHLER.ort;
    else if (ort && enthaeltLink(ort)) fehler.ort = FEHLER.ortLink;
  } else if (body.ort !== undefined && body.ort !== null) {
    fehler.ort = FEHLER.ort;
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > EMAIL_MAX || !EMAIL_MUSTER.test(email)) fehler.email = FEHLER.email;

  if (body.einwilligung !== true) fehler.einwilligung = FEHLER.einwilligung;

  if (Object.keys(fehler).length > 0) return { ok: false, fehler };
  return { ok: true, daten: { sterne: sterne as number, text, name, ort, email } };
}

// ─── Darstellung ─────────────────────────────────────────────────────────

export function sterneText(sterne: number): string {
  const voll = Math.max(0, Math.min(5, Math.round(sterne)));
  return '★'.repeat(voll) + '☆'.repeat(5 - voll);
}

// ─── Tokens und IP ───────────────────────────────────────────────────────

/** 32 Zufallsbytes als base64url (43 Zeichen). In der DB steht nur der Hash. */
export function neuerToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function istTokenFormat(wert: unknown): wert is string {
  return typeof wert === 'string' && /^[A-Za-z0-9_-]{43}$/.test(wert);
}

export function clientIp(header: (name: string) => string | null): string | null {
  const cf = header('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const erste = header('x-forwarded-for')?.split(',')[0]?.trim();
  return erste || null;
}

export function ipHash(ip: string | null, salz: string | undefined): string | null {
  if (!ip) return null;
  return tokenHash(`${salz || ERSATZ_SALZ}${ip}`);
}

export function limitFehler(anzahl: { ipAnzahl24h: number | null; emailAnzahl30Tage: number }): string | null {
  if (anzahl.ipAnzahl24h !== null && anzahl.ipAnzahl24h >= IP_LIMIT_24H) return FEHLER.limitIp;
  if (anzahl.emailAnzahl30Tage >= 1) return FEHLER.limitEmail;
  return null;
}

/** Wert für .ilike(), der exakt (ohne Groß/klein) vergleicht: % _ \ maskiert.
 *  Achtung: PostgREST liest * als %, deshalb Treffer im Code nachprüfen. */
export function ilikeExakt(wert: string): string {
  return wert.replace(/[%_\\]/g, '\\$&');
}

// ─── Öffentliche Liste ───────────────────────────────────────────────────

export interface BewertungZeile {
  id: string;
  sterne: number;
  text: string;
  name: string;
  ort: string | null;
  erstellt_am: string;
  veroeffentlicht_am: string | null;
  kunde_bestaetigt: boolean;
  antwort: string | null;
  antwort_am: string | null;
  /** Datum der Bewertung, wie gezeigt (YYYY-MM-DD). Beim Freigeben bzw. Eintragen gesetzt. */
  datum: string | null;
  herkunft: Herkunft;
}

/** Spalten für die öffentliche Abfrage — nie email, ip_hash, Tokens. */
export const LISTEN_SPALTEN = 'id, sterne, text, name, ort, erstellt_am, veroeffentlicht_am, kunde_bestaetigt, antwort, antwort_am, datum, herkunft';

export interface OeffentlicheBewertung {
  id: string;
  sterne: number;
  text: string;
  name: string;
  ort: string | null;
  datum: string;
  kunde_bestaetigt: boolean;
  antwort: string | null;
  antwort_datum: string | null;
  herkunft: Herkunft;
}

export function oeffentlich(z: BewertungZeile): OeffentlicheBewertung {
  const antwort = z.antwort ?? null;
  return {
    id: z.id,
    sterne: z.sterne,
    text: z.text,
    name: z.name,
    ort: z.ort ?? null,
    datum: anzeigeDatum(z),
    kunde_bestaetigt: z.kunde_bestaetigt === true,
    antwort,
    antwort_datum: antwort && z.antwort_am ? berlinDatum(z.antwort_am) : null,
    herkunft: z.herkunft,
  };
}

/** Neueste zuerst nach angezeigtem Datum; bei gleichem Tag bleibt die Reihenfolge der Abfrage. */
export function listenAntwort(zeilen: BewertungZeile[], jetzt: Date): { bewertungen: OeffentlicheBewertung[]; stand: string } {
  const sortiert = zeilen
    .map((z, i) => ({ b: oeffentlich(z), i }))
    .sort((x, y) => (x.b.datum < y.b.datum ? 1 : x.b.datum > y.b.datum ? -1 : x.i - y.i))
    .map((e) => e.b);
  return {
    bewertungen: sortiert.slice(0, MAX_LISTE),
    stand: jetzt.toISOString(),
  };
}

// ─── CORS und Umgebung ───────────────────────────────────────────────────

function ohneSchraegstrich(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function erlaubterOrigin(origin: string | null | undefined, extra?: string): boolean {
  if (!origin) return false;
  const zusatz = (extra ?? '').split(',').map(ohneSchraegstrich).filter(Boolean);
  return STANDARD_ORIGINS.indexOf(origin) >= 0 || zusatz.indexOf(origin) >= 0;
}

export function corsHeaders(origin: string | null | undefined, extra?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && erlaubterOrigin(origin, extra)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export function apiBasis(env: Record<string, string | undefined>): string {
  const wert = env.BEWERTUNG_API_BASIS?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim() || STANDARD_API_BASIS;
  return ohneSchraegstrich(wert);
}

export function teamEmpfaenger(wert: string | undefined): string[] {
  const liste = (wert ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return liste.length > 0 ? liste : [STANDARD_TEAM_AN];
}

// ─── Bestätigen ──────────────────────────────────────────────────────────

export type BestaetigungsErgebnis = 'bestaetigen' | 'bereits' | 'ungueltig';

export function bestaetigungsErgebnis(
  zeile: { status: BewertungStatus; erstellt_am: string; bestaetigt_am?: string | null } | null,
  jetzt: Date,
): BestaetigungsErgebnis {
  if (!zeile) return 'ungueltig';
  if (zeile.status === 'unbestaetigt') {
    const alter = jetzt.getTime() - new Date(zeile.erstellt_am).getTime();
    return alter < LINK_GUELTIG_MS ? 'bestaetigen' : 'ungueltig';
  }
  // Im Admin vor der Bestätigung abgelehnt (Spam): der Link ist damit ungültig.
  if (zeile.status === 'abgelehnt' && !zeile.bestaetigt_am) return 'ungueltig';
  // bestaetigt, veroeffentlicht, abgelehnt nach Bestätigung: schon bestätigt.
  return 'bereits';
}

export function zielUrl(ergebnis: 'bestaetigt' | 'ungueltig'): string {
  return `${ERFAHRUNGEN_URL}?bewertung=${ergebnis}#bewerten`;
}

// ─── Moderation ──────────────────────────────────────────────────────────

export function moderationsLinks(basis: string, token: string): Record<ModerationsAktion, string> {
  const link = (aktion: ModerationsAktion) =>
    `${ohneSchraegstrich(basis)}/api/bewertungen/moderation?t=${encodeURIComponent(token)}&aktion=${aktion}`;
  return { freigeben: link('freigeben'), freigeben_kunde: link('freigeben_kunde'), ablehnen: link('ablehnen') };
}

// ─── Turnstile ───────────────────────────────────────────────────────────

export const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileFormular(secret: string, token: string, ip: string | null): URLSearchParams {
  const f = new URLSearchParams();
  f.set('secret', secret);
  f.set('response', token);
  if (ip) f.set('remoteip', ip);
  return f;
}

export function turnstileOk(antwort: unknown): boolean {
  return istObjekt(antwort) && antwort.success === true;
}
