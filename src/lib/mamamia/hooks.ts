// React hooks for mamamia-proxy actions.
// Generic `useMamamiaQuery` — explicit per-action hooks below.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  callMamamia,
  type ProxyAction,
  MamamiaError,
} from './client';
import type {
  MamamiaCustomer,
  MamamiaJobOffer,
  MamamiaApplication,
  MamamiaMatching,
  MamamiaInterest,
  MamamiaJobOfferInterestsResponse,
  MamamiaDismissedCaregivers,
  MamamiaAcceptedApplications,
  MamamiaCaregiverFull,
  MamamiaLocation,
  PaginatedResponse,
} from './types';
import {
  fetchCaregiver,
  getCached,
  getError as getCachedError,
  isPending as isCachePending,
  subscribe as subscribeCaregiver,
} from './caregiverCache';

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

type Variables = Record<string, unknown>;

export function useMamamiaQuery<T>(
  action: ProxyAction | null,
  variables: Variables = {},
  enabled = true,
): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  // Serialize variables for dependency — simple deep-ish.
  const varsKey = JSON.stringify(variables);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!action || !enabled) return;
    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const result = await callMamamia<T>(action, JSON.parse(varsKey) as Variables);
        if (!cancelledRef.current) setData(result);
      } catch (e) {
        if (!cancelledRef.current) setError(e as Error);
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [action, varsKey, enabled, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, refetch };
}

// ─── Typed per-action wrappers ───────────────────────────────────────────

export function useJobOffer(enabled = true) {
  const state = useMamamiaQuery<{ JobOffer: MamamiaJobOffer | null }>(
    'getJobOffer',
    {},
    enabled,
  );
  return { ...state, data: state.data?.JobOffer ?? null };
}

export function useCustomer(enabled = true) {
  const state = useMamamiaQuery<{ Customer: MamamiaCustomer | null }>(
    'getCustomer',
    {},
    enabled,
  );
  return { ...state, data: state.data?.Customer ?? null };
}

export function useApplications(opts: { limit?: number; page?: number } = {}, enabled = true) {
  const state = useMamamiaQuery<{
    JobOfferApplicationsWithPagination: PaginatedResponse<MamamiaApplication>;
  }>('listApplications', opts, enabled);
  return {
    ...state,
    data: state.data?.JobOfferApplicationsWithPagination ?? null,
  };
}

export function useMatchings(
  opts: {
    limit?: number;
    page?: number;
    filters?: Record<string, unknown>;
    order_by?: string;
  } = {},
  enabled = true,
) {
  const state = useMamamiaQuery<{
    JobOfferMatchingsWithPagination: PaginatedResponse<MamamiaMatching>;
  }>('listMatchings', opts, enabled);
  return {
    ...state,
    data: state.data?.JobOfferMatchingsWithPagination ?? null,
  };
}

// Caregivers who signalled soft interest in this customer's JobOffer.
// Surface non-rejected entries in a dedicated portal section between
// "Ihre Bewerbungen" and matchings. Customer can invite (StoreRequest)
// or dismiss locally (writes to lead_dismissed_caregivers — UI-only,
// does NOT suppress detect-caregiver-events emails).
export function useInterests(enabled = true) {
  const state = useMamamiaQuery<MamamiaJobOfferInterestsResponse>(
    'listInterests',
    {},
    enabled,
  );
  const interests: MamamiaInterest[] = state.data?.JobOffer?.interests ?? [];
  return { ...state, data: interests };
}

// Set of Mamamia application_ids the customer has confirmed via
// AngebotPruefenModal step 2 (lead_application_acceptances). On portal
// load this flips the matching Application's local status to 'accepted'
// so the existing BookedScreen surfaces and persists across reload.
// Mamamia is NOT involved — pure local MVP state.
export function useAcceptedApplications(enabled = true) {
  const state = useMamamiaQuery<MamamiaAcceptedApplications>(
    'listAcceptedApplications',
    {},
    enabled,
  );
  return { ...state, data: state.data ?? null };
}

// Local UI dismiss-set per lead (lead_dismissed_caregivers). Frontend
// filters out these caregivers from the Interest list. Refetched after
// each successful dismiss to keep the set fresh across renders.
export function useDismissedCaregivers(enabled = true) {
  const state = useMamamiaQuery<MamamiaDismissedCaregivers>(
    'listDismissedCaregivers',
    {},
    enabled,
  );
  return { ...state, data: state.data ?? null };
}

