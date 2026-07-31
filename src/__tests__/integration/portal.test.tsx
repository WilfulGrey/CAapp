/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import {
  defaultHandlers,
  defaultLead,
  sampleMatching,
  TEST_LEAD_TOKEN,
  bridgeHandler,
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
      return { lead: null, error: 'Token nicht gefunden' };
    }),
  };
});

import CustomerPortalPage from '../../pages/CustomerPortalPage';

// jsdom doesn't implement URL.createObjectURL / scrollTo — portal's PDF download
// and scrollTo-on-click accesses these. Stub lightly.
beforeAll(() => {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.scrollTo = vi.fn();
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
  window.history.replaceState({}, '', `/${search}`);
}

describe('Portal integration: golden paths', () => {
  // ─── Path 1: Happy (accept application) ─────────────────────────────────

  it('happy path: token → review → accept → bridge POST + BookedScreen', async () => {
    // MVP flow: acceptance does NOT call Mamamia STORE_CONFIRMATION; it
    // POSTs to the kostenrechner bridge with event=application_accepted_internal.
    // Bridge writes lead_application_acceptances + fires team mail.
    let bridgePayload: { token?: string; event?: string; metadata?: unknown } | null = null;

    // bridgeHandler with capture FIRST so it takes priority over the
    // default no-op bridge handler bundled in defaultHandlers().
    server.use(
      bridgeHandler((body) => {
        bridgePayload = body;
      }),
      ...defaultHandlers({}),
    );

    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // Wait for the pending-applications card to render with "Angebot prüfen"
    const reviewBtn = await screen.findByRole('button', { name: /Angebot prüfen/i }, { timeout: 5000 });

    // Rekruter-Hinweis (application.message) VERBATIM — schon auf der Karte
    // (Registry #22: kein LLM, kein Filter; Fixture-Text 1:1 durch den vollen
    // Pfad proxy → mapper → UI).
    expect(screen.getByText('Test application message')).toBeTruthy();

    await user.click(reviewBtn);

    // …und im Modal an der Entscheidungsstelle (dort amber hervorgehoben).
    await waitFor(() => expect(screen.getAllByText('Test application message').length).toBeGreaterThan(1));

    // Seite 1 = Angebot/Konditionen → weiter zu Daten & Vertrag (Seite 2).
    await user.click(await screen.findByRole('button', { name: /Weiter →/ }));

    // Seite 2 = Kundendaten + Vertrag. Kontaktperson-Pflichtfelder ausfüllen.
    // Placeholders "Vorname" / "Nachname" appear ONLY in Kontaktperson
    // (Hauptpatient fields are prefilled <input value={}>, no placeholder).
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

    // Vertrag-Unterschrift: Name tippen = Unterschrift,
    // beide Pflicht-Häkchen, dann rechtsverbindlich unterschreiben.
    await user.type(await screen.findByPlaceholderText('Vor- und Nachname'), 'Max Kontakt');
    await user.click(screen.getByText(/Ich habe den gesamten Vertragsinhalt gelesen/));
    await user.click(screen.getByText(/Ich verlange ausdrücklich/));
    await user.click(screen.getByRole('button', { name: /Kostenpflichtig unterschreiben/i }));

    // BookedScreen rendered (copy includes "Pflegekraft gebucht!" substring)
    await waitFor(
      () => expect(screen.getByText(/Pflegekraft gebucht!/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    // Bridge called with event=application_accepted_internal + contract data
    await waitFor(() => expect(bridgePayload).not.toBeNull(), { timeout: 1000 });
    expect(bridgePayload!.event).toBe('application_accepted_internal');
    const meta = bridgePayload!.metadata as Record<string, unknown>;
    expect((meta.contract_contact as Record<string, unknown>).vorname).toBe('Max');
    expect((meta.contract_contact as Record<string, unknown>).nachname).toBe('Kontakt');
  }, 15000);

  // ─── Path 2: Decline (reject application) ───────────────────────────────

  it('decline path: reject with message → moved to Bereits bearbeitet', async () => {
    let rejectCalled = false;
    let capturedMessage: string | undefined;

    server.use(
      ...defaultHandlers({
        proxy: {
          rejectApplication: (vars) => {
            rejectCalled = true;
            capturedMessage = vars.reject_message as string | undefined;
            return { RejectApplication: { id: 333, rejected_at: '2026-04-24T11:00Z', reject_message: vars.reject_message ?? null } };
          },
        },
      }),
    );

    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // Wait for "Angebot prüfen" to confirm initial AppCards rendered
    await screen.findByRole('button', { name: /Angebot prüfen/i }, { timeout: 5000 });

    // Click "Ablehnen" on the application card
    const declineBtns = screen.getAllByRole('button', { name: /^Ablehnen$/ });
    await user.click(declineBtns[0]);

    // Confirm modal appears — wait for its unique textarea placeholder
    const msgTextarea = await screen.findByPlaceholderText(/passt leider nicht/i, {}, { timeout: 3000 });
    await user.type(msgTextarea, 'Nie pasuje profilem');

    // The last "Ablehnen" button is the red confirm inside modal
    const finalDeclineBtns = screen.getAllByRole('button', { name: /^Ablehnen$/ });
    await user.click(finalDeclineBtns[finalDeclineBtns.length - 1]);

    // "Bereits bearbeitet" section appears only when doneApps > 0
    await waitFor(
      () => expect(screen.getByText(/Bereits bearbeitet/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(rejectCalled).toBe(true);
    expect(capturedMessage).toBe('Nie pasuje profilem');
  }, 15000);

  // ─── Path 3: Invite matched caregiver ───────────────────────────────────

  it('invite path: 0 applications + invite match → Einladung gesendet', async () => {
    let inviteCaregiverId: number | null = null;

    server.use(
      ...defaultHandlers({
        proxy: {
          listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
          listMatchings: () => ({ JobOfferMatchingsWithPagination: { total: 1, data: [sampleMatching] } }),
          inviteCaregiver: (vars) => {
            inviteCaregiverId = vars.caregiver_id as number;
            // Backend now returns the persisted Request row (StoreRequest
            // mutation under panel-flow agency-only session). Match real
            // proxy response shape so future readers see the truth.
            return {
              StoreRequest: {
                id: 999,
                caregiver_id: vars.caregiver_id as number,
                job_offer_id: 16235,
                message: null,
                created_at: '2026-04-28T09:43:44.000000Z',
              },
            };
          },
        },
      }),
    );

    // Panel-style flow lives in the Edge Function — browser doesn't need
    // to verify anything before clicking Einladen.
    // Strict invite-gate (since 2026-05-09) blocks Einladen until
    // patient profile is saved. AngebotCard hydrates `saved` from this
    // localStorage entry on mount → patientSaved=true → gate opens.
    localStorage.setItem(
      `patient_${TEST_LEAD_TOKEN}`,
      JSON.stringify({ _isDraft: false }),
    );
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // findByRole polls until the element appears — handles the async
    // session bootstrap (mmReady flips from false to true).
    const inviteBtn = await screen.findByRole(
      'button', { name: /^Einladen$/i }, { timeout: 5000 },
    );
    await user.click(inviteBtn);

    // After click: MatchCard awaits the real mutation (no fake setTimeout).
    // The mutation hits MSW which records caregiver_id immediately.
    await waitFor(() => expect(inviteCaregiverId).toBe(sampleMatching.caregiver.id), {
      timeout: 5000,
    });
  }, 15_000);
});
