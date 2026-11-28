/* ─── Admin-Sitzung: signiertes, ablaufendes Cookie ─────────────────────
 *
 * Bis 10/2026 trug das Cookie `admin_auth` das Klartext-Passwort
 * (ADMIN_PASSWORD). Wer das Cookie sah — Browser-Profil, Proxy-Log,
 * Screenshot der DevTools —, hatte damit das Passwort des Panels und, weil
 * dasselbe Passwort das Supabase-Konto info@primundus.de öffnet, auch die
 * Datenbank-Sitzung (Audit C, 22.10.2026; Registry #135).
 *
 * Jetzt: Cookie `admin_sitzung` = `v1.<ausgestellt>.<nonce>.<hmac>`
 *   - ausgestellt: Unix-Sekunden, Ablauf nach SITZUNG_DAUER_S (7 Tage, wie
 *     das alte Cookie)
 *   - nonce: 16 Zufallsbytes, damit keine zwei Sitzungen gleich aussehen
 *   - hmac: HMAC-SHA256 mit ADMIN_SESSION_SECRET über die drei Felder UND das
 *     aktuelle ADMIN_PASSWORD. Das Passwort steht nicht im Cookie, gehört aber
 *     zur Signatur: ein Passwortwechsel beendet alle Sitzungen — so wie beim
 *     alten Cookie, dessen Wert nach dem Wechsel nicht mehr passte.
 *
 * Abmelden aller Geräte: ADMIN_SESSION_SECRET oder ADMIN_PASSWORD auf Render
 * ändern. Einzelne Sitzungen lassen sich serverseitig nicht widerrufen (kein
 * Speicher); DELETE /api/admin/auth löscht nur das Cookie im eigenen Browser.
 *
 * Das Modul läuft in der middleware (Edge-Laufzeit) UND in den API-Routen
 * (Node). Deshalb nur Web Crypto: `timingSafeEqual` aus node:crypto gibt es
 * in der Edge-Laufzeit nicht; `crypto.subtle.verify` vergleicht die Signatur
 * selbst in konstanter Zeit. Kein Import von next/server, damit der Test im
 * Root-vitest ohne die Pakete von project 3 läuft.
 *
 * Fehlt eine der beiden Variablen oder ist das Geheimnis kürzer als
 * MIN_GEHEIMNIS_LAENGE, ist das Panel zu (kein Ersatzwert — das Repo ist
 * öffentlich).
 */

export const SITZUNG_COOKIE = 'admin_sitzung';
/** Trug bis 10/2026 das Klartext-Passwort. Wird nur noch gelöscht, nie gelesen. */
export const ALTES_COOKIE = 'admin_auth';
export const SITZUNG_DAUER_S = 60 * 60 * 24 * 7;
export const MIN_GEHEIMNIS_LAENGE = 32;

const VERSION = 'v1';
/** Uhren von Instanzen dürfen etwas auseinanderlaufen, mehr nicht. */
const UHR_TOLERANZ_S = 60;

export interface SitzungsKonfig {
  geheimnis: string;
  passwort: string;
}

export function sitzungsKonfig(
  geheimnis: string | undefined = process.env.ADMIN_SESSION_SECRET,
  passwort: string | undefined = process.env.ADMIN_PASSWORD,
): SitzungsKonfig | null {
  if (!passwort || !geheimnis || geheimnis.length < MIN_GEHEIMNIS_LAENGE) return null;
  return { geheimnis, passwort };
}

const kodierer = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function ausB64url(text: string): Uint8Array | null {
  try {
    const roh = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
    const bytes = new Uint8Array(roh.length);
    for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/* Schlüssel je Geheimnis einmal importieren — die middleware prüft bei jedem
   Admin-Aufruf. */
let schluesselCache: { geheimnis: string; schluessel: Promise<CryptoKey> } | null = null;

function hmacSchluessel(geheimnis: string): Promise<CryptoKey> {
  if (schluesselCache?.geheimnis !== geheimnis) {
    schluesselCache = {
      geheimnis,
      schluessel: crypto.subtle.importKey(
        'raw',
        kodierer.encode(geheimnis),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      ),
    };
  }
  return schluesselCache.schluessel;
}

function signierteDaten(kopf: string, passwort: string): Uint8Array {
  return kodierer.encode(`${kopf}.${passwort}`);
}

export async function neueSitzung(konfig: SitzungsKonfig, jetztMs: number = Date.now()): Promise<string> {
  const ausgestellt = Math.floor(jetztMs / 1000);
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const kopf = `${VERSION}.${ausgestellt}.${nonce}`;
  const signatur = await crypto.subtle.sign('HMAC', await hmacSchluessel(konfig.geheimnis), signierteDaten(kopf, konfig.passwort));
  return `${kopf}.${b64url(new Uint8Array(signatur))}`;
}

export async function sitzungGueltig(
  wert: string | undefined,
  konfig: SitzungsKonfig | null,
  jetztMs: number = Date.now(),
): Promise<boolean> {
  if (!konfig || !wert || wert.length > 120) return false;
  const teile = wert.split('.');
  if (teile.length !== 4) return false;
  const [version, ausgestelltText, nonce, signaturText] = teile;
  if (version !== VERSION || !/^\d{1,12}$/.test(ausgestelltText)) return false;
  if (!/^[A-Za-z0-9_-]{22}$/.test(nonce) || !/^[A-Za-z0-9_-]{43}$/.test(signaturText)) return false;

  const jetzt = Math.floor(jetztMs / 1000);
  const ausgestellt = Number(ausgestelltText);
  if (ausgestellt > jetzt + UHR_TOLERANZ_S || jetzt - ausgestellt > SITZUNG_DAUER_S) return false;

  const signatur = ausB64url(signaturText);
  if (!signatur || signatur.length !== 32) return false;
  return crypto.subtle.verify(
    'HMAC',
    await hmacSchluessel(konfig.geheimnis),
    signatur,
    signierteDaten(`${version}.${ausgestelltText}.${nonce}`, konfig.passwort),
  );
}

/** Für middleware und API-Routen: liest das Cookie und prüft es gegen die Env. */
export function istAdmin(request: { cookies: { get(name: string): { value: string } | undefined } }): Promise<boolean> {
  return sitzungGueltig(request.cookies.get(SITZUNG_COOKIE)?.value, sitzungsKonfig());
}
