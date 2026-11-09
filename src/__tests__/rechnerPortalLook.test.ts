/*
 * Rechner wie das Portal (Registry #151, Martin 09.11.2026: „Super, mach online“).
 *
 * Der Root-Vitest darf keine Next-Komponenten laden (CLAUDE.md), deshalb prüft dieser Test den Quelltext von
 * FormularPortal.tsx und MultiStepForm.tsx, wie kontaktschrittB2.test.ts. Die Texte sind Martins abgenommener Wortlaut;
 * wer sie ändert, braucht vorher seine Freigabe.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rechner = join(__dirname, '..', '..', 'project 3', 'components/calculator');
const portal = readFileSync(join(rechner, 'FormularPortal.tsx'), 'utf8');
const formular = readFileSync(join(rechner, 'MultiStepForm.tsx'), 'utf8');

/** Rumpf einer Funktion `export function name(` bis zur nächsten Funktion auf oberster Ebene. */
function funktion(name: string): string {
  const start = portal.indexOf(`function ${name}(`);
  expect(start, `function ${name} fehlt in FormularPortal.tsx`).toBeGreaterThan(-1);
  const ende = portal.indexOf('\n}\n', start);
  return portal.slice(start, ende);
}

describe('Rechner wie das Portal (Registry #151)', () => {
  it('ist Standard, `?look=alt` zeigt den Stand davor, und das erste HTML kommt schon im neuen Look', () => {
    const schalter = funktion('usePortalLook');
    expect(schalter).toContain('useState(true)');
    expect(schalter).toContain('get("look") === "alt"');
    expect(schalter).toContain('setAn(false)');
    expect(formular).toContain('const portalLook = usePortalLook();');
  });

  it('letzter Schritt: Titel, Satz und Knopf in Martins Wortlaut', () => {
    expect(portal).toContain('titel: "Ihr persönliches Angebot und Ihre Personalauswahl sind fertig"');
    expect(portal).toContain('text: "Geben Sie Ihre Kontaktdaten ein. Danach sehen Sie sofort Ihr Angebot und Ihre passende Pflegekräfte-Auswahl."');
    expect(portal).toContain('knopf: "Angebot & Pflegekräfte ansehen →"');
    expect(formular).toContain('<TitelPortal haken titel=');
  });

  it('unter dem Knopf erst „100 % kostenfrei & unverbindlich“, dann die Kennzahlen mit den Sternen', () => {
    const block = funktion('UnterDemKnopfPortal');
    expect(block.indexOf('<KostenfreiZeile />')).toBeGreaterThan(-1);
    expect(block.indexOf('<KennzahlenZeile bewertung={bewertung} />')).toBeGreaterThan(block.indexOf('<KostenfreiZeile />'));
    expect(funktion('KostenfreiZeile')).toContain('{SCHRANKE.fussnote}');
    // Sterne nur mit Stand, nie eine feste Zahl; Wortlaut der Kennzahlen wie die Angebotskarte im Portal.
    const kennzahlen = funktion('KennzahlenZeile');
    expect(kennzahlen).toContain('{bewertung && (');
    expect(kennzahlen).toContain('["20 Jahre", "Erfahrung"], ["6× in Folge", "Testsieger"]');
    expect(kennzahlen).not.toMatch(/4,9|126/);
  });

  it('unter der Karte: „So geht es weiter“, dann die Meinungen, kein Siegel', () => {
    const unten = funktion('UnterDemKontaktPortal');
    expect(unten.indexOf('<AblaufNachAbsenden />')).toBeGreaterThan(-1);
    expect(unten.indexOf('<Meinungen bewertung={bewertung} />')).toBeGreaterThan(unten.indexOf('<AblaufNachAbsenden />'));
    expect(unten).not.toContain('SiegelSternePortal');
  });

  it('„So geht es weiter“ in Martins Wortlaut vom 09.11.', () => {
    expect(portal).toContain('{ titel: "Angebot und passende Pflegekräfte sofort sehen, inklusive aller Zuschüsse" }');
    expect(portal).toContain('{ titel: "Bewerbungen innerhalb von 60\\u00a0Minuten erhalten", text: "Auf Wunsch: Pflegesituation kurz beschreiben, dann bewerben sich passende Pflegekräfte bei Ihnen." }');
    expect(portal).toContain('{ titel: "Auswählen und starten", text: "Sie wählen in Ruhe aus, erst danach schließen Sie den Vertrag. Wir übernehmen den Rest, Anreise schon ab 3\\u00a0Tagen möglich." }');
  });

  it('Meinungen: drei echte Stimmen mit Herkunft und Prüfhinweis, keine mit „Vermittlung“', () => {
    const start = portal.indexOf('export const MEINUNGEN');
    const liste = portal.slice(start, portal.indexOf('];', start));
    expect(liste.match(/name: "/g)).toHaveLength(3);
    for (const name of ['Florian D.', 'Anke H.', 'Claudia N.']) expect(liste).toContain(`name: "${name}"`);
    expect(liste).not.toMatch(/[Vv]ermittl/);
    expect(portal).toContain('const PRUEF_LINK = "https://primundus.de/erfahrungen#pruefung";');
    // Neuer Tab: wer den Prüfhinweis öffnet, verliert seine Antworten nicht.
    expect(funktion('Meinungen')).toContain('target="_blank"');
  });

  it('der Haken am Titel bewegt sich nicht, wenn das Gerät reduzierte Bewegung wünscht', () => {
    expect(funktion('ErfolgsHaken')).toContain('@media (prefers-reduced-motion:reduce)');
  });
});
