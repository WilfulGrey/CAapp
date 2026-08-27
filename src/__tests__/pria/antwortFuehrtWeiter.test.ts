/*
 * Pria: Wer eine Frage beantwortet hat, bekommt die NÄCHSTE Frage — nie ein Menü.
 *
 * Warum dieser Test existiert (27.08.2026): Auf der Chat-Landingpage startet
 * das Gespräch offen („Stellen Sie mir gern jede Frage — oder wir starten
 * direkt mit Ihrem Angebot"). Ein Kunde schrieb „Eltern", das Modell erkannte
 * korrekt `personen = 2`, der Chat quittierte („Das notiere ich gleich mit …")
 * — und zeigte danach wieder das Einstiegsmenü. Der Kunde hatte Frage 1
 * beantwortet und musste trotzdem von vorn wählen.
 *
 * Ursache: `uebernehmen()` führte nur dann weiter, wenn bereits eine Frage
 * offen war. Im schwebenden Widget war das fast immer der Fall — im offenen
 * Einstieg ist „Übernahme, bevor der Lauf begonnen hat" der Normalfall.
 *
 * Zweiter Fall am selben Tag: Das Modell schlug bei „Für wen suchen Sie?"
 * die Chips „Mutter", „Vater", „Preis berechnen" vor — „Eltern" fehlte.
 * Welche Personen zur Auswahl stehen, ist eine Preis-Entscheidung und gehört
 * deshalb in den Code, nicht ins Ermessen des Modells.
 *
 * Gelesen wird als Text, nicht importiert: `public/pria.html` ist eine
 * eigenständige Seite ohne Modulsystem (dieselbe Bauart wie die
 * Nachbar-Tests). Geprüft werden Quelle UND erzeugtes Widget — eine Regel,
 * die nur in der Quelle steht, hilft dem Kunden nicht.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');
const DATEIEN = ['public/pria.html', 'public/pria-widget.js'];

/** Körper einer Funktion ab ihrem Namen bis zur schließenden Klammer in Spalte 0. */
function funktionsKoerper(quelle: string, name: string): string {
  const start = quelle.indexOf(`function ${name}(`);
  expect(start, `Funktion ${name} nicht gefunden`).toBeGreaterThan(-1);
  const ende = quelle.indexOf('\n}', start);
  expect(ende, `Ende von ${name} nicht gefunden`).toBeGreaterThan(start);
  return quelle.slice(start, ende);
}

describe('Pria — eine beantwortete Frage führt weiter, nicht zurück ins Menü', () => {
  for (const datei of DATEIEN) {
    it(`${datei}: uebernehmen() geht in den Fragenlauf, statt Chips anzubieten`, () => {
      const quelle = readFileSync(join(WURZEL, datei), 'utf8');
      const koerper = funktionsKoerper(quelle, 'uebernehmen');

      // Der Weiterlauf muss drin sein …
      expect(koerper, 'uebernehmen() ruft nirgends naechste()').toContain('naechste()');

      // … und zwar auch dann, wenn noch KEINE Frage offen ist. Genau diese
      // Lücke war der Bug: der Fall fiel vorher auf beraterChips() zurück.
      const nachDenOffenenFaellen = koerper.slice(koerper.lastIndexOf('if(offeneFrage'));
      expect(
        nachDenOffenenFaellen,
        'Ohne offene Frage endet uebernehmen() nicht im Fragenlauf — der Kunde landet wieder im Menü',
      ).toContain('naechste()');

      // beraterChips darf nur noch der Ausweg für „Lead schon übergeben /
      // Kontaktkarte offen" sein — nicht der Normalfall.
      if (nachDenOffenenFaellen.includes('beraterChips()')) {
        expect(
          nachDenOffenenFaellen,
          'beraterChips() ohne Guard: der Normalfall darf nicht im Menü enden',
        ).toMatch(/uebergeben[\s\S]*kontaktOffen/);
      }
    });

    it(`${datei}: die Für-wen-Auswahl kommt vollständig aus dem Code`, () => {
      const quelle = readFileSync(join(WURZEL, datei), 'utf8');
      const koerper = funktionsKoerper(quelle, 'fuerWenChips');

      // Alle drei Personenfälle — „Eltern" hatte das Modell weggelassen.
      for (const fall of ['Mutter', 'Vater', 'Eltern']) {
        expect(koerper, `Für-wen-Auswahl ohne „${fall}"`).toContain(fall);
      }
      // Eltern sind zwei Pflegebedürftige — sonst rechnet der Preis falsch.
      expect(koerper).toMatch(/Für meine Eltern[\s\S]*'2'|'2'[\s\S]*Für meine Eltern/);

      // Und die Regel, die verhindert, dass Modell-Chips das überschreiben.
      expect(
        quelle,
        'Modell-Chips können die Personen-Auswahl wieder verstümmeln',
      ).toContain('fuerWenGemeint(');
    });
  }
});
