/** @vitest-environment jsdom */
// Der ältere Kompakt-Entwurf („ruhig", Runde 13–15) bleibt per `?look=ruhig` erreichbar und wird hier weiter geprüft. Der
// Schalter `KOMPAKT_LOOK` wird beim Laden des Moduls aus der Adresse gelesen, darum steht sie VOR dem Import (vi.hoisted).
// Seit dem Rückbau Registry #122 zeigt das Portal vor dem ersten Speichern den Stand 75b8df8; den Kompakt-Einstieg gibt es
// dort nur noch mit `?einstieg=kompakt` (Vergleich, Rückweg) — `setLocation` hängt den Schalter an.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse, delay } from 'msw';
import {
  defaultHandlers,
  defaultLead,
  sampleMatching,
  TEST_LEAD_TOKEN,
  TEST_JOB_OFFER_ID,
  bridgeHandler,
  proxyHandler,
  sampleCustomer,
} from '../../../test/fixtures/mamamia-mocks';

// Mock Supabase helpers — Supabase-js uses a fetch impl that doesn't route
// through MSW under Node 18 / jsdom. Edge Function calls (onboard-to-mamamia,
// mamamia-proxy) still use globalThis.fetch and ARE intercepted by MSW.
vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    fetchLeadByToken: vi.fn(async (token: string) => {
      if (token === TEST_LEAD_TOKEN) {
        return { lead: defaultLead as unknown as import('../../lib/supabase').Lead, error: null };
      }
      // Schon abgesendet (Proxy hat `patient_form_at` gesetzt), neues Gerät.
      // Kompakt-Einstieg Runde 4: Lead ohne Zuschüsse in der Kalkulation (keine Eigenanteil-Zeile).
      if (token === 'token-ohne-zuschuesse') {
        return { lead: { ...defaultLead, token, kalkulation: { ...defaultLead.kalkulation, 'zuschüsse': { gesamt: 0, items: [] } } } as unknown as import('../../lib/supabase').Lead, error: null };
      }
      if (token === 'token-abgesendet') {
        return { lead: { ...defaultLead, token, patient_form_at: '2026-09-24T10:00:00Z', patient_form: { startDate: '2099-11-15' } } as unknown as import('../../lib/supabase').Lead, error: null };
      }
      return { lead: null, error: 'Token nicht gefunden' };
    }),
  };
});

vi.hoisted(() => { window.history.replaceState({}, '', '/?look=ruhig'); });

import CustomerPortalPage from '../../pages/CustomerPortalPage';

