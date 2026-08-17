import { describe, it, expect } from 'vitest';
// Cross-App-Import wie bei portalUrl.test.ts: reines Modul ohne React/Next,
// deshalb im Root-Vitest testbar (siehe CLAUDE.md §Testing).
import {
  naechsterDrift,
  naechsterAbstandMs,
  DRIFT_GRENZE,
} from '../../project 3/lib/counter-drift';

describe('naechsterDrift', () => {
  it('geht bei kleinem Wuerfel nach unten, bei grossem nach oben', () => {
    expect(naechsterDrift(0, 0.1)).toBe(-1);
    expect(naechsterDrift(0, 0.9)).toBe(1);
  });

  it('zieht an der oberen Grenze zurueck — egal was der Wuerfel sagt', () => {
    expect(naechsterDrift(DRIFT_GRENZE, 0.9)).toBe(DRIFT_GRENZE - 1);
    expect(naechsterDrift(DRIFT_GRENZE, 0.1)).toBe(DRIFT_GRENZE - 1);
  });

  it('zieht an der unteren Grenze zurueck — egal was der Wuerfel sagt', () => {
    expect(naechsterDrift(-DRIFT_GRENZE, 0.1)).toBe(-DRIFT_GRENZE + 1);
    expect(naechsterDrift(-DRIFT_GRENZE, 0.9)).toBe(-DRIFT_GRENZE + 1);
  });

  it('verlaesst die Grenzen ueber einen langen Lauf nie', () => {
    // Der eigentliche Zweck des Moduls: der Zaehler darf nie weit von der
    // antwortgetriebenen Zahl weglaufen, sonst ueberdeckt die Bewegung das
    // Signal der eigenen Angaben.
    let d = 0;
    for (let i = 0; i < 5000; i++) {
      d = naechsterDrift(d, (i * 0.618) % 1);
      expect(Math.abs(d)).toBeLessThanOrEqual(DRIFT_GRENZE);
    }
  });

  it('macht immer genau einen Schritt', () => {
    for (let d = -DRIFT_GRENZE; d <= DRIFT_GRENZE; d++) {
      expect(Math.abs(naechsterDrift(d, 0.1) - d)).toBe(1);
      expect(Math.abs(naechsterDrift(d, 0.9) - d)).toBe(1);
    }
  });
});

describe('naechsterAbstandMs', () => {
  it('bleibt zwischen 7 und 15 Sekunden', () => {
    expect(naechsterAbstandMs(0)).toBe(7000);
    expect(naechsterAbstandMs(0.5)).toBe(11000);
    expect(naechsterAbstandMs(0.999)).toBeLessThan(15000);
  });
});
