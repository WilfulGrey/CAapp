import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Die Angebotsmail (send-scheduled-emails/kundenMails.ts) übernimmt Texte des Kundenportals WÖRTLICH (Martin 08.10.2026:
// „Warum hast du das nicht übernommen? Darum geht's doch.", „vereinheitlichen, wie im Kundenportal"). Der Test hält beide
// Stellen gleich: Ändert sich ein Portal-Text, schlägt er an, und die Mail wird mitgezogen. Gelesen wird der Quelltext,
// weil die Edge-Funktion Deno-Module importiert.

const WURZEL = join(__dirname, '..', '..', '..');
const lies = (p: string) => readFileSync(join(WURZEL, p), 'utf8');
const MAIL = lies('project 3/supabase/functions/send-scheduled-emails/kundenMails.ts');
const KOMPAKT = lies('src/components/portal/KompaktEinstieg.tsx');
const FAQ = lies('src/components/portal/FaqListe.tsx');

/** JSX-Tags und geschützte Zeichen weg, damit Portal und Mail vergleichbar sind. */
const flach = (s: string) => s
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\\u00a0/g, ' ').replace(/\\u2011/g, '-').replace(/\s+/g, ' ');
const konst = (quelle: string, name: string): string => {
  const m = quelle.match(new RegExp(`const ${name} = (["'])(.+?)\\1;`));
  if (!m) throw new Error(`${name} fehlt`);
  return m[2];
};
const mailSchritte = (): { titel: string; text: string }[] => {
  const block = MAIL.slice(MAIL.indexOf('const SCHRITTE_ANGEBOT'), MAIL.indexOf('];', MAIL.indexOf('const SCHRITTE_ANGEBOT')));
  return [...block.matchAll(/\{ titel: "([^"]+)", text: "([^"]+)" \}/g)].map((m) => ({ titel: m[1], text: flach(m[2]) }));
};
const portalSchritte = (): { titel: string; text: string }[] => {
  const titel1 = konst(KOMPAKT, 'ABLAUF_TITEL_1');
  const block = KOMPAKT.slice(KOMPAKT.indexOf('export const ABLAUF = ['));
  return [...block.matchAll(/\{ titel: (ABLAUF_TITEL_1|'[^']+'), text: '([^']+)' \}/g)].slice(0, 3)
    .map((m) => ({ titel: m[1] === 'ABLAUF_TITEL_1' ? titel1 : m[1].slice(1, -1), text: flach(m[2]) }));
};
const mailAntwort = (frage: string): string => {
  const m = MAIL.match(new RegExp(`frage: "${frage.replace(/[?()]/g, '\\$&')}", antwort: "([^"]+)"`));
  if (!m) throw new Error(`Frage „${frage}" fehlt in der Mail`);
  return m[1];
};

describe('Angebotsmail: Texte wie im Kundenportal', () => {
  it('Einleitung und Testsieger-Satz', () => {
    expect(konst(MAIL, 'EINLEITUNG')).toBe(konst(KOMPAKT, 'EINLEITUNG'));
    expect(konst(MAIL, 'EINLEITUNG_TESTSIEGER')).toBe(konst(KOMPAKT, 'EINLEITUNG_TESTSIEGER'));
  });

  it('Schritt 1 und 2 wie „So geht es weiter" im Portal, einzige Anpassung „hier im Portal" → „im Portal"', () => {
    const [m1, m2] = mailSchritte();
    const [p1, p2] = portalSchritte();
    expect(m1).toEqual(p1);
    expect(m2).toEqual({ ...p2, text: p2.text.replace('hier im Portal', 'im Portal') });
  });

  it('Hinweis unter „Pflegekräfte einladen" und Zeile über den Pflegekräften', () => {
    const hinweis = konst(MAIL, 'EINLADEN_HINWEIS');
    const [erster, ...rest] = hinweis.split('. ');
    expect(flach(KOMPAKT)).toContain(`Achtung: ${erster}`);
    expect(flach(KOMPAKT)).toContain(rest.join('. '));
    expect(flach(KOMPAKT)).toContain(konst(MAIL, 'KRAEFTE_ZEILE'));
  });

  it('Antworten der Häufigen Fragen aus der Portal-FAQ', () => {
    for (const frage of ['Ist das legal?', 'Wie läuft die Betreuung ab?', 'Was brauche ich zu Hause?']) {
      expect(FAQ).toContain(`q: '${frage}', a: '${mailAntwort(frage)}'`);
    }
    expect(FAQ).toContain(`q: 'Was bedeuten die Deutsch-Niveaus (Grund, Mittel, Gut)?'`);
    for (const name of ['DEUTSCH_EINSTIEG', 'DEUTSCH_SCHLUSS']) expect(FAQ).toContain(konst(MAIL, name));
    const stufen = [...MAIL.matchAll(/\{ wort: "(Grund|Mittel|Gut)", text: "([^"]+)" \}/g)];
    expect(stufen.map((m) => m[1])).toEqual(['Grund', 'Mittel', 'Gut']);
    for (const [, wort, text] of stufen) expect(FAQ).toContain(`label: '${wort}', desc: '${text}'`);
    expect(MAIL).not.toContain('Gehe ich mit dem Einladen');
  });
});
