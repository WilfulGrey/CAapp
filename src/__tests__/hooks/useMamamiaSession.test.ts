import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMamamiaSession } from '../../hooks/useMamamiaSession';
import { MamamiaError } from '../../lib/mamamia/client';
import * as client from '../../lib/mamamia/client';

// Keep the real MamamiaError class (the hook does `instanceof MamamiaError`),
// mock only the onboard call.
vi.mock('../../lib/mamamia/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/mamamia/client')>();
  return { ...actual, onboardWithLeadToken: vi.fn() };
});

const onboardMock = client.onboardWithLeadToken as unknown as ReturnType<typeof vi.fn>;

describe('useMamamiaSession — expired flag (routes expired link → ExpiredLinkScreen)', () => {
  beforeEach(() => {
    onboardMock.mockReset();
    sessionStorage.clear();
  });

  it('onboard 401 → expired=true, ready=false, msg "Link nicht mehr gültig"', async () => {
    onboardMock.mockRejectedValue(new MamamiaError(401, 'invalid-token'));
    const { result } = renderHook(() => useMamamiaSession('tok-expired'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.expired).toBe(true);
    expect(result.current.ready).toBe(false);
    expect(result.current.error?.message).toBe('Link nicht mehr gültig');
  });

  it('network error (Failed to fetch) → expired=false (generic screen, NOT expired)', async () => {
    onboardMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useMamamiaSession('tok-net'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.expired).toBe(false);
    expect(result.current.error?.message).toBe('Failed to fetch');
  });

  it('non-401 MamamiaError (500) → expired=false', async () => {
    onboardMock.mockRejectedValue(new MamamiaError(500, 'server error'));
    const { result } = renderHook(() => useMamamiaSession('tok-500'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.expired).toBe(false);
  });

  it('success → ready=true, expired=false', async () => {
    onboardMock.mockResolvedValue({ session_token: 'jwt' } as never);
    const { result } = renderHook(() => useMamamiaSession('tok-ok'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.expired).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('null token → no onboard call', () => {
    renderHook(() => useMamamiaSession(null));
    expect(onboardMock).not.toHaveBeenCalled();
  });
});
