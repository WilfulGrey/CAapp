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
