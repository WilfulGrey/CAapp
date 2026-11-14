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
  it('Bestpreis, Kosten, Frage, „Pflegesituation vervollständigen“ im Kasten unter der Liste und in „So geht es weiter“, Profil mit „Zur Bewerbung einladen“ und das Fenster danach antippen — keine einzige Meldung an die Bridge', async () => {
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
    // Minimal-Einstieg vor dem Speichern (Registry #147, Stand 14.11.2026, #163): „Details“ klappt die Kosten in der Preiskarte
    // auf, „Bestpreisgarantie“ öffnet ihr Fenster. Ins Formular führen der grüne Knopf im Kasten unter der Liste (Messpunkt
    // zur_pflegesituation, Quelle hauptknopf), der in „So geht es weiter“ (Quelle schritte) und der im Fenster „{Name}
    // einladen“ (Quelle einladen_fenster); das Profil öffnet die Zeile (profil_geoeffnet), sein Knopf „Zur Bewerbung einladen“
    // meldet einladen_getippt und einladung_vorgemerkt. Jeder dieser Wege muss in der Vorschau stumm bleiben. Dass der Sprung
    // zum Formular wirklich lief, zeigt scrollIntoView auf #patientendaten: Der Messpunkt sitzt direkt davor
    // (zurPflegesituationAus), ohne Sprung hätte der Test nichts geprüft.
    const ablaufKnopf = await waitFor(() => {
      const k = document.querySelector<HTMLElement>('[data-ablauf-link]');
      if (!k) throw new Error('kein Knopf in „So geht es weiter“');
      return k;
    }, { timeout: 5000 });
    expect(ablaufKnopf.textContent).toBe('Pflegesituation vervollständigen');

    await user.click(screen.getByRole('button', { name: /^Bestpreisgarantie/ }));
    await user.click(within(await screen.findByRole('dialog')).getAllByRole('button', { name: 'Schließen' })[0]);
    await user.click(screen.getByRole('button', { name: 'Details' }));
    await user.click(screen.getByRole('button', { name: 'Was brauche ich zu Hause?' }));

    sprungLeeren();
    await user.click(ablaufKnopf);
    await waitFor(() => expect(gescrollt()).toContain('patientendaten'));

    const kastenKnopf = await waitFor(() => {
      const k = document.querySelector<HTMLElement>('[data-liste-knopf] button');
      if (!k) throw new Error('kein Kasten unter der Liste');
      return k;
    }, { timeout: 5000 });
    sprungLeeren();
    await user.click(kastenKnopf);
    await waitFor(() => expect(gescrollt()).toContain('patientendaten'));

    await user.click(await screen.findByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Anna, 58'));
    const einladen = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-profil-einladen]');
      if (!el) throw new Error('Profilfenster ohne Knopf „Zur Bewerbung einladen“');
      return el;
    }, { timeout: 5000 });
    await user.click(einladen);
    const fenster = await screen.findByRole('dialog', { name: /einladen$/ });
    expect(document.querySelector('[data-profil-einladen]')).toBeNull();
    sprungLeeren();
    await user.click(within(fenster).getByRole('button', { name: 'Pflegesituation vervollständigen' }));
    await waitFor(() => expect(gescrollt()).toContain('patientendaten'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await new Promise((r) => setTimeout(r, 100));
    expect(meldungen).toEqual([]);
  }, 20_000);
});
