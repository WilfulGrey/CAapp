// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALTES_COOKIE,
  istAdmin,
  MIN_GEHEIMNIS_LAENGE,
  neueSitzung,
  SITZUNG_COOKIE,
  SITZUNG_DAUER_S,
  sitzungGueltig,
  sitzungsKonfig,
} from '../../project 3/lib/admin-sitzung';
import { FENSTER_MS, FehlversuchZaehler, MAX_FEHLVERSUCHE, passwortStimmt } from '../../project 3/lib/admin-anmeldung';

/*
 * Admin-Login (Audit C, 22.10.2026; Registry #135): das Cookie trug das
 * Klartext-Passwort, und der Login ließ beliebig viele Versuche zu. Jetzt:
 * signiertes, ablaufendes Token und 5 Fehlversuche je IP in 15 Minuten.
 * Testwerte, keine echten Geheimnisse.
 */

const KONFIG = { geheimnis: 'g'.repeat(MIN_GEHEIMNIS_LAENGE), passwort: 'test-passwort' };
const JETZT = Date.UTC(2026, 9, 22, 10, 0, 0);

describe('sitzungsKonfig', () => {
  it('ohne Passwort, ohne Geheimnis oder mit zu kurzem Geheimnis: kein Login', () => {
    expect(sitzungsKonfig(undefined, 'pw')).toBeNull();
    expect(sitzungsKonfig(KONFIG.geheimnis, undefined)).toBeNull();
    expect(sitzungsKonfig(KONFIG.geheimnis, '')).toBeNull();
    expect(sitzungsKonfig('x'.repeat(MIN_GEHEIMNIS_LAENGE - 1), 'pw')).toBeNull();
    expect(sitzungsKonfig(KONFIG.geheimnis, 'pw')).toEqual({ geheimnis: KONFIG.geheimnis, passwort: 'pw' });
  });
});

describe('Sitzungs-Token', () => {
  it('frisch ausgestellt ist gültig und enthält das Passwort nicht', async () => {
    const token = await neueSitzung(KONFIG, JETZT);
    expect(token).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(token).not.toContain(KONFIG.passwort);
    expect(await sitzungGueltig(token, KONFIG, JETZT)).toBe(true);
  });

  it('zwei Anmeldungen ergeben verschiedene Tokens', async () => {
    expect(await neueSitzung(KONFIG, JETZT)).not.toBe(await neueSitzung(KONFIG, JETZT));
  });

  it('läuft nach 7 Tagen ab', async () => {
    const token = await neueSitzung(KONFIG, JETZT);
    expect(await sitzungGueltig(token, KONFIG, JETZT + SITZUNG_DAUER_S * 1000)).toBe(true);
    expect(await sitzungGueltig(token, KONFIG, JETZT + (SITZUNG_DAUER_S + 1) * 1000)).toBe(false);
  });

  it('aus der Zukunft (mehr als eine Minute) zählt nicht', async () => {
    const token = await neueSitzung(KONFIG, JETZT + 120_000);
    expect(await sitzungGueltig(token, KONFIG, JETZT)).toBe(false);
  });

  it('anderes Geheimnis oder geändertes Passwort beendet die Sitzung', async () => {
    const token = await neueSitzung(KONFIG, JETZT);
    expect(await sitzungGueltig(token, { ...KONFIG, geheimnis: 'h'.repeat(MIN_GEHEIMNIS_LAENGE) }, JETZT)).toBe(false);
    expect(await sitzungGueltig(token, { ...KONFIG, passwort: 'neues-passwort' }, JETZT)).toBe(false);
  });

  it('verändertes Ausstellungsdatum, Nonce oder Signatur fällt durch', async () => {
    const token = await neueSitzung(KONFIG, JETZT);
    const [v, iat, nonce, sig] = token.split('.');
    const andereZahl = String(Number(iat) + 1);
    const andererBuchstabe = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(await sitzungGueltig([v, andereZahl, nonce, sig].join('.'), KONFIG, JETZT)).toBe(false);
    expect(await sitzungGueltig([v, iat, andererBuchstabe(nonce), sig].join('.'), KONFIG, JETZT)).toBe(false);
    expect(await sitzungGueltig([v, iat, nonce, andererBuchstabe(sig)].join('.'), KONFIG, JETZT)).toBe(false);
    expect(await sitzungGueltig(['v2', iat, nonce, sig].join('.'), KONFIG, JETZT)).toBe(false);
  });

  it('der alte Cookie-Wert (Klartext-Passwort) und Müll zählen nicht', async () => {
    for (const wert of [undefined, '', KONFIG.passwort, 'v1...', 'a.b.c.d', 'v1.1.2.3.4', 'x'.repeat(500)]) {
      expect(await sitzungGueltig(wert, KONFIG, JETZT)).toBe(false);
    }
  });

  it('ohne Konfiguration ist auch ein gültiges Token wertlos', async () => {
    const token = await neueSitzung(KONFIG, JETZT);
    expect(await sitzungGueltig(token, null, JETZT)).toBe(false);
  });

  it('istAdmin liest nur das neue Cookie', async () => {
    const env = { s: process.env.ADMIN_SESSION_SECRET, p: process.env.ADMIN_PASSWORD };
    process.env.ADMIN_SESSION_SECRET = KONFIG.geheimnis;
    process.env.ADMIN_PASSWORD = KONFIG.passwort;
    try {
      const token = await neueSitzung(KONFIG);
      const mit = (cookies: Record<string, string>) => ({
        cookies: { get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined) },
      });
      expect(await istAdmin(mit({ [SITZUNG_COOKIE]: token }))).toBe(true);
      expect(await istAdmin(mit({ [ALTES_COOKIE]: KONFIG.passwort }))).toBe(false);
      expect(await istAdmin(mit({}))).toBe(false);
      delete process.env.ADMIN_SESSION_SECRET;
      expect(await istAdmin(mit({ [SITZUNG_COOKIE]: token }))).toBe(false);
    } finally {
      if (env.s === undefined) delete process.env.ADMIN_SESSION_SECRET;
      else process.env.ADMIN_SESSION_SECRET = env.s;
      if (env.p === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = env.p;
    }
  });
});

