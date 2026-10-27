/** @vitest-environment jsdom */
// Gebucht-Seite für echte Kunden (Registry #139): Ein gebuchter Lead sieht GebuchtSeite statt BookedScreen. Daten aus dem
// echten Portalweg: Annahme (listAcceptedApplications), Einsatz (listLeadJobs), Anreise aus dem GET der Brücke
// (`types=caregiver_arrival_scheduled`), Notfallnummer aus der RPC notfall_telefon — die nur für den echten Lead läuft.
// Fantasie-Nummer statt der echten Notfallnummer; supabase-js läuft nicht durch MSW, darum ist die RPC ersetzt.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/mocks/server';
import {
  defaultHandlers,
  defaultLead,
  sampleCaregiver,
  TEST_JOB_OFFER_ID,
  TEST_LEAD_TOKEN,
} from '../../../test/fixtures/mamamia-mocks';
import { berlinTag } from '../../lib/gebuchtStand';

const { notfallRpc } = vi.hoisted(() => ({ notfallRpc: vi.fn(async (_token: string): Promise<string | null> => null) }));
vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    fetchLeadByToken: vi.fn(async (token: string) =>
      token === TEST_LEAD_TOKEN
        ? { lead: defaultLead as unknown as import('../../lib/supabase').Lead, error: null }
        : { lead: null, error: 'Token nicht gefunden' }),
    fetchNotfallTelefon: notfallRpc,
  };
});

import CustomerPortalPage from '../../pages/CustomerPortalPage';

const FANTASIE = '+48 123 456 789';
const KOSTENRECHNER = 'https://kostenrechner.primundus.de';

