import { describe, it, expect, beforeEach, vi } from 'vitest';
/* Cross-App-Import (pures Modul, Muster wie pflegena.test.ts): die Cookie-Leiste des
 * Kostenrechners teilt sich seit Registry #99 die Wahl mit primundus.de über das Cookie
 * `pm_consent` auf .primundus.de. Der Manager ist ein Singleton, das beim Import lädt —
 * deshalb holt jeder Test das Modul frisch. */

type Wahl = { necessary: boolean; analytics: boolean; marketing: boolean };

async function frischerManager() {
  vi.resetModules();
  return (await import('../../project 3/lib/cookie-consent')).cookieConsent;
}

function setzeCookie(wert: string) {
  document.cookie = `pm_consent=${wert}; Path=/`;
}

function cookieWert(): Wahl | null {
  const teil = document.cookie.split('; ').find((c) => c.startsWith('pm_consent='));
  return teil ? JSON.parse(decodeURIComponent(teil.slice('pm_consent='.length))) : null;
}

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'pm_consent=; Max-Age=0; Path=/';
});

describe('Cookie-Leiste: Wahl von primundus.de übernehmen (pm_consent)', () => {
  it('ohne Speicher und ohne Cookie: keine Wahl — die Leiste erscheint', async () => {
    const m = await frischerManager();
    expect(m.hasConsent()).toBe(false);
  });

  it('Cookie von primundus.de, kein eigener Speicher: Wahl gilt, keine zweite Leiste', async () => {
    setzeCookie(encodeURIComponent(JSON.stringify({ necessary: true, analytics: true, marketing: false })));
    const m = await frischerManager();
    expect(m.hasConsent()).toBe(true);
    expect(m.hasCategory('analytics')).toBe(true);
    expect(m.hasCategory('marketing')).toBe(false);
  });

  it('„Nur notwendige“ auf primundus.de bleibt „Nur notwendige“ im Rechner', async () => {
    setzeCookie(encodeURIComponent(JSON.stringify({ necessary: true, analytics: false, marketing: false })));
    const m = await frischerManager();
    expect(m.hasConsent()).toBe(true);
    expect(m.hasCategory('analytics')).toBe(false);
    expect(m.hasCategory('marketing')).toBe(false);
  });

  it('eigener Speicher des Rechners geht vor (wie auf primundus.de)', async () => {
    localStorage.setItem('primundus_cookie_consent', JSON.stringify({
      version: '1.0', consent: { necessary: true, analytics: false, marketing: false },
    }));
    setzeCookie(encodeURIComponent(JSON.stringify({ necessary: true, analytics: true, marketing: true })));
    const m = await frischerManager();
    expect(m.hasCategory('analytics')).toBe(false);
  });

  it('kaputtes oder fremdes Cookie zählt nicht als Wahl', async () => {
    setzeCookie('kein-json');
    expect((await frischerManager()).hasConsent()).toBe(false);
    setzeCookie(encodeURIComponent(JSON.stringify({ analytics: true })));
    expect((await frischerManager()).hasConsent()).toBe(false);
  });

  it('nur echte true-Werte schalten eine Kategorie ein', async () => {
    setzeCookie(encodeURIComponent(JSON.stringify({ necessary: true, analytics: 'ja', marketing: 1 })));
    const m = await frischerManager();
    expect(m.hasConsent()).toBe(true);
    expect(m.hasCategory('analytics')).toBe(false);
    expect(m.hasCategory('marketing')).toBe(false);
  });
});

describe('Cookie-Leiste: Wahl im Rechner an primundus.de weitergeben', () => {
  it('„Alle akzeptieren“ schreibt pm_consent', async () => {
    const m = await frischerManager();
    m.acceptAll();
    expect(cookieWert()).toMatchObject({ necessary: true, analytics: true, marketing: true });
  });

  it('„Nur notwendige“ schreibt pm_consent ohne Analyse und Marketing', async () => {
    const m = await frischerManager();
    m.acceptNecessary();
    expect(cookieWert()).toMatchObject({ necessary: true, analytics: false, marketing: false });
  });

  it('Widerruf löscht pm_consent — die Leiste erscheint auf beiden Seiten wieder', async () => {
    const m = await frischerManager();
    m.acceptAll();
    m.revokeConsent();
    expect(cookieWert()).toBeNull();
    expect((await frischerManager()).hasConsent()).toBe(false);
  });
});
