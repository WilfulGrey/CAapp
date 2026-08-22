/*
 * Pria: das Widget und der Sprachdienst müssen DENSELBEN Fragenkatalog kennen.
 *
 * Warum dieser Test existiert (22.08.2026): Der Chat bekam zwei neue Fragen —
 * Führerschein und Geschlecht — im Widget (`public/pria.html`), aber nicht im
 * Prompt (`lib/pria.ts`). Folge: Das Modell erkannte „lieber eine Frau" völlig
 * richtig und antwortete `geschlecht = weiblich`, die serverseitige Prüfung
 * kannte das Feld aber nicht und warf den Wert weg. Für den Kunden sah es so
 * aus, als hätte Pria seine Antwort bestätigt und dann dieselbe Frage noch
 * einmal gestellt.
 *
 * Der Fehler war unsichtbar: beide Seiten für sich waren in sich stimmig, nur
 * zueinander nicht. Genau das prüft dieser Test — Schlüssel UND erlaubte Werte,
 * in derselben Reihenfolge.
 *
 * Gelesen wird als Text, nicht importiert: `public/pria.html` ist eine
 * eigenständige Seite ohne Modulsystem, und `lib/pria.ts` liegt außerhalb der
 * Auflösungspfade dieses Testlaufs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');

/**
 * FLOW-Einträge einsammeln. Bewusst nicht mit einem grossen Muster über den
 * ganzen Block: zwischen den Einträgen stehen Kommentare, an denen sich ein
 * gieriges Muster verschluckt (genau das ist beim ersten Versuch passiert —
 * `haushalt` hat die Werte von `pflegegrad` mitgenommen und `pflegegrad`
 * verschwand). Stattdessen am Schlüssel schneiden und je Stück die erste
 * Optionsliste bis zum schliessenden `]]` lesen.
 */
function flowAus(block: string, stil: 'html' | 'ts'): Array<{ k: string; werte: string[] }> {
  const schluessel = stil === 'html' ? /\{k:'(\w+)'/g : /\{ k: '(\w+)'/g;
  const treffer = Array.from(block.matchAll(schluessel));
  return treffer
    .map((t, i) => {
      const stueck = block.slice(t.index!, i + 1 < treffer.length ? treffer[i + 1].index! : block.length);
      const liste = /o:\s*\[([\s\S]*?)\]\s*\]/.exec(stueck);
      const werte = liste ? Array.from(liste[1].matchAll(/\['([^']+)'/g)).map((m) => m[1]) : [];
      return { k: t[1], werte };
    })
    .filter((f) => f.werte.length > 0);
}

/** Nur den FLOW-Block, nicht den Rest der Datei (im Widget folgt THEMEN mit
 *  derselben Schreibweise). */
function nurFlow(quelle: string, anfang: string): string {
  const von = quelle.indexOf(anfang);
  if (von < 0) return '';
  const bis = quelle.indexOf('\n];', von);
  return quelle.slice(von, bis < 0 ? undefined : bis);
}

describe('Pria — Widget und Sprachdienst kennen denselben Fragenkatalog', () => {
  const html = readFileSync(join(WURZEL, 'public', 'pria.html'), 'utf8');
  const lib = readFileSync(join(WURZEL, 'lib', 'pria.ts'), 'utf8');

  const imWidget = flowAus(nurFlow(html, 'const FLOW=['), 'html');
  const imDienst = flowAus(nurFlow(lib, 'export const FLOW = ['), 'ts');

  it('findet in beiden Dateien überhaupt einen Fragenkatalog', () => {
    // Ohne diese Zusicherung wäre ein leerer Treffer ein bestandener Test —
    // der Wächter würde schlafen, statt zu warnen.
    expect(imWidget.length).toBeGreaterThanOrEqual(8);
    expect(imDienst.length).toBeGreaterThanOrEqual(8);
  });

  it('hat dieselben Felder in derselben Reihenfolge', () => {
    expect(imDienst.map((f) => f.k)).toEqual(imWidget.map((f) => f.k));
  });

  it('hat je Feld dieselben erlaubten Werte', () => {
    for (const feld of imWidget) {
      const gegenstueck = imDienst.find((f) => f.k === feld.k);
      expect(gegenstueck, `Feld ${feld.k} fehlt im Sprachdienst`).toBeDefined();
      expect(gegenstueck!.werte, `Werte von ${feld.k} weichen ab`).toEqual(feld.werte);
    }
  });
});
