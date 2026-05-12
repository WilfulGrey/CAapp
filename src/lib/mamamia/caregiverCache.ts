// Module-level cache for full Caregiver profiles.
//
// Why this exists: GET_CAREGIVER takes 1.7-3.1s on Mamamia (measured
// on beta tenant 2026-04; preprod tenant nie sprawdzony empirycznie ale
// rząd wielkości ten sam — full caregiver profile = duże response).
// Bez cachowania każde modal-open re-fires request. Bez prefetchu user
// zawsze płaci pełne latency na first click. Ten moduł rozwiązuje oba:
//
// - `getCached(id)`           → resolved Caregiver or null (sync read)
// - `fetch(id)`               → returns Promise; dedupes in-flight requests
// - `prefetch(ids)`           → fires fetches in parallel (with cap),
//                               results land in cache for instant modal-open
// - `subscribe(id, listener)` → receive notification when value lands
//
// The cache is intentionally session-scoped (module global) and not LRU —
// caregiver count per portal session is small (single-digit to ~50) so
// retaining all of them is cheap.

import type { MamamiaCaregiverFull } from './types';
import { callMamamia } from './client';

type CacheEntry =
  | { state: 'pending'; promise: Promise<MamamiaCaregiverFull | null> }
  | { state: 'resolved'; data: MamamiaCaregiverFull | null }
  | { state: 'rejected'; error: Error };

const cache = new Map<number, CacheEntry>();
const listeners = new Map<number, Set<() => void>>();

function notify(id: number): void {
  const set = listeners.get(id);
  if (!set) return;
  for (const fn of set) fn();
}

export function getCached(id: number): MamamiaCaregiverFull | null | undefined {
  const e = cache.get(id);
  if (!e) return undefined;
  if (e.state === 'resolved') return e.data;
  return undefined;
}

export function getError(id: number): Error | null {
  const e = cache.get(id);
  return e?.state === 'rejected' ? e.error : null;
}

export function isPending(id: number): boolean {
  return cache.get(id)?.state === 'pending';
}

export function fetchCaregiver(id: number): Promise<MamamiaCaregiverFull | null> {
  const existing = cache.get(id);
  if (existing?.state === 'pending') return existing.promise;
  if (existing?.state === 'resolved') return Promise.resolve(existing.data);
  // Allow retry after rejection.

  const promise = callMamamia<{ Caregiver: MamamiaCaregiverFull | null }>(
    'getCaregiver',
    { id },
  ).then(
    (r) => {
      cache.set(id, { state: 'resolved', data: r.Caregiver });
      notify(id);
      return r.Caregiver;
    },
    (err: Error) => {
      cache.set(id, { state: 'rejected', error: err });
      notify(id);
      throw err;
    },
  );

  cache.set(id, { state: 'pending', promise });
  return promise;
}

// Best-effort parallel prefetch with concurrency cap. Failures are
// swallowed — they'll re-surface when the user actually opens the modal,
// but they shouldn't break anything else (CLAUDE.md §1 — visible failures
// only when they block real interaction).
export function prefetchCaregivers(ids: number[], concurrency = 4): void {
  const queue = ids.filter((id) => {
    const e = cache.get(id);
    return !e || e.state === 'rejected';
  });
  let active = 0;
  function next(): void {
    while (active < concurrency && queue.length > 0) {
      const id = queue.shift()!;
      active++;
      fetchCaregiver(id).catch(() => {}).finally(() => {
        active--;
        next();
      });
    }
  }
  next();
}

export function subscribe(id: number, listener: () => void): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(id);
  };
}

// Test/debug helper — clear cache between tests.
export function _resetCache(): void {
  cache.clear();
  listeners.clear();
}
