/**
 * Dedupe semantics for reportLeadEvent. Hand-tested behavior we rely on:
 * - patient_data_saved / portal_opened → dedupe per (token, event) so a
 *   re-render or repeated save doesn't spam the bridge.
 * - caregiver_invited → dedupe per (token, event, caregiver_id) so inviting
 *   different caregivers in the same session each produces an event AND a
 *   team mail. Two consecutive invites for the SAME caregiver are still
 *   collapsed (prevents accidental double-clicks).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module caches a session-level dedupe Set at import time. Reset modules
// between tests so each test starts with an empty Set.
let reportLeadEvent: typeof import('../lib/leadEvents').reportLeadEvent;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  vi.stubEnv('VITE_KOSTENRECHNER_URL', 'https://kr.test');
  const mod = await import('../lib/leadEvents');
  reportLeadEvent = mod.reportLeadEvent;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function calls() {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
}

function bodyOf(callIndex: number): any {
  return JSON.parse(calls()[callIndex][1]!.body);
}

describe('reportLeadEvent', () => {
  it('skips when token is missing', () => {
    reportLeadEvent(null, 'patient_data_saved');
    reportLeadEvent(undefined, 'caregiver_invited');
    reportLeadEvent('', 'portal_opened');
    expect(calls()).toHaveLength(0);
  });

  it('dedupes patient_data_saved per token', () => {
    reportLeadEvent('tok-1', 'patient_data_saved');
    reportLeadEvent('tok-1', 'patient_data_saved');
    expect(calls()).toHaveLength(1);
    expect(bodyOf(0)).toEqual({ token: 'tok-1', event: 'patient_data_saved' });
  });

  it('fires caregiver_invited once per distinct caregiver in the same session', () => {
    reportLeadEvent('tok-1', 'caregiver_invited', { caregiver_id: 100, caregiver_name: 'A' });
    reportLeadEvent('tok-1', 'caregiver_invited', { caregiver_id: 200, caregiver_name: 'B' });
    reportLeadEvent('tok-1', 'caregiver_invited', { caregiver_id: 100, caregiver_name: 'A' }); // dupe

    expect(calls()).toHaveLength(2);
    expect(bodyOf(0).metadata).toEqual({ caregiver_id: 100, caregiver_name: 'A' });
    expect(bodyOf(1).metadata).toEqual({ caregiver_id: 200, caregiver_name: 'B' });
  });

  it('omits the metadata field when no metadata is given', () => {
    reportLeadEvent('tok-1', 'portal_opened');
    expect(bodyOf(0)).not.toHaveProperty('metadata');
  });

  it('releases the dedupe key when the request fails so a retry is possible', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));
    reportLeadEvent('tok-1', 'patient_data_saved');
    // Let the catch handler run.
    await Promise.resolve();
    await Promise.resolve();
    reportLeadEvent('tok-1', 'patient_data_saved');
    expect(calls()).toHaveLength(2);
  });
});
