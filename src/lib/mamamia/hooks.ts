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
  MamamiaCaregiverFull,
  MamamiaLocation,
  PaginatedResponse,
} from './types';

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

export function useCaregiver(id: number | null) {
  const state = useMamamiaQuery<{ Caregiver: MamamiaCaregiverFull | null }>(
    id ? 'getCaregiver' : null,
    { id: id ?? 0 },
    id !== null,
  );
  return { ...state, data: state.data?.Caregiver ?? null };
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

export { MamamiaError };
