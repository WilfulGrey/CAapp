// @vitest-environment node
/*
 * Eigenanteil ohne Entlastungsbudget — Entscheidung 3 (Martin, 15.10.2026, „alle Empfehlungen umsetzen“).
 *
 * Der Posten `entlastungsbudget_neu` (294,92 € im Monat) zählt nie zum Eigenanteil, egal was
 * `subsidies_config.in_kalkulation` sagt (Prod am 15.10.2026: `true`). Geprüft werden:
 *  1. die Regel in `project 3/lib/eigenanteil.ts` und ihre beiden Spiegel (Portal, Kundenmails),
 *  2. die echte Server-Rechnung `berechnePreis` mit einer Supabase-Attrappe, in der der Posten auf `true` steht —
 *     die Zahlen müssen die von primundus.de sein (Pflegegrad 2/3/4: ab ca. 1.470/1.218/1.017 €),
 *  3. per Quelltext, dass der Rechner im Browser (calculator-context.tsx, darf hier nicht geladen werden) dieselbe
 *     Regel nutzt und die Kundenansichten (Kalkulationsseite, Druckansicht, PDF) keine Budget-Zeile mehr haben.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Supabase-Attrappe für lib/calculation.ts — wie leadEventMesspunkte.test.ts für beide Auflösungswege (mit und ohne
// `project 3/node_modules`). Filter werden mitgeschrieben, die Antwort hängt an Tabelle und Filtern.
const { attrappe } = vi.hoisted(() => {
  const ZUSCHUESSE = [
    { id: 's1', name: 'steuervorteil', label: 'Steuerliche Absetzbarkeit', beschreibung: '', typ: 'jaehrlich', in_kalkulation: true },
    { id: 's2', name: 'pflegegeld', label: 'Pflegegeld', beschreibung: '', typ: 'monatlich', in_kalkulation: true },
    // So stand die Zeile am 15.10.2026 in Prod — der Code muss den Posten trotzdem herausrechnen.
    { id: 's3', name: 'entlastungsbudget_neu', label: 'Entlastungsbudget (3.539 Euro/Jahr ab Pflegegrad 2)', beschreibung: '', typ: 'jaehrlich', in_kalkulation: true },
  ];
  const PFLEGEGELD: Record<string, number> = { '2': 347, '3': 599, '4': 800, '5': 990 };
  function antwort(tabelle: string, f: Record<string, unknown>): unknown {
    if (tabelle === 'pricing_config') return f.kategorie === 'basis' ? { aufschlag_euro: 2150 } : null;
    if (tabelle === 'subsidies_config') return ZUSCHUESSE;
    if (tabelle === 'subsidies_values') {
      if (f.subsidy_id === 's1') return { betrag_typ: 'prozent_vom_brutto', betrag: 20, hinweis: 'Max. 4.000 € pro Jahr' };
      if (f.subsidy_id === 's2') return { betrag: PFLEGEGELD[String(f.bedingung_value)] ?? 0, hinweis: null };
      if (f.subsidy_id === 's3') return { betrag: 3539, hinweis: 'Bis zu 3.539 €/Jahr (seit 1.7.2025)' };
    }
    return null;
  }
  function kette(tabelle: string) {
    const filter: Record<string, unknown> = {};
    const k: Record<string, unknown> = {};
    k.select = () => k;
    k.order = () => k;
    k.eq = (spalte: string, wert: unknown) => { filter[spalte] = wert; return k; };
    k.maybeSingle = async () => ({ data: antwort(tabelle, filter), error: null });
    k.then = (ok: (v: unknown) => unknown, nok?: (e: unknown) => unknown) =>
      Promise.resolve({ data: antwort(tabelle, filter), error: null }).then(ok, nok);
    return k;
  }
  return { attrappe: () => ({ createClient: () => ({ from: (tabelle: string) => kette(tabelle) }) }) };
});
vi.mock('@supabase/supabase-js', () => attrappe());
vi.mock('../../project 3/node_modules/@supabase/supabase-js', () => attrappe());

import * as original from '../../project 3/lib/eigenanteil';
import * as mails from '../../project 3/supabase/functions/send-scheduled-emails/eigenanteil';
import * as portal from '../lib/eigenanteil';
import { berechnePreis, type FormularDaten } from '../../project 3/lib/calculation';

const P3 = join(__dirname, '..', '..', 'project 3');
const lies = (...teile: string[]) => readFileSync(join(P3, ...teile), 'utf8');

// Gespeicherte Anfrage von vor dem 15.10.2026 (Pflegegrad 4, 3.050 €): Budget mit `in_kalkulation: true`.
const ALT = {
  bruttopreis: 3050,
  eigenanteil: 1621.75,
  'zuschüsse': {
    gesamt: 1428.25,
    items: [
      { name: 'pflegegeld', betrag_monatlich: 800, in_kalkulation: true },
      { name: 'entlastungsbudget_neu', betrag_monatlich: 294.92, in_kalkulation: true },
      { name: 'steuervorteil', betrag_monatlich: 333.33, in_kalkulation: true },
    ],
  },
};
// Dieselbe Anfrage aus dem neuen Rechner.
const NEU = {
  bruttopreis: 3050,
  eigenanteil: 1916.67,
  'zuschüsse': {
    gesamt: 1133.33,
    items: [
      { name: 'pflegegeld', betrag_monatlich: 800, in_kalkulation: true },
      { name: 'entlastungsbudget_neu', betrag_monatlich: 294.92, in_kalkulation: false },
      { name: 'steuervorteil', betrag_monatlich: 333.33, in_kalkulation: true },
    ],
  },
};

const POSTEN: unknown[] = [
  { name: 'pflegegeld', in_kalkulation: true },
  { name: 'steuervorteil', in_kalkulation: true },
  { name: 'entlastungsbudget_neu', in_kalkulation: true },
  { name: 'entlastungsbudget_neu', in_kalkulation: false },
  { name: 'verhinderungspflege', in_kalkulation: false },
  { name: 'pflegegeld', in_kalkulation: false },
  {},
  null,
  undefined,
  'pflegegeld',
];

describe('Regel: Entlastungsbudget nie im Eigenanteil (Entscheidung 3)', () => {
  it('zählt Posten nur mit in_kalkulation und nie das Entlastungsbudget', () => {
    expect(POSTEN.map(original.zaehltZumEigenanteil)).toEqual([true, true, false, false, false, false, false, false, false, false]);
  });

  it('neue Berechnung: Budget-Posten bleibt sichtbar, aber mit in_kalkulation: false', () => {
    const z = { name: 'entlastungsbudget_neu', in_kalkulation: true, betrag_monatlich: 294.92 };
    expect(original.nachEigenanteilRegel(z)).toEqual({ ...z, in_kalkulation: false });
    const pg = { name: 'pflegegeld', in_kalkulation: true, betrag_monatlich: 599 };
    expect(original.nachEigenanteilRegel(pg)).toEqual(pg);
  });

  it('alte Anfrage: Eigenanteil und Summe ohne die 294,92 €; neue Anfrage bleibt, wie sie ist', () => {
    expect(original.zuUnrechtAbgezogen(ALT)).toBe(294.92);
    expect(original.eigenanteilOhneEntlastungsbudget(ALT)).toBe(1916.67);
    expect(original.zuschuesseOhneEntlastungsbudget(ALT)).toBe(1133.33);
    expect(original.zuUnrechtAbgezogen(NEU)).toBe(0);
    expect(original.eigenanteilOhneEntlastungsbudget(NEU)).toBe(1916.67);
    expect(original.zuschuesseOhneEntlastungsbudget(NEU)).toBe(1133.33);
  });

  it('ohne Werte: null bzw. 0, nichts erfunden', () => {
    expect(original.eigenanteilOhneEntlastungsbudget(null)).toBeNull();
    expect(original.eigenanteilOhneEntlastungsbudget({ bruttopreis: 3050 })).toBeNull();
    expect(original.zuschuesseOhneEntlastungsbudget({ eigenanteil: 1700 })).toBeNull();
    expect(original.eigenanteilOhneEntlastungsbudget({ eigenanteil: 1700 })).toBe(1700);
    expect(original.zuUnrechtAbgezogen({ 'zuschüsse': { items: 'kaputt' } })).toBe(0);
  });
});

describe('Spiegel: Portal und Kundenmails rechnen gleich', () => {
  it('Kopie der Kundenmails ist unter dem Kopf Zeichen für Zeichen das Original', () => {
    const koerper = (s: string) => s.slice(s.indexOf('*/\n') + 3);
    const a = lies('lib', 'eigenanteil.ts');
    const b = lies('supabase', 'functions', 'send-scheduled-emails', 'eigenanteil.ts');
    expect(koerper(b)).toBe(koerper(a));
    expect(koerper(a).length).toBeGreaterThan(500);
  });

  it('gleiche Liste, gleiches Urteil je Posten, gleiche Zahlen', () => {
    expect([...portal.NIE_IM_EIGENANTEIL]).toEqual([...original.NIE_IM_EIGENANTEIL]);
    expect([...mails.NIE_IM_EIGENANTEIL]).toEqual([...original.NIE_IM_EIGENANTEIL]);
    for (const p of POSTEN) {
      expect(portal.zaehltZumEigenanteil(p)).toBe(original.zaehltZumEigenanteil(p));
      expect(mails.zaehltZumEigenanteil(p)).toBe(original.zaehltZumEigenanteil(p));
    }
    for (const k of [ALT, NEU, null, {}]) {
      expect(mails.eigenanteilOhneEntlastungsbudget(k)).toBe(original.eigenanteilOhneEntlastungsbudget(k));
      expect(mails.zuschuesseOhneEntlastungsbudget(k)).toBe(original.zuschuesseOhneEntlastungsbudget(k));
    }
  });
});

