/** @vitest-environment jsdom */
// Schwebende Frage „Was sagen Sie zum Angebot?“ bei echten Kunden (Token im Link, kein Vorschau-Schalter).
//
// Befund 06.10.2026: Seit dem 12.08. kam von echten Kunden keine einzige Antwort über die schwebende Frage. Beim
// ersten Render steht „Ihr Angebot wird geladen…“ da, der Abschnitt #patientendaten fehlt noch; der Beobachter gab
// dann auf und versuchte es nie wieder. In der Vorschau startet die Frage „reif“, deshalb fiel es dort nie auf.
//
// Rückbau Registry #122 (10.10.2026): Vor dem ersten Speichern zeigt das Portal wieder den Stand 75b8df8 — und dort war
// die Frage wegen genau dieses Fehlers bei echten Kunden nie sichtbar. Damit Kunden erleben, was sie damals erlebt haben,
// erscheint sie im Rückbau nicht. Mit `?einstieg=kompakt` (Kompakt-Einstieg #780, Vergleich/Rückweg) weiter wie bisher.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { defaultHandlers, defaultLead, TEST_LEAD_TOKEN } from '../../../test/fixtures/mamamia-mocks';

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    fetchLeadByToken: vi.fn(async () => ({ lead: defaultLead as unknown as import('../../lib/supabase').Lead, error: null })),
  };
});

import CustomerPortalPage from '../../pages/CustomerPortalPage';

// Aufzeichnender IntersectionObserver: merkt sich Optionen und beobachtete Elemente.
type Eintrag = { cb: IntersectionObserverCallback; optionen?: IntersectionObserverInit; elemente: Set<Element> };
const beobachter: Eintrag[] = [];
class AufzeichnenderIO {
  private eintrag: Eintrag;
  constructor(cb: IntersectionObserverCallback, optionen?: IntersectionObserverInit) {
    this.eintrag = { cb, optionen, elemente: new Set() };
    beobachter.push(this.eintrag);
  }
  observe(el: Element) { this.eintrag.elemente.add(el); }
  unobserve(el: Element) { this.eintrag.elemente.delete(el); }
  disconnect() { this.eintrag.elemente.clear(); }
  takeRecords() { return []; }
}
// Der Beobachter der Frage ist der mit 20 % Rand unten (der Abschnitt muss ein Stück weit im Bild sein).
const frageBeobachter = (el: Element) =>
  beobachter.filter((b) => b.optionen?.rootMargin === '0px 0px -20% 0px' && b.elemente.has(el));

const vorher = { io: window.IntersectionObserver };
beforeAll(() => {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = AufzeichnenderIO;
});
afterAll(() => {
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = vorher.io;
});

describe('Schwebende Frage „Was sagen Sie zum Angebot?“ bei echten Kunden', () => {
  it.each([
    ['Kompakt-Einstieg per ?einstieg=kompakt', '&einstieg=kompakt', true],
    ['Kompakt-Einstieg im Angebots-Look (Fassung 30)', '&einstieg=kompakt&look=angebot', true],
    ['Rückbau vor dem Speichern (Stand 75b8df8, Registry #122)', '', false],
  ] as const)('%s: der Beobachter hängt am Abschnitt Pflegesituation, sobald er nach dem Laden dasteht; nach 45 s im Bild erscheint die Frage nur, wenn sie soll', async (_name, look, erscheint) => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      server.use(
        ...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }),
        http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
        http.get('https://kostenrechner.primundus.de/api/lead-event', () => HttpResponse.json({ events: [] })),
      );
      window.history.replaceState({}, '', `/?token=${TEST_LEAD_TOKEN}${look}`);
      render(<CustomerPortalPage />);
      // Erst nach dem Laden steht der Abschnitt da …
      const abschnitt = await waitFor(() => {
        const el = document.getElementById('patientendaten');
        if (!el) throw new Error('Abschnitt noch nicht gerendert');
        return el;
      }, { timeout: 5000 });
      // … und genau dann muss der Beobachter der Frage an ihm hängen.
      await waitFor(() => expect(frageBeobachter(abschnitt)).toHaveLength(1), { timeout: 2000 });
      expect(screen.queryByText('Was sagen Sie zum Angebot?')).toBeNull();

      // Der Kunde scrollt bis zum Abschnitt und bleibt 45 s auf der Seite.
      act(() => {
        for (const b of frageBeobachter(abschnitt)) {
          b.cb([{ isIntersecting: true, target: abschnitt } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
        }
      });
      act(() => { vi.advanceTimersByTime(45_000); });
      if (erscheint) {
        expect(await screen.findByText('Was sagen Sie zum Angebot?')).toBeInTheDocument();
      } else {
        // Der Rückbau ist wirklich da (Kasten von 75b8df8) — und die Frage bleibt weg.
        expect(await screen.findByText('Noch 2 Minuten bis zu Ihren Bewerbungen', {}, { timeout: 5000 })).toBeInTheDocument();
        await new Promise((r) => setTimeout(r, 200));
        expect(screen.queryByText('Was sagen Sie zum Angebot?')).toBeNull();
      }
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);
});
