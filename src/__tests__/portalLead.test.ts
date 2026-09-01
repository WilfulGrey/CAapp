import { describe, it, expect } from 'vitest';
// Cross-App-Import (pure Modul, Muster wie portalUrl.test.ts): die Regeln
// für eingekaufte Portal-Leads leben im Kostenrechner (project 3/lib/
// portal-lead.ts — nur ein type-Import, kein Next). Getestet hier im
// root-vitest, weil project 3 keinen Testrunner hat und die früheren
// Deno-Prüfskripte in scripts/ den `next build` gebrochen haben
// (Registry #38): CI-required statt nie-laufender Standalone-Skripte.
import { ergaenzeAngaben, reiterFuer } from '../../project 3/lib/portal-lead';

// pricing_config-Ausschnitt: pro Kategorie mehrere Werte, unterschiedlich
// teuer — die Default-Regel nimmt fehlende Angaben zum TEUREREN Wert an,
// ausser beim Pflegegrad (mehr Grad = mehr Zuschuss = weniger Eigenanteil).
const tabelle = [
  { kategorie: 'betreuung_fuer', antwort_key: 'elternteil', aufschlag_euro: 0 },
  { kategorie: 'betreuung_fuer', antwort_key: 'ehepaar', aufschlag_euro: 900 },
  { kategorie: 'weitere_personen', antwort_key: 'nein', aufschlag_euro: 0 },
  { kategorie: 'weitere_personen', antwort_key: 'ja', aufschlag_euro: 200 },
  { kategorie: 'mobilitaet', antwort_key: 'gehfaehig', aufschlag_euro: 0 },
  { kategorie: 'mobilitaet', antwort_key: 'bettlaegerig', aufschlag_euro: 600 },
  { kategorie: 'nachteinsaetze', antwort_key: 'nein', aufschlag_euro: 0 },
  { kategorie: 'nachteinsaetze', antwort_key: 'mehrmals', aufschlag_euro: 800 },
  { kategorie: 'deutschkenntnisse', antwort_key: 'grund', aufschlag_euro: 0 },
  { kategorie: 'deutschkenntnisse', antwort_key: 'sehr_gut', aufschlag_euro: 400 },
  { kategorie: 'erfahrung', antwort_key: 'egal', aufschlag_euro: 0 },
  { kategorie: 'erfahrung', antwort_key: 'viel', aufschlag_euro: 300 },
  { kategorie: 'pflegegrad', antwort_key: '5', aufschlag_euro: 700 },
  { kategorie: 'pflegegrad', antwort_key: '1', aufschlag_euro: 0 },
];

describe('ergaenzeAngaben (Defaults für eingekaufte Leads)', () => {
  it('Portal liefert gar nichts → alles teuer, Pflegegrad 0', () => {
    const leer = ergaenzeAngaben({}, tabelle);
    expect(leer.daten.betreuung_fuer).toBe('ehepaar');
    expect(leer.daten.mobilitaet).toBe('bettlaegerig');
    expect(leer.daten.nachteinsaetze).toBe('mehrmals');
    expect(leer.daten.deutschkenntnisse).toBe('sehr_gut');
    // Pflegegrad NICHT der teuerste Wert: mehr Grad hiesse mehr Zuschuss,
    // also weniger Eigenanteil — angenommen wird 0.
    expect(leer.daten.pflegegrad).toBe(0);
    expect(leer.angenommen).toHaveLength(7);
  });

  it('Portal liefert etwas → das bleibt stehen, nur der Rest wird angenommen', () => {
    const teil = ergaenzeAngaben(
      { pflegegrad: 3, mobilitaet: 'gehfaehig', betreuung_fuer: 'elternteil' },
      tabelle,
    );
    expect(teil.daten.pflegegrad).toBe(3);
    expect(teil.daten.mobilitaet).toBe('gehfaehig');
    expect([...teil.angenommen].sort()).toEqual([
      'deutschkenntnisse',
      'erfahrung',
      'nachteinsaetze',
      'weitere_personen',
    ]);
  });

  it('optionale Felder werden NIE geraten', () => {
    const leer = ergaenzeAngaben({}, tabelle);
    expect(leer.daten.fuehrerschein).toBeUndefined();
    expect(leer.daten.geschlecht).toBeUndefined();
  });

  it('Leerstring gilt als fehlend', () => {
    const leerstring = ergaenzeAngaben({ mobilitaet: '  ' as never }, tabelle);
    expect(leerstring.daten.mobilitaet).toBe('bettlaegerig');
  });
});

describe('reiterFuer (Admin-Lead-Liste)', () => {
  it('leere DB: die Portal-Reiter stehen trotzdem da, alle Zähler 0', () => {
    const leer = reiterFuer([]);
    expect(leer.map((r) => r.label)).toEqual([
      'Alle',
      'Eigene Anfragen',
      'Pflegebund.eu',
      'Pflegehilfe.org',
    ]);
    expect(leer.map((r) => r.anzahl)).toEqual([0, 0, 0, 0]);
  });

  it('nur eigene Leads: Portal-Reiter bleiben sichtbar, aber leer', () => {
    const eigene = reiterFuer([{ source: 'rechner' }, { source: 'pria-chat' }]);
    expect(eigene.find((r) => r.key === 'eigene')?.anzahl).toBe(2);
    expect(
      eigene.filter((r) => r.key.startsWith('portal:')).map((r) => r.anzahl),
    ).toEqual([0, 0]);
  });

  it('gemischt: jeder Lead zählt genau einmal, Summe = Alle', () => {
    const gemischt = reiterFuer([
      { source: 'rechner' },
      { source: 'portal:pflegehilfe.org' },
      { source: 'portal:pflegehilfe.org' },
    ]);
    expect(gemischt.find((r) => r.key === 'portal:pflegehilfe.org')?.anzahl).toBe(2);
    expect(gemischt.find((r) => r.key === 'eigene')?.anzahl).toBe(1);
    expect(
      gemischt.filter((r) => r.key !== 'all').reduce((s, r) => s + r.anzahl, 0),
    ).toBe(gemischt.find((r) => r.key === 'all')?.anzahl);
  });

  it('ein Lead aus einem entfernten Portal verschwindet nicht unter "Alle"', () => {
    const altes = reiterFuer([{ source: 'portal:altes-portal.de' }]);
    expect(
      altes.some((r) => r.key === 'portal:altes-portal.de' && r.anzahl === 1),
    ).toBe(true);
  });

  it('Leads ohne source gelten als eigene (Altbestand vor der Quellenspalte)', () => {
    const ohne = reiterFuer([{ source: null }, {}]);
    expect(ohne.find((r) => r.key === 'eigene')?.anzahl).toBe(2);
  });
});
