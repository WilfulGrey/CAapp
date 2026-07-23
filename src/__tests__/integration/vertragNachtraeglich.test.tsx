/** @vitest-environment jsdom */
// Vertrag nachträglich abschließen (Martin, 2026-07-15): Die Agentur hat die
// Bewerbung im SA-Portal akzeptiert → mamamia setzt final_confirmation am Job,
// es gibt KEINE lead_application_acceptances-Zeile und die Bewerbung ist aus
// listApplications verschwunden. Das Portal zeigt den BookedScreen über die
// fc-Synthese (PR #378) — aber ohne Vertrag. Dieser Test fährt den Nachhol-Pfad:
//   BookedScreen-Button → AngebotPruefenModal NUR Schritt 2 (contractOnly) →
//   Unterschrift → Bridge-POST (Upsert inkl. contract_snapshot, application_id =
//   numerische fc-Referenz) + Team-Mail-Resend (team_only_resend, weil die
//   route.ts-Dedupe die Team-Mail sonst verschluckt) → Vertrag sofort im Kasten.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import {
  defaultHandlers,
  defaultLead,
  sampleCustomer,
  sampleCaregiver,
  TEST_LEAD_TOKEN,
  TEST_JOB_OFFER_ID,
  bridgeHandler,
} from '../../../test/fixtures/mamamia-mocks';

// Mock Supabase helpers — Supabase-js uses a fetch impl that doesn't route
// through MSW under Node 18 / jsdom (gleicher Ansatz wie portal.test.tsx).
vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    fetchLeadByToken: vi.fn(async (token: string) => {
      if (token === TEST_LEAD_TOKEN) {
        return { lead: defaultLead as unknown as import('../../lib/supabase').Lead, error: null };
      }
      return { lead: null, error: 'Token nicht gefunden' };
    }),
  };
});

import CustomerPortalPage from '../../pages/CustomerPortalPage';

