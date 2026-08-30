/*
 * Der Abschluss des Fragenlaufs darf im Float nichts versprechen, was der
 * nächste Satz wieder wegnimmt.
 *
 * Warum dieser Test existiert (30.08.2026): Von zwölf Sitzungen, die den
 * Fragenlauf durchhatten (27.–29.08.), brachen elf auf derselben Nachricht
 * ab — nicht verstreut, auf einem Satz. Pria sagte „Fertig. Ihr Preis ist
 * berechnet" und begründete unmittelbar danach, warum sie ihn doch nicht
 * zeigt. Das Formular des Kostenrechners verlangt DIESELBEN drei
 * Pflichtfelder (Name, E-Mail, Telefon), fragt aber nur nach der
 * Lieferadresse — und schneidet deutlich besser ab.
 *
 * Der Voll-Chat (/sofortangebot) behält bewusst den alten Wortlaut: die
 * Seite bekommt derzeit keinen Verkehr, und zwei geänderte Texte auf einmal
 * würden die Messung vermischen (Martin, 30.08.: „die voll bleibt erstmal
 * raus"). Fällt diese Trennung weg, schlägt dieser Test an.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');
const DATEIEN = ['public/pria.html', 'public/pria-widget.js'];

/* Der Abschluss-Block: von der Preis-Zeile bis zum Aufruf der Kontaktkarte.
   Ausschnitt statt ganzer Datei, damit ein Treffer irgendwo sonst im Skript
   den Test nicht scheinbar bestehen lässt. */
function abschluss(quelle: string): string {
  // Ankerpunkt ist der alte Wortlaut; die Modus-Weiche steht unmittelbar
  // davor, deshalb von dort aus rueckwaerts suchen.
  const anker = quelle.indexOf('Fertig. Ihr Preis ist berechnet');
  expect(anker, 'Abschluss-Block nicht gefunden').toBeGreaterThan(-1);
  const start = quelle.lastIndexOf('if(VOLL)', anker);
  expect(start, 'Modus-Weiche vor dem Abschluss nicht gefunden').toBeGreaterThan(-1);
  /* Die Weiche muss UNMITTELBAR davor stehen. Ohne diese Schranke fand die
     Rueckwaertssuche irgendein VOLL weiter oben im Skript — und der Test
     bestand gegen den alten Stand, obwohl es die Trennung gar nicht gab. */
  expect(anker - start, 'Modus-Weiche gehoert nicht zu diesem Abschluss').toBeLessThan(300);
  const ende = quelle.indexOf('kontakt();', anker);
  expect(ende, 'kontakt() nach dem Abschluss nicht gefunden').toBeGreaterThan(anker);
  return quelle.slice(start, ende);
}

describe('Pria — Abschluss fragt nach der Lieferadresse', () => {
  for (const datei of DATEIEN) {
    const quelle = () => readFileSync(join(WURZEL, datei), 'utf8');

    it(`${datei}: der Float fragt, wohin das Angebot geht`, () => {
      expect(abschluss(quelle())).toContain('Wohin darf ich Ihr Angebot schicken?');
    });

    it(`${datei}: beide Wortlaute hängen an der Modus-Weiche VOLL`, () => {
      // Ohne die Weiche bekämen beide Varianten denselben Text — genau das
      // soll vorerst nicht passieren.
      expect(abschluss(quelle())).toMatch(/if\s*\(\s*VOLL\s*\)/);
    });

    it(`${datei}: das Preis-Versprechen steht NUR im Voll-Zweig`, () => {
      const block = abschluss(quelle());
      const weiche = block.search(/\}\s*else\s*\{/);
      expect(weiche, 'else-Zweig nicht gefunden').toBeGreaterThan(-1);
      const float = block.slice(weiche);
      // Im Float darf weder „Preis ist berechnet" stehen noch die
      // Begründung, warum die Profile verborgen bleiben.
      expect(float).not.toContain('Ihr Preis ist berechnet');
      expect(float).not.toContain('nicht offen im Netz zeigen');
    });
  }
});
