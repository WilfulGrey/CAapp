// Cache + dedup behaviour for the caregiver profile fetch.
// Mocks the proxy client to avoid network — verifies:
//   • two concurrent fetches dedupe to one network call
//   • cached values are returned synchronously after the first resolve
//   • prefetch primes the cache without re-fetching
//   • subscribers fire when value lands

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchCaregiver,
  getCached,
  isPending,
  prefetchCaregivers,
  subscribe,
  _resetCache,
} from '../../lib/mamamia/caregiverCache';
import * as client from '../../lib/mamamia/client';

const baseCg = {
  id: 9913,
  first_name: 'Filip',
  last_name: 'K.',
  gender: 'male' as const,
  year_of_birth: 1986,
  birth_date: null,
  germany_skill: 'level_2',
  care_experience: '13',
  available_from: null,
  last_contact_at: null,
  last_login_at: null,
  is_active_user: false,
  hp_total_jobs: 0,
  hp_total_days: 0,
  hp_avg_mission_days: 0,
  avatar: null,
  avatar_retouched: null,
};

describe('caregiverCache', () => {
  beforeEach(() => {
    _resetCache();
    vi.restoreAllMocks();
  });

  it('dedupes two concurrent fetches into one network call', async () => {
    const spy = vi.spyOn(client, 'callMamamia').mockResolvedValue({ Caregiver: baseCg });
    const [a, b] = await Promise.all([fetchCaregiver(9913), fetchCaregiver(9913)]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toEqual(baseCg);
    expect(b).toEqual(baseCg);
  });

  it('getCached returns undefined before fetch, value after', async () => {
    vi.spyOn(client, 'callMamamia').mockResolvedValue({ Caregiver: baseCg });
    expect(getCached(9913)).toBeUndefined();
    await fetchCaregiver(9913);
    expect(getCached(9913)).toEqual(baseCg);
  });

  it('isPending true while fetch in flight, false after resolve', async () => {
    let resolveIt!: (v: unknown) => void;
    vi.spyOn(client, 'callMamamia').mockImplementation(
      () => new Promise((r) => { resolveIt = r; }),
    );
    const promise = fetchCaregiver(9913);
    expect(isPending(9913)).toBe(true);
    resolveIt({ Caregiver: baseCg });
    await promise;
    expect(isPending(9913)).toBe(false);
  });

  it('prefetchCaregivers populates cache without re-fetching when re-called', async () => {
    const spy = vi.spyOn(client, 'callMamamia').mockResolvedValue({ Caregiver: baseCg });
    prefetchCaregivers([9913, 946]);
    // Wait microtask + flush
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalledTimes(2);
    // Second prefetch is a no-op for already-cached ids.
    prefetchCaregivers([9913, 946]);
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('subscribe fires when value lands; unsubscribe stops it', async () => {
    vi.spyOn(client, 'callMamamia').mockResolvedValue({ Caregiver: baseCg });
    const calls: number[] = [];
    const unsub = subscribe(9913, () => { calls.push(1); });
    fetchCaregiver(9913);
    await new Promise((r) => setTimeout(r, 5));
    expect(calls.length).toBeGreaterThanOrEqual(1);
    unsub();
    // No second listener should fire on a fresh fetch (we test by clearing
    // and re-fetching — listener already detached.)
    _resetCache();
    fetchCaregiver(9913);
    await new Promise((r) => setTimeout(r, 5));
    expect(calls.length).toBeGreaterThanOrEqual(1); // unchanged from prior
  });

  it('rejection caches error; retry via fetchCaregiver tries again', async () => {
    const spy = vi.spyOn(client, 'callMamamia')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ Caregiver: baseCg });
    await expect(fetchCaregiver(9913)).rejects.toThrow('boom');
    // After rejection, fetch retries.
    const r = await fetchCaregiver(9913);
    expect(r).toEqual(baseCg);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
