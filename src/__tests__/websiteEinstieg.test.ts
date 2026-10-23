/*
 * Einstieg auf primundus.de (Registry #120, 09.10.2026).
 *
 * Bei 11 von 32 Website-Anfragen (11.09.–08.10.) fehlte die Seite, und ob jemand über Google oder direkt kam, speicherte
 * niemand. primundus.de hängt jetzt beim Klick in den Rechner `ein` (erste Seite) und `her` (Art der Herkunft) an den Link;
 * der Rechner nimmt beides an, hält es im Arbeitsspeicher und legt es je Absendung als Ereignis `website_einstieg` ab.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EINSTIEG_HERKUNFT,
  websiteEinstiegAusAdresse,
  websiteEinstiegBereinigen,
  websiteEinstiegEreignis,
} from '../../project 3/lib/website-einstieg';

const P3 = join(__dirname, '..', '..', 'project 3');

describe('Einstieg auf primundus.de: Prüfung', () => {
  it('nimmt bekannte Klassen und Pfade nach Muster an', () => {
    expect(websiteEinstiegBereinigen({ pfad: '/kosten', herkunft: 'google' })).toEqual({ pfad: '/kosten', herkunft: 'google' });
    expect(websiteEinstiegBereinigen({ pfad: '/', herkunft: 'direkt' })).toEqual({ pfad: '/', herkunft: 'direkt' });
  });

  it('verwirft unbekannte Klassen ganz und unpassende Pfade einzeln', () => {
    expect(websiteEinstiegBereinigen({ pfad: '/kosten', herkunft: 'https://www.google.com/' })).toBeNull();
    expect(websiteEinstiegBereinigen({ pfad: '/kosten', herkunft: 'GOOGLE' })).toBeNull();
    expect(websiteEinstiegBereinigen({ pfad: '/k?x=1', herkunft: 'google' })).toEqual({ pfad: null, herkunft: 'google' });
    expect(websiteEinstiegBereinigen({ pfad: '/' + 'a'.repeat(81), herkunft: 'google' })).toEqual({ pfad: null, herkunft: 'google' });
    expect(websiteEinstiegBereinigen({ pfad: 42, herkunft: 'intern' })).toEqual({ pfad: null, herkunft: 'intern' });
    expect(websiteEinstiegBereinigen(null)).toBeNull();
    expect(websiteEinstiegBereinigen('google')).toBeNull();
  });

  it('übernimmt nur Pfad und Klasse, keine weiteren Felder', () => {
    expect(websiteEinstiegBereinigen({ pfad: '/kosten', herkunft: 'bing', verweis: 'https://www.bing.com/search?q=x' }))
      .toEqual({ pfad: '/kosten', herkunft: 'bing' });
  });

  it('liest die Werte aus der Rechner-Adresse, wie primundus.de sie anhängt', () => {
    expect(websiteEinstiegAusAdresse('?start=1&src=apex-components&ein=%2Fkosten&her=google'))
      .toEqual({ pfad: '/kosten', herkunft: 'google' });
    expect(websiteEinstiegAusAdresse('?start=1&src=apex-components&her=intern')).toEqual({ pfad: null, herkunft: 'intern' });
    expect(websiteEinstiegAusAdresse('?start=1&src=apex-components')).toBeNull();
    expect(websiteEinstiegAusAdresse('')).toBeNull();
  });

  it('kennt dieselben Klassen wie primundus.de (lib/einstieg.ts, HERKUNFT)', () => {
    expect([...EINSTIEG_HERKUNFT]).toEqual(['google', 'anzeige', 'bing', 'ki', 'suche', 'sozial', 'andere', 'direkt', 'intern', 'unbekannt']);
  });

  it('beschreibt Art und Quelle der Absendung im Ereignis', () => {
    const e = { pfad: '/kosten', herkunft: 'google' as const };
    expect(websiteEinstiegEreignis(e, { isNew: true, isUpgrade: false }, 'website:apex-components'))
      .toEqual({ pfad: '/kosten', herkunft: 'google', art: 'neu', quelle: 'website:apex-components' });
    expect(websiteEinstiegEreignis(e, { isNew: false, isUpgrade: true }, 'website:apex-kosten').art).toBe('hochgestuft');
    expect(websiteEinstiegEreignis(e, { isNew: false, isUpgrade: false }, 'website:apex-kosten').art).toBe('duplikat');
  });
});

describe('Einstieg auf primundus.de: im Rechner nur im Arbeitsspeicher', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('behält den Einstieg über einen Seitenwechsel ohne Neuladen (Bestpreisgarantie → Fragebogen)', async () => {
    const m = await import('../../project 3/lib/website-einstieg');
    window.history.replaceState(null, '', '/bestpreisgarantie?src=apex-garantie&ein=%2F24h-pflege-muenchen&her=google');
    m.websiteEinstiegMerken();
    window.history.replaceState(null, '', '/?start=1&src=garantie');
    expect(m.websiteEinstieg()).toEqual({ pfad: '/24h-pflege-muenchen', herkunft: 'google' });
  });

  it('legt dafür nichts auf dem Gerät ab', async () => {
    const m = await import('../../project 3/lib/website-einstieg');
    window.history.replaceState(null, '', '/?start=1&src=apex-components&ein=%2Fkosten&her=direkt');
    m.websiteEinstiegMerken();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('ohne gemerkten Einstieg zählt die aktuelle Adresse, ohne Werte gibt es keinen', async () => {
    const m = await import('../../project 3/lib/website-einstieg');
    expect(m.websiteEinstieg()).toBeNull();
    window.history.replaceState(null, '', '/?start=1&src=apex-kosten&ein=%2Fkosten&her=bing');
    expect(m.websiteEinstieg()).toEqual({ pfad: '/kosten', herkunft: 'bing' });
  });
});

describe('Einstieg auf primundus.de: Anschluss im Rechner', () => {
  it('die Absende-Route prüft den Wert und schreibt das Ereignis zu JEDER Absendung nach der Lead-Suche', () => {
    const code = readFileSync(join(P3, 'app', 'api', 'angebot-anfordern', 'route.ts'), 'utf8');
    expect(code).toMatch(/websiteEinstiegBereinigen\(websiteEinstieg\)/);
    const suche = code.indexOf('await findOrCreateLead(');
    const ereignis = code.indexOf("'website_einstieg'");
    expect(suche).toBeGreaterThan(-1);
    expect(ereignis).toBeGreaterThan(suche);
    // Nicht nur bei neuen Leads: keine Bedingung auf isNew/isUpgrade dazwischen.
    expect(code.slice(suche, ereignis)).not.toMatch(/if\s*\(\s*!?\s*(isNew|isUpgrade)/);
  });

  it('das Formular schickt den Einstieg mit, der Provider merkt ihn vor der Messung', () => {
    const formular = readFileSync(join(P3, 'components', 'calculator', 'MultiStepForm.tsx'), 'utf8');
    expect(formular).toMatch(/websiteEinstieg: websiteEinstieg\(\),/);
    const provider = readFileSync(join(P3, 'components', 'AnalyticsProvider.tsx'), 'utf8');
    expect(provider.indexOf('websiteEinstiegMerken();')).toBeGreaterThan(-1);
    expect(provider.indexOf('websiteEinstiegMerken();')).toBeLessThan(provider.indexOf('initAnalytics();'));
  });
});