beforeAll(() => {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.scrollTo = vi.fn();
  if (!('IntersectionObserver' in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  }
});

function setLocation(search: string) {
  window.history.replaceState({}, '', `/${search}`);
}

const FC_ID = 5511;

// Kunde-Hagedorn-Szenario: bestätigter Job mit final_confirmation,
// Bewerbungsliste leer, keine Portal-Annahme.
const confirmedCustomer = {
  ...sampleCustomer,
  job_offers: [
    {
      id: TEST_JOB_OFFER_ID,
      arrival_at: '2026-08-01 00:00:00',
      departure_at: '2026-09-12 00:00:00',
      salary_offered: 2490,
      status: 'on_job',
      final_confirmation: {
        id: FC_ID,
        final_confirmed_at: '2026-07-14 09:30:00',
        caregiver: {
          id: sampleCaregiver.id,
          first_name: sampleCaregiver.first_name,
          last_name: sampleCaregiver.last_name,
        },
      },
    },
  ],
};

describe('Vertrag nachträglich abschließen (agentur-seitige Annahme)', () => {
  it('BookedScreen-Button → contractOnly-Modal (nur Schritt 2) → Upsert-POST + Team-Resend + Vertrag sichtbar', async () => {
    const bridgeCalls: { token?: string; event?: string; metadata?: Record<string, unknown> }[] = [];
    server.use(
      bridgeHandler((body) => {
        bridgeCalls.push(body as (typeof bridgeCalls)[number]);
      }),
      ...defaultHandlers({
        proxy: {
          getCustomer: () => ({ Customer: confirmedCustomer }),
          // Mamamia hat die akzeptierte Bewerbung aus listApplications entfernt.
          listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
          // Keine Portal-Annahme → leere Acceptance-Liste (Pfad 3 der Overlay-Logik).
          listAcceptedApplications: () => ({ application_ids: [], rows: [] }),
        },
      }),
    );

    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // BookedScreen rendert über die fc-Synthese; der Vertrag-Milestone ist
    // ein aktiver Schritt (Hinweis + Button) statt „wird vorbereitet".
    await screen.findByText(/Pflegekraft gebucht!/i, {}, { timeout: 5000 });
    expect(await screen.findByText(/Bitte schließen Sie noch Ihren Betreuungsvertrag ab\./)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Vertrag jetzt abschließen/ }));

    // Modal öffnet DIREKT auf dem Vertragsformular (Schritt 2) — kein
    // Angebots-Schritt, keine Tab-Navigation zurück zu Schritt 1.
    expect(await screen.findByText(/zu betreuende Person/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Weiter →/ })).toBeNull();
    expect(screen.queryByText('1 · Angebot')).toBeNull();
    expect(screen.queryByRole('button', { name: /Zurück zum Angebot/ })).toBeNull();

    // Vorbefüllt aus lead.patient_* (Stufe B).
    expect(screen.getByDisplayValue('Anna')).toBeTruthy();

    // Kontaktperson-Pflichtfelder ausfüllen (Platzhalter „Vorname"/„Nachname"
    // existieren nur dort — LE-Felder sind vorbefüllt; gleiche Selektorik wie
    // portal.test.tsx happy path).
    await user.type(await screen.findByPlaceholderText('Vorname'), 'Max');
    await user.type(screen.getByPlaceholderText('Nachname'), 'Kontakt');
    const kpSection = screen.getByText(/Kontaktperson/).closest('div')!;
    const kpInputs = within(kpSection.parentElement!).getAllByPlaceholderText('Bitte eingeben');
    const byLabel = (needle: string) => kpInputs.find(el => {
      const label = el.closest('div')?.querySelector('label')?.textContent ?? '';
      return label.includes(needle) && label.includes('*');
    });
    const kpTelefonInput = byLabel('Telefon');
    const kpEmailInput = byLabel('E-Mail');
    if (!kpTelefonInput || !kpEmailInput) throw new Error('KP Telefon/E-Mail input not found');
    await user.type(kpTelefonInput, '+49 89 12345');
    await user.clear(kpEmailInput);
    await user.type(kpEmailInput, 'max@kontakt.de');

    // Unterschrift (VertragSignieren embedded — identisch zum Annahme-Flow).
    await user.type(await screen.findByPlaceholderText('Vor- und Nachname'), 'Max Kontakt');
    await user.click(screen.getByText(/Ich habe den gesamten Vertragsinhalt gelesen/));
    await user.click(screen.getByText(/Ich verlange ausdrücklich/));
    await user.click(screen.getByRole('button', { name: /Kostenpflichtig unterschreiben/i }));

    // Bridge-Kette: 1. Upsert-Event (persistiert contract_snapshot serverseitig),
    // 2. Team-Mail-Resend. reportLeadEvent-Events (portal_opened, …) laufen über
    // denselben Endpoint → auf application_accepted_internal filtern.
    await waitFor(() => {
      expect(bridgeCalls.filter((c) => c.event === 'application_accepted_internal').length).toBeGreaterThanOrEqual(2);
    }, { timeout: 3000 });
    const acceptCalls = bridgeCalls.filter((c) => c.event === 'application_accepted_internal');
    const [upsertCall, resendCall] = acceptCalls;

    // Upsert-POST: numerische fc-Referenz (route.ts verlangt Number.isFinite),
    // caregiver_id (für die Caregiver-Rekonstruktion nach Reload), Signatur +
    // Vertrags-Snapshot mit den Eckdaten der gebuchten Kraft/des Jobs.
    expect(upsertCall.token).toBe(TEST_LEAD_TOKEN);
    const meta = upsertCall.metadata as Record<string, any>;
    expect(meta.application_id).toBe(FC_ID);
    expect(meta.caregiver_id).toBe(sampleCaregiver.id);
    expect(meta.team_only_resend).toBeUndefined();
    expect(meta.signatur).toBe('Max Kontakt');
    expect(meta.contract).toBeTruthy();
    expect(meta.contract.vertragsbeginn).toBe('01.08.2026');
    expect(meta.contract.voraussAbreise).toBe('12.09.2026');
    expect(meta.contract.tagessatz).toBe('EUR 83,00'); // 2490 / 30
    expect((meta.contract_contact as Record<string, unknown>).vorname).toBe('Max');

    // Team-Mail-Resend: gleiche Daten + team_only_resend (route.ts: nur
    // Team-Mail, kein DB-Write, keine Kunden-Mail — Mail C bleibt einmalig).
    expect((resendCall.metadata as Record<string, unknown>).team_only_resend).toBe(true);
    expect((resendCall.metadata as Record<string, any>).application_id).toBe(FC_ID);

    // signedForm gesetzt → Vertrag erscheint sofort als unterschrieben
    // (PDF-Link-Variante, lead.id + token vorhanden); Button verschwindet.
    await waitFor(() => expect(screen.getByText(/✓ Unterschrieben/)).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByRole('button', { name: /Vertrag jetzt abschließen/ })).toBeNull();
  }, 20000);

  it('Regression: Portal-Annahme mit persistiertem contract_snapshot → kein Nachhol-Button', async () => {
    server.use(
      ...defaultHandlers({
        proxy: {
          // Realer Zustand nach dem Server-Sync (#396): die Portal-Annahme hat
          // binnen Minuten eine final_confirmation am SESSION-Job — das Multi-
          // Job-Gate (Opcja B, Dachs 8899) synthetisiert NUR dann. Ohne fc am
          // Session-Job gehörte der Akzept zu einem anderen Einsatz.
          getCustomer: () => ({ Customer: confirmedCustomer }),
          listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
          // Portal-Annahme liegt vor, inkl. Snapshot → Vertrag ist erledigt.
          listAcceptedApplications: () => ({
            application_ids: [333],
            rows: [{
              application_id: 333,
              caregiver_id: sampleCaregiver.id,
              accepted_at: '2026-07-10T10:00:00Z',
              contract_snapshot: {
                datum: '10.07.2026',
                vertragsbeginn: '01.08.2026',
                voraussAbreise: '12.09.2026',
                tagessatz: 'EUR 83,00',
                ag: { name: 'Anna Testerin' },
                le: null,
                dl: { name: 'Kamila Bilska-Wabik' },
              },
            }],
          }),
        },
      }),
    );

    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);

    await screen.findByText(/Pflegekraft gebucht!/i, {}, { timeout: 5000 });
    // Vertrag liegt vor → „✓ Unterschrieben", niemals der Nachhol-Button.
    await waitFor(() => expect(screen.getByText(/✓ Unterschrieben/)).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByRole('button', { name: /Vertrag jetzt abschließen/ })).toBeNull();
    expect(screen.queryByText(/Bitte schließen Sie noch Ihren Betreuungsvertrag ab/)).toBeNull();
  }, 20000);
});
