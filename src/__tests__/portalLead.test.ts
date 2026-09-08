import { describe, it, expect } from 'vitest';
// Cross-App-Import (pure Modul, Muster wie portalUrl.test.ts): die Regeln
// für eingekaufte Portal-Leads leben im Kostenrechner (project 3/lib/
// portal-lead.ts — nur ein type-Import, kein Next). Getestet hier im
// root-vitest, weil project 3 keinen Testrunner hat und die früheren
// Deno-Prüfskripte in scripts/ den `next build` gebrochen haben
// (Registry #38): CI-required statt nie-laufender Standalone-Skripte.
import { ergaenzeAngaben, reiterFuer } from '../../project 3/lib/portal-lead';

/* pricing_config — ECHTE Zeilen von prod (Abzug 08.09.2026), nicht erfunden.
 *
 * Vorher stand hier eine synthetische Tabelle mit Fantasie-Keys
 * ("elternteil", "sehr_gut", "viel"). Sie hat genau den Fehler verdeckt, den
 * dieser Test jetzt festhaelt: `deutschkenntnisse` hat auf prod eine VIERTE,
 * teuerste Zeile `sehr-gut-sa` (600 EUR, aktiv) — den L4-Wert, den nur das
 * SA-Portal setzt und den kein Formular anbietet (Registry #30). Eine
 * ausgedachte Tabelle prueft nur sich selbst.
 *
 * Wer sie anfasst: Werte aus pricing_config uebernehmen, nicht erfinden. */
const tabelle = [
  { kategorie: 'betreuung_fuer', antwort_key: 'ehepaar', aufschlag_euro: 450 },
  { kategorie: 'betreuung_fuer', antwort_key: '1-person', aufschlag_euro: 0 },
  { kategorie: 'deutschkenntnisse', antwort_key: 'sehr-gut-sa', aufschlag_euro: 600 },
  { kategorie: 'deutschkenntnisse', antwort_key: 'sehr-gut', aufschlag_euro: 450 },
  { kategorie: 'deutschkenntnisse', antwort_key: 'kommunikativ', aufschlag_euro: 250 },
  { kategorie: 'deutschkenntnisse', antwort_key: 'grundlegend', aufschlag_euro: 0 },
  { kategorie: 'erfahrung', antwort_key: 'sehr-erfahren', aufschlag_euro: 0 },
  { kategorie: 'erfahrung', antwort_key: 'erfahren', aufschlag_euro: 0 },
  { kategorie: 'erfahrung', antwort_key: 'einsteiger', aufschlag_euro: 0 },
  { kategorie: 'mobilitaet', antwort_key: 'rollstuhl', aufschlag_euro: 100 },
  { kategorie: 'mobilitaet', antwort_key: 'bettlaegerig', aufschlag_euro: 100 },
  { kategorie: 'mobilitaet', antwort_key: 'mobil', aufschlag_euro: 0 },
  { kategorie: 'mobilitaet', antwort_key: 'rollator', aufschlag_euro: 0 },
  { kategorie: 'nachteinsaetze', antwort_key: 'mehrmals', aufschlag_euro: 300 },
  { kategorie: 'nachteinsaetze', antwort_key: 'taeglich', aufschlag_euro: 100 },
  { kategorie: 'nachteinsaetze', antwort_key: 'gelegentlich', aufschlag_euro: 50 },
  { kategorie: 'nachteinsaetze', antwort_key: 'nein', aufschlag_euro: 0 },
  { kategorie: 'weitere_personen', antwort_key: 'ja', aufschlag_euro: 200 },
  { kategorie: 'weitere_personen', antwort_key: 'nein', aufschlag_euro: 0 },
  { kategorie: 'pflegegrad', antwort_key: '5', aufschlag_euro: 50 },
  { kategorie: 'pflegegrad', antwort_key: '1', aufschlag_euro: 0 },
];

