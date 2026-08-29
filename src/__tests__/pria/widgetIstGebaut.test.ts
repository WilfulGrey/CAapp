/*
 * Das eingebettete Widget muss zu seiner Quelle passen.
 *
 * Warum dieser Test existiert (29.08.2026): `public/pria-widget.js` wird von
 * `scripts/pria-widget-bauen.py` aus `public/pria.html` erzeugt — die HTML-Datei
 * ist die EINE Quelle. An diesem Tag standen zwei Änderungen (Auftritt am
 * Abschnitt „So funktioniert's", Mitschreiben des Einstiegs) nur in der
 * ERZEUGTEN Datei. Von Hand hineingeschrieben, in der Quelle fehlten sie.
 *
 * Das fällt nicht auf, solange niemand baut: ausgeliefert wird ja die erzeugte
 * Datei, und die war richtig. Der nächste Lauf des Erzeugers hätte beide
 * Änderungen kommentarlos wieder entfernt — Pria wäre auf die alte
 * Auftrittsregel zurückgefallen und der Einstieg nicht mehr auswertbar
 * gewesen, ohne dass ein Test angeschlagen hätte.
 *
 * Der Test baut deshalb in einem Wegwerf-Ordner neu und vergleicht Zeichen für
 * Zeichen. Schlägt er an, ist die Antwort fast immer: die Änderung gehört in
 * `pria.html`, danach `python3 scripts/pria-widget-bauen.py` laufen lassen.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');

describe('Pria — das ausgelieferte Widget stammt aus der Quelle', () => {
  it('erzeugt aus pria.html exakt die eingecheckte pria-widget.js', () => {
    const quelle = readFileSync(join(WURZEL, 'public', 'pria.html'), 'utf8');
    const skript = readFileSync(join(WURZEL, 'scripts', 'pria-widget-bauen.py'), 'utf8');
    const eingecheckt = readFileSync(join(WURZEL, 'public', 'pria-widget.js'), 'utf8');

    // Gleiche Ordnerform wie im Projekt: das Skript findet Quelle und Ziel
    // über seinen eigenen Ort (HIER.parent / 'public').
    const ordner = mkdtempSync(join(tmpdir(), 'pria-bau-'));
    mkdirSync(join(ordner, 'public'));
    mkdirSync(join(ordner, 'scripts'));
    writeFileSync(join(ordner, 'public', 'pria.html'), quelle);
    writeFileSync(join(ordner, 'scripts', 'pria-widget-bauen.py'), skript);

    execFileSync('python3', [join(ordner, 'scripts', 'pria-widget-bauen.py')], { stdio: 'pipe' });
    const frisch = readFileSync(join(ordner, 'public', 'pria-widget.js'), 'utf8');

    expect(
      frisch,
      'pria-widget.js weicht von einem Neubau aus pria.html ab — die Änderung ' +
      'steht nur in der erzeugten Datei und wäre beim nächsten Bau weg. ' +
      'Ändern in public/pria.html, dann: python3 scripts/pria-widget-bauen.py'
    ).toBe(eingecheckt);
  });
});
