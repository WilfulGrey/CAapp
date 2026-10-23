import { describe, expect, it } from 'vitest';
import {
  STERNE_STAND_URL,
  anzahlText,
  pruefeSterneStand,
  sternFuellung,
} from '../../project 3/lib/sterne-zeile';

// Bewertungssterne auf der Startseite des Rechners (Martin 17.09.2026).
// Kein Ersatzwert: alles Unerwartete muss null ergeben, dann fehlt die Zeile.

describe('pruefeSterneStand', () => {
  it('übernimmt die echte Antwort von primundus.de', () => {
    const antwort = { schnitt: '4,9', wert: 4.89, anzahl: 126, url: 'https://primundus.de/erfahrungen', stand: '2026-09-17T11:09:26.100Z' };
    expect(pruefeSterneStand(antwort)).toEqual({ schnitt: '4,9', wert: 4.89, anzahl: 126 });
  });

  it('nimmt den Text als Wert, wenn wert fehlt oder nicht passt', () => {
    expect(pruefeSterneStand({ schnitt: '4,9', anzahl: 126 })).toEqual({ schnitt: '4,9', wert: 4.9, anzahl: 126 });
    expect(pruefeSterneStand({ schnitt: '4,9', wert: 3.2, anzahl: 126 })).toEqual({ schnitt: '4,9', wert: 4.9, anzahl: 126 });
    expect(pruefeSterneStand({ schnitt: '4,9', wert: '4.89', anzahl: 126 })).toEqual({ schnitt: '4,9', wert: 4.9, anzahl: 126 });
  });

  it.each([
    ['null', null],
    ['Liste', [{ schnitt: '4,9', anzahl: 126 }]],
    ['Punkt statt Komma', { schnitt: '4.9', anzahl: 126 }],
    ['Zahl statt Text', { schnitt: 4.9, anzahl: 126 }],
    ['zwei Nachkommastellen', { schnitt: '4,89', anzahl: 126 }],
    ['über 5', { schnitt: '5,1', anzahl: 126 }],
    ['unter 1', { schnitt: '0,9', anzahl: 126 }],
    ['keine Anzahl', { schnitt: '4,9' }],
    ['Anzahl 0', { schnitt: '4,9', anzahl: 0 }],
    ['Anzahl gebrochen', { schnitt: '4,9', anzahl: 12.5 }],
    ['Anzahl als Text', { schnitt: '4,9', anzahl: '126' }],
    ['Fehlerseite', { error: 'Internal Server Error' }],
  ])('lehnt ab: %s', (_, payload) => {
    expect(pruefeSterneStand(payload)).toBeNull();
  });
});

describe('sternFuellung', () => {
  it('füllt bei 4,89 vier Sterne ganz und den fünften zu 89 %', () => {
    expect([0, 1, 2, 3].map((i) => sternFuellung(4.89, i))).toEqual([1, 1, 1, 1]);
    expect(sternFuellung(4.89, 4)).toBeCloseTo(0.89, 5);
  });

  it('bleibt zwischen 0 und 1', () => {
    expect(sternFuellung(1, 3)).toBe(0);
    expect(sternFuellung(5, 4)).toBe(1);
  });
});

describe('anzahlText', () => {
  it('schreibt Einzahl, Mehrzahl und Tausenderpunkt', () => {
    expect(anzahlText(1)).toBe('1 Bewertung');
    expect(anzahlText(126)).toBe('126 Bewertungen');
    expect(anzahlText(1204)).toBe('1.204 Bewertungen');
  });
});

describe('Quelle', () => {
  it('liest die Schnittstelle ohne www (die leitet um)', () => {
    expect(STERNE_STAND_URL).toBe('https://primundus.de/api/bewertungen-stand');
  });
});
