/** @vitest-environment jsdom */
// Messpunkte (Registry #123) nie aus den Vorschau-Modi: `IS_PREVIEW_ANY` wird beim Laden des Moduls aus der Adresse
// gelesen, darum steht sie VOR dem Import (vi.hoisted).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { bridgeHandler } from '../../../test/fixtures/mamamia-mocks';

vi.hoisted(() => { window.history.replaceState({}, '', '/?preview=patient'); });

import CustomerPortalPage from '../../pages/CustomerPortalPage';

beforeAll(() => {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
  if (!('IntersectionObserver' in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  }
});

describe('Messpunkte in der Vorschau (?preview=patient)', () => {
  it('Bestpreis, Kosten, Frage, Einladen und Profil antippen — keine einzige Meldung an die Bridge', async () => {
    const meldungen: unknown[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b); }),
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
      // Die Vorschau versucht (wie bisher) eine Sitzung — ohne Lead abgelehnt.
      http.post('https://test.supabase.co/functions/v1/onboard-to-mamamia', () => HttpResponse.json({ error: 'no token' }, { status: 401 })),
      http.post('https://test.supabase.co/functions/v1/mamamia-proxy', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
    );
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Noch 2 Minuten bis zu Ihren Bewerbungen', {}, { timeout: 5000 });

    await user.click(screen.getByRole('button', { name: /^Bestpreisgarantie/ }));
    await user.click(within(await screen.findByRole('dialog')).getAllByRole('button', { name: 'Schließen' })[0]);
    await user.click(screen.getByRole('button', { name: 'Alle Kosten im Überblick' }));
    await user.click(screen.getByRole('button', { name: 'Was brauche ich zu Hause?' }));
    await user.click(screen.getAllByRole('button', { name: 'Einladen' })[0]);
    await user.click(within(await screen.findByRole('dialog', { name: 'Warum erst die Pflegesituation?' })).getAllByRole('button', { name: 'Schließen' })[0]);
    await user.click(screen.getByText('Anna N.'));

    await new Promise((r) => setTimeout(r, 50));
    expect(meldungen).toEqual([]);
  }, 20_000);
});
