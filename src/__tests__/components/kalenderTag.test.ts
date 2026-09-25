import { describe, it, expect } from 'vitest';
import { kalenderTag } from '../../components/portal/DateField';

describe('kalenderTag', () => {
  it('liest die mamamia-Formen ohne Zeitzone als Kalendertag', () => {
    expect(kalenderTag('2026-10-15 00:00:00')).toBe('2026-10-15');
    expect(kalenderTag('2026-10-15')).toBe('2026-10-15');
    expect(kalenderTag('2026-10-15T00:00:00')).toBe('2026-10-15');
    expect(kalenderTag(' 2026-10-15 23:59 ')).toBe('2026-10-15');
  });

  it('verwirft alles andere statt zu raten', () => {
    expect(kalenderTag(null)).toBeNull();
    expect(kalenderTag(undefined)).toBeNull();
    expect(kalenderTag('')).toBeNull();
    expect(kalenderTag('15.10.2026')).toBeNull();
    // Mit Zone ist es ein Zeitpunkt, kein Kalendertag.
    expect(kalenderTag('2026-10-15T00:00:00Z')).toBeNull();
  });
});
