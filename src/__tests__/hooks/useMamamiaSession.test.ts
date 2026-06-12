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

describe('useMamamiaSession — Multi-Job (Variant A) job scoping', () => {
  beforeEach(() => {
    onboardMock.mockReset();
    sessionStorage.clear();
  });

  it('forwards jobId to onboardWithLeadToken', async () => {
    onboardMock.mockResolvedValue({ session_token: 'jwt', job_offer_id: 42 } as never);
    const { result } = renderHook(() => useMamamiaSession('tok', 'job-uuid-1'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(onboardMock).toHaveBeenCalledWith('tok', 'job-uuid-1');
  });

  it('omitted jobId → onboard called with undefined (default job)', async () => {
    onboardMock.mockResolvedValue({ session_token: 'jwt' } as never);
    const { result } = renderHook(() => useMamamiaSession('tok'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(onboardMock).toHaveBeenCalledWith('tok', undefined);
  });

  it('re-onboards when jobId changes (job swap)', async () => {
    onboardMock.mockResolvedValue({ session_token: 'jwt' } as never);
    const { result, rerender } = renderHook(
      ({ job }: { job: string }) => useMamamiaSession('tok', job),
      { initialProps: { job: 'job-A' } },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    rerender({ job: 'job-B' });
    await waitFor(() => expect(onboardMock).toHaveBeenCalledTimes(2));
    expect(onboardMock).toHaveBeenNthCalledWith(1, 'tok', 'job-A');
    expect(onboardMock).toHaveBeenNthCalledWith(2, 'tok', 'job-B');
  });

  it('caches per (token, job) — job A and job B sessions do not collide', async () => {
    onboardMock.mockImplementation((_t: string, job?: string | null) =>
      Promise.resolve({ session_token: `jwt-${job}`, job_offer_id: job === 'job-A' ? 1 : 2 } as never),
    );
    const { result, rerender } = renderHook(
      ({ job }: { job: string }) => useMamamiaSession('tok', job),
      { initialProps: { job: 'job-A' } },
    );
    await waitFor(() => expect(result.current.session?.job_offer_id).toBe(1));
    rerender({ job: 'job-B' });
    await waitFor(() => expect(result.current.session?.job_offer_id).toBe(2));
    // Both cache buckets written independently.
    expect(sessionStorage.getItem('mamamia_session:tok:job-A')).toContain('"job_offer_id":1');
    expect(sessionStorage.getItem('mamamia_session:tok:job-B')).toContain('"job_offer_id":2');
  });
});