describe('passwortStimmt', () => {
  it('nur genau das Passwort', () => {
    expect(passwortStimmt('test-passwort', 'test-passwort')).toBe(true);
    expect(passwortStimmt('test-passwort ', 'test-passwort')).toBe(false);
    expect(passwortStimmt('kurz', 'test-passwort')).toBe(false);
    expect(passwortStimmt('', 'test-passwort')).toBe(false);
    expect(passwortStimmt(undefined, 'test-passwort')).toBe(false);
    expect(passwortStimmt({ toString: () => 'test-passwort' }, 'test-passwort')).toBe(false);
  });
});

describe('FehlversuchZaehler', () => {
  it(`nach ${MAX_FEHLVERSUCHE} Fehlversuchen ist die IP bis zum Ende des Fensters zu`, () => {
    const z = new FehlversuchZaehler();
    for (let i = 0; i < MAX_FEHLVERSUCHE - 1; i++) z.fehlversuch('1.2.3.4', JETZT + i * 1000);
    expect(z.wartezeit('1.2.3.4', JETZT + 5000)).toBe(0);
    z.fehlversuch('1.2.3.4', JETZT + 5000);
    expect(z.wartezeit('1.2.3.4', JETZT + 6000)).toBe(FENSTER_MS - 6000);
    expect(z.wartezeit('5.6.7.8', JETZT + 6000)).toBe(0);
    expect(z.wartezeit('1.2.3.4', JETZT + FENSTER_MS)).toBe(0);
    // Neues Fenster: wieder 5 Versuche.
    z.fehlversuch('1.2.3.4', JETZT + FENSTER_MS);
    expect(z.wartezeit('1.2.3.4', JETZT + FENSTER_MS + 1)).toBe(0);
  });

  it('erfolgreiche Anmeldung setzt den Zähler zurück', () => {
    const z = new FehlversuchZaehler();
    for (let i = 0; i < MAX_FEHLVERSUCHE - 1; i++) z.fehlversuch('1.2.3.4', JETZT);
    z.erfolg('1.2.3.4');
    z.fehlversuch('1.2.3.4', JETZT);
    expect(z.wartezeit('1.2.3.4', JETZT)).toBe(0);
  });

  it('bleibt bei einer Flut aus IPs begrenzt', () => {
    const z = new FehlversuchZaehler(MAX_FEHLVERSUCHE, FENSTER_MS, 3);
    for (const ip of ['a', 'b', 'c', 'd']) z.fehlversuch(ip, JETZT);
    for (let i = 0; i < MAX_FEHLVERSUCHE; i++) z.fehlversuch('e', JETZT);
    expect(z.wartezeit('e', JETZT)).toBeGreaterThan(0);
    expect(z.wartezeit('a', JETZT)).toBe(0);
  });
});

describe('kein Code prüft mehr das alte Cookie', () => {
  const wurzel = join(__dirname, '..', '..', 'project 3');
  function dateien(ordner: string): string[] {
    return readdirSync(ordner).flatMap((name) => {
      const pfad = join(ordner, name);
      if (statSync(pfad).isDirectory()) return dateien(pfad);
      return /\.(ts|tsx)$/.test(name) ? [pfad] : [];
    });
  }

  it("weder 'admin_auth' noch das alte Code-Passwort außerhalb von lib/admin-sitzung.ts", () => {
    const treffer = [...dateien(join(wurzel, 'app')), ...dateien(join(wurzel, 'lib')), join(wurzel, 'middleware.ts')]
      .filter((pfad) => !pfad.endsWith(join('lib', 'admin-sitzung.ts')))
      .filter((pfad) => /admin_auth|primundus2026/.test(readFileSync(pfad, 'utf8')));
    expect(treffer).toEqual([]);
  });
});
