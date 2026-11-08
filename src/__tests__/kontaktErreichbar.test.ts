// istErreichbar (Minimal-Einstieg, Registry #147): täglich 8–20 Uhr deutscher Zeit, unabhängig von der Zeitzone des Geräts.
import { describe, it, expect } from 'vitest';
import { istErreichbar } from '../lib/kontakt';

describe('istErreichbar', () => {
  it('Winterzeit: 7:59 nein, 8:00 ja, 19:59 ja, 20:00 nein', () => {
    expect(istErreichbar(new Date('2026-11-09T07:59:00+01:00'))).toBe(false);
    expect(istErreichbar(new Date('2026-11-09T08:00:00+01:00'))).toBe(true);
    expect(istErreichbar(new Date('2026-11-09T19:59:00+01:00'))).toBe(true);
    expect(istErreichbar(new Date('2026-11-09T20:00:00+01:00'))).toBe(false);
  });
  it('Sommerzeit rechnet in deutscher Zeit (UTC+2)', () => {
    expect(istErreichbar(new Date('2026-07-01T05:59:00Z'))).toBe(false);
    expect(istErreichbar(new Date('2026-07-01T06:00:00Z'))).toBe(true);
    expect(istErreichbar(new Date('2026-07-01T17:59:00Z'))).toBe(true);
    expect(istErreichbar(new Date('2026-07-01T18:00:00Z'))).toBe(false);
  });
  it('auch am Wochenende (Zeiten „täglich“)', () => {
    expect(istErreichbar(new Date('2026-11-08T12:00:00+01:00'))).toBe(true);
  });
});
