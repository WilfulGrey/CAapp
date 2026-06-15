/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as client from '../../lib/mamamia/client';
import type { LeadJobRow } from '../../lib/mamamia/types';

// Mock the edge-function client: onboard (used by useMamamiaSession) +
// callMamamia (used by useLeadJobs). Keep MamamiaError real.
vi.mock('../../lib/mamamia/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/mamamia/client')>();
  return { ...actual, onboardWithLeadToken: vi.fn(), callMamamia: vi.fn() };
});

import JobsOverviewPage from '../../pages/JobsOverviewPage';

const onboardMock = client.onboardWithLeadToken as unknown as ReturnType<typeof vi.fn>;
const callMock = client.callMamamia as unknown as ReturnType<typeof vi.fn>;

function setUrl(search: string) {
  window.history.replaceState({}, '', search);
}

// The onboard → ready → listLeadJobs → setState chain is several async ticks;
// under the full parallel suite (CPU contention) it can exceed RTL's 1000ms
// default. Give findBy* headroom so these stay non-flaky in CI.
const FIND = { timeout: 5000 } as const;

function row(p: Partial<LeadJobRow>): LeadJobRow {
  return {
    id: p.id ?? 'j',
    mamamia_job_offer_id: p.mamamia_job_offer_id ?? 1,
    status: p.status ?? 'geplant',
    anreise: p.anreise ?? null,
    abreise: p.abreise ?? null,
    position: p.position ?? 0,
    pflegekraft: p.pflegekraft ?? null,
    bewerbungen: p.bewerbungen ?? null,
  };
}

describe('JobsOverviewPage (?view=jobs)', () => {
  beforeEach(() => {
    onboardMock.mockReset();
    callMock.mockReset();
    sessionStorage.clear();
  });

  it('no token → shows missing-link message, never onboards', async () => {
    setUrl('/?view=jobs');
    render(<JobsOverviewPage />);
    expect(await screen.findByText(/Link fehlt/i, undefined, FIND)).toBeInTheDocument();
    expect(onboardMock).not.toHaveBeenCalled();
  });

  it('onboards with the token then renders real lead_jobs cards as deep-links', async () => {
    setUrl('/?token=tok123&view=jobs');
    onboardMock.mockResolvedValue({ session_token: 'jwt', job_offer_id: 1, customer_id: 1 } as never);
    callMock.mockResolvedValue({
      jobs: [
        // wide window → laufend on any test date
        row({ id: 'job-live', status: 'gebucht', anreise: '2000-01-01', abreise: '2999-01-01' }),
        row({ id: 'job-plan', status: 'geplant', anreise: '2026-08-01', abreise: '2026-09-01' }),
      ],
    } as never);

    render(<JobsOverviewPage />);

    // onboard uses the token, default job (no jobId)
    await waitFor(() => expect(onboardMock).toHaveBeenCalledWith('tok123', undefined));
    // listLeadJobs fetched once session is ready
    await waitFor(() => expect(callMock).toHaveBeenCalledWith('listLeadJobs', {}));

    // Both cards render with derived badges
    expect(await screen.findByText("Laufend", undefined, FIND)).toBeInTheDocument();
    expect(screen.getByText('Geplant')).toBeInTheDocument();

    // Cards are deep-links into the portal scoped to the job
    const live = screen.getByRole('link', { name: /Laufend/i });
    expect(live).toHaveAttribute('href', '/?token=tok123&job=job-live');
    const plan = screen.getByRole('link', { name: /Geplant/i });
    expect(plan).toHaveAttribute('href', '/?token=tok123&job=job-plan');
  });

  it('empty job list → shows "keine Einsätze" copy', async () => {
    setUrl('/?token=tok123&view=jobs');
    onboardMock.mockResolvedValue({ session_token: 'jwt', job_offer_id: 1, customer_id: 1 } as never);
    callMock.mockResolvedValue({ jobs: [] } as never);
    render(<JobsOverviewPage />);
    // Sync on the fetch firing before asserting the resolved (empty) render —
    // otherwise we can race the optimistic loading→ready transition.
    await waitFor(() => expect(callMock).toHaveBeenCalledWith('listLeadJobs', {}));
    expect(await screen.findByText(/keine Einsätze hinterlegt/i, undefined, FIND)).toBeInTheDocument();
  });

  it('enriches cards (Pflegekraft / Bewerbungen) + greets the customer', async () => {
    setUrl('/?token=tok123&view=jobs');
    onboardMock.mockResolvedValue({ session_token: 'jwt', job_offer_id: 1, customer_id: 1 } as never);
    callMock.mockImplementation((action: string) =>
      Promise.resolve(
        action === 'getCustomer'
          ? { Customer: { last_name: 'Dachs', gender: 'female' } }
          : {
              jobs: [
                // wide window → laufend; shows the booked Pflegekraft
                row({ id: 'booked', status: 'gebucht', anreise: '2000-01-01', abreise: '2999-01-01', pflegekraft: 'Anna T.' }),
                row({ id: 'plan-apps', status: 'geplant', anreise: '2026-08-01', abreise: null, bewerbungen: 2 }),
                row({ id: 'plan-empty', status: 'geplant', anreise: '2026-09-01', abreise: null, bewerbungen: null }),
              ],
            },
      ) as never,
    );

    render(<JobsOverviewPage />);

    // Booked job → caregiver name on the card
    expect(await screen.findByText('Anna T.', undefined, FIND)).toBeInTheDocument();
    // geplant with applications → count; without → Suchlauf-Hinweis
    expect(screen.getByText('2 Bewerbungen')).toBeInTheDocument();
    expect(screen.getByText(/Suchlauf läuft/i)).toBeInTheDocument();
    // Personalised greeting from getCustomer (gender → salutation)
    expect(await screen.findByText('Guten Tag, Frau Dachs.', undefined, FIND)).toBeInTheDocument();
  });

  it('expired token → shows expired message (onboard 401)', async () => {
    setUrl('/?token=expired&view=jobs');
    onboardMock.mockRejectedValue(new client.MamamiaError(401, 'invalid-token'));
    render(<JobsOverviewPage />);
    expect(await screen.findByText(/nicht mehr gültig/i, undefined, FIND)).toBeInTheDocument();
  });
});
