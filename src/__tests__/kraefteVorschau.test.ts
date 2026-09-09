import { describe, expect, it } from 'vitest';
import { kraefteVorschauAktiv, kraftZeile, parseVorschau, wuenscheAusAntworten } from '../../project 3/lib/kraefte-vorschau';

function speicher(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

describe('Kräfte-Vorschau (Rechner)', () => {
  it('Schalter: ?kraefte=1 schaltet ein und merkt sich das, ?kraefte=0 schaltet aus', () => {
    const s = speicher();
    expect(kraefteVorschauAktiv('?kraefte=1&start=1', s)).toBe(true);
    expect(kraefteVorschauAktiv('?start=1', s)).toBe(true);
    expect(kraefteVorschauAktiv('?kraefte=0', s)).toBe(false);
    expect(kraefteVorschauAktiv('', s)).toBe(false);
    expect(kraefteVorschauAktiv('', null)).toBe(false);
  });

  it('Wünsche: nur Deutsch, Geschlecht, Führerschein', () => {
    expect(wuenscheAusAntworten({ germanLevel: 'sehr-gut', gender: '', driving: 'ja' }))
      .toEqual({ deutsch: 'sehr-gut', geschlecht: null, fuehrerschein: 'ja' });
  });

  it('Zeile unter dem Namen', () => {
    const heute = new Date('2026-09-09T12:00:00');
    const k = { id: 1, vorname: 'Anna', alter: 52, deutschWort: 'Mittel', erfahrungJahre: 7, einsaetze: 3, stufe: 'Bewährt', fotoUrl: 'https://x/a.jpg', verfuegbarAb: '2026-09-20' };
    expect(kraftZeile(k, heute)).toBe('7 J. Erfahrung · Deutsch: Mittel · verfügbar ab 20.09.');
    expect(kraftZeile({ ...k, verfuegbarAb: '2026-09-01', erfahrungJahre: 0, deutschWort: null }, heute)).toBe('sofort verfügbar');
  });

  it('parseVorschau lässt nur saubere Karten mit https-Foto durch, maximal drei', () => {
    const ok = { id: 1, vorname: 'Anna', alter: 52, deutschWort: 'Gut', erfahrungJahre: 7, einsaetze: 3, stufe: 'Bewährt', fotoUrl: 'https://x/a.jpg', verfuegbarAb: null };
    const out = parseVorschau({ kraefte: [ok, { ...ok, id: 2, fotoUrl: 'http://x' }, { id: 'x' }, { ...ok, id: 3 }, { ...ok, id: 4 }, { ...ok, id: 5 }] });
    expect(out.map((k) => k.id)).toEqual([1, 3, 4]);
    expect(parseVorschau(null)).toEqual([]);
    expect(parseVorschau({ kraefte: 'nein' })).toEqual([]);
  });
});
