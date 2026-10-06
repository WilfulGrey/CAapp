/** @vitest-environment jsdom */
// Fassung 31 (Vorschlag 06.10.2026): die Ansicht NACH dem Absenden im Aufbau von Fassung 30, nur mit `?look=angebot`.
// Eigene Datei, weil der Schalter `KOMPAKT_LOOK` beim Laden des Moduls aus der Adresse gelesen wird: Die Adresse muss
// VOR dem Import stehen (vi.hoisted).
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { defaultHandlers, defaultLead, sampleCustomer } from '../../../test/fixtures/mamamia-mocks';

vi.hoisted(() => { window.history.replaceState({}, '', '/?look=angebot'); });

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    fetchLeadByToken: vi.fn(async (token: string) => (token === 'token-abgesendet'
      ? { lead: { ...defaultLead, token, patient_form_at: '2026-09-24T10:00:00Z', patient_form: { startDate: '2099-11-15' } } as unknown as import('../../lib/supabase').Lead, error: null }
      : { lead: null, error: 'Token nicht gefunden' })),
  };
});

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

const setLocation = (search: string) => window.history.replaceState({}, '', `/${search}`);

describe('Ansicht nach dem Absenden im Look „angebot" (Fassung 31)', () => {
  // Fassung 31 (Vorschlag 06.10.2026, nur mit ?look=angebot): nach dem Absenden derselbe Aufbau wie vor dem Absenden.
  it('nach dem Absenden im Look „angebot": „Ihre Suche läuft", „So geht es weiter" mit Stand, „Pflegekräfte einladen", nur eine Marta', async () => {
    server.use(
      ...defaultHandlers({
        proxy: {
          getCustomer: () => ({ Customer: { ...sampleCustomer, status: 'active' } }),
          listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
        },
      }),
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
      http.get('https://kostenrechner.primundus.de/api/lead-event', () => HttpResponse.json({ events: [] })),
    );
    setLocation('?token=token-abgesendet&look=angebot');
    render(<CustomerPortalPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ihre Suche läuft' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Passende Pflegekräfte sehen jetzt Ihre Anfrage und können sich bei Ihnen bewerben.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'So geht es weiter' })).toBeInTheDocument();
    expect(screen.getByText('Pflegesituation ergänzt')).toBeInTheDocument();
    expect(await screen.findByText('Ihr Wunschstart: 15.11.')).toBeInTheDocument();
    expect(screen.queryByText('Stand heute')).toBeNull();
    expect(await screen.findByRole('heading', { level: 2, name: 'Pflegekräfte einladen' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText('Unsicher bei der Auswahl?')).toBeNull();
    expect(screen.queryByText(/meldet sich meist innerhalb/)).toBeNull();
    expect(screen.getByRole('button', { name: /Angebot ansehen/ })).toBeInTheDocument();
  }, 15_000);
});
