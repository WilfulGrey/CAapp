import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpiredLinkScreen } from '../../components/portal/ExpiredLinkScreen';

const MESSAGE = 'Ihr Angebot konnte nicht geladen werden.';

describe('ExpiredLinkScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders contact prompt when token missing (no regen button)', () => {
    render(<ExpiredLinkScreen token={null} message={MESSAGE} />);
    expect(screen.getByText(/Link fehlt/)).toBeTruthy();
    // The "Neuen Link senden" CTA must not show — we have nothing to identify.
    expect(screen.queryByText(/Neuen Link senden/)).toBeNull();
    expect(screen.getByText(/089 200 000 830/)).toBeTruthy();
  });

  it('renders regen CTA when token present, hits endpoint on click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ masked_email: 'c***e@t-online.de', sent: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ExpiredLinkScreen token="tok-abc" message={MESSAGE} />);
    expect(screen.getByText(/Ihr Link ist abgelaufen/)).toBeTruthy();

    await user.click(screen.getByText(/Neuen Link senden/));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/lead-regenerate-token$/);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ token: 'tok-abc', source: 'portal' });

    await waitFor(() => expect(screen.getByText(/Neuer Link gesendet/)).toBeTruthy());
    expect(screen.getByText(/c\*\*\*e@t-online\.de/)).toBeTruthy();
  });

  it('shows "Link nicht erkannt" on 404 unknown_token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'unknown_token' }),
    }));
    const user = userEvent.setup();
    render(<ExpiredLinkScreen token="random" message={MESSAGE} />);
    await user.click(screen.getByText(/Neuen Link senden/));
    await waitFor(() => expect(screen.getByText(/Link nicht erkannt/)).toBeTruthy());
  });

  it('shows "Auftrag abgeschlossen" on 403 lead_closed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'lead_closed' }),
    }));
    const user = userEvent.setup();
    render(<ExpiredLinkScreen token="tok-closed" message={MESSAGE} />);
    await user.click(screen.getByText(/Neuen Link senden/));
    await waitFor(() => expect(screen.getByText(/Auftrag abgeschlossen/)).toBeTruthy());
  });

  it('shows generic error + retry button on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const user = userEvent.setup();
    render(<ExpiredLinkScreen token="tok-net" message={MESSAGE} />);
    await user.click(screen.getByText(/Neuen Link senden/));
    await waitFor(() => expect(screen.getByText(/Etwas ist schiefgegangen/)).toBeTruthy());
    expect(screen.getByText(/Erneut versuchen/)).toBeTruthy();
  });
});
