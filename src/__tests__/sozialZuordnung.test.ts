/*
 * Social-Zuordnung Beitrag → Anfrage (Registry #112, schlanke Fassung 04.10.2026).
 *
 * Geprüft wird, was den Rechner verlassen darf: nur Variante, Beitrag, Plattform
 * und das Datum (Europe/Berlin) — keine Lead-ID, nichts daraus Abgeleitetes, keine
 * Uhrzeit. Nichts im Browser-Speicher, keine zusätzliche Anfrage aus dem Browser,
 * keine öffentliche Route, nichts ohne Konfiguration, genau ein Versuch.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  sozialAusSuche,
  sozialBereinigen,
  sozialHerkunft,
  sozialZuruecksetzen,
} from '../../project 3/lib/sozial-zuordnung';
import {
  anfrageAnContentLoop,
  anfrageNutzlast,
  berlinTag,
  ZUORDNUNG_ZEITLIMIT_MS,
} from '../../project 3/lib/sozial-zuordnung-server';

// Ziel-Link laut docs/v1/KONVENTIONEN.md im Content-Loop.
const LINK_IG = '?utm_source=instagram&utm_medium=social&utm_campaign=pflegekosten&utm_content=p17-b&content_id=p17&variant_id=p17-b&start=1';
const HERKUNFT = { variante: 'p17-b', beitrag: 'p17', plattform: 'instagram' as const };
const LEAD_ID = '3f1c2b9e-8d7a-4c3b-9e21-5a6b7c8d9e0f';
const ENV = {
  SOZIAL_ZUORDNUNG_URL: 'https://loop.example/functions/v1/zuordnung',
  SOZIAL_ZUORDNUNG_SCHLUESSEL: 'geheim',
};
const JETZT = new Date('2026-10-04T13:47:12.345Z');

const WURZEL = join(__dirname, '..', '..', 'project 3');
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function fetchMit(antwort: number | 'netzfehler') {
  const aufrufe: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn((url: string, init: RequestInit) => {
    aufrufe.push({ url, init });
    if (antwort === 'netzfehler') return Promise.reject(new TypeError('fetch failed'));
    return Promise.resolve(new Response(null, { status: antwort }));
  });
  return { fn: fn as unknown as typeof fetch, aufrufe };
}

describe('Social-Zuordnung: Herkunft aus der Adresse', () => {
  it('liest Variante, Beitrag und Plattform aus dem Link des Content-Loops', () => {
    expect(sozialAusSuche(LINK_IG)).toEqual(HERKUNFT);
    expect(sozialAusSuche('?utm_source=facebook&utm_medium=social&variant_id=p3-a')).toEqual({ variante: 'p3-a', beitrag: null, plattform: 'facebook' });
    // Ohne variant_id gilt utm_content (gleicher Wert laut Konvention).
    expect(sozialAusSuche('?utm_source=Instagram&utm_medium=Social&utm_content=P17-B')).toEqual({ variante: 'p17-b', beitrag: null, plattform: 'instagram' });
  });

  it('nimmt nur Social-Links von Instagram oder Facebook mit gültiger Variante', () => {
    expect(sozialAusSuche('?utm_source=google&utm_medium=cpc&gclid=abc&utm_content=p17-b')).toBeNull();
    expect(sozialAusSuche('?utm_source=tiktok&utm_medium=social&variant_id=p17-b')).toBeNull();
    expect(sozialAusSuche('?utm_source=instagram&utm_medium=social')).toBeNull();
    expect(sozialAusSuche('?utm_source=instagram&utm_medium=social&variant_id=a%40b.de')).toBeNull();
    expect(sozialAusSuche(`?utm_source=instagram&utm_medium=social&variant_id=${'x'.repeat(33)}`)).toBeNull();
    expect(sozialAusSuche('?start=1&src=apex-kontakt')).toBeNull();
    expect(sozialAusSuche('')).toBeNull();
    // Ungültiger Beitrag fällt weg, die Variante bleibt.
    expect(sozialAusSuche('?utm_source=instagram&utm_medium=social&variant_id=p17-b&content_id=<x>')).toEqual({ variante: 'p17-b', beitrag: null, plattform: 'instagram' });
  });

  it('hält die Herkunft im Arbeitsspeicher: Navigation ohne Parameter verliert sie nicht', () => {
    sozialZuruecksetzen();
    expect(sozialHerkunft('?start=1')).toBeNull();
    expect(sozialHerkunft(LINK_IG)).toEqual(HERKUNFT);
    expect(sozialHerkunft('')).toEqual(HERKUNFT);
    sozialZuruecksetzen();
    expect(sozialHerkunft('')).toBeNull();
  });

  it('der Server übernimmt vom Browser nur die drei Felder', () => {
    expect(sozialBereinigen({ ...HERKUNFT, email: 'a@b.de', leadId: LEAD_ID })).toEqual(HERKUNFT);
    expect(sozialBereinigen({ variante: 'p17-b', plattform: 'facebook' })).toEqual({ variante: 'p17-b', beitrag: null, plattform: 'facebook' });
    expect(sozialBereinigen({ variante: 'p17-b', plattform: 'tiktok' })).toBeNull();
    expect(sozialBereinigen({ variante: 'P17 B', plattform: 'instagram' })).toBeNull();
    expect(sozialBereinigen([HERKUNFT])).toBeNull();
    expect(sozialBereinigen(null)).toBeNull();
    expect(sozialBereinigen('p17-b')).toBeNull();
  });

  it('im Browser: kein Speicher, keine eigene Anfrage', () => {
    const code = ohneKommentare(readFileSync(join(WURZEL, 'lib', 'sozial-zuordnung.ts'), 'utf8'));
    expect(code).not.toMatch(/sessionStorage|localStorage|document\.cookie|indexedDB/);
    expect(code).not.toMatch(/fetch|sendBeacon|XMLHttpRequest/);
  });
});

describe('Social-Zuordnung: Meldung „Anfrage“ an den Content-Loop', () => {
  it('Nutzlast: genau Ereignis, Variante, Beitrag, Plattform und Datum — keine Uhrzeit, nichts vom Lead', () => {
    const n = anfrageNutzlast(HERKUNFT, JETZT);
    expect(n).toEqual({ ereignis: 'anfrage', tracking_id: 'p17-b', content_id: 'p17', plattform: 'instagram', tag: '2026-10-04' });
    expect(anfrageNutzlast({ variante: 'p3-a', beitrag: null, plattform: 'facebook' }, JETZT).content_id).toBeNull();
    expect(JSON.stringify(n)).not.toMatch(/T\d\d:|extern|lead/i);
  });

  it('das Datum gilt in Europe/Berlin (Sommer- und Winterzeit, Jahreswechsel)', () => {
    expect(berlinTag(new Date('2026-10-04T21:59:59Z'))).toBe('2026-10-04'); // 23:59 MESZ
    expect(berlinTag(new Date('2026-10-04T22:00:00Z'))).toBe('2026-10-05'); // 00:00 MESZ
    expect(berlinTag(new Date('2026-12-31T22:59:59Z'))).toBe('2026-12-31'); // 23:59 MEZ
    expect(berlinTag(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01'); // 00:00 MEZ
  });

  it('ist ohne beide Variablen aus und sendet nichts', async () => {
    const { fn, aufrufe } = fetchMit(201);
    expect(await anfrageAnContentLoop(HERKUNFT, {}, fn, JETZT)).toBe('aus');
    expect(await anfrageAnContentLoop(HERKUNFT, { SOZIAL_ZUORDNUNG_URL: ENV.SOZIAL_ZUORDNUNG_URL }, fn, JETZT)).toBe('aus');
    expect(await anfrageAnContentLoop(HERKUNFT, { SOZIAL_ZUORDNUNG_SCHLUESSEL: 'geheim' }, fn, JETZT)).toBe('aus');
    expect(await anfrageAnContentLoop(HERKUNFT, { SOZIAL_ZUORDNUNG_URL: '  ', SOZIAL_ZUORDNUNG_SCHLUESSEL: ' ' }, fn, JETZT)).toBe('aus');
    expect(aufrufe).toHaveLength(0);
  });

  it('sendet per POST mit JSON und Schlüssel-Kopfzeile genau die Nutzlast, mit Zeitlimit ≤ 3 s', async () => {
    const { fn, aufrufe } = fetchMit(201);
    expect(await anfrageAnContentLoop(HERKUNFT, ENV, fn, JETZT)).toBe('gesendet');
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].url).toBe(ENV.SOZIAL_ZUORDNUNG_URL);
    expect(aufrufe[0].init.method).toBe('POST');
    const kopf = aufrufe[0].init.headers as Record<string, string>;
    expect(kopf['Content-Type']).toBe('application/json');
    expect(kopf['x-zuordnung-schluessel']).toBe('geheim');
    expect(JSON.parse(String(aufrufe[0].init.body))).toEqual(anfrageNutzlast(HERKUNFT, JETZT));
    expect(aufrufe[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(ZUORDNUNG_ZEITLIMIT_MS).toBeLessThanOrEqual(3000);
  });

  it('genau ein Versuch: kein zweiter bei 5xx, Netzfehler oder 4xx', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const antwort of [503, 'netzfehler', 422, 401] as const) {
      const { fn, aufrufe } = fetchMit(antwort);
      expect(await anfrageAnContentLoop(HERKUNFT, ENV, fn, JETZT), String(antwort)).toBe('fehler');
      expect(aufrufe, String(antwort)).toHaveLength(1);
    }
    // Protokolliert wird nie die Nutzlast oder das Geheimnis.
    for (const [zeile] of fehler.mock.calls) expect(String(zeile)).not.toMatch(/p17|geheim|loop\.example/);
    fehler.mockRestore();
  });
});

describe('Social-Zuordnung: Einbau', () => {
  const route = ohneKommentare(readFileSync(join(WURZEL, 'app', 'api', 'angebot-anfordern', 'route.ts'), 'utf8'));
  const formular = ohneKommentare(readFileSync(join(WURZEL, 'components', 'calculator', 'MultiStepForm.tsx'), 'utf8'));

  it('der Server meldet nur neue Leads mit geprüfter Herkunft, im Hintergrund, ohne Lead-Daten', () => {
    expect(route).toContain('sozialBereinigen(body.sozial)');
    expect(route).toMatch(/if \(sozial && \(isNew \|\| isUpgrade\)\) \{\s*anfrageAnContentLoop\(sozial\)\s*\.catch\(/);
    // nicht abgewartet: Lead, Mails und Antwort hängen nicht davon ab
    expect(route).not.toMatch(/await\s+anfrageAnContentLoop/);
  });

  it('keine öffentliche Route, kein Besuchs-Beacon, kein HMAC', () => {
    expect(existsSync(join(WURZEL, 'app', 'api', 'sozial-zuordnung'))).toBe(false);
    expect(formular).toContain('sozial: sozialHerkunft()');
    expect(formular).not.toMatch(/meldeSozialBesuch|sendBeacon|\/api\/sozial-zuordnung/);
    const server = ohneKommentare(readFileSync(join(WURZEL, 'lib', 'sozial-zuordnung-server.ts'), 'utf8'));
    expect(server).not.toMatch(/createHmac|extern_ref|SALZ/);
  });

  it('.env.example kennt genau die zwei Variablen', () => {
    const beispiel = readFileSync(join(WURZEL, '.env.example'), 'utf8');
    const variablen = beispiel.match(/^SOZIAL_ZUORDNUNG_[A-Z_]+(?==)/gm);
    expect(variablen).toEqual(['SOZIAL_ZUORDNUNG_URL', 'SOZIAL_ZUORDNUNG_SCHLUESSEL']);
  });
});
