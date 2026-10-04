/*
 * Social-Zuordnung Beitrag → Besuch → Anfrage (Registry #112).
 *
 * Geprüft wird, was den Rechner verlassen darf: nur Variante, Beitrag,
 * Plattform, Zeitpunkt auf die volle Stunde und bei Anfragen ein HMAC der
 * Lead-ID. Nichts im Browser-Speicher, keine Anfrage aus dem Browser, nichts
 * ohne Konfiguration.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  meldeSozialBesuch,
  sozialAusSuche,
  sozialBereinigen,
  sozialHerkunft,
  sozialZuruecksetzen,
  SOZIAL_PFAD,
} from '../../project 3/lib/sozial-zuordnung';
import {
  anContentLoopMelden,
  externRef,
  volleStunde,
  zuordnungsNutzlast,
} from '../../project 3/lib/sozial-zuordnung-server';

// Ziel-Link laut docs/v1/KONVENTIONEN.md im Content-Loop.
const LINK_IG = '?utm_source=instagram&utm_medium=social&utm_campaign=pflegekosten&utm_content=p17-b&content_id=p17&variant_id=p17-b&start=1';
const HERKUNFT = { variante: 'p17-b', beitrag: 'p17', plattform: 'instagram' as const };
const LEAD_ID = '3f1c2b9e-8d7a-4c3b-9e21-5a6b7c8d9e0f';
const ENV = {
  SOZIAL_ZUORDNUNG_URL: 'https://loop.example/functions/v1/zuordnung',
  SOZIAL_ZUORDNUNG_SCHLUESSEL: 'geheim',
  SOZIAL_ZUORDNUNG_SALZ: 'salz',
};
const JETZT = new Date('2026-10-04T13:47:12.345Z');

const WURZEL = join(__dirname, '..', '..', 'project 3');
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function fetchMit(antworten: Array<number | 'netzfehler'>) {
  const aufrufe: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn((url: string, init: RequestInit) => {
    aufrufe.push({ url, init });
    const a = antworten[Math.min(aufrufe.length - 1, antworten.length - 1)];
    if (a === 'netzfehler') return Promise.reject(new TypeError('fetch failed'));
    return Promise.resolve(new Response(null, { status: a }));
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
});

describe('Social-Zuordnung: Besuch aus dem Browser', () => {
  beforeEach(() => sozialZuruecksetzen());

  it('meldet einmal je Seitenaufruf an die eigene Route, nur die drei Felder', async () => {
    const gesendet: Array<{ url: string; data: Blob }> = [];
    const sender = { sendBeacon: (url: string, data: Blob) => { gesendet.push({ url, data }); return true; } };
    expect(meldeSozialBesuch(sender, LINK_IG)).toBe(true);
    expect(meldeSozialBesuch(sender, LINK_IG)).toBe(false);
    expect(gesendet).toHaveLength(1);
    expect(gesendet[0].url).toBe(SOZIAL_PFAD);
    const text = await new Promise<string>((fertig) => {
      const leser = new FileReader();
      leser.onload = () => fertig(String(leser.result));
      leser.readAsText(gesendet[0].data);
    });
    expect(JSON.parse(text)).toEqual({ ereignis: 'besuch', ...HERKUNFT });
  });

  it('meldet nichts ohne Social-Herkunft', () => {
    const sendBeacon = vi.fn(() => true);
    expect(meldeSozialBesuch({ sendBeacon }, '?utm_source=google&gclid=abc')).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('fällt auf fetch mit keepalive zurück, wenn sendBeacon fehlt', () => {
    const { fn, aufrufe } = fetchMit([204]);
    expect(meldeSozialBesuch({ fetch: fn }, LINK_IG)).toBe(true);
    expect(aufrufe[0].url).toBe(SOZIAL_PFAD);
    expect(aufrufe[0].init.keepalive).toBe(true);
    expect(JSON.parse(String(aufrufe[0].init.body))).toEqual({ ereignis: 'besuch', ...HERKUNFT });
  });

  it('nutzt keinen Browser-Speicher', () => {
    const code = ohneKommentare(readFileSync(join(WURZEL, 'lib', 'sozial-zuordnung.ts'), 'utf8'));
    expect(code).not.toMatch(/sessionStorage|localStorage|document\.cookie|indexedDB/);
  });
});

describe('Social-Zuordnung: Meldung an den Content-Loop', () => {
  it('Besuch: nur Variante, Beitrag, Plattform und volle Stunde', () => {
    expect(zuordnungsNutzlast({ ereignis: 'besuch', herkunft: HERKUNFT }, 'salz', JETZT)).toEqual({
      ereignis: 'besuch',
      tracking_id: 'p17-b',
      content_id: 'p17',
      plattform: 'instagram',
      zeitpunkt: '2026-10-04T13:00:00.000Z',
    });
    expect(volleStunde(new Date('2026-10-04T23:59:59.999Z'))).toBe('2026-10-04T23:00:00.000Z');
  });

  it('Anfrage: dazu extern_ref als HMAC der Lead-ID — die Lead-ID selbst geht nie raus', () => {
    const n = zuordnungsNutzlast({ ereignis: 'anfrage', herkunft: HERKUNFT, leadId: LEAD_ID }, 'salz', JETZT);
    expect(Object.keys(n).sort()).toEqual(['content_id', 'ereignis', 'extern_ref', 'plattform', 'tracking_id', 'zeitpunkt']);
    expect((n as { extern_ref: string }).extern_ref).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(n)).not.toContain(LEAD_ID);
    // Gleicher Lead, gleiches Salz → gleicher Schlüssel (Entdopplung); sonst verschieden.
    expect(externRef(LEAD_ID, 'salz')).toBe(externRef(LEAD_ID, 'salz'));
    expect(externRef(LEAD_ID, 'anderes-salz')).not.toBe(externRef(LEAD_ID, 'salz'));
    expect(externRef('4a2d3c0f-9e8b-4d4c-8f32-6b7c8d9e0f1a', 'salz')).not.toBe(externRef(LEAD_ID, 'salz'));
  });

  it('ist ohne Konfiguration aus und sendet nichts', async () => {
    const { fn, aufrufe } = fetchMit([201]);
    expect(await anContentLoopMelden({ ereignis: 'besuch', herkunft: HERKUNFT }, {}, fn, JETZT)).toBe('aus');
    expect(await anContentLoopMelden({ ereignis: 'besuch', herkunft: HERKUNFT }, { SOZIAL_ZUORDNUNG_URL: ENV.SOZIAL_ZUORDNUNG_URL }, fn, JETZT)).toBe('aus');
    // Anfragen brauchen zusätzlich das Salz für extern_ref.
    expect(await anContentLoopMelden({ ereignis: 'anfrage', herkunft: HERKUNFT, leadId: LEAD_ID }, { ...ENV, SOZIAL_ZUORDNUNG_SALZ: '' }, fn, JETZT)).toBe('aus');
    expect(aufrufe).toHaveLength(0);
  });

  it('sendet per POST mit Schlüssel-Kopfzeile genau die Nutzlast', async () => {
    const { fn, aufrufe } = fetchMit([201]);
    const e = { ereignis: 'anfrage' as const, herkunft: HERKUNFT, leadId: LEAD_ID };
    expect(await anContentLoopMelden(e, ENV, fn, JETZT)).toBe('gesendet');
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].url).toBe(ENV.SOZIAL_ZUORDNUNG_URL);
    expect(aufrufe[0].init.method).toBe('POST');
    expect((aufrufe[0].init.headers as Record<string, string>)['x-zuordnung-schluessel']).toBe('geheim');
    expect(JSON.parse(String(aufrufe[0].init.body))).toEqual(zuordnungsNutzlast(e, 'salz', JETZT));
  });

  it('wiederholt nur Anfragen (idempotent über extern_ref), nie Besuche, nie bei 4xx', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
    const anfrage = { ereignis: 'anfrage' as const, herkunft: HERKUNFT, leadId: LEAD_ID };

    const a = fetchMit([503, 201]);
    expect(await anContentLoopMelden(anfrage, ENV, a.fn, JETZT)).toBe('gesendet');
    expect(a.aufrufe).toHaveLength(2);

    const b = fetchMit(['netzfehler', 200]);
    expect(await anContentLoopMelden(anfrage, ENV, b.fn, JETZT)).toBe('gesendet');
    expect(b.aufrufe).toHaveLength(2);

    const c = fetchMit([503, 201]);
    expect(await anContentLoopMelden({ ereignis: 'besuch', herkunft: HERKUNFT }, ENV, c.fn, JETZT)).toBe('fehler');
    expect(c.aufrufe).toHaveLength(1);

    const d = fetchMit([422, 201]);
    expect(await anContentLoopMelden(anfrage, ENV, d.fn, JETZT)).toBe('fehler');
    expect(d.aufrufe).toHaveLength(1);

    // Protokolliert wird nur Ereignisart und Status, nie die Nutzlast.
    for (const [zeile] of fehler.mock.calls) expect(String(zeile)).not.toMatch(/p17|extern_ref|geheim/);
    fehler.mockRestore();
  });
});

describe('Social-Zuordnung: Einbau', () => {
  const route = ohneKommentare(readFileSync(join(WURZEL, 'app', 'api', 'angebot-anfordern', 'route.ts'), 'utf8'));
  const besuch = ohneKommentare(readFileSync(join(WURZEL, 'app', 'api', 'sozial-zuordnung', 'route.ts'), 'utf8'));
  const formular = ohneKommentare(readFileSync(join(WURZEL, 'components', 'calculator', 'MultiStepForm.tsx'), 'utf8'));

  it('Anfragen meldet nur der Server, nur für neue Leads, mit geprüfter Herkunft', () => {
    expect(route).toContain('sozialBereinigen(body.sozial)');
    expect(route).toMatch(/if \(sozial && \(isNew \|\| isUpgrade\)\)/);
    expect(route).toMatch(/anContentLoopMelden\(\{ ereignis: 'anfrage', herkunft: sozial, leadId: lead\.id \}\)/);
    // Die Besuchs-Route nimmt aus dem Browser nur Besuche an.
    expect(besuch).toContain("body?.ereignis === 'besuch'");
    expect(besuch).not.toContain("'anfrage'");
  });

  it('der Fragebogen meldet den Besuch und schickt die Herkunft beim Absenden mit', () => {
    expect(formular).toContain('meldeSozialBesuch()');
    expect(formular).toContain('sozial: sozialHerkunft()');
  });
});
