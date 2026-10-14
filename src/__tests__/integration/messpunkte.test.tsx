/** @vitest-environment jsdom */
// Unsichtbare Messpunkte im Portal (Registry #123, Martin 14.10.2026): Was ein echter Kunde vor dem ersten Speichern
// ansieht und antippt, geht als Ereignis an die Bridge — mit `notify: false`, ohne Personendaten, einmal je Sitzung
// (Profil und Einladen je Pflegekraft, Fragen je Frage). Sichtbar ändert sich dabei nichts.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { defaultHandlers, defaultLead, bridgeHandler } from '../../../test/fixtures/mamamia-mocks';
import { MESSPUNKTE } from '../../lib/leadEvents';

const TOKEN = 'token-messpunkte';

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    fetchLeadByToken: vi.fn(async (token: string) => {
      if (token === 'token-messpunkte') {
        return { lead: { ...defaultLead, token } as unknown as import('../../lib/supabase').Lead, error: null };
      }
      return { lead: null, error: 'Token nicht gefunden' };
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

type Meldung = { token?: string; event?: string; metadata?: Record<string, unknown>; notify?: boolean };
const ERLAUBTE_FELDER = ['caregiver_id', 'quelle', 'vor_speichern', 'frage'];
// Lesende Aufrufe der Seite (Ereignisse für die Karten, Sterne) — hier ohne Inhalt.
const lesen = [
  http.get('https://kostenrechner.primundus.de/api/lead-event', () => HttpResponse.json({ events: [] })),
  http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
];

describe('Messpunkte vor dem ersten Speichern (Rückbau, Registry #122/#123)', () => {
  it('Einladen mit Schloss, Warum, Bestpreis, Kosten, Frage und Profil — je eine stille Meldung ohne Personendaten', async () => {
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }),
    );
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Noch 2 Minuten bis zu Ihren Bewerbungen', {}, { timeout: 5000 });
    const messpunkte = () => meldungen.filter((m) => (MESSPUNKTE as readonly string[]).includes(m.event ?? ''));
    const von = (event: string) => messpunkte().filter((m) => m.event === event);

    // „Einladen" mit Schloss → Meldung + Pop-up „Warum erst die Pflegesituation?"
    await user.click(screen.getAllByRole('button', { name: 'Einladen' })[0]);
    const warum = await screen.findByRole('dialog', { name: 'Warum erst die Pflegesituation?' });
    await user.click(within(warum).getAllByRole('button', { name: 'Schließen' })[0]);

    // Bestpreisgarantie (Kostenkarte) → Pop-up
    await user.click(screen.getByRole('button', { name: /^Bestpreisgarantie/ }));
    const bestpreis = await screen.findByRole('dialog');
    await user.click(within(bestpreis).getAllByRole('button', { name: 'Schließen' })[0]);

    // „Alle Kosten im Überblick", zweimal auf/zu → eine Meldung
    await user.click(screen.getByRole('button', { name: 'Alle Kosten im Überblick' }));
    await user.click(screen.getByRole('button', { name: 'Weniger anzeigen' }));
    await user.click(screen.getByRole('button', { name: 'Alle Kosten im Überblick' }));

    // Häufige Frage
    await user.click(screen.getByRole('button', { name: 'Was brauche ich zu Hause?' }));

    // Profil über die Karte
    await user.click(screen.getByText('Helena K.'));

    await waitFor(() => {
      expect(von('einladen_getippt')).toHaveLength(1);
      expect(von('warum_geoeffnet')).toHaveLength(1);
      expect(von('bestpreis_geoeffnet')).toHaveLength(1);
      expect(von('kosten_aufgeklappt')).toHaveLength(1);
      expect(von('faq_geoeffnet')).toHaveLength(1);
      expect(von('profil_geoeffnet')).toHaveLength(1);
    });
    expect(von('einladen_getippt')[0].metadata).toEqual({ caregiver_id: 50002, quelle: 'karte', vor_speichern: true });
    expect(von('profil_geoeffnet')[0].metadata).toEqual({ caregiver_id: 50002, quelle: 'karte', vor_speichern: true });
    expect(von('faq_geoeffnet')[0].metadata).toEqual({ frage: 'zuhause' });
    for (const m of messpunkte()) {
      expect(m.token).toBe(TOKEN);
      expect(m.notify).toBe(false);
      for (const feld of Object.keys(m.metadata ?? {})) expect(ERLAUBTE_FELDER).toContain(feld);
    }
  }, 20_000);

  it('Kalender im Patientenbogen: geöffnet und ohne Datum wieder zu', async () => {
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }),
    );
    // Entwurf mit Schritt 1 und 2 ausgefüllt, ohne Startdatum — damit der Kalender in Schritt 3 erreichbar ist.
    localStorage.setItem(`patient_${TOKEN}`, JSON.stringify({
      _isDraft: true, anzahl: '1', geschlecht: 'Weiblich',
      mobilitaet: 'Rollatorfähig', heben: 'Nein', demenz: 'Nein', nacht: 'Nein',
      plz: '80331', ort: 'München', wohnungstyp: 'Einfamilienhaus', urbanisierung: 'Großstadt', startDate: '',
    }));
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText(/Schritt 1 von 4/, {}, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Weiter →' }));
    await user.click(screen.getByRole('button', { name: 'Weiter →' }));
    await screen.findByText(/Schritt 3 von 4/);
    const feld = screen.getByRole('button', { name: 'Datum wählen' });
    await user.click(feld);
    await user.click(feld);
    await waitFor(() => {
      const ereignisse = meldungen.map((m) => m.event);
      expect(ereignisse.filter((e) => e === 'kalender_geoeffnet')).toHaveLength(1);
      expect(ereignisse.filter((e) => e === 'kalender_zu_ohne_datum')).toHaveLength(1);
    });
    for (const m of meldungen.filter((x) => x.event?.startsWith('kalender_'))) {
      expect(m.notify).toBe(false);
      expect(m).not.toHaveProperty('metadata');
    }
  }, 20_000);
});
