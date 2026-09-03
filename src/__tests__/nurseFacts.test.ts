import { describe, it, expect } from 'vitest';
import { nurseFacts } from '../components/portal/shared';

// Faktenzeile der Pflegekraft-Karten. Vorher stand ohne `care_experience`
// wörtlich „—" als einzige Qualifikationszeile, und ohne Einsätze blieb die
// Zeile nach dem Label leer (Martin, 13.08.).

describe('nurseFacts', () => {
  it('voller Fall: Jahre + Einsätze über Primundus — ohne Ø-Dauer (Martin, 03.09.)', () => {
    expect(nurseFacts({ experience: '4 J. Erfahrung', history: { assignments: 9, avgDurationMonths: 2.3 } }))
      .toBe('4 J. Erfahrung · 9 Einsätze über Primundus');
  });

  it('Einsätze ohne Jahre: der Strich fällt weg, kein „— · 3 Einsätze"', () => {
    expect(nurseFacts({ experience: '—', history: { assignments: 3, avgDurationMonths: 2.3 } }))
      .toBe('3 Einsätze über Primundus');
  });

  it('Jahre ohne Einsätze: nur die Jahre', () => {
    expect(nurseFacts({ experience: '4 J. Erfahrung' })).toBe('4 J. Erfahrung');
  });

  it('gar nichts: kurzer ehrlicher Satz statt leerem Strich', () => {
    expect(nurseFacts({ experience: '—' })).toBe('bereit für den ersten Einsatz');
    expect(nurseFacts({ experience: '' })).toBe('bereit für den ersten Einsatz');
  });

  it('Einzahl: „1 Einsatz über Primundus" — nicht „1 Einsätze" (Prod-Screenshot 13.08.)', () => {
    expect(nurseFacts({ experience: '—', history: { assignments: 1, avgDurationMonths: 0.23 } }))
      .toBe('1 Einsatz über Primundus');
  });

  // Wächter: die Durchschnittsdauer darf nicht zurückkommen — auch nicht
  // über einen anderen Wortlaut. Der Kunde sah „Ø 10 Wochen pro Einsatz"
  // und konnte damit nichts anfangen (Martin, 03.09.2026).
  it('keine Durchschnittsdauer, egal welche history-Werte', () => {
    for (const avg of [0.25, 1, 2.5, 12]) {
      const s = nurseFacts({ experience: '4 J. Erfahrung', history: { assignments: 5, avgDurationMonths: avg } });
      expect(s).not.toMatch(/Ø|Woche|pro Einsatz/);
      expect(s).toBe('4 J. Erfahrung · 5 Einsätze über Primundus');
    }
  });
});
