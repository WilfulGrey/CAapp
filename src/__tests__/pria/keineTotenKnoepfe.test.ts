/*
 * Pria darf keinen Knopf zeigen, der nichts tut.
 *
 * Warum dieser Test existiert (22.08.2026): „Rückruf vereinbaren" und „Auf
 * WhatsApp schreiben" standen monatelang mit einem leeren Handler `f:()=>{}`
 * im Chat. Der Kunde klickte, nichts geschah — und weil das Modell die Bitte
 * im Fließtext freundlich bestätigte („Name und Nummer habe ich"), sah es für
 * ihn aus, als sei ein Rückruf vereinbart. Es war keiner. Ein drittes
 * Vorkommen („Kundenportal — Link folgt per E-Mail") fiel erst auf, als der
 * Wächter beim Einbau anschlug.
 *
 * Der Fehler ist von aussen unsichtbar: die Seite wirft keinen Fehler, das
 * Layout stimmt, nur die Zusage ist leer. Deshalb prüft ihn eine Maschine.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');

describe('Pria — kein Chip ohne Wirkung', () => {
  // Beide Dateien: die Quelle und das daraus erzeugte Widget. Ein leerer
  // Handler, der nur im Erzeugnis steht, wäre genauso schlimm.
  for (const datei of ['public/pria.html', 'public/pria-widget.js']) {
    it(`${datei} enthält keinen leeren Klick-Handler`, () => {
      const quelle = readFileSync(join(WURZEL, datei), 'utf8');
      // Leerzeichen zwischen den Zeichen zulassen — der Fehler soll nicht
      // durchrutschen, weil jemand anders formatiert hat.
      const leer = /f\s*:\s*\(\s*\)\s*=>\s*\{\s*\}/g;
      const treffer = quelle.match(leer) ?? [];
      expect(treffer, `${treffer.length} Chip(s) ohne Wirkung in ${datei}`).toEqual([]);
    });
  }

  it('der Rückruf-Knopf ruft die Route, die ihn weitergibt', () => {
    const html = readFileSync(join(WURZEL, 'public', 'pria.html'), 'utf8');
    // Ohne diese Zusicherung wäre ein umbenannter Knopf ein bestandener Test.
    expect(html).toContain('Rückruf vereinbaren');
    expect(html).toContain("fetch('/api/pria/rueckruf'");
  });
});
