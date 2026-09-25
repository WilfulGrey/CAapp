import { describe, it, expect } from 'vitest';
import { HERO_PUNKTE } from '../lib/heroPunkte';
import { HERO_PUNKTE as ORIGINAL } from '../../project 3/lib/hero-punkte';

describe('Vorteile im Portal = Kostenrechner-Startseite', () => {
  it('gleicher Wortlaut, gleiche Reihenfolge', () => {
    expect([...HERO_PUNKTE]).toEqual([...ORIGINAL]);
  });
});
