import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERO_PUNKTE } from '../lib/heroPunkte';
import { HERO_PUNKTE as ORIGINAL, PORTAL_PUNKTE } from '../../project 3/lib/hero-punkte';
import { GARANTIE_PUNKTE } from '../components/portal/EinstiegMinimal';

describe('Hero-Punkte: Spiegel und Startseite (Registry #158)', () => {
  it('gleicher Wortlaut, gleiche Reihenfolge (ältere Portal-Ansichten und /kalkulation)', () => {
    expect([...HERO_PUNKTE]).toEqual([...ORIGINAL]);
  });

  it('unter dem Hero-Knopf dieselben Punkte wie im Portal unter dem Preis, Bestpreisgarantie zuerst (Registry #158)', () => {
    // Martin 09.11.2026: „Punkte unter dem Text sind gut. Mache live“.
    expect([...PORTAL_PUNKTE]).toEqual([...GARANTIE_PUNKTE]);
    const formular = readFileSync(join(__dirname, '..', '..', 'project 3', 'components/calculator/MultiStepForm.tsx'), 'utf8');
    const hero = formular.slice(formular.indexOf('<ul className="mt-5 flex flex-col gap-3 lg:pl-1.5">'), formular.indexOf('<BestpreisDialog open={garantieOffen}'));
    expect(hero.indexOf('{GARANTIE.wort}')).toBeGreaterThan(-1);
    expect(hero.indexOf('PORTAL_PUNKTE.map(')).toBeGreaterThan(hero.indexOf('{GARANTIE.wort}'));
    expect(hero).not.toContain('HERO_PUNKTE');
    // Grüne Haken wie im Portal, Koralle bleibt den Knöpfen vorbehalten.
    expect(hero).not.toContain('text-[#E76F63]');
    expect((hero.match(/<HakenGruen \/>/g) || []).length).toBe(2);
    const haken = formular.slice(formular.indexOf('function HakenGruen()'), formular.indexOf('// ─── Matching Animation Component'));
    expect(haken).toContain('text-[#3D7A5C]');
    expect(haken).not.toContain('#E76F63');
  });
});
