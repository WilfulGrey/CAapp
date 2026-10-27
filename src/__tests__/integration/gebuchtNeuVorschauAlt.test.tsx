/** @vitest-environment jsdom */
// Gebucht-Seite neu (PROTOTYP 15.10.2026): `&seite=alt` zeigt in der Vorschau weiter die heutige Seite (BookedScreen),
// das Hilfe-Blatt bleibt unverändert.
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';

vi.hoisted(() => { window.history.replaceState({}, '', '/?preview=gebucht&seite=alt&zustand=im-einsatz'); });

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

describe('?preview=gebucht&seite=alt', () => {
  it('zeigt die heutige Seite, ohne neue Teile', async () => {
    server.use(
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
      http.post('https://test.supabase.co/functions/v1/onboard-to-mamamia', () => HttpResponse.json({ error: 'no token' }, { status: 401 })),
      http.post('https://test.supabase.co/functions/v1/mamamia-proxy', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
    );
    const user = userEvent.setup();
    const { container } = render(<CustomerPortalPage />);
    await screen.findByText('Vielen Dank — Pflegekraft gebucht!', {}, { timeout: 5000 });
    expect(container.querySelector('[data-gebucht-seite]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Hilfe' }));
    const zeiten = await screen.findByText('Mo–So, 8–20 Uhr');
    const blatt = zeiten.closest('.pointer-events-auto') as HTMLElement;
    expect(within(blatt).queryByText(/Notfallnummer/)).toBeNull();
  }, 20_000);
});
