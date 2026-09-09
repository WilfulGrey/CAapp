import { describe, it, expect } from 'vitest';
import { zeigtSommerzuschlag } from '../components/portal/konditionen';

/*
 * Der Sommerzuschlag WIRD unveraendert fuer Juli und August berechnet und
 * steht im Vertrag (§ 4) und in der FAQ. Hier geht es nur um die allgemeine
 * Kosten-Uebersicht im Portal, die keinen Einsatzzeitraum kennt: Dort soll er
 * in der Saison stehen und ausserhalb nicht (Martin, 09.09.2026 — „wir haben
 * keinen Sommer mehr, zeigen wir wieder ab Mai").
 */
describe('zeigtSommerzuschlag: Saisonfenster der allgemeinen Uebersicht', () => {
  const am = (monat1basiert: number) => new Date(2026, monat1basiert - 1, 15);

  it('zeigt ihn von Mai bis August', () => {
    for (const m of [5, 6, 7, 8]) {
      expect(zeigtSommerzuschlag(am(m))).toBe(true);
    }
  });

  it('zeigt ihn von September bis April nicht', () => {
    for (const m of [9, 10, 11, 12, 1, 2, 3, 4]) {
      expect(zeigtSommerzuschlag(am(m))).toBe(false);
    }
  });

  it('Kanten: 30. April aus, 1. Mai an, 31. August an, 1. September aus', () => {
    expect(zeigtSommerzuschlag(new Date(2026, 3, 30))).toBe(false);
    expect(zeigtSommerzuschlag(new Date(2026, 4, 1))).toBe(true);
    expect(zeigtSommerzuschlag(new Date(2026, 7, 31))).toBe(true);
    expect(zeigtSommerzuschlag(new Date(2026, 8, 1))).toBe(false);
  });
});
