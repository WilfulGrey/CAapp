/** @vitest-environment jsdom */
// Gebucht-Seite neu, Vorschau ?preview=gebucht (echte Kunden: gebuchtEcht.test.tsx). Die Adresse wird beim Laden des
// Moduls gelesen, darum steht sie VOR dem Import (vi.hoisted). Fantasie-Nummer statt der echten Notfallnummer; die RPC
// notfall_telefon darf in der Vorschau nie laufen (Registry #139).
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';

vi.hoisted(() => { window.history.replaceState({}, '', '/?preview=gebucht&zustand=im-einsatz&notfall=%2B48%20123%20456%20789'); });
const { notfallRpc } = vi.hoisted(() => ({ notfallRpc: vi.fn(async () => '+48 999 999 999') }));
vi.mock('../../lib/supabase', async () => ({
  ...(await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase')),
  fetchNotfallTelefon: notfallRpc,
}));

import CustomerPortalPage from '../../pages/CustomerPortalPage';

beforeAll(() => {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
  if (!('IntersectionObserver' in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
  }
});

describe('?preview=gebucht zeigt die neue Gebucht-Seite', () => {
  it('Zustand „im Einsatz": Karte „Ihr Einsatz" vor dem Kontakt mit Notfallfeld, keine Satz-Überschrift, kein alter Kopf; Hilfe-Blatt mit Notfallfeld unter der Kopfzeile', async () => {
    server.use(
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
      http.post('https://test.supabase.co/functions/v1/onboard-to-mamamia', () => HttpResponse.json({ error: 'no token' }, { status: 401 })),
      http.post('https://test.supabase.co/functions/v1/mamamia-proxy', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
    );
    const user = userEvent.setup();
    const { container } = render(<CustomerPortalPage />);
    const h1 = await screen.findByRole('heading', { level: 1 }, { timeout: 5000 });
    expect((h1.textContent ?? '').trim()).toBe('Ihr Einsatz');
    const seite = container.querySelector('[data-gebucht-seite]') as HTMLElement;
    expect(seite.getAttribute('data-zustand')).toBe('L');
    expect(screen.queryByText(/Vielen Dank — Pflegekraft gebucht!/)).toBeNull();
    expect(screen.queryByText('Als Nächstes')).toBeNull();
    expect(seite.textContent).not.toMatch(/Gebuchter Einsatz bis|Alle meine Einsätze/);
    expect(within(seite).getByRole('link', { name: 'Primundus-Notfallnummer anrufen: +48 123 456 789' })).toBeTruthy();
    // Eine Reihenfolge für alle Zustände (Nachtrag 3): Begrüßung, Karte, Schritte, Kontakt, Siegel.
    const bausteine = [...seite.querySelectorAll('[data-baustein]')].map((e) => e.getAttribute('data-baustein'));
    expect(bausteine.indexOf('einsatz')).toBeLessThan(bausteine.indexOf('schritte'));
    expect(bausteine.indexOf('schritte')).toBeLessThan(bausteine.indexOf('kontakt'));

    await user.click(screen.getByRole('button', { name: 'Hilfe' }));
    const blatt = await screen.findByText('Ihre Beraterin');
    const huelle = blatt.closest('.pointer-events-auto') as HTMLElement;
    const anruf = within(huelle).getByRole('link', { name: 'Primundus-Notfallnummer anrufen: +48 123 456 789' });
    // Notfallfeld unter der Kopfzeile mit dem X (das X bleibt oben), VOR „Ihre Beraterin" (Martin 24.10.: Notfall zuerst).
    expect(anruf.compareDocumentPosition(blatt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(huelle).getByText('täglich 8–20 Uhr')).toBeTruthy();
    expect(within(huelle).getByText('Bekannt aus')).toBeTruthy();
    expect(notfallRpc).not.toHaveBeenCalled();
  }, 20_000);
});
