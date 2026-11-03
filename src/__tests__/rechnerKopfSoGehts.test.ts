/*
 * Kostenrechner: Kopfleiste über Frage 1–8 und „So geht's“ unter Frage 1 (Registry #146).
 *
 * Martin 03.11.2026: „wenn man den Kostenrechner öffnet, da die Überschrift
 * ändern und vielleicht machen wir darunter, weil die erste Frage ja sehr kurz
 * ist, einfach die Infos …“. Die Wortlaute sind seine Vorgabe und werden hier
 * wörtlich festgehalten.
 *
 * Der Root-Vitest darf keine Next-Komponenten laden (CLAUDE.md), deshalb prüft
 * dieser Test die Texte aus `project 3/lib/rechner-kopf.ts` und den Quelltext
 * von MultiStepForm/SoGehts, wie fragebogenBleibtOffen.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECHNER_KOPF, SO_GEHTS } from '../../project 3/lib/rechner-kopf';

const rechner = join(__dirname, '..', '..', 'project 3', 'components/calculator');
const quelle = readFileSync(join(rechner, 'MultiStepForm.tsx'), 'utf8');
const soGehts = readFileSync(join(rechner, 'SoGehts.tsx'), 'utf8');

describe('Kopfleiste des Fragebogens (Registry #146)', () => {
  it('Wortlaut wie vorgegeben, ohne Punkt', () => {
    expect(RECHNER_KOPF).toBe('Passende Pflegekräfte sofort finden');
  });

  it('die rote Kopfleiste zeigt RECHNER_KOPF, der alte Satz steht nirgends mehr im Bild', () => {
    expect(quelle).toMatch(/<p className=\{`text-center text-\[15px\] font-bold text-white[^`]*`\}>\s*\{RECHNER_KOPF\}\s*<\/p>/);
    expect(quelle, 'Alter Kopf „In 2 Minuten zu Ihrem Preis“ wird wieder angezeigt').not.toMatch(/>\s*In 2 Minuten zu Ihrem Preis\s*</);
  });

  it('nur Frage 1–8: der Kontaktschritt behält seinen grünen Kopf', () => {
    const kopf = quelle.slice(quelle.indexOf("currentStep === totalSteps ? 'bg-[#22A06B]' : 'bg-[#E76F63]'"), quelle.indexOf('{RECHNER_KOPF}'));
    expect(kopf, 'Kopfbereich nicht gefunden').toContain('{currentStep === totalSteps ? (');
    expect(kopf).toContain('SCHRANKE.kopf');
    expect(kopf).toContain('KONTAKT_NACH_PREIS.kopf(preisDaten.bruttopreis)');
    expect(quelle.match(/\{RECHNER_KOPF\}/g) ?? []).toHaveLength(1);
  });
});

describe('Kartenfuß des Rechners (Nachbesserung 03.11.)', () => {
  it('„DSGVO-konform“ klein, wie in TrustRow und im Kontaktschritt', () => {
    expect(quelle).toContain('>DSGVO-konform</span>');
    expect(quelle, 'Großes „Konform“ steht wieder im Rechner').not.toContain('DSGVO-Konform');
  });
});

describe('„So geht\'s“ unter Frage 1 (Registry #146)', () => {
  it('Überschrift und vier Schritte wie vorgegeben', () => {
    expect(SO_GEHTS.titel).toBe("So geht's");
    expect([...SO_GEHTS.schritte]).toEqual([
      'Ein paar preisrelevante Fragen beantworten',
      'Kontaktdaten angeben',
      'Preis und passende Pflegekräfte sehen',
      'Pflegekräfte einladen: kurz die Pflegesituation beschreiben',
    ]);
  });

  it('steht genau einmal im Fragebogen, nur bei Frage 1 nach der Aufwärmfrage', () => {
    const treffer = [...quelle.matchAll(/<SoGehts \/>/g)];
    expect(treffer).toHaveLength(1);
    const zeile = quelle.slice(quelle.lastIndexOf('\n', treffer[0].index!) + 1, quelle.indexOf('\n', treffer[0].index!));
    // `warmupAudience` gesetzt = nicht die Aufwärmfrage „Für wen …“; kein `fullscreen`, also auch eingebettet.
    expect(zeile.trim()).toBe('{currentStep === 1 && warmupAudience && <SoGehts />}');
  });

  it('steht UNTER den beiden Antworten von Frage 1 und vor Frage 2', () => {
    const block = quelle.indexOf('<SoGehts />');
    expect(quelle.indexOf("label: '2 Pflegebedürftige (Ehepaar)'")).toBeLessThan(block);
    expect(block).toBeLessThan(quelle.indexOf('{/* Step 2 (was 3) — Haushalt */}'));
  });

  it('ruhiger Block: kein Knopf, kein Schatten, Texte aus SO_GEHTS', () => {
    expect(soGehts).toContain('{SO_GEHTS.titel}');
    expect(soGehts).toContain('SO_GEHTS.schritte.map');
    expect(soGehts).not.toMatch(/<button|onClick|shadow/);
    expect(soGehts).toContain('data-so-gehts');
  });

  it('Schritt 1 in Martins Wort „preisrelevante Fragen“ (Nachbesserung 03.11.)', () => {
    expect(SO_GEHTS.schritte[0]).toBe('Ein paar preisrelevante Fragen beantworten');
    expect(SO_GEHTS.schritte.join(' ')).not.toContain('Fragen zum Preis');
  });

  it('Ziffern lesbar (≥ 4,5:1 auf Weiß) und die Liste bleibt für Screenreader eine Liste', () => {
    const ziffer = soGehts.match(/className="([^"]*rounded-full[^"]*)"/);
    expect(ziffer, 'Ziffernkreis nicht gefunden').not.toBeNull();
    // #5A5A5A = 6,9:1 auf Weiß; das frühere Braun #8B7355 hatte 4,49:1.
    expect(ziffer![1]).toContain('text-[#5A5A5A]');
    expect(ziffer![1]).not.toContain('text-[#8B7355]');
    expect(soGehts).toMatch(/<ol role="list"/);
  });

  it('Zähler und Messung bleiben unverändert', () => {
    expect(quelle).toContain('zaehle(`schritt_${currentStep}` as `schritt_${1|2|3|4|5|6|7|8|9}`, zaehlVariante())');
    expect(soGehts).not.toMatch(/zaehle|analytics|trackEvent/);
  });
});
