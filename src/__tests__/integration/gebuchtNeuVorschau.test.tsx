/** @vitest-environment jsdom */
// Gebucht-Seite neu (PROTOTYP 15.10.2026): Die neue Seite erscheint NUR in ?preview=gebucht. Die Adresse wird beim Laden
// des Moduls gelesen, darum steht sie VOR dem Import (vi.hoisted). Fantasie-Nummer statt der echten Notfallnummer.
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';

vi.hoisted(() => { window.history.replaceState({}, '', '/?preview=gebucht&zustand=im-einsatz&notfall=%2B48%20123%20456%20789'); });

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
  it('Zustand „im Einsatz": Status, Karte vor dem Kontakt mit Notfallfeld, kein alter Kopf; Hilfe-Blatt mit Notfallfeld unter der Kopfzeile', async () => {
    server.use(
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
      http.post('https://test.supabase.co/functions/v1/onboard-to-mamamia', () => HttpResponse.json({ error: 'no token' }, { status: 401 })),
      http.post('https://test.supabase.co/functions/v1/mamamia-proxy', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
    );
    const user = userEvent.setup();
    const { container } = render(<CustomerPortalPage />);
    const h1 = await screen.findByRole('heading', { level: 1 }, { timeout: 5000 });
    expect((h1.textContent ?? '').replace(/ /g, ' ')).toMatch(/^Gebuchter Einsatz bis /);
    const seite = container.querySelector('[data-gebucht-seite]') as HTMLElement;
    expect(seite.getAttribute('data-zustand')).toBe('L');
    expect(screen.queryByText(/Vielen Dank — Pflegekraft gebucht!/)).toBeNull();
    expect(screen.queryByText('Als Nächstes')).toBeNull();
    expect(within(seite).getByRole('link', { name: 'Primundus-Notfallnummer anrufen: +48 123 456 789' })).toBeTruthy();
    // Standard im laufenden Einsatz: Martins Reihenfolge, erst die Karte, dann der Kontakt.
    const bausteine = [...seite.querySelectorAll('[data-baustein]')].map((e) => e.getAttribute('data-baustein'));
    expect(bausteine.indexOf('karte')).toBeLessThan(bausteine.indexOf('kontakt'));

    await user.click(screen.getByRole('button', { name: 'Hilfe' }));
    const blatt = await screen.findByText('Ihre Beraterin');
    const huelle = blatt.closest('.pointer-events-auto') as HTMLElement;
    const anruf = within(huelle).getByRole('link', { name: 'Primundus-Notfallnummer anrufen: +48 123 456 789' });
    // Notfallfeld unter der Kopfzeile mit dem X (das X bleibt oben).
    expect(blatt.compareDocumentPosition(anruf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(huelle).getByText('täglich 8–20 Uhr')).toBeTruthy();
    expect(within(huelle).getByText('Bekannt aus')).toBeTruthy();
  }, 20_000);
});
