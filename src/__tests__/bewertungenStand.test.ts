/**
 * Bewertungszeile unter Martas Karte (Martin, 17.09.2026):
 *   ★★★★★ 4,9 von 5 aus 126 Bewertungen · Erfahrungen lesen →
 *
 * Die Zahlen kommen live aus primundus.de/api/bewertungen-stand. Fällt der
 * Abruf aus oder ist die Antwort kaputt, steht der letzte bekannte Stand in
 * der Mail. Pures Modul aus `project 3/lib/` (Cross-App-Import wie
 * quietHours.test.ts). Die Kopie für die Edge Function wird unten gegen
 * dieses Modul geprüft, damit beide nicht auseinanderlaufen.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BEWERTUNGS_STAND_ERSATZ,
  BEWERTUNGS_STAND_URL,
  ERFAHRUNGEN_URL,
  bewertungsZeileHtml,
  holeBewertungsStand,
  ladeBewertungsStand,
  leereBewertungsStandCache,
  pruefeBewertungsStand,
} from '../../project 3/lib/bewertungen-stand';
import * as edge from '../../project 3/supabase/functions/send-scheduled-emails/bewertungenStand';

const GUELTIG = {
  schnitt: '4,9',
  wert: 4.89,
  anzahl: 126,
  url: 'https://primundus.de/erfahrungen',
  stand: '2026-09-17T08:00:00.000Z',
};

const antwort = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('pruefeBewertungsStand', () => {
  it('übernimmt Schnitt und Anzahl aus einer gültigen Antwort', () => {
    expect(pruefeBewertungsStand(GUELTIG)).toEqual({ schnitt: '4,9', anzahl: 126 });
  });

  it.each([
    ['Punkt statt Komma', '4.9'],
    ['zwei Nachkommastellen', '4,89'],
    ['ohne Komma', '49'],
    ['leer', ''],
    ['Zahl statt Text', 4.9],
    ['über 5', '5,1'],
    ['unter 1', '0,9'],
  ])('verwirft den Schnitt (%s)', (_name, schnitt) => {
    expect(pruefeBewertungsStand({ ...GUELTIG, schnitt })).toBeNull();
  });

  it.each([
    ['null', 0],
    ['negativ', -3],
    ['Bruch', 12.5],
    ['Text', '126'],
    ['NaN', Number.NaN],
    ['fehlt', undefined],
  ])('verwirft die Anzahl (%s)', (_name, anzahl) => {
    expect(pruefeBewertungsStand({ ...GUELTIG, anzahl })).toBeNull();
  });

  it.each([null, undefined, 'kaputt', 42, [GUELTIG]])('verwirft Nicht-Objekte (%s)', (payload) => {
    expect(pruefeBewertungsStand(payload)).toBeNull();
  });

  it('akzeptiert die Grenzen 1,0 und 5,0 und eine einzelne Bewertung', () => {
    expect(pruefeBewertungsStand({ schnitt: '1,0', anzahl: 1 })).toEqual({ schnitt: '1,0', anzahl: 1 });
    expect(pruefeBewertungsStand({ schnitt: '5,0', anzahl: 1 })).toEqual({ schnitt: '5,0', anzahl: 1 });
  });
});

describe('bewertungsZeileHtml', () => {
  const html = bewertungsZeileHtml({ schnitt: '4,9', anzahl: 126 });

  it('zeigt fünf goldene Sterne als Textzeichen, kein Bild', () => {
    expect(html).toContain('color:#D4A843;');
    expect(html.match(/&#9733;/g)).toHaveLength(5);
    expect(html).not.toContain('<img');
  });

  it('setzt Schnitt und Anzahl fett in #3D2B1F, den Rest in #555', () => {
    expect(html).toContain('<strong style="color:#3D2B1F;">4,9</strong>');
    expect(html).toContain('<strong style="color:#3D2B1F;">126</strong>');
    expect(html).toMatch(/<td[^>]*color:#555;/);
    expect(html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '))
      .toContain('4,9 von 5 aus 126 Bewertungen');
  });

  it('verlinkt „Erfahrungen lesen →" auf primundus.de/erfahrungen', () => {
    expect(ERFAHRUNGEN_URL).toBe('https://primundus.de/erfahrungen');
    expect(html).toMatch(/<a href="https:\/\/primundus\.de\/erfahrungen"[^>]*>Erfahrungen lesen&nbsp;&rarr;<\/a>/);
  });

  it('ist mailtauglich: Tabelle mit role=presentation, nur Inline-Styles', () => {
    expect(html).toMatch(/^\s*<table [^>]*role="presentation"/);
    expect(html).not.toMatch(/class=/);
    expect(html).not.toMatch(/<style/);
  });

  it('Schriftgrößen passen zur Karte (13–14 px)', () => {
    const groessen = [...html.matchAll(/font-size:(\d+)px/g)].map((m) => Number(m[1]));
    expect(groessen.length).toBeGreaterThan(0);
    for (const g of groessen) expect(g === 13 || g === 14).toBe(true);
  });

  it('bricht auf schmalen Bildschirmen nur vor dem Link um, nie innerhalb der Zahlen', () => {
    expect(html).toMatch(/<span style="white-space:nowrap;">[^]*Bewertungen<\/span>/);
    expect(html).toMatch(/<a [^>]*white-space:nowrap;/);
  });

  it('Abstand nach unten ist einstellbar (Standard 24 px), die Karte darüber rückt heran', () => {
    expect(html).toContain('margin:0 0 24px 0;');
    expect(bewertungsZeileHtml({ schnitt: '4,9', anzahl: 126 }, 32)).toContain('margin:0 0 32px 0;');
    expect(html).toMatch(/padding:10px /);
  });

  it('rundet die Sterne: 4,4 zeigt vier goldene und einen hellen', () => {
    const z = bewertungsZeileHtml({ schnitt: '4,4', anzahl: 30 });
    expect(z).toMatch(/color:#D4A843;">(&#9733;){4}<\/span><span style="color:#E3D9CB;">&#9733;<\/span>/);
  });

  it('Einzahl bei einer Bewertung, Tausenderpunkt bei großen Zahlen', () => {
    const eins = bewertungsZeileHtml({ schnitt: '5,0', anzahl: 1 }).replace(/<[^>]+>/g, '');
    expect(eins).toContain('aus 1 Bewertung');
    expect(eins).not.toContain('Bewertungen');
    expect(bewertungsZeileHtml({ schnitt: '4,8', anzahl: 1234 })).toContain('>1.234</strong>');
  });
});

describe('ladeBewertungsStand (ein Abruf, nie ein Fehler nach außen)', () => {
  it('ruft den Endpunkt mit Timeout-Signal ab und liefert den Stand', async () => {
    let aufruf: { url: string; init?: RequestInit } | null = null;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      aufruf = { url, init };
      return antwort(GUELTIG);
    }) as unknown as typeof fetch;
    await expect(ladeBewertungsStand(fetchFn)).resolves.toEqual({ schnitt: '4,9', anzahl: 126 });
    expect(aufruf!.url).toBe(BEWERTUNGS_STAND_URL);
    expect(aufruf!.url).toBe('https://primundus.de/api/bewertungen-stand');
    expect(aufruf!.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('404 (Endpunkt noch nicht live) → Ersatzwert', async () => {
    const fetchFn = (async () => antwort('<html>404</html>', 404)) as unknown as typeof fetch;
    await expect(ladeBewertungsStand(fetchFn)).resolves.toEqual(BEWERTUNGS_STAND_ERSATZ);
  });

  it('kaputtes JSON oder ungültige Werte → Ersatzwert', async () => {
    const kaputt = (async () => antwort('{nicht json')) as unknown as typeof fetch;
    const falsch = (async () => antwort({ ...GUELTIG, schnitt: '4.9' })) as unknown as typeof fetch;
    await expect(ladeBewertungsStand(kaputt)).resolves.toEqual(BEWERTUNGS_STAND_ERSATZ);
    await expect(ladeBewertungsStand(falsch)).resolves.toEqual(BEWERTUNGS_STAND_ERSATZ);
  });

  it('Netzwerkfehler → Ersatzwert', async () => {
    const fetchFn = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(ladeBewertungsStand(fetchFn)).resolves.toEqual(BEWERTUNGS_STAND_ERSATZ);
  });

  it('hängender Server → Ersatzwert nach dem Timeout', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')));
      })) as unknown as typeof fetch;
    const start = Date.now();
    await expect(ladeBewertungsStand(fetchFn, 30)).resolves.toEqual(BEWERTUNGS_STAND_ERSATZ);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('Ersatzwert ist der Stand vom 17.09.2026', () => {
    expect(BEWERTUNGS_STAND_ERSATZ).toEqual({ schnitt: '4,9', anzahl: 126 });
  });
});

describe('holeBewertungsStand (Kostenrechner: Prozess-Cache)', () => {
  beforeEach(() => leereBewertungsStandCache());

  const zaehlenderFetch = (body: unknown, status = 200) => {
    const f = Object.assign(
      (async () => { f.aufrufe += 1; return antwort(body, status); }) as unknown as typeof fetch,
      { aufrufe: 0 },
    );
    return f as typeof fetch & { aufrufe: number };
  };

  it('fragt innerhalb einer Stunde nur einmal', async () => {
    const f = zaehlenderFetch(GUELTIG);
    let jetzt = 1_000_000;
    const uhr = () => jetzt;
    await holeBewertungsStand({ fetchFn: f, jetzt: uhr });
    jetzt += 59 * 60_000;
    await expect(holeBewertungsStand({ fetchFn: f, jetzt: uhr })).resolves.toEqual({ schnitt: '4,9', anzahl: 126 });
    expect(f.aufrufe).toBe(1);
    jetzt += 2 * 60_000;
    await holeBewertungsStand({ fetchFn: f, jetzt: uhr });
    expect(f.aufrufe).toBe(2);
  });

  it('merkt sich einen Fehlschlag nur zehn Minuten', async () => {
    const f = zaehlenderFetch('nope', 404);
    let jetzt = 5_000_000;
    const uhr = () => jetzt;
    await expect(holeBewertungsStand({ fetchFn: f, jetzt: uhr })).resolves.toEqual(BEWERTUNGS_STAND_ERSATZ);
    jetzt += 9 * 60_000;
    await holeBewertungsStand({ fetchFn: f, jetzt: uhr });
    expect(f.aufrufe).toBe(1);
    jetzt += 2 * 60_000;
    await holeBewertungsStand({ fetchFn: f, jetzt: uhr });
    expect(f.aufrufe).toBe(2);
  });
});

describe('Kopie in der Edge Function (send-scheduled-emails/bewertungenStand.ts)', () => {
  const staende = [
    { schnitt: '4,9', anzahl: 126 },
    { schnitt: '4,4', anzahl: 30 },
    { schnitt: '5,0', anzahl: 1 },
    { schnitt: '4,8', anzahl: 1234 },
  ];

  it('rendert dieselbe Zeile', () => {
    for (const s of staende) {
      expect(edge.bewertungsZeileHtml(s)).toBe(bewertungsZeileHtml(s));
      expect(edge.bewertungsZeileHtml(s, 32)).toBe(bewertungsZeileHtml(s, 32));
    }
  });

  it('prüft gleich und hat dieselben Konstanten', () => {
    const payloads: unknown[] = [GUELTIG, { ...GUELTIG, schnitt: '4.9' }, { ...GUELTIG, anzahl: 0 }, null, 'x'];
    for (const p of payloads) expect(edge.pruefeBewertungsStand(p)).toEqual(pruefeBewertungsStand(p));
    expect(edge.BEWERTUNGS_STAND_ERSATZ).toEqual(BEWERTUNGS_STAND_ERSATZ);
    expect(edge.BEWERTUNGS_STAND_URL).toBe(BEWERTUNGS_STAND_URL);
    expect(edge.ERFAHRUNGEN_URL).toBe(ERFAHRUNGEN_URL);
  });
});
