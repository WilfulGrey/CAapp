import { describe, it, expect } from 'vitest';
import { pruefeSterneStand, sternFuellung, anzahlText, STERNE_STAND_URL } from '../lib/sterne';
import * as original from '../../project 3/lib/sterne-zeile';

const faelle: unknown[] = [
  { schnitt: '4,9', wert: 4.89, anzahl: 126 },
  { schnitt: '4,9', wert: 3.2, anzahl: 126 },
  { schnitt: '4,9', anzahl: 1 },
  { schnitt: '4.9', wert: 4.9, anzahl: 126 },
  { schnitt: '6,0', anzahl: 3 },
  { schnitt: '4,5', anzahl: 0 },
  { schnitt: '4,5', anzahl: 2.5 },
  null, [], 'x',
];

describe('Sterne-Zeile im Portal = Spiegel des Rechners', () => {
  it('prüft die Antwort genau wie der Rechner', () => {
    for (const f of faelle) expect(pruefeSterneStand(f)).toEqual(original.pruefeSterneStand(f));
  });
  it('füllt Sterne und schreibt die Anzahl gleich', () => {
    for (const w of [4.89, 4.5, 1, 5]) for (let i = 0; i < 5; i++) expect(sternFuellung(w, i)).toBe(original.sternFuellung(w, i));
    for (const n of [1, 2, 126, 1204]) expect(anzahlText(n)).toBe(original.anzahlText(n));
    expect(STERNE_STAND_URL).toBe(original.STERNE_STAND_URL);
  });
});
