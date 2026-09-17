/**
 * Bewertungsstand für die Sterne in Martas Karte (Martin, 17.09.2026;
 * Darstellung: martaKarte.test.ts).
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
  it('prüft gleich und hat dieselben Konstanten', () => {
    const payloads: unknown[] = [GUELTIG, { ...GUELTIG, schnitt: '4.9' }, { ...GUELTIG, anzahl: 0 }, null, 'x'];
    for (const p of payloads) expect(edge.pruefeBewertungsStand(p)).toEqual(pruefeBewertungsStand(p));
    expect(edge.BEWERTUNGS_STAND_ERSATZ).toEqual(BEWERTUNGS_STAND_ERSATZ);
    expect(edge.BEWERTUNGS_STAND_URL).toBe(BEWERTUNGS_STAND_URL);
    expect(edge.ERFAHRUNGEN_URL).toBe(ERFAHRUNGEN_URL);
    expect(ERFAHRUNGEN_URL).toBe('https://primundus.de/erfahrungen');
  });
});
