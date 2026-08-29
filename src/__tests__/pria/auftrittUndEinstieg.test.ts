/*
 * Wann Pria auftritt — und womit die Leute einsteigen.
 *
 * Warum dieser Test existiert (29.08.2026): Der Auftritt hing vorher am
 * Kostenrechner-Formular („keine Karte im Bild"). Diese Regel stammte aus
 * der Zeit des LANGEN Formulars und hielt Pria bis weit unter die Seite
 * zurück — Martin: „Ich sehe, dass Pria viel zu spät startet." Der neue
 * Anker ist der Abschnitt „So funktioniert's" (#ablauf), weil er auf Handy
 * und Desktop an derselben Stelle im Lesefluss sitzt, anders als eine
 * Pixel-Schwelle.
 *
 * Der zweite Teil ist die Messung: Ohne sie wüssten wir zwar, DASS jemand
 * den Chat öffnet, aber nicht, WORÜBER — Kopf oder eine der fünf Fragen,
 * die beim Scrollen wechseln. Genau daran hängt aber die Frage, welche
 * Frage die Interessenten anspricht.
 *
 * Beides ist von aussen unsichtbar: Die Seite sieht in jedem Fall richtig
 * aus, nur der Auftritt kommt zu spät bzw. die Spur fehlt. Deshalb prüft
 * es eine Maschine.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');
const widget = readFileSync(join(WURZEL, 'public/pria-widget.js'), 'utf8');

describe('Pria — Auftritt', () => {
  it('hängt am Abschnitt „So funktioniert\'s" (#ablauf), nicht mehr am Formular', () => {
    expect(widget, 'Anker #ablauf fehlt — Pria startet wieder nach Pixeln')
      .toMatch(/getElementById\(\s*['"]ablauf['"]\s*\)/);
    expect(widget, 'Die alte Formular-Bremse ist zurück: der Auftritt darf nicht an den Kostenrechner-Karten hängen')
      .not.toMatch(/imBild\.size\s*===\s*0/);
  });

  it('behält eine Regel für Seiten ohne diesen Abschnitt', () => {
    // Ohne Rückfall stünde Pria auf Prototyp-Seiten entweder sofort oder nie da.
    expect(widget, 'Rückfall auf die Scroll-Schwelle fehlt')
      .toMatch(/anker\s*\?\s*ankerErreicht\s*:\s*scrollY\s*>/);
  });

  it('zeigt erst den Kopf und dann die Fragen', () => {
    // Am Anker nur Pria; die erste Frage kommt nach etwas Weiterlesen.
    expect(widget, 'Die Fragen erscheinen sofort mit dem Kopf statt danach')
      .toMatch(/seitAnker\s*<\s*innerHeight\s*\*\s*0\.5/);
  });
});

describe('Pria — Einstieg wird mitgeschrieben', () => {
  it('hält fest, ob über den Kopf geöffnet wurde', () => {
    expect(widget).toMatch(/ereignis:\s*['"]chat_geoeffnet['"][^}]*via:\s*['"]kopf['"]/);
  });

  it('hält bei der Frage AUCH fest, welche Frage es war', () => {
    // Ohne den Wortlaut wüssten wir nur „über eine Frage" — und könnten
    // nicht sagen, welche der fünf zieht.
    const zeile = widget.match(/ereignis:\s*['"]chat_geoeffnet['"][^}]*via:\s*['"]frage['"][^}]*/)?.[0] ?? '';
    expect(zeile, 'Einstieg über die Frage wird nicht protokolliert').not.toBe('');
    expect(zeile, 'Der Wortlaut der Frage fehlt — dann ist die Auswertung wertlos').toMatch(/frage:\s*f\b/);
  });

  it('protokolliert das Öffnen VOR dem Öffnen — sonst geht es beim Wegklicken verloren', () => {
    const kopf = widget.indexOf("via:'kopf'") >= 0 ? widget.indexOf("via:'kopf'") : widget.indexOf('via: \'kopf\'');
    const oeffneNachher = widget.indexOf('oeffne();', kopf);
    expect(kopf, 'Kopf-Einstieg nicht gefunden').toBeGreaterThan(0);
    expect(oeffneNachher, 'protokoll() muss vor oeffne() stehen').toBeGreaterThan(kopf);
  });
});
