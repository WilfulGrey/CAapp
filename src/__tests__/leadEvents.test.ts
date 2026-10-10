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

  it('sends portal_reopened with mail_source and referrer once per session (server does not dedupe it)', () => {
    reportLeadEvent('tok-1', 'portal_reopened', { mail_source: 'pn1', referrer: 'mail.google.com' });
    reportLeadEvent('tok-1', 'portal_reopened', { mail_source: 'pn1', referrer: 'mail.google.com' }); // re-render
    expect(calls()).toHaveLength(1);
    expect(bodyOf(0)).toEqual({
      token: 'tok-1',
      event: 'portal_reopened',
      metadata: { mail_source: 'pn1', referrer: 'mail.google.com' },
    });
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

  it('re-fires patient_data_saved when phone changes (so leads.telefon sync runs)', () => {
    reportLeadEvent('tok-1', 'patient_data_saved', { phone: '+49 89 111' });
    reportLeadEvent('tok-1', 'patient_data_saved', { phone: '+49 89 111' }); // dedupe
    reportLeadEvent('tok-1', 'patient_data_saved', { phone: '+49 89 222' }); // new value
    expect(calls()).toHaveLength(2);
    expect(bodyOf(0).metadata).toEqual({ phone: '+49 89 111' });
    expect(bodyOf(1).metadata).toEqual({ phone: '+49 89 222' });
  });
});

describe('patient_form_location_unresolved dedupe (Registry #65)', () => {
  it('collapses the same PLZ twice in one session', () => {
    reportLeadEvent('t', 'patient_form_location_unresolved', { plz: '50348', ort: '' });
    reportLeadEvent('t', 'patient_form_location_unresolved', { plz: '50348', ort: '' });
    expect(calls()).toHaveLength(1);
  });

  it('reports a corrected — still wrong — PLZ as its own event', () => {
    // Ohne PLZ im Schlüssel bliebe die zweite Korrektur stumm und das Team
    // sähe für immer nur den ersten Versuch.
    reportLeadEvent('t', 'patient_form_location_unresolved', { plz: '50348', ort: '' });
    reportLeadEvent('t', 'patient_form_location_unresolved', { plz: '50384', ort: '' });
    expect(calls()).toHaveLength(2);
    expect(bodyOf(1).metadata.plz).toBe('50384');
  });

  it('a proxy outage does not eat the later real rejection of the same PLZ', () => {
    // Die stille lookup_down-Variante darf den Schlüssel nicht besetzen —
    // sonst fehlt genau die Mail, für die das Team-Ereignis existiert.
    reportLeadEvent('t', 'patient_form_location_unresolved', { plz: '50348', ort: '', lookup_down: '1' }, false);
    reportLeadEvent('t', 'patient_form_location_unresolved', { plz: '50348', ort: '' }, true);
    expect(calls()).toHaveLength(2);
    expect(bodyOf(0).notify).toBe(false);
    expect(bodyOf(1).notify).not.toBe(false);
  });
});

describe('patient_form_step: der Schritt gehört in den Schlüssel (Registry #122)', () => {
  // Bis Registry #122 lautete der Sitzungs-Schlüssel `${token}:patient_form_step` — der erste erreichte Schritt
  // besetzte ihn, jeder weitere Schritt derselben Sitzung wurde verschluckt. Der Server speichert seit Registry #109
  // jeden Schritt, bekam aber nur den ersten zu sehen.
  it('meldet jeden erreichten Schritt einmal', () => {
    reportLeadEvent('tok-1', 'patient_form_step', { step: 1 });
    reportLeadEvent('tok-1', 'patient_form_step', { step: 2 });
    reportLeadEvent('tok-1', 'patient_form_step', { step: 3 });
    expect(calls()).toHaveLength(3);
    expect([0, 1, 2].map((i) => bodyOf(i).metadata.step)).toEqual([1, 2, 3]);
  });

  it('derselbe Schritt zweimal in einer Sitzung (Zurück und wieder Weiter) bleibt EIN Ereignis', () => {
    reportLeadEvent('tok-1', 'patient_form_step', { step: 1 });
    reportLeadEvent('tok-1', 'patient_form_step', { step: 1 });
    expect(calls()).toHaveLength(1);
  });
});
