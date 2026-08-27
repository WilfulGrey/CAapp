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
    it(`${datei}: nach einer Angabe geht es zur nächsten Frage, nicht ins Menü`, () => {
      const quelle = readFileSync(join(WURZEL, datei), 'utf8');

      // Der Weiterlauf liegt an EINER Stelle — sonst läuft er wieder pro
      // Pfad auseinander (genau so entstand der Bug vom 27.08.).
      const weiter = funktionsKoerper(quelle, 'weiterNachAngabe');
      expect(weiter, 'weiterNachAngabe() führt nicht in den Fragenlauf').toContain('naechste()');

      // Ohne offene Frage MUSS es trotzdem weitergehen: das war die Lücke.
      const ohneOffeneFrage = weiter.slice(weiter.lastIndexOf('if(offeneFrage'));
      expect(
        ohneOffeneFrage,
        'Ohne offene Frage endet der Weg nicht im Fragenlauf — der Kunde landet wieder im Menü',
      ).toContain('naechste()');
      if (ohneOffeneFrage.includes('beraterChips()')) {
        expect(
          ohneOffeneFrage,
          'beraterChips() ohne Guard: der Normalfall darf nicht im Menü enden',
        ).toMatch(/uebergeben[\s\S]*kontaktOffen/);
      }

      // …und beide Übernahme-Pfade müssen dort landen.
      for (const fn of ['uebernehmen', 'mehrfachUebernehmen']) {
        expect(
          funktionsKoerper(quelle, fn),
          `${fn}() geht nicht über weiterNachAngabe() — der Weiterlauf läuft wieder auseinander`,
        ).toContain('weiterNachAngabe()');
      }
    });

    it(`${datei}: mehrere Angaben aus einer Nachricht werden zusammen eingetragen`, () => {
      const quelle = readFileSync(join(WURZEL, datei), 'utf8');
      // Der Bot darf verstehen, was in einem Satz steckt („meine Eltern,
      // beide Pflegegrad 3, nachts unruhig") — sonst fragt er nach dem,
      // was der Kunde gerade gesagt hat.
      expect(quelle, 'Mehrfach-Übernahme fehlt').toContain('mehrfachUebernehmen(');
      expect(
        quelle,
        'verarbeite() reicht die Felder-Liste des Modells nicht durch',
      ).toMatch(/r\.felder/);
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