describe('berechnePreis (lib/calculation.ts): subsidies_config sagt in_kalkulation = true, gezählt wird es trotzdem nicht', () => {
  const formular = (pflegegrad: number): FormularDaten => ({
    betreuung_fuer: '1-person', pflegegrad, weitere_personen: 'nein', mobilitaet: 'mobil',
    nachteinsaetze: 'nein', deutschkenntnisse: 'grundlegend', erfahrung: 'einsteiger',
  });

  it('Pflegegrad 3 beim Grundpreis: 2.150 − 599 − 333,33 = 1.217,67 € (Website: ab ca. 1.218 €)', async () => {
    const k = await berechnePreis(formular(3));
    expect(k.bruttopreis).toBe(2150);
    expect(k.zuschüsse.items.find((z) => z.name === 'entlastungsbudget_neu')).toMatchObject({ betrag_monatlich: 294.92, in_kalkulation: false });
    expect(k.zuschüsse.items.filter((z) => z.in_kalkulation).map((z) => z.name).sort()).toEqual(['pflegegeld', 'steuervorteil']);
    expect(k.zuschüsse.gesamt).toBeCloseTo(932.33, 2);
    expect(k.eigenanteil).toBeCloseTo(1217.67, 2);
  });

  it('Pflegegrad 2 und 4: ab ca. 1.470 € und 1.017 € wie primundus.de', async () => {
    expect(Math.round((await berechnePreis(formular(2))).eigenanteil)).toBe(1470);
    expect(Math.round((await berechnePreis(formular(4))).eigenanteil)).toBe(1017);
  });
});

