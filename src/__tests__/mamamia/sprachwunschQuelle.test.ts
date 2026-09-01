import { describe, it, expect } from 'vitest';
import { resolveDeutschWishLevel } from '../../lib/mamamia/mappers';

// Kunde 10508, 01.09.2026: Das Portal zeigte keine einzige Pflegekraft,
// obwohl mamamia 921 Vorschläge lieferte. Grund: bei mamamia stand
// germany_skill=level_3 (im SA-Portal nachgebessert, Budget 2.740 statt
// 2.500), der Lead trug aber noch den Rechner-Wert "grundlegend" (level_1).
// mamamia matchte nach level_3 — 661× level_3, 239× level_4, 0× level_1 —
// und das Portal filterte all das gegen level_1 weg.
//
// Regel: der lebende Wunsch bei mamamia gewinnt, weil NUR er bestimmt,
// welche Kräfte überhaupt vorgeschlagen werden.

describe('resolveDeutschWishLevel', () => {
  it('nimmt den mamamia-Wunsch, wenn beide sich widersprechen', () => {
    expect(resolveDeutschWishLevel('level_3', 'grundlegend')).toBe('level_3');
  });

  it('faellt auf den Rechner zurueck, solange mamamia nichts weiss', () => {
    expect(resolveDeutschWishLevel(null, 'grundlegend')).toBe('level_1');
    expect(resolveDeutschWishLevel(undefined, 'kommunikativ')).toBe('level_2');
    expect(resolveDeutschWishLevel(null, 'sehr-gut')).toBe('level_3');
  });

  it('behandelt "egal" als keinen Wunsch — dann wird nicht gefiltert', () => {
    expect(resolveDeutschWishLevel('not_important', 'grundlegend')).toBeNull();
    expect(resolveDeutschWishLevel('level_0', 'grundlegend')).toBeNull();
  });

  it('ohne beides: kein Filter', () => {
    expect(resolveDeutschWishLevel(null, null)).toBeNull();
    expect(resolveDeutschWishLevel(null, 'unbekannt')).toBeNull();
  });

  it('ignoriert Unfug in der mamamia-Stufe und nimmt den Rechner', () => {
    expect(resolveDeutschWishLevel('level_9', 'kommunikativ')).toBe('level_2');
    expect(resolveDeutschWishLevel('', 'kommunikativ')).toBe('level_2');
  });

  it('deckt alle vier echten Stufen ab', () => {
    for (const l of ['level_1', 'level_2', 'level_3', 'level_4']) {
      expect(resolveDeutschWishLevel(l, 'grundlegend')).toBe(l);
    }
  });
});
