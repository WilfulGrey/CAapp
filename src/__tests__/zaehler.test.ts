import { beforeEach, describe, expect, it } from 'vitest';
import { pruefeZaehler, zaehle, zaehlerQuelle, zaehlerZuruecksetzen, ZAEHLER_PFAD } from '../../project 3/lib/zaehler';
import { geraeteTyp, zaehlerGeraetAus } from '../../project 3/lib/geraet';

describe('Anonyme Wizard-Zähler', () => {
  beforeEach(() => zaehlerZuruecksetzen());

  it('nimmt nur bekannte Ereignisse und Varianten an', () => {
    expect(pruefeZaehler({ ereignis: 'schritt_9', variante: 'vorschau' })).toEqual({ ereignis: 'schritt_9', variante: 'vorschau', quelle: 'sonst', geraet: 'unbekannt' });
    expect(pruefeZaehler({ ereignis: 'abgeschickt', variante: 'alt', quelle: 'chatgpt' })).toEqual({ ereignis: 'abgeschickt', variante: 'alt', quelle: 'chatgpt', geraet: 'unbekannt' });
    expect(pruefeZaehler({ ereignis: 'abgeschickt', variante: 'alt', quelle: 'bing' })).toBeNull();
    expect(pruefeZaehler({ ereignis: 'schritt_10', variante: 'vorschau' })).toBeNull();
    // Kontakt in drei Schritten (Registry #76): Teilschritte, Ausgang, Variante `stufen`
    expect(pruefeZaehler({ ereignis: 'kontakt_email', variante: 'stufen', quelle: 'google' })).toEqual({ ereignis: 'kontakt_email', variante: 'stufen', quelle: 'google', geraet: 'unbekannt' });
    expect(pruefeZaehler({ ereignis: 'absenden_fehler', variante: 'alt' })).toEqual({ ereignis: 'absenden_fehler', variante: 'alt', quelle: 'sonst', geraet: 'unbekannt' });
    expect(pruefeZaehler({ ereignis: 'ohne_telefon', variante: 'stufen' })).toEqual({ ereignis: 'ohne_telefon', variante: 'stufen', quelle: 'sonst', geraet: 'unbekannt' });
    // Preis zuerst (Registry #77): Preisseite, Knopf zur Kontaktabfrage, Variante `preis`
    expect(pruefeZaehler({ ereignis: 'preis_gesehen', variante: 'preis', quelle: 'google' })).toEqual({ ereignis: 'preis_gesehen', variante: 'preis', quelle: 'google', geraet: 'unbekannt' });
    expect(pruefeZaehler({ ereignis: 'kontakt_geoeffnet', variante: 'preis' })).toEqual({ ereignis: 'kontakt_geoeffnet', variante: 'preis', quelle: 'sonst', geraet: 'unbekannt' });
    expect(pruefeZaehler({ ereignis: 'preis_fehler', variante: 'preis' })).toEqual({ ereignis: 'preis_fehler', variante: 'preis', quelle: 'sonst', geraet: 'unbekannt' });
    expect(pruefeZaehler({ ereignis: 'kontakt_email', variante: 'neu' })).toBeNull();
    expect(pruefeZaehler({ ereignis: 'garantie_geoeffnet', variante: 'vorschau', quelle: 'google' })).toEqual({ ereignis: 'garantie_geoeffnet', variante: 'vorschau', quelle: 'google', geraet: 'unbekannt' });
    expect(pruefeZaehler({ ereignis: 'garantie_weiter', variante: 'alt', quelle: 'sonst' })).toEqual({ ereignis: 'garantie_weiter', variante: 'alt', quelle: 'sonst', geraet: 'unbekannt' });
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
    // Test-Umgebung: kein Verweis, keine Anzeigen-Parameter → direkt; jsdom-User-Agent → desktop.
    expect(JSON.parse(String(aufrufe[0].init.body))).toEqual({ ereignis: 'abgeschickt', variante: 'alt', quelle: 'direkt', geraet: 'desktop' });
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
    expect(JSON.parse(gesendet[0])).toEqual({ ereignis: 'schritt_1', variante: 'vorschau', quelle: 'chatgpt', geraet: 'desktop' });
  });

  it('trennt Website, direkt und sonst — Anzeigen gehen vor (Registry #103)', () => {
    expect(zaehlerQuelle({}, '?start=1&src=apex-startseite', { website: true })).toBe('website');
    expect(zaehlerQuelle({ gclid: 'abc' }, '', { website: true })).toBe('google');
    expect(zaehlerQuelle(null, '?oppref=x', { website: true, einstieg: 'direkt' })).toBe('chatgpt');
    expect(zaehlerQuelle({}, '', { einstieg: 'direkt' })).toBe('direkt');
    expect(zaehlerQuelle({}, '', { einstieg: 'verweis' })).toBe('sonst');
    expect(zaehlerQuelle({}, '', { einstieg: null })).toBe('sonst');
  });

  it('nimmt das Gerät nur als Klasse an — mobil oder desktop, alte Rechner ohne Feld zählen als unbekannt', () => {
    expect(pruefeZaehler({ ereignis: 'schritt_2', variante: 'alt', quelle: 'website', geraet: 'mobil' })).toEqual({ ereignis: 'schritt_2', variante: 'alt', quelle: 'website', geraet: 'mobil' });
    expect(pruefeZaehler({ ereignis: 'schritt_2', variante: 'alt', quelle: 'direkt', geraet: 'desktop' })).toEqual({ ereignis: 'schritt_2', variante: 'alt', quelle: 'direkt', geraet: 'desktop' });
    expect(pruefeZaehler({ ereignis: 'schritt_2', variante: 'alt', quelle: 'website' })).toEqual({ ereignis: 'schritt_2', variante: 'alt', quelle: 'website', geraet: 'unbekannt' });
    expect(pruefeZaehler({ ereignis: 'schritt_2', variante: 'alt', geraet: 'tablet' })).toBeNull();
    expect(pruefeZaehler({ ereignis: 'schritt_2', variante: 'alt', geraet: 'Mozilla/5.0 (iPhone)' })).toBeNull();
  });

  it('teilt Geräte wie die Sitzungen ein; Handy und Tablet zählen als mobil', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
    const android = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';
    const androidTablet = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
    const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
    expect([iphone, android, androidTablet, mac, windows].map(geraeteTyp)).toEqual(['mobile', 'mobile', 'tablet', 'desktop', 'desktop']);
    expect([iphone, android, androidTablet, mac, windows].map(zaehlerGeraetAus)).toEqual(['mobil', 'mobil', 'mobil', 'desktop', 'desktop']);
  });
});
