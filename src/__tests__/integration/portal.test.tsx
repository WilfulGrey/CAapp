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

  it('happy path: token → review → accept → Confirmation', async () => {
    let confirmationCalled = false;

    server.use(
      ...defaultHandlers({
        proxy: {
          storeConfirmation: () => {
            confirmationCalled = true;
            return { StoreConfirmation: { id: 77, application_id: 333, is_confirm_binding: true } };
          },
        },
      }),
    );

    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // Wait for the pending-applications card to render with "Angebot prüfen"
    const reviewBtn = await screen.findByRole('button', { name: /Angebot prüfen/i }, { timeout: 5000 });
    await user.click(reviewBtn);

    // Modal step 1 → click Weiter
    const weiter = await screen.findByRole('button', { name: /^Weiter/i });
    await user.click(weiter);

    // Step 2 — fill required Kontaktperson fields.
    // Placeholders "Vorname" / "Nachname" appear ONLY in Kontaktperson (Hauptpatient
    // fields are prefilled <input value={}>, no placeholder).
    await user.type(await screen.findByPlaceholderText('Vorname'), 'Max');
    await user.type(screen.getByPlaceholderText('Nachname'), 'Kontakt');

    // KP Telefon is the only "Telefon *" (asterisk = required) label. Find via
    // the label element, then its sibling input.
    const kpSection = screen.getByText(/Kontaktperson/).closest('div')!;
    const kpTelefonInput = within(kpSection.parentElement!)
      .getAllByPlaceholderText('Bitte eingeben')
      .find(el => {
        const label = el.closest('div')?.querySelector('label')?.textContent ?? '';
        return label.includes('Telefon') && label.includes('*');
      });
    if (!kpTelefonInput) throw new Error('KP Telefon input not found');
    await user.type(kpTelefonInput, '+49 89 12345');

    // AGB checkbox — click label
    await user.click(screen.getByText(/Ich akzeptiere das Angebot verbindlich/));

    // Accept
    const acceptBtn = screen.getByRole('button', { name: /Betreuungskraft akzeptieren/i });
    await user.click(acceptBtn);

    // BookedScreen rendered
    await waitFor(
      () => expect(screen.getByText(/Pflegekraft gebucht!/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(confirmationCalled).toBe(true);
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
            return { SendInvitationCaregiver: true };
          },
        },
      }),
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
