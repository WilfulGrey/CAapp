/*
 * Kontakt-Schritt nach Entwurf B2 (Registry #121, Martin 09.10.2026: „1 ja“).
 *
 * Befund dahinter: Am Kontakt-Schritt schickten seit 24.09. ca. 30 % je Aufruf
 * ab; wer ein Feld antippt, schickt zu ca. 90 % ab. Der Verlust liegt vor dem
 * ersten Tastendruck. Auf dem iPhone SE (553 px) lag der Knopf bei 619–675 px,
 * also unter der Falz, und bis alle drei Felder stimmten, war er blass und ein
 * Tipp bewirkte nichts.
 *
 * Der Root-Vitest darf keine Next-Komponenten laden (CLAUDE.md), deshalb prüft
 * dieser Test den Quelltext von MultiStepForm, wie fragebogenBleibtOffen.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rechner = join(__dirname, '..', '..', 'project 3', 'components/calculator');
const quelle = readFileSync(join(rechner, 'MultiStepForm.tsx'), 'utf8');
const kontaktSeite = readFileSync(join(rechner, 'KontaktSeite.tsx'), 'utf8');

/** Vom Absende-Knopf des Kontakt-Schritts bis zum Datenschutz-Satz darunter. */
function absendeBlock(): string {
  const start = quelle.indexOf('onClick={() => (canProceed() ? handleNext() : kontaktUnvollstaendig())}');
  expect(start, 'Absende-Knopf des Kontakt-Schritts nicht gefunden').toBeGreaterThan(-1);
  const ende = quelle.indexOf('Datenschutzerklärung', start);
  expect(ende).toBeGreaterThan(start);
  return quelle.slice(start, ende);
}

/** Rumpf einer Pfeilfunktion `const name = (...) => { ... };` auf Komponenten-Ebene. */
function rumpf(kopf: string): string {
  const start = quelle.indexOf(kopf);
  expect(start, `„${kopf}" fehlt in MultiStepForm.tsx`).toBeGreaterThan(-1);
  return quelle.slice(start, quelle.indexOf('\n  };', start));
}

describe('Kontakt-Schritt B2 (Registry #121)', () => {
  it('der Knopf ist nur beim Senden gesperrt, nie wegen fehlender Angaben', () => {
    const block = absendeBlock();
    expect(block).toContain('disabled={isSubmitting}');
    expect(block).not.toMatch(/disabled=\{!canProceed\(\)/);
    expect(block).not.toContain('cursor-not-allowed');
  });

  it('ein Tipp bei fehlenden Angaben zählt, zeigt den Hinweis am ersten offenen Feld und setzt dort den Cursor', () => {
    const r = rumpf('const kontaktUnvollstaendig = () => {');
    expect(r).toContain("zaehle('knopf_unvollstaendig'");
    // Dieselbe Regel wie beim Absenden (kontaktFehlerAlt), aber nur EIN Hinweis (so abgenommen).
    expect(r).toContain('kontaktFehlerAlt()');
    expect(r).toContain(".find((k) => fehler[k])");
    expect(r).toContain('[erstes]: fehler[erstes]');
    expect(r).toContain('KONTAKT_FELD_ID[erstes]');
    expect(r).toContain('.focus()');
    expect(rumpf('const validateForm = () => {')).toContain('kontaktFehlerAlt()');
  });

  it('alle drei Felder zählen das erste Antippen und tragen die ids, die der Fokus braucht', () => {
    expect(rumpf('const kontaktFeldFokus = (feld: KontaktFeld) => {')).toContain("zaehle('feld_angetippt'");
    for (const feld of ['name', 'email', 'phone']) {
      expect(quelle).toContain(`onFocus={() => kontaktFeldFokus('${feld}')}`);
    }
    expect(quelle).toContain('id="kontakt-email"');
    expect(quelle).toContain('id="kontakt-telefon"');
    // Dieselben ids wie KONTAKT_FELD_ID der Kontaktseite, über die der Fokus springt.
    expect(kontaktSeite).toContain("{ name: 'kontakt-name', email: 'kontakt-email', phone: 'kontakt-telefon' }");
  });

  it('die Sterne stehen direkt unter dem Knopf, vor Fußzeile und Datenschutz-Satz', () => {
    const block = absendeBlock();
    const knopfEnde = block.indexOf('</button>');
    const sterne = block.indexOf('<SterneText stand={bewertung} />');
    const fussnote = block.indexOf('{SCHRANKE.fussnote}');
    expect(knopfEnde).toBeGreaterThan(-1);
    expect(sterne).toBeGreaterThan(knopfEnde);
    expect(fussnote).toBeGreaterThan(sterne);
    // Ohne Stand keine Zeile, nie eine feste Zahl.
    expect(block).toContain('{bewertung && (');
  });

  it('„100 % kostenfrei & unverbindlich“ steht mit Haken wie in der Leiste, die Leiste lässt den Punkt dann weg', () => {
    // Martin 10.10.: „prominenter, so wie das vorher da drunter war“.
    const block = absendeBlock();
    const fussnote = block.indexOf('<span className="text-[#3D3D3D] font-medium">{SCHRANKE.fussnote}</span>');
    expect(fussnote, 'Fußzeile nicht im Stil der Leiste').toBeGreaterThan(-1);
    expect(block.slice(fussnote - 200, fussnote)).toContain('<CheckCircle2');
    // Dieselbe Bedingung wie der Absendeblock blendet den Punkt in der Leiste aus,
    // sonst stünde der Satz zweimal in der Karte.
    expect(quelle).toContain(
      'const kontaktAbsendeblock = currentStep === totalSteps && (!ergebnisModus || kontaktOffen) && !stufenAktiv && !preisModus;',
    );
    const leiste = quelle.indexOf('100&nbsp;% kostenfrei &amp; unverbindlich</span>');
    expect(leiste).toBeGreaterThan(-1);
    expect(quelle.slice(leiste - 500, leiste)).toContain('{!kontaktAbsendeblock && (');
  });

  it('der grüne Kasten erscheint nur noch in den drei Teilschritten', () => {
    const kasten = quelle.indexOf('bg-[#F0F7F1] px-5 py-4 mb-1');
    expect(kasten).toBeGreaterThan(-1);
    expect(quelle.slice(kasten - 200, kasten)).toContain('{stufenAktiv && (');
  });

  it('das Formular für alle zeigt Frage, vier Gesichter, Lohnzeile und „Ihr Name“', () => {
    expect(quelle).toContain('{SCHRANKE.lohn}');
    expect(quelle).toContain("['pk-1', 'pk-2', 'pk-3', 'pk-4'].map(");
    expect(quelle).toContain('placeholder="Ihr Name"');
    expect(quelle).not.toContain('placeholder="Name"');
  });
});