// Set of caregiver IDs that already have an invite Request. Backend
// derives via JobOfferMatchingsWithPagination(filters:{is_request:true}) —
// the only working signal, since Matching.is_request field is null even
// when the row is request-flagged. Used to render persistent
// "Eingeladen" status across page refreshes.
export function useInvitedCaregivers(enabled = true) {
  const state = useMamamiaQuery<{ caregiver_ids: number[] }>(
    'listInvitedCaregiverIds',
    {},
    enabled,
  );
  return { ...state, data: state.data?.caregiver_ids ?? null };
}

// Cached, dedupable fetch for the modal's heavy GET_CAREGIVER. Reads from
// `caregiverCache` first — if the id was prefetched (e.g. for visible
// matching/application cards), modal opens with data instantly instead of
// paying the 1.7-3.1s round-trip. Falls through to a real fetch on miss.
export function useCaregiver(id: number | null): QueryState<MamamiaCaregiverFull | null> {
  const [data, setData] = useState<MamamiaCaregiverFull | null>(
    id != null ? (getCached(id) ?? null) : null,
  );
  const [loading, setLoading] = useState<boolean>(
    id != null && getCached(id) === undefined,
  );
  const [error, setError] = useState<Error | null>(
    id != null ? getCachedError(id) : null,
  );

  // Re-evaluate on id change.
  useEffect(() => {
    if (id == null) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Cache hit — instant render, no spinner.
    const cached = getCached(id);
    if (cached !== undefined) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    let cancelled = false;
    const unsub = subscribeCaregiver(id, () => {
      if (cancelled) return;
      const v = getCached(id);
      if (v !== undefined) {
        setData(v);
        setLoading(false);
      }
      const e = getCachedError(id);
      if (e) {
        setError(e);
        setLoading(false);
      }
    });

    fetchCaregiver(id).catch(() => {/* error already in cache */});

    return () => {
      cancelled = true;
      unsub();
    };
  }, [id]);

  const refetch = useCallback(() => {
    if (id == null) return;
    // Bypass cache — kick a fresh fetch by clearing pending state via the
    // module's own retry path. We trigger by importing _resetCache only in
    // tests; in prod we just refetch which dedupes if pending.
    setLoading(true);
    setError(null);
    fetchCaregiver(id)
      .then((v) => { setData(v); setLoading(false); })
      .catch((e) => { setError(e); setLoading(false); });
  }, [id]);

  // Surface the in-flight state correctly when other consumers triggered
  // the fetch via prefetch — `loading` should reflect cache pending.
  useEffect(() => {
    if (id == null) return;
    if (data == null && getCached(id) === undefined && isCachePending(id)) {
      setLoading(true);
    }
  }, [id, data]);

  return { data, loading, error, refetch };
}

export function useSearchLocations(
  search: string,
  opts: { limit?: number; page?: number } = {},
) {
  const state = useMamamiaQuery<{
    LocationsWithPagination: PaginatedResponse<MamamiaLocation>;
  }>(
    search.length >= 2 ? 'searchLocations' : null,
    { search, ...opts },
    search.length >= 2,
  );
  return {
    ...state,
    data: state.data?.LocationsWithPagination.data ?? null,
  };
}

// Invite rate-limit snapshot. Backend reads OUR Supabase ledger
// (caregiver_invite_attempts, written by inviteCaregiver after Mamamia
// StoreRequest succeeds). Frontend uses this for:
//   - disabling the "Einladen" button + showing a wait modal when blocked
//   - showing "X von 5 in letzter Stunde" indicator (optional UX hint)
//   - countdown without re-fetch (use retry_after_seconds locally)
// Refetch after every successful invite (manual via .refetch()) to keep
// the count in sync without polling.
export interface InviteRateState {
  used: number;
  limit: number;
  window_minutes: number;
  oldest_at: string | null;
  retry_after_seconds: number;
  blocked: boolean;
}

export function useInviteRateState(enabled = true) {
  return useMamamiaQuery<InviteRateState>('getInviteRateState', {}, enabled);
}

export { MamamiaError };
