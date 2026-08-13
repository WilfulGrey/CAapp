import { describe, it, expect } from 'vitest';
import { nurseFacts } from '../components/portal/shared';

// Faktenzeile der Pflegekraft-Karten. Vorher stand ohne `care_experience`
// wörtlich „—" als einzige Qualifikationszeile, und ohne Einsätze blieb die
// Zeile nach dem Label leer (Martin, 13.08.).

describe('nurseFacts', () => {
  it('voller Fall: Jahre + Einsätze + Ø-Dauer', () => {
    expect(nurseFacts({ experience: '4 J. Erfahrung', history: { assignments: 9, avgDurationMonths: 2.3 } }))
      .toBe('4 J. Erfahrung · 9 Einsätze · Ø 10 Wochen pro Einsatz');
  });

  it('Einsätze ohne Jahre: der Strich fällt weg, kein „— · 3 Einsätze"', () => {
    expect(nurseFacts({ experience: '—', history: { assignments: 3, avgDurationMonths: 2.3 } }))
      .toBe('3 Einsätze · Ø 10 Wochen pro Einsatz');
  });

  it('Jahre ohne Einsätze: nur die Jahre', () => {
    expect(nurseFacts({ experience: '4 J. Erfahrung' })).toBe('4 J. Erfahrung');
  });

  it('gar nichts: kurzer ehrlicher Satz statt leerem Strich', () => {
    expect(nurseFacts({ experience: '—' })).toBe('bereit für den ersten Einsatz');
    expect(nurseFacts({ experience: '' })).toBe('bereit für den ersten Einsatz');
  });

  it('Einzahl: „1 Einsatz" und „Ø 1 Woche" — nicht „1 Einsätze" (Prod-Screenshot 13.08.)', () => {
    expect(nurseFacts({ experience: '—', history: { assignments: 1, avgDurationMonths: 0.23 } }))
      .toBe('1 Einsatz · Ø 1 Woche pro Einsatz');
  });
});
