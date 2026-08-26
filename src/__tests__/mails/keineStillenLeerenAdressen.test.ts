import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PORTAL_BASIS } from '../../../project 3/lib/portal-url';

// Am 26.08.2026 gingen Bewertungsmails raus, deren Zielseite keinen einzigen
// Bewertungsknopf zeigte, und Mail-Bausteine, denen der Portal-Link fehlte.
// Beides dieselbe Ursache: eine Pflicht-Adresse lag NUR in einer
// NEXT_PUBLIC_*-Variable mit Rueckfall auf ''. War die Variable in Render
// nicht gesetzt, verschwand der Link stillschweigend — kein Fehler, keine
// Meldung, nur eine Mail bzw. Seite ohne Weg nach vorn.
//
// Diese Tests halten fest: eine Adresse, an der eine Handlung haengt, muss
// im Code stehen. Die Variable darf ueberschreiben, nie allein tragen.

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');

function alleQuellen(ordner: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(ordner)) {
    if (eintrag === 'node_modules' || eintrag === '.next' || eintrag.startsWith('.')) continue;
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) alleQuellen(pfad, treffer);
    else if (/\.tsx?$/.test(eintrag)) treffer.push(pfad);
  }
  return treffer;
}

describe('Pflicht-Adressen duerfen nicht still leer werden', () => {
  it('PORTAL_BASIS ist absolut und nie leer', () => {
    expect(PORTAL_BASIS).toMatch(/^https:\/\/\S+$/);
    expect(PORTAL_BASIS.endsWith('/')).toBe(false);
  });

  it('kein NEXT_PUBLIC_PORTAL_URL mehr mit Rueckfall auf leer', () => {
    const muster = /NEXT_PUBLIC_PORTAL_URL\s*(?:\?\?|\|\|)\s*['"]['"]/;
    const sünder = alleQuellen(WURZEL)
      .filter((f) => muster.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(WURZEL, 'project 3'));
    expect(sünder).toEqual([]);
  });

  it('die Bewertungsseite traegt mindestens eine Adresse im Code', () => {
    const quelle = readFileSync(join(WURZEL, 'app', 'feedback', 'page.tsx'), 'utf8');
    // Mindestens eine der Bewertungs-Konstanten braucht einen echten
    // Rueckfall — sonst kann die Seite wieder ohne Knopf enden.
    expect(quelle).toMatch(/REVIEW_URL[\s\S]{0,220}?\|\|\s*'https:\/\//);
  });

  it('die Bewertungsseite endet nie ohne Handlung', () => {
    const quelle = readFileSync(join(WURZEL, 'app', 'feedback', 'page.tsx'), 'utf8');
    // Genau dieser Satz stand als einzige "Antwort" auf der Dankesseite,
    // nachdem beide Knoepfe verschwunden waren.
    const sackgasse = /!GOOGLE_REVIEW_URL\s*&&\s*!TRUSTPILOT_REVIEW_URL/;
    expect(sackgasse.test(quelle)).toBe(false);
  });
});
