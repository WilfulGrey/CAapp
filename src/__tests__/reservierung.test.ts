import { describe, it, expect } from 'vitest';
import { reserviertBis, reserviertBisText, RESERVIERUNG_STUNDEN } from '../lib/reservierung';

const ev = (event_type: string, created_at: string, metadata: Record<string, unknown>) =>
  ({ id: Math.random().toString(36), event_type, created_at, metadata });

const JETZT = Date.parse('2026-09-25T10:00:00Z');

describe('reserviertBis', () => {
  it('frühestes echtes application_received + 72 h, auf die volle Stunde abgerundet', () => {
    expect(RESERVIERUNG_STUNDEN).toBe(72);
    const d = reserviertBis([
      ev('application_received', '2026-09-24T14:37:12Z', { caregiver_id: 7, mamamia_job_offer_id: 33570 }),
      ev('application_received', '2026-09-24T18:00:00Z', { caregiver_id: 7, mamamia_job_offer_id: 33570 }),
    ], { caregiverId: 7, jobOfferId: 33570 }, JETZT);
    expect(d?.toISOString()).toBe('2026-09-27T14:00:00.000Z');
  });

  it('ignoriert still erfasste (seeded) Ereignisse — der Server tut es auch', () => {
    expect(reserviertBis([
      ev('application_received', '2026-09-24T14:37:00Z', { caregiver_id: 7, seeded: true }),
    ], { caregiverId: 7, jobOfferId: 33570 }, JETZT)).toBeNull();
  });

  it('nur dieselbe Pflegekraft und derselbe Job zählen', () => {
    const d = reserviertBis([
      ev('application_received', '2026-09-20T08:00:00Z', { caregiver_id: 8, mamamia_job_offer_id: 33570 }),
      ev('application_received', '2026-09-21T08:00:00Z', { caregiver_id: 7, mamamia_job_offer_id: 11111 }),
      ev('application_received', '2026-09-24T09:10:00Z', { caregiver_id: 7, mamamia_job_offer_id: 33570 }),
    ], { caregiverId: 7, jobOfferId: 33570 }, JETZT);
    expect(d?.toISOString()).toBe('2026-09-27T09:00:00.000Z');
  });

  it('nach einer Reaktion auf diese Pflegekraft gibt es keine Frist (Server sagt dann nicht ab)', () => {
    expect(reserviertBis([
      ev('application_received', '2026-09-24T14:37:00Z', { caregiver_id: 7, mamamia_job_offer_id: 33570 }),
      ev('application_rejected', '2026-09-24T15:00:00Z', { caregiver_id: 7 }),
    ], { caregiverId: 7, jobOfferId: 33570 }, JETZT)).toBeNull();
  });

  it('ohne Ereignis, ohne Pflegekraft oder mit abgelaufener Frist: null — wir raten nicht', () => {
    expect(reserviertBis([], { caregiverId: 7, jobOfferId: 33570 }, JETZT)).toBeNull();
    expect(reserviertBis([ev('application_received', '2026-09-24T14:37:00Z', { caregiver_id: 7 })], { caregiverId: undefined, jobOfferId: 33570 }, JETZT)).toBeNull();
    expect(reserviertBis([ev('application_received', '2026-09-20T14:37:00Z', { caregiver_id: 7 })], { caregiverId: 7, jobOfferId: 33570 }, JETZT)).toBeNull();
  });
});

describe('reserviertBisText', () => {
  it('schreibt Wochentag, Datum und Uhrzeit in Berliner Zeit', () => {
    // 14:00 UTC = 16:00 MESZ
    expect(reserviertBisText(new Date('2026-09-27T14:00:00Z'))).toBe('So, 27.09., 16 Uhr');
    expect(reserviertBisText(new Date('2026-12-04T09:00:00Z'))).toBe('Fr, 04.12., 10 Uhr');
  });
});

describe('Reservierung = Auto-Absage des Servers', () => {
  it('RESERVIERUNG_STUNDEN passt zu AUTO_REJECT_AFTER_HOURS in detect-caregiver-events', async () => {
    const fs = await import('node:fs');
    const quelle = fs.readFileSync('supabase/functions/detect-caregiver-events/index.ts', 'utf8');
    const m = quelle.match(/AUTO_REJECT_AFTER_HOURS\s*=\s*(\d+)/);
    expect(m && Number(m[1])).toBe(RESERVIERUNG_STUNDEN);
  });
});

describe('Countdown', () => {
  it('volle Stunden, abgerundet, nie negativ; unter 24 h dringend', async () => {
    const { stundenBis, nochReserviertText, istDringend } = await import('../lib/reservierung');
    const jetzt = Date.parse('2026-09-25T10:00:00Z');
    const ende = new Date('2026-09-27T14:00:00Z'); // 52 h
    expect(stundenBis(ende, jetzt)).toBe(52);
    expect(nochReserviertText(ende, jetzt)).toBe('Noch 52 Stunden für Sie reserviert');
    expect(istDringend(ende, jetzt)).toBe(false);
    const bald = new Date(jetzt + 90 * 60 * 1000);
    expect(nochReserviertText(bald, jetzt)).toBe('Nur noch 1 Stunde für Sie reserviert');
    expect(istDringend(bald, jetzt)).toBe(true);
    expect(nochReserviertText(new Date(jetzt + 10 * 60 * 1000), jetzt)).toBe('Nur noch kurz für Sie reserviert');
    expect(stundenBis(new Date(jetzt - 5000), jetzt)).toBe(0);
  });
});

describe('reserviertBis — Jobs wie im Server', () => {
  it('Ereignisse ohne Job gehören zum Standard-Job des Leads, nicht zu jedem Job', () => {
    const alt = ev('application_received', '2026-09-20T08:00:00Z', { caregiver_id: 7 });
    const neu = ev('application_received', '2026-09-24T09:10:00Z', { caregiver_id: 7, mamamia_job_offer_id: 222 });
    // Bewerbung auf Job 222, Standard-Job 111: das alte jobfreie Ereignis zählt nicht.
    expect(reserviertBis([alt, neu], { caregiverId: 7, jobOfferId: 222, standardJobId: 111 }, JETZT)?.toISOString())
      .toBe('2026-09-27T09:00:00.000Z');
    // Bewerbung auf dem Standard-Job: das jobfreie Ereignis ist der Anker (hier schon abgelaufen).
    expect(reserviertBis([alt], { caregiverId: 7, jobOfferId: 111, standardJobId: 111 }, JETZT)).toBeNull();
  });

  it('ohne bekannten Job der Bewerbung keine Frist', () => {
    expect(reserviertBis([ev('application_received', '2026-09-24T14:37:00Z', { caregiver_id: 7, mamamia_job_offer_id: 1 })],
      { caregiverId: 7, jobOfferId: null }, JETZT)).toBeNull();
  });
});
