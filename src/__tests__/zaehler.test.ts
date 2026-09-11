import { beforeEach, describe, expect, it } from 'vitest';
import { pruefeZaehler, zaehle, zaehlerZuruecksetzen, ZAEHLER_PFAD } from '../../project 3/lib/zaehler';

describe('Anonyme Wizard-Zähler', () => {
  beforeEach(() => zaehlerZuruecksetzen());

  it('nimmt nur bekannte Ereignisse und Varianten an', () => {
    expect(pruefeZaehler({ ereignis: 'schritt_9', variante: 'vorschau' })).toEqual({ ereignis: 'schritt_9', variante: 'vorschau' });
    expect(pruefeZaehler({ ereignis: 'abgeschickt', variante: 'alt' })).toEqual({ ereignis: 'abgeschickt', variante: 'alt' });
    expect(pruefeZaehler({ ereignis: 'schritt_10', variante: 'vorschau' })).toBeNull();
    expect(pruefeZaehler({ ereignis: 'schritt_9', variante: 'x', email: 'a@b.de' })).toBeNull();
    expect(pruefeZaehler('nein')).toBeNull();
    expect(pruefeZaehler(null)).toBeNull();
  });

  it('schickt nur Ereignis und Variante — nichts Persönliches — und zählt je Seitenaufruf einmal', async () => {
    const gesendet: string[] = [];
    const sender = { sendBeacon: (_url: string, data: Blob) => { gesendet.push(_url); void data; return true; } };
    expect(zaehle('schritt_9', 'vorschau', sender)).toBe(true);
    expect(zaehle('schritt_9', 'vorschau', sender)).toBe(false);
    expect(zaehle('cta_geklickt', 'vorschau', sender)).toBe(true);
    expect(gesendet).toEqual([ZAEHLER_PFAD, ZAEHLER_PFAD]);
  });

  it('fällt auf fetch mit keepalive zurück, wenn sendBeacon fehlt', async () => {
    const aufrufe: Array<{ url: string; init: RequestInit }> = [];
    const sender = { fetch: ((url: string, init: RequestInit) => { aufrufe.push({ url, init }); return Promise.resolve(new Response(null, { status: 204 })); }) as unknown as typeof fetch };
    expect(zaehle('abgeschickt', 'alt', sender)).toBe(true);
    expect(aufrufe[0].url).toBe(ZAEHLER_PFAD);
    expect(aufrufe[0].init.keepalive).toBe(true);
    expect(JSON.parse(String(aufrufe[0].init.body))).toEqual({ ereignis: 'abgeschickt', variante: 'alt' });
  });
});
