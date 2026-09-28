/*
 * Automatische Prüfläufe zählen nicht (Registry #104, 28.09.2026).
 *
 * Am 27.09. waren 8 der 9 „Website-Besucher" im Rechner unsere eigenen
 * Playwright-Läufe, der Frage-1-Zähler bestand nur aus ihnen. Jeder
 * automatisierte Browser meldet navigator.webdriver === true; der Server
 * erkennt markierte Läufe am User-Agent. Beides wird hier festgehalten —
 * ein Ausfall wäre von außen unsichtbar, nur die Zahlen wären wieder falsch.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { istPruefAnfrage, istPruefbrowser } from '../../project 3/lib/pruefbrowser';
import { zaehle, zaehlerZuruecksetzen } from '../../project 3/lib/zaehler';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const HEADLESS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36';
const WURZEL = join(__dirname, '..', '..', 'project 3');

describe('Prüfläufe erkennen', () => {
  it('erkennt automatisierte Browser an navigator.webdriver und markierte am User-Agent', () => {
    expect(istPruefbrowser({ webdriver: true, userAgent: IPHONE })).toBe(true);
    expect(istPruefbrowser({ webdriver: false, userAgent: HEADLESS })).toBe(true);
    expect(istPruefbrowser({ webdriver: false, userAgent: IPHONE + ' PrimundusPruefung' })).toBe(true);
    expect(istPruefbrowser({ webdriver: false, userAgent: IPHONE })).toBe(false);
    expect(istPruefbrowser({ userAgent: IPHONE })).toBe(false);
    expect(istPruefbrowser(undefined)).toBe(false);
  });

  it('erkennt markierte Anfragen auf dem Server nur am User-Agent', () => {
    expect(istPruefAnfrage(HEADLESS)).toBe(true);
    expect(istPruefAnfrage('Mozilla/5.0 PrimundusPruefung')).toBe(true);
    expect(istPruefAnfrage(IPHONE)).toBe(false);
    expect(istPruefAnfrage(null)).toBe(false);
    expect(istPruefAnfrage(undefined)).toBe(false);
  });
});

describe('Prüfläufe senden nichts', () => {
  afterEach(() => {
    Object.defineProperty(window.navigator, 'webdriver', { value: false, configurable: true });
    zaehlerZuruecksetzen();
  });

  it('der Zähler schweigt in einem automatisierten Browser', () => {
    const gesendet: string[] = [];
    const sender = { sendBeacon: (url: string) => { gesendet.push(url); return true; } };
    Object.defineProperty(window.navigator, 'webdriver', { value: true, configurable: true });
    expect(zaehle('schritt_1', 'alt', sender)).toBe(false);
    expect(gesendet).toEqual([]);
    Object.defineProperty(window.navigator, 'webdriver', { value: false, configurable: true });
    expect(zaehle('schritt_1', 'alt', sender)).toBe(true);
    expect(gesendet).toHaveLength(1);
  });

  it('die Messung legt in einem automatisierten Browser keine Sitzung an', () => {
    const code = readFileSync(join(WURZEL, 'lib', 'analytics.ts'), 'utf8');
    const init = code.slice(code.indexOf('async init()'));
    const sperre = init.indexOf('if (istPruefbrowser()) return;');
    expect(sperre, 'Sperre in init() fehlt').toBeGreaterThan(-1);
    expect(sperre).toBeLessThan(init.indexOf('createOrUpdateSession('));
    expect(code).toMatch(/async function senden\([\s\S]{0,200}if \(istPruefbrowser\(\)\) return null;/);
  });

  it.each(['collect', 'page-time', 'critical-event', 'zaehler'])('Route /api/analytics/%s verwirft markierte Prüfläufe, bevor sie schreibt', (route) => {
    const code = readFileSync(join(WURZEL, 'app', 'api', 'analytics', route, 'route.ts'), 'utf8');
    const sperre = code.indexOf("istPruefAnfrage(request.headers.get('user-agent'))");
    expect(sperre, 'Sperre fehlt').toBeGreaterThan(-1);
    const schreiben = Math.min(...['.from(', 'rpc/', 'request.json()'].map((m) => code.indexOf(m, sperre > 0 ? 0 : 0)).filter((i) => i > -1));
    expect(sperre).toBeLessThan(schreiben);
  });
});
