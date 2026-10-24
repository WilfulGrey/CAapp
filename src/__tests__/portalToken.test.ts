import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { portalToken, PORTAL_TOKEN_STORAGE_KEY } from '../lib/portalToken';

// Registry #134: der Zugangsschlüssel darf nicht in der Adresse stehen, wenn
// GTM (Google Analytics, Clarity) die Seite meldet. index.html nimmt ihn vor
// dem GTM-Snippet heraus; das Portal liest ihn über portalToken().

const TOKEN = 'Ab3dEf6hIj9lMn2pQr5tUv8xYz1bCd4f';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const skripte = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const ausAdresse = skripte.find((s) => s.includes('pm_portal_token'));

function adresse(pfad: string) {
  window.history.replaceState(null, '', pfad);
}

function skriptAusfuehren() {
  if (!ausAdresse) throw new Error('Skript in index.html fehlt');
  // eslint-disable-next-line no-new-func
  new Function(ausAdresse)();
}

describe('index.html: Schlüssel vor GTM aus der Adresse', () => {
  beforeEach(() => {
    delete window.__pmPortalToken;
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    adresse('/');
  });

  it('steht vor dem GTM-Snippet', () => {
    const posSkript = html.indexOf('pm_portal_token');
    const posGtm = html.indexOf('googletagmanager.com/gtm.js');
    expect(posSkript).toBeGreaterThan(0);
    expect(posSkript).toBeLessThan(posGtm);
  });

  it('nimmt den Schlüssel heraus und lässt die übrigen Parameter stehen', () => {
    adresse(`/?token=${TOKEN}&m=eb&goto=anfragen#stand`);
    skriptAusfuehren();
    expect(window.location.search).toBe('?m=eb&goto=anfragen');
    expect(window.location.hash).toBe('#stand');
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.__pmPortalToken).toBe(TOKEN);
    expect(window.localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY)).toBe(TOKEN);
  });

  it('ohne Schlüssel in der Adresse ändert es nichts', () => {
    window.localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, 'alt');
    adresse('/?view=jobs');
    skriptAusfuehren();
    expect(window.location.search).toBe('?view=jobs');
    expect(window.__pmPortalToken).toBeUndefined();
    expect(window.localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY)).toBe('alt');
  });

  it('ein neuer Mail-Link überschreibt einen gespeicherten Schlüssel', () => {
    window.localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, 'alt');
    adresse(`/?token=${TOKEN}`);
    skriptAusfuehren();
    expect(window.localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY)).toBe(TOKEN);
    expect(portalToken()).toBe(TOKEN);
  });

  it('verweigert der Browser den Speicher, bleibt die Adresse wie bisher', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    adresse(`/?token=${TOKEN}`);
    skriptAusfuehren();
    expect(window.location.search).toBe(`?token=${TOKEN}`);
    expect(portalToken()).toBe(TOKEN);
  });
});

describe('portalToken()', () => {
  beforeEach(() => {
    delete window.__pmPortalToken;
    window.localStorage.clear();
    adresse('/');
  });

  it('nimmt zuerst den Schlüssel dieses Seitenaufrufs', () => {
    window.__pmPortalToken = TOKEN;
    adresse('/?token=anders');
    window.localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, 'gespeichert');
    expect(portalToken()).toBe(TOKEN);
  });

  it('dann die Adresse (Tests, alter Stand ohne Skript)', () => {
    adresse('/?token=ausAdresse');
    window.localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, 'gespeichert');
    expect(portalToken()).toBe('ausAdresse');
  });

  it('dann den gespeicherten Schlüssel (Neuladen, Lesezeichen ohne Schlüssel)', () => {
    window.localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, 'gespeichert');
    expect(portalToken()).toBe('gespeichert');
  });

  it('ohne alles: null', () => {
    expect(portalToken()).toBeNull();
  });

  it('gesperrter Speicher wirft nicht', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(portalToken()).toBeNull();
    vi.restoreAllMocks();
  });
});
