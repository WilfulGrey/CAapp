// Hook orchestrating onboard-to-mamamia call on first visit.
// After success, HttpOnly session cookie is set by the Edge Function;
// subsequent mamamia-proxy calls will use it automatically via credentials: 'include'.

import { useEffect, useState } from 'react';
import { onboardWithLeadToken, MamamiaError, type OnboardResponse } from '../lib/mamamia/client';

export interface MamamiaSessionState {
  session: OnboardResponse | null;
  loading: boolean;
  error: Error | null;
  /** True once the onboard HTTP request returned 200 (cookie is live). */
  ready: boolean;
  /** True when onboard failed with 401 — magic-link token expired/invalid.
   *  Lets the page show the self-service ExpiredLinkScreen instead of the
   *  generic connection-error screen. The lead row still loads
   *  (fetchLeadByToken ignores token_expires_at), so this is the only signal
   *  distinguishing "expired link" from a transient network/500 failure. */
  expired: boolean;
}

const SESSION_STORAGE_KEY = 'mamamia_session';

// Cache key is per (token, job) — Multi-Job (Variant A) re-onboards with a
// different job_id swap the scoped session, so a job B cache must not shadow
// job A. `null`/undefined jobId → the lead's default job ('default' bucket).
function cacheKey(leadToken: string, jobId?: string | null): string {
  return `${SESSION_STORAGE_KEY}:${leadToken}:${jobId ?? 'default'}`;
}

function readCached(leadToken: string, jobId?: string | null): OnboardResponse | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(leadToken, jobId));
    if (!raw) return null;
    return JSON.parse(raw) as OnboardResponse;
  } catch {
    return null;
  }
}

function writeCached(leadToken: string, jobId: string | null | undefined, session: OnboardResponse) {
  try {
    sessionStorage.setItem(cacheKey(leadToken, jobId), JSON.stringify(session));
  } catch {
    // ignore quota / private mode
  }
}

// `jobId` (a lead_jobs.id from a `?job=...` deep link, optional) scopes the
// session to one job. Changing it re-onboards: the edge function swaps the
// session's job_offer_id (ownership-checked; foreign id → default job).
export function useMamamiaSession(leadToken: string | null, jobId?: string | null): MamamiaSessionState {
  const [state, setState] = useState<MamamiaSessionState>({
    session: null,
    loading: false,
    error: null,
    ready: false,
    expired: false,
  });

  useEffect(() => {
    if (!leadToken) return;
    // Optimistic read — but we still call onboard to ensure cookie is fresh.
    const cached = readCached(leadToken, jobId);
    setState({ session: cached, loading: true, error: null, ready: false, expired: false });

    let cancelled = false;
    onboardWithLeadToken(leadToken, jobId)
      .then((session) => {
        if (cancelled) return;
        writeCached(leadToken, jobId, session);
        setState({ session, loading: false, error: null, ready: true, expired: false });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        const isAuthErr = e instanceof MamamiaError && e.status === 401;
        setState({
          session: cached,
          loading: false,
          error: isAuthErr ? new Error('Link nicht mehr gültig') : e,
          ready: false,
          expired: isAuthErr,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [leadToken, jobId]);

  return state;
}