beforeAll(() => {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
  if (!('IntersectionObserver' in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
  }
});

beforeEach(() => {
  notfallRpc.mockReset();
  notfallRpc.mockImplementation(async () => null);
});

/** Berliner Kalendertag heute + n Tage (YYYY-MM-DD). */
function tag(n: number): string {
  const d = new Date(`${berlinTag()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const ANNAHME = {
  application_id: 333,
  caregiver_id: sampleCaregiver.id,
  accepted_at: '2026-10-15T09:20:00Z',
  contract_snapshot: {
    datum: '15.10.2026', vertragsbeginn: '01.11.2026', voraussAbreise: '20.12.2026', tagessatz: 'EUR 95,00',
    ag: { name: 'Anna Testerin' }, le: null, dl: { name: 'Primundus' },
  },
};

/** Proxy-Aktionen der Gebucht-Seite; alle anderen laufen zum Standard-Handler weiter. */
function gebuchtProxy() {
  return http.post('*/functions/v1/mamamia-proxy', async ({ request }) => {
    const body = await request.clone().json() as { action: string };
    if (body.action === 'listAcceptedApplications') {
      return HttpResponse.json({ data: { application_ids: [333], rows: [ANNAHME] } });
    }
    if (body.action === 'listLeadJobs') {
      return HttpResponse.json({ data: { jobs: [{
        id: 'job-aktuell', mamamia_job_offer_id: TEST_JOB_OFFER_ID, status: 'gebucht', anreise: tag(7), abreise: tag(60),
        position: 1, pflegekraft: 'Maria Kowalski', bewerbungen: 1,
      }] } });
    }
    return undefined;
  });
}

/** GET der Brücke: zeichnet die Abfragen auf; `antwort` = Ereignisse oder eine HTTP-Statuszahl. */
function brueckeGet(abfragen: URL[], antwort: unknown[] | number) {
  return http.get(`${KOSTENRECHNER}/api/lead-event`, ({ request }) => {
    const url = new URL(request.url);
    abfragen.push(url);
    if (typeof antwort === 'number') return HttpResponse.json({ error: 'x' }, { status: antwort });
    const typen = url.searchParams.get('types') ?? '';
    return HttpResponse.json({ events: typen.includes('caregiver_arrival_scheduled') ? antwort : [] });
  });
}

const sterne = () => http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 }));

function anreiseEreignis() {
  return {
    id: 'e1', event_type: 'caregiver_arrival_scheduled', created_at: '2026-10-20T08:00:00Z',
    metadata: {
      mamamia_job_offer_id: TEST_JOB_OFFER_ID, anreise_datum: tag(7), anreise_von: '14:00', anreise_bis: '16:00',
      verkehrsmittel: 'Minibus', einsatzort_strasse: 'Musterstraße 1', einsatzort_plz_ort: '12345 Musterstadt',
    },
  };
}

describe('Gebucht-Seite für echte Kunden (Registry #139)', () => {
  it('gebucht: neue Seite mit Anreise aus der Brücke, Notfallnummer aus notfall_telefon, Vertrag als PDF dieser Bewerbung', async () => {
    notfallRpc.mockImplementation(async () => FANTASIE);
    const abfragen: URL[] = [];
    server.use(gebuchtProxy(), brueckeGet(abfragen, [anreiseEreignis()]), sterne(), ...defaultHandlers({}));
    window.history.replaceState({}, '', `/?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    const { container } = render(<CustomerPortalPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Ihr Einsatz' }, { timeout: 6000 })).toBeTruthy();
    const seite = container.querySelector('[data-gebucht-seite]') as HTMLElement;
    expect(seite.getAttribute('data-zustand')).toBe('AD');
    expect(screen.queryByText(/Pflegekraft gebucht!/)).toBeNull();
    // Anreise genau aus dem Ereignis.
    expect(within(seite).getByText('Minibus')).toBeTruthy();
    expect(seite.textContent).toContain('Musterstraße 1');
    // Brücke mit Token und genau dem Ereignistyp gefragt.
    const anreiseAbfrage = abfragen.find((u) => u.searchParams.get('types') === 'caregiver_arrival_scheduled');
    expect(anreiseAbfrage?.searchParams.get('token')).toBe(TEST_LEAD_TOKEN);
    // Notfallnummer nur aus der RPC, mit dem Token des Leads.
    expect(notfallRpc).toHaveBeenCalledWith(TEST_LEAD_TOKEN);
    expect(await within(seite).findByRole('link', { name: `Primundus-Notfallnummer anrufen: ${FANTASIE}` })).toBeTruthy();
    // Vertrag dieser Pflegekraft: unterschrieben, PDF genau dieser Bewerbung, Tagessatz aus dem Vertrag.
    expect(within(seite).getByText('Vertrag unterschrieben')).toBeTruthy();
    const pdf = within(seite).getByRole('link', { name: /Vertrag als PDF/ }) as HTMLAnchorElement;
    const pdfUrl = new URL(pdf.href);
    expect(pdfUrl.pathname).toBe(`/api/contract-pdf/${defaultLead.id}`);
    expect(pdfUrl.searchParams.get('application_id')).toBe('333');
    expect(seite.querySelector('[data-teil="kosten"]')?.textContent).toContain('95');

    // Hilfe-Blatt: dieselbe Nummer vor Martas Tageskontakt.
    await user.click(screen.getByRole('button', { name: 'Hilfe' }));
    const beraterin = await screen.findByText('Ihre Beraterin');
    const huelle = beraterin.closest('.pointer-events-auto') as HTMLElement;
    expect(within(huelle).getByRole('link', { name: `Primundus-Notfallnummer anrufen: ${FANTASIE}` })).toBeTruthy();
  }, 20_000);

  it('Brücke antwortet nicht: Seite erscheint trotzdem, ohne Anreisedaten; ohne Nummer kein Notfallfeld', async () => {
    const abfragen: URL[] = [];
    server.use(gebuchtProxy(), brueckeGet(abfragen, 500), sterne(), ...defaultHandlers({}));
    window.history.replaceState({}, '', `/?token=${TEST_LEAD_TOKEN}`);
    const { container } = render(<CustomerPortalPage />);

    await screen.findByRole('heading', { level: 1, name: 'Ihr Einsatz' }, { timeout: 6000 });
    const seite = container.querySelector('[data-gebucht-seite]') as HTMLElement;
    expect(seite.textContent).not.toContain('Minibus');
    expect(seite.textContent).not.toContain('Musterstraße');
    await waitFor(() => expect(notfallRpc).toHaveBeenCalledWith(TEST_LEAD_TOKEN));
    expect(seite.querySelector('[data-notfall]')).toBeNull();
  }, 20_000);

  it('nicht gebucht: keine Gebucht-Seite, keine Frage nach der Notfallnummer', async () => {
    server.use(brueckeGet([], []), sterne(), ...defaultHandlers({}));
    window.history.replaceState({}, '', `/?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);

    await screen.findByRole('button', { name: /^Angebot prüfen$/ }, { timeout: 6000 });
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByRole('heading', { level: 1, name: 'Ihr Einsatz' })).toBeNull();
    expect(notfallRpc).not.toHaveBeenCalled();
  }, 20_000);
});
