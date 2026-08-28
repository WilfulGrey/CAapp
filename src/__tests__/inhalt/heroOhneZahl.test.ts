import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Martin, 28.08.2026: "hier im Hero nie diese 6x schreiben".
//
// Der Kicker der H1 trug "24-Stunden-Pflege vom Testsieger – 6× in Folge".
// Auf dem Desktop brach die Zeile um und "IN FOLGE" stand allein in Zeile
// zwei. Der Vertrauensanker sitzt ohnehin im Siegel auf dem Foto daneben.
//
// Der Test bewacht NUR die H1 der Startseite — auf der uebrigen Seite und
// in der Testsieger-Sektion bleibt die Zahl ausdruecklich erwuenscht.

const STARTSEITE = join(__dirname, '..', '..', '..', 'project 3', 'app', 'page.tsx');

describe('Hero der Startseite', () => {
  it('traegt keine Zahl im Kicker', () => {
    const quelle = readFileSync(STARTSEITE, 'utf8');
    const h1 = quelle.slice(quelle.indexOf('<h1'), quelle.indexOf('</h1>'));
    // Kommentare raus — dort steht die Begruendung und darf "6x" vorkommen.
    const sichtbar = h1.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(sichtbar).not.toMatch(/6\s*[x×]/i);
    expect(sichtbar).not.toMatch(/in Folge/i);
  });

  it('behaelt den Testsieger-Anker ohne Zahl', () => {
    const quelle = readFileSync(STARTSEITE, 'utf8');
    expect(quelle).toMatch(/24-Stunden-Pflege vom Testsieger/);
  });
});
