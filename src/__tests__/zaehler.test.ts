import { beforeEach, describe, expect, it } from 'vitest';
import { pruefeZaehler, zaehle, zaehlerQuelle, zaehlerZuruecksetzen, ZAEHLER_PFAD } from '../../project 3/lib/zaehler';

describe('Anonyme Wizard-Zähler', () => {
  beforeEach(() => zaehlerZuruecksetzen());

  it('nimmt nur bekannte Ereignisse und Varianten an', () => {
    expect(pruefeZaehler({ ereignis: 'schritt_9', variante: 'vorschau' })).toEqual({ ereignis: 'schritt_9', variante: 'vorschau', quelle: 'sonst' });
    expect(pruefeZaehler({ ereignis: 'abgeschickt', variante: 'alt', quelle: 'chatgpt' })).toEqual({ ereignis: 'abgeschickt', variante: 'alt', quelle: 'chatgpt' });
    expect(pruefeZaehler({ ereignis: 'abgeschickt', variante: 'alt', quelle: 'bing' })).toBeNull();
    expect(pruefeZaehler({ ereignis: 'schritt_10', variante: 'vorschau' })).toBeNull();
    expect(pruefeZaehler({ ereignis: 'garantie_geoeffnet', variante: 'vorschau', quelle: 'google' })).toEqual({ ereignis: 'garantie_geoeffnet', variante: 'vorschau', quelle: 'google' });
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
    expect(JSON.parse(String(aufrufe[0].init.body))).toEqual({ ereignis: 'abgeschickt', variante: 'alt', quelle: 'sonst' });
  });

  it('ordnet die Quelle grob zu: ChatGPT vor Google vor sonst, aus Parametern oder URL', () => {
    expect(zaehlerQuelle({ utm_source: 'chatgpt', utm_medium: 'cpc' })).toBe('chatgpt');
    expect(zaehlerQuelle(null, '?oppref=gAAAA&olref=x')).toBe('chatgpt');
    expect(zaehlerQuelle({ gclid: 'abc' })).toBe('google');
    expect(zaehlerQuelle(null, '?wbraid=1')).toBe('google');
    expect(zaehlerQuelle({ utm_source: 'Google' })).toBe('google');
    expect(zaehlerQuelle({}, '?start=1')).toBe('sonst');
    expect(zaehlerQuelle(undefined)).toBe('sonst');
    const gesendet: string[] = [];
    const sender = { fetch: ((_u: string, init: RequestInit) => { gesendet.push(String(init.body)); return Promise.resolve(new Response(null, { status: 204 })); }) as unknown as typeof fetch };
    zaehle('schritt_1', 'vorschau', sender, 'chatgpt');
    expect(JSON.parse(gesendet[0])).toEqual({ ereignis: 'schritt_1', variante: 'vorschau', quelle: 'chatgpt' });
  });
});
