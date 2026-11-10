import { describe, it, expect } from 'vitest';
import { startDatumAus, START_WAHL } from '../../components/portal/StartWahl';

// Martin 10.11.2026: „wenn er sagt, 1 bis 2 Wochen machen wir plus 7 Tage … 2 bis 4 Wochen … plus 2 Wochen, also immer den ersten
// Wert“; schnellstmöglich = plus 3 Tage. An mamamia geht immer ein Datum, „Noch unklar“ gibt es nicht.
describe('StartWahl', () => {
  const heute = new Date(2026, 10, 10); // 10.11.2026

  it('speichert den ersten Tag des Zeitraums', () => {
    expect(startDatumAus('sofort', heute)).toBe('2026-11-13');
    expect(startDatumAus('eins_zwei', heute)).toBe('2026-11-17');
    expect(startDatumAus('zwei_vier', heute)).toBe('2026-11-24');
  });

  it('„Ab einem Datum“ rechnet nichts, das Datum kommt aus dem Kalender', () => {
    expect(startDatumAus('datum', heute)).toBeNull();
  });

  it('rechnet über Monats- und Jahresgrenzen', () => {
    expect(startDatumAus('zwei_vier', new Date(2026, 11, 20))).toBe('2027-01-03');
  });

  it('hat genau vier Antworten, ohne „Noch unklar“', () => {
    expect(START_WAHL.map((w) => w.key)).toEqual(['sofort', 'eins_zwei', 'zwei_vier', 'datum']);
  });
});
