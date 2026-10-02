/*
 * Ein Tipp neben den Fragebogen darf keinen Fortschritt kosten (Registry #108).
 *
 * Warum dieser Test existiert (02.10.2026): Wer über primundus.de mit
 * `?start=1` in den Rechner kommt, sieht den Fragebogen sofort als Overlay
 * (Fragebogen z-90, dunkler Hintergrund z-80). Ohne Cookie-Wahl liegt die
 * Cookie-Leiste (z-50) darunter — sichtbar, aber nicht bedienbar. Ein Tipp auf
 * die Leiste traf den Hintergrund, der Hintergrund schloss den Fragebogen, und
 * das Schließen setzte ihn auf Frage 1 zurück. Live gemessen in 32 von 32
 * Läufen. Martin hat freigegeben: Hintergrund schließt nicht mehr, Schließen
 * nur über das X, Wiederöffnen an derselben Frage mit denselben Antworten.
 *
 * Der Root-Vitest darf keine Next-Komponenten laden (CLAUDE.md), deshalb
 * prüft dieser Test den Quelltext von MultiStepForm — wie
 * pria/plaketteKlickbar.test.ts — und den echten anonymen Zähler.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zaehle, zaehlerZuruecksetzen } from '../../project 3/lib/zaehler';

const quelle = readFileSync(
  join(__dirname, '..', '..', 'project 3', 'components/calculator/MultiStepForm.tsx'),
  'utf8',
);

/** Rumpf einer Pfeilfunktion `const name = (...) => { ... };` (Ende = gleiche Einrückung). */
function rumpf(kopf: string): string {
  const start = quelle.indexOf(kopf);
  expect(start, `„${kopf}" fehlt in MultiStepForm.tsx`).toBeGreaterThan(-1);
  const zeilenAnfang = quelle.lastIndexOf('\n', start) + 1;
  const einzug = quelle.slice(zeilenAnfang, start);
  const ende = quelle.indexOf(`\n${einzug}};`, start);
  expect(ende, `Ende von „${kopf}" nicht gefunden`).toBeGreaterThan(start);
  return quelle.slice(start, ende);
}

describe('Fragebogen-Overlay: Hintergrund-Tipp kostet keinen Fortschritt', () => {
  it('der dunkle Hintergrund schließt nur im Kontaktschritt (dort gibt es kein X)', () => {
    const hintergruende = [...quelle.matchAll(/<div[^>]*bg-black\/60[^>]*>/g)].map((m) => m[0]);
    // Fragebogen und Warteseite haben je einen Hintergrund.
    expect(hintergruende.length).toBeGreaterThanOrEqual(2);
    for (const h of hintergruende) {
      const ohneKontaktAusgang = h.replace('onClick={currentStep === totalSteps ? schliessen : undefined}', '');
      expect(ohneKontaktAusgang, 'Ein Tipp auf den Hintergrund (z. B. auf die Cookie-Leiste) schließt wieder den Fragebogen').not.toMatch(/onClick|onPointer|onMouse|onTouch/);
    }
    // Der eine erlaubte Ausgang: nur im Kontaktschritt und nur über `schliessen` (hält Schritt und Antworten).
    expect(hintergruende.filter((h) => h.includes('onClick=')).length).toBeLessThanOrEqual(1);
  });

  it('bei den Fragen schließt nur das X — über die Funktion `schliessen`', () => {
    const xKnopf = quelle.slice(quelle.lastIndexOf('<button', quelle.indexOf('aria-label="Schließen"')), quelle.indexOf('aria-label="Schließen"'));
    expect(xKnopf).toMatch(/onClick=\{schliessen\}/);
    // Jeder weitere Ort, der den Fragebogen schließt, braucht eine eigene Entscheidung.
    expect(quelle.match(/setFullscreen\(false\)/g) ?? [], 'Ein zweiter Weg schließt den Fragebogen').toHaveLength(1);
    expect(rumpf('const schliessen = () =>')).toContain('setFullscreen(false)');
  });

  it('Schließen setzt im CTA-Modus nicht auf Frage 1 zurück', () => {
    const koerper = rumpf('const schliessen = () =>');
    // Der Inline-Modus (nirgends eingebunden) darf wie bisher zurücksetzen —
    // nur innerhalb von `if (mode !== 'cta') { ... }`.
    const ohneInline = koerper.replace(/if \(mode !== 'cta'\) \{[^}]*\}/, '');
    expect(ohneInline, 'Das X setzt den Fragebogen wieder auf Frage 1').not.toMatch(/setCurrentStep|setWarmupAudience/);
    // Ein laufender Auto-Weiter darf nach dem Schließen nicht weiterblättern.
    expect(koerper).toMatch(/clearTimeout\(advanceTimer\.current\)/);
  });

  it('Wiederöffnen setzt nicht auf Frage 1 zurück — Hero-Knopf, Plakette und alle CTAs', () => {
    expect(rumpf('const oeffnen = (e: Event) =>'), 'CTAs der Seite starten wieder bei Frage 1').not.toMatch(/setCurrentStep/);
    for (const quelleName of ['hero_cta', 'hero_badge']) {
      const pos = quelle.indexOf(`source: '${quelleName}'`);
      expect(pos, `Kennung ${quelleName} fehlt`).toBeGreaterThan(-1);
      const handler = quelle.slice(quelle.lastIndexOf('onClick={() => {', pos), quelle.indexOf('}}', pos));
      expect(handler, `${quelleName} startet wieder bei Frage 1`).not.toMatch(/setCurrentStep/);
      expect(handler).toMatch(/setFullscreen\(true\)/);
    }
  });

  it('?start=1 öffnet weiter einmal je Seitenaufruf bei Frage 1', () => {
    const block = quelle.slice(quelle.indexOf('const startVerarbeitet = useRef(false);'), quelle.indexOf('}, [mode]);'));
    expect(block).toMatch(/params\.get\('start'\) !== '1'/);
    expect(block).toMatch(/startVerarbeitet\.current = true/);
    expect(block).toMatch(/setCurrentStep\(1\)/);
  });
});

describe('Anonymer Zähler beim Wiederöffnen', () => {
  beforeEach(() => zaehlerZuruecksetzen());

  it('zählt den Schritt, an dem weitergemacht wird, nicht ein zweites Mal', () => {
    const gesendet: string[] = [];
    const sender = { sendBeacon: (_url: string, data: Blob) => { void data; gesendet.push(_url); return true; } };
    // Öffnen per ?start=1, Frage 1 und 2 beantwortet, Frage 3 sichtbar …
    expect(zaehle('schritt_1', 'alt', sender)).toBe(true);
    expect(zaehle('schritt_2', 'alt', sender)).toBe(true);
    expect(zaehle('schritt_3', 'alt', sender)).toBe(true);
    // … X, Hero-Knopf: der step_view-Effekt läuft für Frage 3 erneut.
    expect(zaehle('schritt_3', 'alt', sender)).toBe(false);
    expect(gesendet).toHaveLength(3);
  });
});
