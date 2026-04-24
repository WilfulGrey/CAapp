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
}

const SESSION_STORAGE_KEY = 'mamamia_session';

function readCached(leadToken: string): OnboardResponse | null {
  try {
    const raw = sessionStorage.getItem(`${SESSION_STORAGE_KEY}:${leadToken}`);
    if (!raw) return null;
    return JSON.parse(raw) as OnboardResponse;
  } catch {
    return null;
  }
}

function writeCached(leadToken: string, session: OnboardResponse) {
  try {
    sessionStorage.setItem(`${SESSION_STORAGE_KEY}:${leadToken}`, JSON.stringify(session));
  } catch {
    // ignore quota / private mode
  }
}

export function useMamamiaSession(leadToken: string | null): MamamiaSessionState {
  const [state, setState] = useState<MamamiaSessionState>({
    session: null,
    loading: false,
    error: null,
    ready: false,
  });

  useEffect(() => {
    if (!leadToken) return;
    // Optimistic read — but we still call onboard to ensure cookie is fresh.
    const cached = readCached(leadToken);
    setState({ session: cached, loading: true, error: null, ready: false });

    let cancelled = false;
    onboardWithLeadToken(leadToken)
      .then((session) => {
        if (cancelled) return;
        writeCached(leadToken, session);
        setState({ session, loading: false, error: null, ready: true });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        const isAuthErr = e instanceof MamamiaError && e.status === 401;
        setState({
          session: cached,
          loading: false,
          error: isAuthErr ? new Error('Link nicht mehr gültig') : e,
          ready: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [leadToken]);

  return state;
}
