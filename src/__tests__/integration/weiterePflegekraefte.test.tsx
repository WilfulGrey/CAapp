/** @vitest-environment jsdom */
// Registry #164 (Martin 14.11.2026): „ermöglichen, weitere PKs anzuzeigen mit Textlink unter der letzten. Und spätestens nach
// 2 x dann bitte Angaben vervollständigen und Bewerbungen erhalten“; „niemals einen grünen Link“. Nach dem Speichern dieselben
// Zeilen wie vorher, mit „Einladen“ in der Zeile („wenn Daten vervollständigt sind, kann man hier auch machen, einladen“),
// dezent umrandet („bei Mouse Over ist er dann ausgefüllt“).
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { defaultHandlers, defaultLead, sampleCaregiver, sampleCustomer, sampleMatching, bridgeHandler } from '../../../test/fixtures/mamamia-mocks';
import { vormerkSchluessel } from '../../lib/vormerkungen';
import { weitereText } from '../../components/portal/EinstiegMinimal';

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    // Token mit „gespeichert“: Pflegesituation schon abgeschickt (wie in nachAbsendenAngebot.test.tsx).
    fetchLeadByToken: vi.fn(async (token: string) => token.startsWith('token-wp-')
      ? { lead: { ...defaultLead, token, ...(token.includes('gespeichert') ? { patient_form_at: '2026-09-24T10:00:00Z', patient_form: { startDate: '2099-11-15' } } : {}) } as unknown as import('../../lib/supabase').Lead, error: null }
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
beforeEach(() => { localStorage.clear(); });

// 17 Vorschläge (Kennungen 60001–60017); die erste ist die Empfehlung (mehr Einsätze) und steht oben.
const VORNAMEN = ['Ada', 'Bea', 'Cora', 'Dana', 'Eva', 'Fina', 'Gerda', 'Hanna', 'Ines', 'Jana', 'Karla', 'Lena', 'Mira', 'Nora', 'Olga', 'Paula', 'Rita'];
const viele = () => ({ JobOfferMatchingsWithPagination: { total: VORNAMEN.length, data: VORNAMEN.map((vorname, i) => ({
  ...sampleMatching, id: 20001 + i, is_best_matching: i === 0,
  caregiver: { ...sampleCaregiver, id: 60001 + i, first_name: vorname, last_name: 'Test', hp_total_jobs: i === 0 ? 15 : 3 },
})) } });
const ohneBewerbung = { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) };
const lesen = [
  http.get('https://kostenrechner.primundus.de/api/lead-event', () => HttpResponse.json({ events: [] })),
  http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
];
type Meldung = { event?: string; metadata?: Record<string, unknown>; notify?: boolean };
const zeilen = () => [...document.querySelectorAll('[data-pflegekraft-zeile]')] as HTMLElement[];
const link = () => document.querySelector('[data-weitere-anzeigen]') as HTMLElement | null;
const ueberschrift = () => document.getElementById('pflegekraefte')!.querySelector('h2')!.textContent;