describe('ergaenzeAngaben (Defaults für eingekaufte Leads)', () => {
  it('Portal liefert gar nichts → alles teuer, Pflegegrad 0', () => {
    const leer = ergaenzeAngaben({}, tabelle);
    expect(leer.daten.betreuung_fuer).toBe('ehepaar');
    expect(leer.daten.mobilitaet).toBe('bettlaegerig');
    expect(leer.daten.nachteinsaetze).toBe('mehrmals');
    expect(leer.daten.deutschkenntnisse).toBe('sehr-gut');
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

  /* Registry #50: "Keinen" (pflege-helfer24) ist eine Kundenangabe — 0 ist
     nicht "fehlt". Vorher lief es ueber `grad > 0` in `angenommen` und Mail
     1 behauptete "vorsichtig angenommen" (Klasse #13e: 0 ist falsy). */
  it('explizites Pflegegrad 0 ("Keinen") ist Kundenangabe, nicht Annahme', () => {
    const keinen = ergaenzeAngaben({ pflegegrad: 0 }, tabelle);
    expect(keinen.daten.pflegegrad).toBe(0);
    expect(keinen.angenommen).not.toContain('pflegegrad');
  });

  it('Pflegegrad als String (manueller curl) wird gelesen; leer/undefined bleibt Annahme', () => {
    expect(ergaenzeAngaben({ pflegegrad: '3' as never }, tabelle).daten.pflegegrad).toBe(3);
    expect(ergaenzeAngaben({ pflegegrad: '' as never }, tabelle).angenommen).toContain('pflegegrad');
    expect(ergaenzeAngaben({}, tabelle).angenommen).toContain('pflegegrad');
  });
});

describe('reiterFuer (Admin-Lead-Liste)', () => {
  it('leere DB: die Portal-Reiter stehen trotzdem da, alle Zähler 0', () => {
    const leer = reiterFuer([]);
    expect(leer.map((r) => r.label)).toEqual([
      'Alle',
      'Eigene Anfragen',
      'Pflege-Helfer24.de',
      'Pflegebund.eu',
      'Pflegehilfe.org',
    ]);
    expect(leer.map((r) => r.anzahl)).toEqual([0, 0, 0, 0, 0]);
  });

  it('nur eigene Leads: Portal-Reiter bleiben sichtbar, aber leer', () => {
    const eigene = reiterFuer([{ source: 'rechner' }, { source: 'pria-chat' }]);
    expect(eigene.find((r) => r.key === 'eigene')?.anzahl).toBe(2);
    expect(
      eigene.filter((r) => r.key.startsWith('portal:')).map((r) => r.anzahl),
    ).toEqual([0, 0, 0]);
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

describe('teuerster nimmt nur waehlbare Werte (Registry #58)', () => {
  it('sehr-gut-sa ist die teuerste Zeile, wird aber NIE angenommen', () => {
    /* Der SA-Portal-Wert kostet 600 € statt 450 € und laesst
       mapGermanySkill im Onboarding werfen — der Lead bekaeme dann gar
       keinen Mamamia-Kunden, und der Admin-Resync (Registry #55) bricht ab.
       Trifft JEDES Portal mit leerer Deutsch-Spalte, nicht nur einen. */
    const r = ergaenzeAngaben({}, tabelle);
    expect(r.daten.deutschkenntnisse).toBe('sehr-gut');
    expect(r.daten.deutschkenntnisse).not.toBe('sehr-gut-sa');
    expect(r.angenommen).toContain('deutschkenntnisse');
  });

  it('gelieferter Wert bleibt unangetastet — auch der teuerste waehlbare', () => {
    const r = ergaenzeAngaben({ deutschkenntnisse: 'grundlegend' } as never, tabelle);
    expect(r.daten.deutschkenntnisse).toBe('grundlegend');
    expect(r.angenommen).not.toContain('deutschkenntnisse');
  });

  it('Gleichstand deterministisch (erfahrung: auf prod alle 0 €)', () => {
    /* Ohne Tiebreak entscheidet die Zeilenfolge des selects — dann stuende
       in angenommene_felder bei jedem Lauf ein anderer Wert. */
    const a = ergaenzeAngaben({}, tabelle).daten.erfahrung;
    const b = ergaenzeAngaben({}, [...tabelle].reverse()).daten.erfahrung;
    expect(a).toBe(b);
    expect(['einsteiger', 'erfahren', 'sehr-erfahren']).toContain(a);
  });

  it('Kategorie ohne Kanon-Eintrag faellt auf den reinen Preisvergleich zurueck', () => {
    // 'basis'/'grundpreis' stehen nicht in ERLAUBT — die Funktion darf daran
    // nicht ersticken, sie wird dafuer nur nie gefragt.
    expect(() => ergaenzeAngaben({}, [{ kategorie: 'basis', antwort_key: 'grundpreis', aufschlag_euro: 2150 }])).not.toThrow();
  });
});
