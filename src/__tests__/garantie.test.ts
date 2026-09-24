import { describe, it, expect } from 'vitest';
import { GARANTIE_PORTAL } from '../lib/garantie';
import { GARANTIE } from '../../project 3/lib/kraefte-vorschau';

describe('Bestpreisgarantie im Portal', () => {
  it('hat Wort für Wort den freigegebenen Text aus dem Kostenrechner', () => {
    expect(GARANTIE_PORTAL.titel).toBe(GARANTIE.titel);
    expect(GARANTIE_PORTAL.zusage).toBe(GARANTIE.zusage);
    expect(GARANTIE_PORTAL.ablauf).toBe(GARANTIE.ablauf);
    expect(GARANTIE_PORTAL.warum).toBe(GARANTIE.warum);
    expect(GARANTIE_PORTAL.aufklappen).toBe(GARANTIE.aufklappen);
    expect([...GARANTIE_PORTAL.bedingungen]).toEqual([...GARANTIE.bedingungen]);
  });
});
