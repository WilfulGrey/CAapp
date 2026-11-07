/**
 * rueckrufAnfordern (src/lib/rueckruf.ts, Registry #147): „Rückruf vereinbaren“ im Minimal-Einstieg schickt die Bitte an
 * die Rückmelde-Route des Kostenrechners und WARTET auf die Antwort — das Portal bestätigt nur nach 2xx. Wirft nie.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let rueckrufAnfordern: typeof import('../lib/rueckruf').rueckrufAnfordern;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_KOSTENRECHNER_URL', 'https://kr.test');
  rueckrufAnfordern = (await import('../lib/rueckruf')).rueckrufAnfordern;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('rueckrufAnfordern', () => {
  it('POST an /api/rueckmeldung mit genau { token, aktion: rueckruf, quelle: portal_einstieg }, ohne Cookies', async () => {
    expect(await rueckrufAnfordern('token-abc-123')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://kr.test/api/rueckmeldung');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ token: 'token-abc-123', aktion: 'rueckruf', quelle: 'portal_einstieg' });
    expect(init.credentials).toBeUndefined();
  });

  it('nur 2xx zählt: 404/500/502 ⇒ false', async () => {
    for (const status of [404, 500, 502]) {
      fetchMock.mockResolvedValueOnce({ ok: false, status });
      expect(await rueckrufAnfordern('token-abc-123')).toBe(false);
    }
  });

  it('Netzfehler ⇒ false, ohne zu werfen', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(rueckrufAnfordern('token-abc-123')).resolves.toBe(false);
  });

  it('Vorschau-Token und fehlender Token: kein Netz', async () => {
    expect(await rueckrufAnfordern('preview-token')).toBe(false);
    expect(await rueckrufAnfordern(null)).toBe(false);
    expect(await rueckrufAnfordern('')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