describe('Quelltext: Rechner im Browser und Kundenansichten', () => {
  it('calculator-context.tsx bildet die Summe erst nach der Regel', () => {
    const q = lies('lib', 'calculator-context.tsx');
    expect(q).toContain("import { nachEigenanteilRegel } from './eigenanteil';");
    const regel = q.indexOf('const items = zuschüsse.map(nachEigenanteilRegel);');
    expect(regel).toBeGreaterThan(-1);
    expect(q.indexOf('const gesamt = items', regel)).toBeGreaterThan(regel);
    expect(q).toContain('return { items, gesamt };');
  });

  it('Kalkulationsseite, Druckansicht und PDF: keine Budget-Zeile, Eigenanteil über die Regel', () => {
    for (const datei of [['app', 'kalkulation', '[leadId]', 'page.tsx'], ['app', 'kalkulation', '[leadId]', 'print', 'page.tsx'], ['app', 'api', 'pdf', 'kalkulation', '[leadId]', 'route.ts']]) {
      const q = lies(...datei);
      expect(q, datei.join('/')).not.toContain('Entlastungsbudget (anteilig');
      expect(q, datei.join('/')).toContain('eigenanteilOhneEntlastungsbudget(kalk)');
    }
    expect(lies('lib', 'pdf-generator-pdfkit.ts')).not.toContain('Entlastungsbudget (anteilig');
  });
});
