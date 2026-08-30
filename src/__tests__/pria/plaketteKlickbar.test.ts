/*
 * Die Verfügbarkeits-Plakette auf der Startseite muss klickbar sein.
 *
 * Warum dieser Test existiert (30.08.2026): Sie war reiner Text — vier
 * Gesichter und „75 Pflegekräfte sofort verfügbar", eingefasst wie ein Chip.
 * Clarity zeigte, dass die Leute genau darauf tippen: 17 Sitzungen in drei
 * Tagen endeten mit einem toten Klick, mehrere davon hatten überhaupt nur
 * diesen einen Klick und verließen die Seite danach.
 *
 * Der Fehler ist von aussen unsichtbar — nichts bricht, es passiert nur
 * nichts. Und er trifft den Moment mit der höchsten Absicht auf der ganzen
 * Seite: „Pflegekräfte ansehen" ist das Versprechen der Anzeige, die
 * Gesichter sind seine Einlösung.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const quelle = readFileSync(
  join(__dirname, '..', '..', '..', 'project 3', 'components/calculator/MultiStepForm.tsx'),
  'utf8',
);

describe('Verfügbarkeits-Plakette', () => {
  it('ist ein Knopf und öffnet den Fragenlauf', () => {
    const block = quelle.slice(
      quelle.indexOf('Zaehler zentriert unter dem Button'),
      quelle.indexOf('Pflegekräfte sofort verfügbar') + 200,
    );
    expect(block, 'Die Plakette ist wieder ein <div> — der Klick verpufft').toMatch(/<button/);
    expect(block, 'Sie öffnet den Fragenlauf nicht').toMatch(/setFullscreen\(true\)/);
  });

  it('zählt den Einstieg getrennt vom Hauptknopf', () => {
    // Ohne eigene Kennung wüssten wir nie, ob dieser Weg genutzt wird.
    expect(quelle, "Kennung 'hero_badge' fehlt").toMatch(/source:\s*'hero_badge'/);
    expect(quelle, "Die Kennung des Hauptknopfs darf bleiben").toMatch(/source:\s*'hero_cta'/);
  });

  it('sieht anklickbar aus', () => {
    // Ein Knopf, der wie ein Etikett aussieht, wird nur zufällig getroffen.
    expect(quelle, 'Kein sichtbarer Hinweis, dass hier etwas passiert')
      .toMatch(/Pflegekräfte sofort verfügbar[\s\S]{0,320}→/);
  });
});