describe('5 weitere Pflegekräfte anzeigen (Registry #164, vor dem ersten Speichern)', () => {
  it('Link unter der fünften Zeile, je Tipp 5 weitere, höchstens zweimal; Farbe wie die übrigen Links (Taupe), nie grün; Messpunkt je Seite', async () => {
    const meldungen: Meldung[] = [];
    server.use(bridgeHandler((b) => { meldungen.push(b as Meldung); }), ...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: viele } }));
    window.history.replaceState({}, '', '/?token=token-wp-link');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(5), { timeout: 5000 });
    expect(ueberschrift()).toBe('Ihre Pflegekräfte-Auswahl5');
    expect(link()!.textContent).toBe('5 weitere Pflegekräfte anzeigen');
    expect(weitereText(5)).toBe('5 weitere Pflegekräfte anzeigen');
    expect(weitereText(1)).toBe('1 weitere Pflegekraft anzeigen');
    expect(link()!.className).toContain('text-pm-taupe-ink');
    expect(link()!.className).not.toMatch(/pm-green/);
    // Der Link steht zwischen der letzten Zeile und dem Kasten „Ihre Angaben sind noch unvollständig“.
    const kasten = document.querySelector('[data-liste-knopf]')!;
    expect(zeilen()[4].compareDocumentPosition(link()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link()!.compareDocumentPosition(kasten) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const erste = zeilen().slice(0, 5).map((z) => z.dataset.pflegekraftZeile);

    await user.click(link()!);
    await waitFor(() => expect(zeilen()).toHaveLength(10));
    // Die oberen fünf bleiben, wo sie sind.
    expect(zeilen().slice(0, 5).map((z) => z.dataset.pflegekraftZeile)).toEqual(erste);
    expect(ueberschrift()).toBe('Ihre Pflegekräfte-Auswahl10');
    await user.click(link()!);
    await waitFor(() => expect(zeilen()).toHaveLength(15));
    // Nach dem zweiten Mal kein Link mehr, obwohl noch 2 übrig sind; darunter steht nur der Kasten.
    expect(link()).toBeNull();
    expect(document.querySelector('[data-liste-knopf]')).not.toBeNull();
    await waitFor(() => expect(meldungen.filter((m) => m.event === 'weitere_pflegekraefte').map((m) => m.metadata)).toEqual([{ seite: 1 }, { seite: 2 }]));
    for (const m of meldungen.filter((x) => x.event === 'weitere_pflegekraefte')) expect(m.notify).toBe(false);
  }, 20_000);

  it('eine Vormerkung aus den weiteren Zeilen bleibt nach dem Neuladen sichtbar (die Seiten öffnen sich so weit wie nötig) und wird nicht verworfen', async () => {
    const TOKEN = 'token-wp-neuladen';
    // Hanna steht als achte Pflegekraft in der zweiten Seite.
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([60008]));
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: viele } }));
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(10), { timeout: 5000 });
    const hanna = document.querySelector('[data-pflegekraft-zeile="60008"]') as HTMLElement;
    expect(hanna.querySelector('[data-zeile-eingeladen]')!.textContent).toBe('Eingeladen');
    expect(document.querySelector('[data-vormerk-zeile]')!.textContent).toMatch(/^Nach dem Speichern laden wir Hanna/);
    // Noch eine Seite möglich.
    expect(link()!.textContent).toBe('5 weitere Pflegekräfte anzeigen');
    await new Promise((r) => setTimeout(r, 200));
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel(TOKEN))!)).toEqual([60008]);
  }, 20_000);
});

describe('Nach dem Speichern: dieselben Zeilen mit „Einladen“ (Registry #164)', () => {
  it('Zeilen statt Karten, „Einladen“ umrandet in Koralle (gefüllt bei Maus und Tipp), kein Link „weitere“; Tipp lädt ein wie die Karte', async () => {
    const eingeladen: number[] = [];
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, getCustomer: () => ({ Customer: { ...sampleCustomer, status: 'active' } }), listMatchings: viele, inviteCaregiver: (vars) => { eingeladen.push(vars.caregiver_id as number); return { StoreRequest: { id: 1, caregiver_id: vars.caregiver_id } }; } } }),
    );
    window.history.replaceState({}, '', '/?token=token-wp-gespeichert');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen().length).toBeGreaterThan(0), { timeout: 8000 });
    expect(document.querySelector('[data-einstieg="minimal"]')).toBeNull();
    expect(document.querySelector('.rounded-card.cursor-pointer')).toBeNull();
    expect(screen.queryByText('Unsere Empfehlung für Sie')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Elite|Stammkraft|Einsätze bei uns/);
    expect(link()).toBeNull();
    const ersteZeile = zeilen()[0];
    const knopf = within(ersteZeile).getByRole('button', { name: 'Einladen' });
    for (const k of ['border-pm-coral', 'bg-white', 'text-pm-coral-ink', 'hover:bg-pm-coral', 'active:bg-pm-coral']) expect(knopf.className).toContain(k);
    // Der Knopf liegt nicht im Profil-Knopf der Zeile (kein Knopf im Knopf).
    expect(knopf.closest('button')).toBe(knopf);
    expect(knopf.parentElement!.closest('button')).toBeNull();
    const id = Number(ersteZeile.dataset.pflegekraftZeile);
    await user.click(knopf);
    await waitFor(() => expect(eingeladen).toEqual([id]), { timeout: 8000 });
    await waitFor(() => expect(meldungen.find((m) => m.event === 'einladen_getippt')?.metadata).toEqual({ caregiver_id: id, quelle: 'karte', vor_speichern: false }));
  }, 30_000);
});
