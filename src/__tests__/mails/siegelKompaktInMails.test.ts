import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Der Wortlaut ist innerhalb von zwei Tagen zweimal gekippt (#543 "6×
// Testsieger", #577 "6× in Folge" als eigene Zeile) — und im Siegel-Block
// der Mails stand danach "Testsieger" ohne die Zahl, auf vier gedraengten
// Zeilen neben dem Logo. Entscheidung Martin 28.08.2026:
//
//   Mails  → kompakt: "6× Testsieger / DIE WELT / Preis & Qualität"
//   Sonst  → wo Platz ist (Website, PDF, Fließtext), gern "6× in Folge"
//
// Der Test bewacht NUR den engen Siegel-Block, nicht den Fließtext.

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');
const MAIL_DATEIEN = [
  'lib/email.ts',
  'lib/email-template.ts',
  'supabase/functions/send-scheduled-emails/index.ts',
  'supabase/functions/send-scheduled-emails/bewertung.ts',
];

// Eine Siegel-Zeile ist ein <p>, das NUR "6× in Folge" enthaelt.
const SIEGELZEILE = /<p[^>]*>\s*6×\s*in\s*Folge\s*<\/p>/;

describe('Siegel in Mails bleibt kompakt', () => {
  for (const datei of MAIL_DATEIEN) {
    it(`${datei}: keine eigene "6× in Folge"-Zeile im Siegel`, () => {
      const quelle = readFileSync(join(WURZEL, datei), 'utf8');
      expect(SIEGELZEILE.test(quelle)).toBe(false);
    });

    it(`${datei}: das Siegel traegt die Zahl`, () => {
      const quelle = readFileSync(join(WURZEL, datei), 'utf8');
      expect(quelle).toMatch(/<p[^>]*>6× Testsieger/);
    });
  }

  it('im Fließtext bleibt "in Folge" ausdruecklich erlaubt', () => {
    const quelle = readFileSync(
      join(WURZEL, 'supabase/functions/send-scheduled-emails/index.ts'), 'utf8');
    // Absichtlich: dort steht eine ganze Zeile zur Verfuegung.
    expect(quelle).toMatch(/in Folge/);
  });
});