// jsdom doesn't implement URL.createObjectURL / scrollTo — portal's PDF download
// and scrollTo-on-click accesses these. Stub lightly.
beforeAll(() => {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.scrollTo = vi.fn();
  // …und kein Element.scrollTo (das Portal scrollt nach dem Absenden nach oben).
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  // jsdom kennt scrollIntoView nicht — das Formular scrollt beim Schrittwechsel
  // und beim Sprung zum ersten fehlenden Feld dorthin.
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom has no IntersectionObserver for lucide-react / popup positioning
  if (!('IntersectionObserver' in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  }
});

function setLocation(search: string) {
  // jsdom allows assigning to window.location.search via setter trick
  window.history.replaceState({}, '', `/${search}&einstieg=kompakt`);
}

describe('Kompakt-Einstieg, älterer Entwurf „ruhig“ (`?look=ruhig`)', () => {
  const gescrollt = () => (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts.map((e) => e.id);
  // ─── Kompakt-Einstieg vor dem ersten Absenden (Vorschlag 03.10.2026, KompaktEinstieg.tsx) ────────
  // Ersetzt den Kasten „Noch 2 Minuten“ (Registry #102), die Knöpfe je Karte, den Formularkopf
  // „Jetzt konkrete Bewerbungen erhalten“ und die Liste „So geht es weiter“ (Registry #109).
  // Runde 8 (Geschäftsführer: „Wir haben doch echte Pflegekräfte … keine Fake-Box") bis Runde 13
  // („ruhig"): Einleitung im Kopf, Kostenkarte (Preis, Eigenanteil als Text, vier Punkte, Siegel mit
  // Testsieger/Erfahrung und Sternen), dann „Ihre passenden Pflegekräfte" mit dem Status-Hinweis
  // „Ihre Pflegesituation ist noch nicht vollständig" (Look B, Formular darin) und den echten Profilen.

  // Text ohne geschütztes Leerzeichen (vor dem „·“ der Zeile 3 steht eins).
  const text = (el: Element) => (el.textContent ?? '').replace(/ /g, ' ');

  it('Neukunde: Einleitung mit Sternen und Testsieger, Kostenkarte, dann „Ihre passenden Pflegekräfte“ mit dem Hinweis; der Knopf öffnet das Formular im Hinweis, ohne Sprung', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    server.use(
      ...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }),
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
    );
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    const bereich = await screen.findByRole('region', { name: 'Ihre passenden Pflegekräfte' }, { timeout: 5000 });
    // Kopf: Titel wie der Betreff der Angebotsmail, Einleitung, Sterne und Testsieger als ruhige Zeilen.
    const titel = screen.getByRole('heading', { level: 1, name: 'Ihr Angebot zur 24-Stunden-Betreuung' });
    const einleitung = titel.nextElementSibling as HTMLElement;
    expect(einleitung.textContent).toBe(
      'Ihr Angebot umfasst eine Rund-um-Betreuung zu Hause durch bei uns angestellte Betreuungskräfte. Anreise, Wechsel und Vertretung organisieren wir, und Ihre Ansprechpartnerin ist täglich von 8 bis 20 Uhr für Sie da.',
    );
    // Runde 13: im Kopf nur die Einleitung — keine Fakten-Zeile, kein Knopf, keine Haken, kein Siegel, keine Sterne.
    const kopf = titel.parentElement as HTMLElement;
    expect(within(kopf).queryByRole('list')).toBeNull();
    expect(within(kopf).queryByRole('button')).toBeNull();
    expect(kopf.querySelector('img[src="/badge-testsieger.webp"]')).toBeNull();
    expect(within(kopf).queryByRole('link', { name: /Bewertungen/ })).toBeNull();
    // Siegel + Sterne unten in der Kostenkarte.
    const sterne = await screen.findByRole('link', { name: /4,9 von 5 aus 126 Bewertungen/ }, { timeout: 5000 });
    // Reihenfolge: Kopf → Kostenkarte → Pflegekräfte-Bereich (Kopf, Hinweis, Zeilen).
    const karte = screen.getByText('Ihre Betreuungskosten').closest('.shadow-lift')!;
    expect(karte.contains(sterne)).toBe(true);
    expect(einleitung.compareDocumentPosition(karte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(karte.compareDocumentPosition(bereich) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Runde 13: keine Versalien-Zeilen (weder „Für Sie ausgewählt" noch sichtbar „Ihre Betreuungskosten").
    expect(screen.queryByText('Für Sie ausgewählt')).toBeNull();
    expect(screen.getByText('Ihre Betreuungskosten').className).toContain('sr-only');
    expect(text(within(bereich).getByText(/^Echte Profile, ausgewählt nach/))).toBe('Echte Profile, ausgewählt nach Ihren Angaben.');
    const hinweis = document.getElementById('patientendaten')!;
    expect(bereich.contains(hinweis)).toBe(true);
    expect(within(hinweis).queryByText('Hinweis')).toBeNull();
    expect(within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Ihre Pflegesituation ist noch nicht vollständig')).toBeInTheDocument();
    expect(within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Deshalb können Sie diese Pflegekräfte noch nicht einladen und noch keine Bewerbungen erhalten.')).toBeInTheDocument();
    expect(text(within(hinweis).getByText(/^Vieles ist schon ausgefüllt\./))).toBe('Vieles ist schon ausgefüllt. Unverbindlich: Ein Vertrag entsteht erst, wenn Sie ein Angebot ausdrücklich annehmen.');
    expect(screen.queryByText('Noch 2 Minuten bis zum Einladen')).toBeNull();
    const ersteZeile = await within(bereich).findByRole('button', { name: 'Profil von Helena K. ansehen' }, { timeout: 5000 });
    expect(hinweis.compareDocumentPosition(ersteZeile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Weg: Zusammenfassungskarte mit Fotostapel, „Wir kümmern uns um alles", „Die Profile",
    // „So geht es weiter", Schloss-Hinweis, die Frage „Passt Ihnen …?", der Formularkopf.
    expect(screen.queryByText(/schon für Sie ausgewählt/)).toBeNull();
    expect(screen.queryByText('Fotos, Namen und Profile liegen bereit.')).toBeNull();
    expect(screen.queryByText('Wir kümmern uns um alles')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Die Profile' })).toBeNull();
    expect(screen.queryByText('So geht es weiter')).toBeNull();
    expect(screen.queryByText(/Vor dem Einladen/)).toBeNull();
    expect(screen.queryByText('Passt Ihnen das Angebot?')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Jetzt konkrete Bewerbungen erhalten' })).toBeNull();
    expect(screen.queryByText(/Schritt 1 von 4/)).toBeNull();

    await userEvent.click(within(hinweis).getByRole('button', { name: 'Pflegesituation vervollständigen →' }));
    expect(await within(hinweis).findByText(/Schritt 1 von 4/)).toBeInTheDocument();
    expect(within(hinweis).queryByRole('button', { name: 'Pflegesituation vervollständigen →' })).toBeNull();
    // Kein Sprung: Der Knopf steht im Hinweis, das Formular klappt darunter auf.
    expect(gescrollt()).not.toContain('patientendaten');
  }, 15_000);

  it('Neukunde: Kostenkarte mit Preis, kleiner Schrift, dem Textlink „Alle Kosten im Überblick ›“, den vier Punkten und unten Siegel + Sterne; kein Eigenanteil an der Karte', async () => {
    server.use(
      ...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }),
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
    );
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    await screen.findByRole('region', { name: 'Ihre passenden Pflegekräfte' }, { timeout: 5000 });
    const karte = screen.getByText('Ihre Betreuungskosten').closest('.shadow-lift') as HTMLElement;
    const inKarte = within(karte);
    expect(text(inKarte.getByText('2.800 €').parentElement!)).toBe('2.800 €im Monat');
    // Runde 14: EIN Absatz kleine Schrift im Wortlaut der Geschäftsführung.
    const kleineZeile = inKarte.getByText(/^Inklusive Lohn/);
    expect(text(kleineZeile)).toBe('Inklusive Lohn, Steuern, Sozialabgaben und Gebühren. Dazu kommen Kost und Logis und 125 € Reisekosten pro Fahrt.');
    // Keine Eigenanteil-Zeilen mehr an der Karte; stattdessen direkt unter der kleinen Schrift ein leiser Textlink (kein Kasten).
    expect(inKarte.queryByText(/^Ihr Eigenanteil/)).toBeNull();
    expect(inKarte.queryByText(/^nach Pflegegeld/)).toBeNull();
    expect(inKarte.queryByRole('button', { name: 'So rechnen wir ›' })).toBeNull();
    const link = inKarte.getByRole('button', { name: 'Alle Kosten im Überblick ›' });
    expect(link.parentElement!.previousElementSibling).toBe(kleineZeile);
    expect(link.className).toContain('underline');
    expect(link.className).not.toMatch(/\bbg-|\bborder\b|rounded/);
    // Dann die vier Punkte der Startseite.
    const punkt = inKarte.getByText('Kein Vertrag vor Ihrer Auswahl');
    expect(link.compareDocumentPosition(punkt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(inKarte.getByText('Keine Vermittlungsgebühr')).toBeInTheDocument();
    expect(inKarte.getByText('Täglich kündbar, taggenau abgerechnet')).toBeInTheDocument();
    expect(karte.querySelector('.bg-pm-mint')).toBeNull();
    // Unten in der Karte: Siegel, daneben Testsieger/Erfahrung, darunter die Sterne (Runde 15), nach den vier Punkten.
    const siegel = karte.querySelector('img[src="/badge-testsieger.webp"]')!;
    const sterne = await inKarte.findByRole('link', { name: /4,9 von 5 aus 126 Bewertungen/ }, { timeout: 5000 });
    expect(within(siegel.parentElement!).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['6× in Folge Testsieger DIE WELT', 'über 20 Jahre Erfahrung']);
    expect(siegel.compareDocumentPosition(sterne) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(punkt.compareDocumentPosition(siegel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Runde 15: Karte ohne Rand, Haken im Marken-Grün statt Koralle.
    expect(karte.className).toContain('!border-0');
    expect(punkt.closest('li')!.querySelector('svg')!.getAttribute('class')).toContain('text-pm-green');
    expect(karte.querySelector('.text-pm-coral')).toBeNull();
    // Weg aus der Karte: „Wir kümmern uns um alles", die Klappzeile „Alle Kosten im Überblick".
    expect(inKarte.queryByText('Wir kümmern uns um alles')).toBeNull();
    expect(inKarte.queryByRole('button', { name: 'Alle Kosten im Überblick' })).toBeNull();
    // „Mehr Infos" an der Bestpreisgarantie öffnet das Pop-up.
    await userEvent.click(inKarte.getByRole('button', { name: 'Mehr Infos' }));
    const sheet = await screen.findByRole('dialog', { name: 'Bestpreisgarantie' });
    await userEvent.click(within(sheet).getAllByRole('button', { name: 'Schließen' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Bestpreisgarantie' })).toBeNull());

    // Kosten-Satz und Heimvergleich nur in der Aufstellung; zu geht sie mit „Weniger anzeigen".
    expect(screen.queryByText('Kosten erst, wenn die Pflegekraft da ist.')).toBeNull();
    expect(screen.queryByText(/Zuhause statt Pflegeheim/)).toBeNull();
    await userEvent.click(link);
    expect(inKarte.getByText('Kosten erst, wenn die Pflegekraft da ist.')).toBeInTheDocument();
    expect(inKarte.getByText(/Zuhause statt Pflegeheim/)).toBeInTheDocument();
    expect(inKarte.queryByText(/6× Testsieger/)).toBeNull();
    await userEvent.click(inKarte.getByRole('button', { name: 'Weniger anzeigen' }));
    expect(screen.queryByText('Kosten erst, wenn die Pflegekraft da ist.')).toBeNull();
    expect(inKarte.queryByRole('button', { name: 'Weniger anzeigen' })).toBeNull();
    expect(inKarte.queryByRole('button', { name: 'Alle Kosten im Überblick' })).toBeNull();
    // Der Textlink bleibt stehen und öffnet wieder.
    expect(inKarte.getByRole('button', { name: 'Alle Kosten im Überblick ›' })).toBeInTheDocument();
  }, 15_000);

  it('Neukunde: „Alle Kosten im Überblick ›“ öffnet die Aufstellung und springt an ihren Anfang — darin „Was bleibt für Sie übrig“ mit dem Eigenanteil', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    await screen.findByRole('region', { name: 'Ihre passenden Pflegekräfte' }, { timeout: 5000 });
    expect(document.getElementById('kosten-ueberblick')).toBeNull();
    expect(screen.queryByText('Was bleibt für Sie übrig')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Alle Kosten im Überblick ›' }));
    const ueberblick = document.getElementById('kosten-ueberblick')!;
    expect(text(within(ueberblick).getByText('Betreuung').parentElement!)).toBe('Betreuung2.800 € / Monat');
    expect(screen.getByRole('button', { name: 'Weniger anzeigen' })).toBeInTheDocument();
    await waitFor(() => expect(gescrollt()).toContain('kosten-ueberblick'));
    // Der Eigenanteil steht in der Aufstellung (defaultLead: 2.800 € − Pflegegeld 347 € = 2.453 €).
    const rechnung = screen.getByText('Was bleibt für Sie übrig').parentElement!;
    expect(ueberblick.compareDocumentPosition(rechnung) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text(within(rechnung).getByText('Ihr Eigenanteil').parentElement!)).toBe('Ihr Eigenanteil2.453 €');
  }, 15_000);

  it('Neukunde ohne Zuschüsse in der Kalkulation: Textlink da, die Aufstellung ohne „Was bleibt für Sie übrig“', async () => {
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    setLocation('?token=token-ohne-zuschuesse');
    render(<CustomerPortalPage />);
    await screen.findByRole('region', { name: 'Ihre passenden Pflegekräfte' }, { timeout: 5000 });
    const karte = screen.getByText('Ihre Betreuungskosten').closest('.shadow-lift') as HTMLElement;
    expect(within(karte).getByText('Kein Vertrag vor Ihrer Auswahl')).toBeInTheDocument();
    expect(within(karte).getByRole('button', { name: 'Mehr Infos' })).toBeInTheDocument();
    await userEvent.click(within(karte).getByRole('button', { name: 'Alle Kosten im Überblick ›' }));
    expect(document.getElementById('kosten-ueberblick')).not.toBeNull();
    expect(screen.queryByText('Was bleibt für Sie übrig')).toBeNull();
    expect(screen.queryByText(/Ihr Eigenanteil/)).toBeNull();
  }, 15_000);

  it('Neukunde: die Profile als Zeilen in EINER weißen Karte, ohne Knöpfe und ohne Sterne — Deutsch mit Punkten, Erfahrung und Einsätze bei uns', async () => {
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    // Kopf „Ihre passenden Pflegekräfte" (Runde 13 ohne Versalien-Zeile); keine Zahl, keine eigene Überschrift über den Zeilen.
    const bereich = await screen.findByRole('region', { name: 'Ihre passenden Pflegekräfte' }, { timeout: 5000 });
    expect(within(bereich).queryByText('Für Sie ausgewählt')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Die Profile' })).toBeNull();
    // Der Kopf steht sofort, die Zeilen kommen mit den Vorschlägen.
    const zeile = await within(bereich).findByRole('button', { name: 'Profil von Helena K. ansehen' }, { timeout: 5000 });
    expect(within(zeile).getByText('Unsere Empfehlung')).toBeInTheDocument();
    expect(within(zeile).getByText('Deutsch gut')).toBeInTheDocument();
    expect(zeile.querySelectorAll('span.bg-pm-taupe')).toHaveLength(3);
    // Ganze Teile; der Trenner „·" kommt per CSS (am Zeilenanfang abgeschnitten).
    expect([...zeile.querySelectorAll('.whitespace-nowrap')].map((t) => t.textContent)).toEqual(['5 Jahre Erfahrung', '15 Einsätze bei uns']);
    expect(zeile.textContent).not.toContain('★');
    // Runde 15: eine weiße Karte mit Haarlinien.
    expect(zeile.parentElement!.className).toContain('rounded-card');
    expect(zeile.parentElement!.className).toContain('divide-y');
    // Keine Knöpfe je Pflegekraft mehr.
    expect(screen.queryByRole('button', { name: 'Profil vervollständigen & einladen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Einladen' })).toBeNull();
  }, 15_000);

});
