/** @vitest-environment jsdom */
// Messpunkte (Registry #123) nie aus den Vorschau-Modi: `IS_PREVIEW_ANY` wird beim Laden des Moduls aus der Adresse
// gelesen, darum steht sie VOR dem Import (vi.hoisted).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const gescrollt = () => (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts.map((e) => e.id);
const sprungLeeren = () => (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();

describe('Messpunkte in der Vorschau (?preview=patient)', () => {
  it('Bestpreis, Kosten, Frage, „Pflegesituation vervollständigen“ in „So geht es weiter“, Profil und der Knopf darin antippen — keine einzige Meldung an die Bridge', async () => {
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
    // Minimal-Einstieg vor dem Speichern (Registry #147, Stand 13.11.2026): „Details“ klappt die Kosten in der Preiskarte auf,
    // „Bestpreisgarantie“ öffnet ihr Fenster. Kein fester Knopf und kein „Einladen“ mehr: Ins Formular führen der grüne Knopf in
    // „So geht es weiter“ (Messpunkt zur_pflegesituation, Quelle schritte) und im Profil der Knopf „Pflegesituation
    // vervollständigen“ (Quelle karte); das Profil öffnet die Zeile (profil_geoeffnet). Jeder dieser Wege muss in der Vorschau
    // stumm bleiben. Dass der Sprung zum Formular wirklich lief, zeigt scrollIntoView auf #patientendaten: Der Messpunkt sitzt
    // direkt davor (zurPflegesituationAus), ohne Sprung hätte der Test nichts geprüft.
    const ablaufKnopf = await screen.findByRole('button', { name: 'Pflegesituation vervollständigen' }, { timeout: 5000 });
    expect(ablaufKnopf).toHaveAttribute('data-ablauf-link');

    await user.click(screen.getByRole('button', { name: /^Bestpreisgarantie/ }));
    await user.click(within(await screen.findByRole('dialog')).getAllByRole('button', { name: 'Schließen' })[0]);
    await user.click(screen.getByRole('button', { name: 'Details' }));
    await user.click(screen.getByRole('button', { name: 'Was brauche ich zu Hause?' }));

    sprungLeeren();
    await user.click(ablaufKnopf);
    await waitFor(() => expect(gescrollt()).toContain('patientendaten'));

    await user.click(await screen.findByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Anna, 58'));
    const zumFormular = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-profil-zum-formular]');
      if (!el) throw new Error('Profilfenster ohne Knopf „Pflegesituation vervollständigen“');
      return el;
    }, { timeout: 5000 });
    sprungLeeren();
    await user.click(zumFormular);
    await waitFor(() => expect(gescrollt()).toContain('patientendaten'));
    expect(document.querySelector('[data-profil-zum-formular]')).toBeNull();

    await new Promise((r) => setTimeout(r, 100));
    expect(meldungen).toEqual([]);
  }, 20_000);
});
