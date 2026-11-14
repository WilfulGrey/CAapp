/** @vitest-environment jsdom */
// Registry #163: Im Minimal-Einstieg vor dem Speichern lädt das Profil nur Pflegekräfte ein, die als offene Karte in der Liste
// stehen — nur die lädt der Lauf #145 nach dem Speichern ein. Ein Profil außerhalb der Liste (hier über den Mail-Link `cg=`
// auf die sechste Pflegekraft, die Liste zeigt fünf) behält den Knopf ins Formular aus #162; sonst verspräche das Fenster
// „{Name} einladen“ eine Einladung, die nie verschickt wird. `CG_PARAM` liest die Adresse beim Laden des Moduls, darum steht
// sie VOR dem Import (vi.hoisted).
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { defaultHandlers, defaultLead, sampleCaregiver, sampleMatching, bridgeHandler } from '../../../test/fixtures/mamamia-mocks';
import { vormerkSchluessel } from '../../lib/vormerkungen';

vi.hoisted(() => { window.history.replaceState({}, '', '/?token=token-mi-cg&cg=50007'); });

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    fetchLeadByToken: vi.fn(async (token: string) => token === 'token-mi-cg'
      ? { lead: { ...defaultLead, token } as unknown as import('../../lib/supabase').Lead, error: null }
      : { lead: null, error: 'Token nicht gefunden' }),
    fetchNotfallTelefon: vi.fn(async () => null),
  };
});

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

// Sechs Vorschläge: Helena (50002, Empfehlung) bis Dorota (50007). Die Liste zeigt fünf, Dorota steht nicht darin.
const NAMEN = ['Helena', 'Emilia', 'Anna', 'Beata', 'Celina', 'Dorota'];
const sechs = () => ({ JobOfferMatchingsWithPagination: { total: 6, data: NAMEN.map((vorname, i) => ({
  ...sampleMatching, id: 10001 + i, is_best_matching: i === 0,
  caregiver: { ...sampleCaregiver, id: 50002 + i, first_name: vorname, hp_total_jobs: i === 0 ? 15 : 3 },
})) } });
const gescrollt = () => (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts.map((e) => e.id);
type Meldung = { event?: string; metadata?: Record<string, unknown>; notify?: boolean };

describe('Profil außerhalb der Liste vor dem Speichern (Registry #163)', () => {
  it('Mail-Link cg= auf die sechste Pflegekraft: kein „Zur Bewerbung einladen“, sondern der Knopf ins Formular (Quelle karte); nichts vorgemerkt', async () => {
    const meldungen: Meldung[] = [];
    let einladungen = 0;
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      http.get('https://kostenrechner.primundus.de/api/lead-event', () => HttpResponse.json({ events: [] })),
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
      ...defaultHandlers({ proxy: {
        listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
        listMatchings: sechs,
        inviteCaregiver: () => { einladungen += 1; return { StoreRequest: { id: 1 } }; },
      } }),
    );
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // Fünf Zeilen, Dorota nicht darunter; der Mail-Link öffnet trotzdem ihr Profil.
    await waitFor(() => expect(document.querySelectorAll('[data-pflegekraft-zeile]')).toHaveLength(5), { timeout: 5000 });
    expect(document.querySelector('[data-pflegekraft-zeile="50007"]')).toBeNull();
    const zumFormular = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-profil-zum-formular]');
      if (!el) throw new Error('Profil ohne Knopf ins Formular');
      return el;
    }, { timeout: 5000 });
    // Geöffnet hat es der Mail-Link (keine Zeile angetippt); die Profildaten liefert die Attrappe für jede Kennung gleich.
    expect(document.querySelector('[data-profil-einladen]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nein danke' })).toBeNull();
    expect(zumFormular.textContent).toBe('Pflegesituation vervollständigen');
    expect(zumFormular.className).toContain('bg-pm-green');

    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    await user.click(zumFormular);
    await waitFor(() => expect(document.querySelector('[data-profil-zum-formular]')).toBeNull());
    await waitFor(() => expect(gescrollt()).toContain('patientendaten'));
    await waitFor(() => expect(meldungen.find((m) => m.event === 'zur_pflegesituation')?.metadata).toEqual({ quelle: 'karte', vor_speichern: true }));
    // Kein Fenster „{Name} einladen“, nichts vorgemerkt, nichts eingeladen.
    expect(screen.queryByRole('dialog', { name: /einladen$/ })).toBeNull();
    expect(meldungen.filter((m) => ['einladen_getippt', 'einladung_vorgemerkt'].includes(m.event ?? ''))).toEqual([]);
    expect(localStorage.getItem(vormerkSchluessel('token-mi-cg'))).toBeNull();
    expect(document.querySelector('[data-vormerk-zeile]')).toBeNull();
    expect(einladungen).toBe(0);

    // Eine Pflegekraft aus der Liste lädt das Profil dagegen ein.
    await user.click(document.querySelector<HTMLElement>('[data-pflegekraft-zeile="50003"] button')!);
    const einladen = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-profil-einladen]');
      if (!el) throw new Error('Profil ohne „Zur Bewerbung einladen“');
      return el;
    }, { timeout: 5000 });
    expect(document.querySelector('[data-profil-zum-formular]')).toBeNull();
    await user.click(einladen);
    expect(await screen.findByRole('dialog', { name: 'Emilia K. einladen' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel('token-mi-cg'))!)).toEqual([50003]);
  }, 20_000);
});
