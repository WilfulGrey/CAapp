/** @vitest-environment jsdom */
/*
 * Entscheidung 3 (Martin, 15.10.2026, „alle Empfehlungen umsetzen“): Das Entlastungsbudget zählt nie zum Eigenanteil.
 * Gespeicherte Anfragen von vorher tragen den Posten noch mit `in_kalkulation: true` — das Portal zieht ihn trotzdem
 * nicht ab: weder in „Was bleibt für Sie übrig“ noch im Heimvergleich, weder vor dem ersten Speichern (Rückbau,
 * Registry #122) noch im Kompakt-Einstieg (`?einstieg=kompakt`). Rechnung: 2.800 − 347 − 333,33 = 2.119,67 € (≈ 2.120 €).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { defaultHandlers, defaultLead } from '../../../test/fixtures/mamamia-mocks';

const ALTE_ANFRAGE = 'token-alte-anfrage';

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    fetchLeadByToken: vi.fn(async (token: string) => {
      if (token !== 'token-alte-anfrage') return { lead: null, error: 'Token nicht gefunden' };
      // So steht eine Anfrage von vor dem 15.10.2026 in der Datenbank: Budget mit in_kalkulation: true,
      // gespeicherter Eigenanteil um 294,92 € zu niedrig.
      const kalkulation = {
        ...defaultLead.kalkulation,
        bruttopreis: 2800,
        eigenanteil: 1824.75,
        'zuschüsse': {
          gesamt: 975.25,
          items: [
            { name: 'pflegegeld', label: 'Pflegegeld', beschreibung: '', betrag_monatlich: 347, betrag_jaehrlich: 4164, typ: 'monatlich', hinweis: null, in_kalkulation: true },
            { name: 'entlastungsbudget_neu', label: 'Entlastungsbudget (3.539 Euro/Jahr ab Pflegegrad 2)', beschreibung: '', betrag_monatlich: 294.92, betrag_jaehrlich: 3539, typ: 'jaehrlich', hinweis: 'Bis zu 3.539 €/Jahr (seit 1.7.2025)', in_kalkulation: true },
            { name: 'steuervorteil', label: 'Steuerliche Absetzbarkeit', beschreibung: '', betrag_monatlich: 333.33, betrag_jaehrlich: 4000, typ: 'jaehrlich', hinweis: 'Max. 4.000 € pro Jahr (= ca. 333 €/Monat).', in_kalkulation: true },
          ],
        },
      };
      return { lead: { ...defaultLead, token, kalkulation } as unknown as import('../../lib/supabase').Lead, error: null };
    }),
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

const text = (el: Element) => (el.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const ohneBewerbungen = () =>
  server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));

function pruefeAufstellung() {
  const rechnung = screen.getByText('Was bleibt für Sie übrig').parentElement!;
  expect(text(within(rechnung).getByText('Ihr Eigenanteil').parentElement!)).toBe('Ihr Eigenanteil2.120 €');
  expect(within(rechnung).getByText('Pflegegeld')).toBeInTheDocument();
  expect(within(rechnung).getByText(/^Steuerliche Absetzbarkeit/)).toBeInTheDocument();
  expect(text(rechnung)).toContain('Pflegegeld und Steuervorteil sind Leistungen Dritter mit eigenen Voraussetzungen');
  // Nirgends auf der Seite: weder die Zeile noch der Hinweis des Budgets.
  expect(document.body.textContent).not.toContain('Entlastungsbudget');
  expect(document.body.textContent).not.toContain('3.539');
}

describe('Portal: alte Anfrage mit Entlastungsbudget im gespeicherten Eigenanteil (Entscheidung 3)', () => {
  it('vor dem ersten Speichern (Rückbau): Heimvergleich und Aufstellung ohne die 294,92 €', async () => {
    ohneBewerbungen();
    localStorage.removeItem(`patient_${ALTE_ANFRAGE}`);
    window.history.replaceState({}, '', `/?token=${ALTE_ANFRAGE}`);
    render(<CustomerPortalPage />);
    await screen.findByText('Ihre Betreuungskosten', {}, { timeout: 5000 });
    expect(text(screen.getByText(/^Heim-Eigenanteil im 1\. Jahr/))).toBe('Heim-Eigenanteil im 1. Jahr 3.364 €, bei Ihnen nach Zuschüssen etwa 2.120 €. Quelle: vdek-Auswertung, Stand 1. Juli 2026.');
    expect(text(screen.getByText(/^Zuhause statt Pflegeheim/))).toBe('Zuhause statt Pflegeheim: rund 1.244 € weniger im Monat.');
    await userEvent.click(screen.getByRole('button', { name: 'Alle Kosten im Überblick' }));
    pruefeAufstellung();
  }, 15_000);

  it('Kompakt-Einstieg: „Kosten im Überblick ›“ zeigt denselben Eigenanteil', async () => {
    ohneBewerbungen();
    localStorage.removeItem(`patient_${ALTE_ANFRAGE}`);
    window.history.replaceState({}, '', `/?token=${ALTE_ANFRAGE}&einstieg=kompakt`);
    render(<CustomerPortalPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Kosten im Überblick ›' }, { timeout: 5000 }));
    pruefeAufstellung();
  }, 15_000);
});
