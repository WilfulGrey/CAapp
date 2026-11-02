import { describe, it, expect } from 'vitest';
import { fehlerKurz, geraetKlasse, neuBelegteFelder } from '../lib/messWerte';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

describe('geraetKlasse', () => {
  it('trennt Gerät, Browser und In-App-Browser', () => {
    expect(geraetKlasse(IPHONE_SAFARI, 664)).toEqual({ geraet: 'iphone', browser: 'safari', in_app: false, hoehe: 'unter_700' });
    expect(geraetKlasse(IPHONE_APP, 590)).toEqual({ geraet: 'iphone', browser: 'sonst', in_app: true, hoehe: 'unter_600' });
    expect(geraetKlasse(ANDROID_CHROME, 780)).toEqual({ geraet: 'android', browser: 'chrome', in_app: false, hoehe: 'unter_800' });
    expect(geraetKlasse(ANDROID_WEBVIEW, 780)).toMatchObject({ geraet: 'android', in_app: true });
    expect(geraetKlasse(SAMSUNG, 900)).toEqual({ geraet: 'android', browser: 'samsung', in_app: false, hoehe: 'ab_800' });
  });

  it('iPad meldet sich als Macintosh, nur Touch-Punkte verraten es', () => {
    expect(geraetKlasse(MAC, 900, true).geraet).toBe('ipad');
    expect(geraetKlasse(MAC, 900, false).geraet).toBe('computer');
  });
});

describe('fehlerKurz', () => {
  it('lässt keine Adresse, Zahl oder zitierten Inhalt durch', () => {
    const text = fehlerKurz('Save failed for anna@example.com at https://x.de/a?b=1 plz 80331 "Demenz seit 2019"');
    for (const wert of ['anna@example.com', 'x.de', '80331', 'Demenz', '2019']) expect(text).not.toContain(wert);
  });

  it('schneidet ab dem ersten Anführungszeichen ab, auch verschachtelt oder als JSON', () => {
    for (const roh of [
      'Unexpected token x, "{"name":"Hans Müller"}x" is not valid JSON',
      'MamamiaError 502: {"error":"x {\\"message\\":\\"Hans Müller invalid\\"}"}',
      '"Hans \'Hansi\' Müller"',
      'Fehler vorname.nachname @ example.de',
    ]) {
      const text = fehlerKurz(roh);
      for (const wert of ['Hans', 'Müller', 'example.de', 'nachname']) expect(text).not.toContain(wert);
    }
  });

  it('Safari-Fehler bleiben unterscheidbar', () => {
    expect(fehlerKurz("Can't find variable: gtag")).toBe('Can’t find variable: gtag');
    expect(fehlerKurz("Can't find variable: dataLayer")).not.toBe(fehlerKurz("Can't find variable: gtag"));
  });

  it('behält den Fehlertyp lesbar und kappt auf 100 Zeichen', () => {
    expect(fehlerKurz('Cannot read properties of undefined')).toBe('Cannot read properties of undefined');
    expect(fehlerKurz('x'.repeat(500))).toHaveLength(100);
    expect(fehlerKurz(undefined)).toBe('');
  });
});

describe('neuBelegteFelder', () => {
  it('meldet nur den Wechsel von leer auf belegt, nur Schlüssel', () => {
    expect(neuBelegteFelder(
      { geschlecht: '', geburtsjahr: '1944', listen: [], flag: false, _isDraft: false },
      { geschlecht: 'Weiblich', geburtsjahr: '1945', listen: ['a'], flag: true, _isDraft: true },
    )).toEqual(['geschlecht', 'listen', 'flag']);
  });

  it('Leeren ist keine Wahl', () => {
    expect(neuBelegteFelder({ geschlecht: 'Weiblich' }, { geschlecht: '' })).toEqual([]);
  });
});
