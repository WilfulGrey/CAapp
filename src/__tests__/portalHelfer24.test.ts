import { describe, it, expect } from 'vitest';
// Cross-App-Import (pure Modul, Muster portalLead.test.ts): der Mapper der
// Partner-API von pflege-helfer24.de lebt im Kostenrechner (project 3/lib/
// portal-helfer24.ts — nur type-Imports + kgZuBucket, kein Next).
import {
  apiZeilen,
  helfer24ZuLeadBody,
  lieferTagIso,
  heuteBerlin,
  HELFER24_DOMAIN,
} from '../../project 3/lib/portal-helfer24';

/* Kopf + Zeile aus der API-Doku (Feld-Referenz), vollstaendiger 24h-Satz.
   Reihenfolge absichtlich NICHT die der Doku — Spalten muessen per Name
   zugeordnet werden. */
const KOPF = [
  'Status', 'Lead ID', 'E-mail', 'Name', 'Telefon', 'Liefer Datum', 'Leadtyp',
  'Postleitzahl', 'Stadt', 'Anzahl betreuter Personen', 'Startdatum',
  'Geschlecht der/des Pflegebedürftigen', 'Dauer der Betreuung', 'Unterkunft vorhanden',
  'Anzahl zusätzl. Personen im Haushalt', 'Haustiere im Haushalt', 'Pflegegrad',
  'Mobilität des Pflegebedürftigen', 'Hilfe beim Transfer benötigt',
  'Mobilitätshilfsmittel vorhanden', 'Gewicht der/des Pflegebedürftigen', 'Demenz vorhanden',
  'Nachtschichten benötigt', 'Führerschein erforderlich', 'Internetanschluss vorhanden',
  'Gewünschtes Geschlecht der Pflegekraft', 'Deutschkenntnisse', 'Telefonische Erreichbarkeit',
  'Budget', 'Sonstige Informationen', 'Rechnung', 'Rechnung (für Storno)',
];
const ZEILE = [
  'Aktiv', '4d7211f9-8992-44e9-8ba1-f413db78b332', 'max@example.com', 'Max Mustermann',
  '+4915158581722', '04.09.2026', 'Exklusiv', '80331', 'München', '1 person',
  'Innerhalb von 4 wochen', 'Weiblich', 'Dauerhaft', 'Zimmer', 'Keine', 'Ja, hund',
  'Pflegegrad 3', 'Eingeschränkt', 'Ja', 'Ja', '72 kg', 'Leicht', 'Nein', 'Erforderlich',
  'Vorhanden', 'Weiblich', 'Mittelstufe', 'Morgens', '2.500-3.000€', 'Bitte anrufen',
  'nächste Rechnung', 'N/A',
];

function zeile(ueberschreib: Record<string, string> = {}) {
  const z = apiZeilen({ headers: KOPF, data: [ZEILE] })[0];
  return { ...z, ...ueberschreib };
}

describe('apiZeilen (Antwort → Zeilenobjekte)', () => {
  it('ordnet per Spaltenname zu, "N/A" und Leerstring fehlen', () => {
    const z = zeile();
    expect(z['Lead ID']).toBe('4d7211f9-8992-44e9-8ba1-f413db78b332');
    expect(z['Rechnung (für Storno)']).toBeUndefined();
    expect(Object.keys(z)).not.toContain('Rechnung (für Storno)');
  });

  it('kaputte Antwort → leere Liste statt Absturz', () => {
    expect(apiZeilen(null)).toEqual([]);
    expect(apiZeilen({ headers: ['a'], data: [] })).toEqual([]);
    expect(apiZeilen({ headers: ['a', 'b'], data: [['x']] })).toEqual([{ a: 'x' }]);
  });
});

describe('helfer24ZuLeadBody (API-Zeile → Body fuer /api/portal-lead)', () => {
  it('voller Satz: Kontakt, Preis-Angaben, Details, Einwilligung, Nachweise', () => {
    const e = helfer24ZuLeadBody(zeile())!;
    expect(e.extern_id).toBe('4d7211f9-8992-44e9-8ba1-f413db78b332');
    expect(e.lieferTag).toBe('2026-09-04');
    expect(e.uebersprungen).toBeUndefined();
    expect(e.unbekannt).toEqual([]);

    const b = e.body as any;
    expect(b.portal).toBe(HELFER24_DOMAIN);
    expect(b.name).toBe('Max Mustermann');
    expect(b.email).toBe('max@example.com');
    expect(b.telefon).toBe('+4915158581722');
    expect(b.plz).toBe('80331');
    expect(b.ort).toBe('München');
    expect(b.portal_lead_id).toBe(e.extern_id);
    expect(b.status).toBe('Aktiv');
    expect(b.erstellt_am).toBe('04.09.2026');

    expect(b.angaben).toEqual({
      betreuung_fuer: '1-person',
      weitere_personen: 'nein',
      mobilitaet: 'rollator',
      nachteinsaetze: 'nein',
      deutschkenntnisse: 'kommunikativ',
      fuehrerschein: 'ja',
      geschlecht: 'weiblich',
      pflegegrad: 3,
    });
    expect(b.care_start_timing).toBe('2-4-wochen');

    expect(b.details.patient_anrede).toBe('Frau');
    expect(b.details.gewicht).toBe('71-80');
    expect(b.details.internet).toBe('ja');
    expect(b.details.demenz).toBe('ja');
    expect(b.details.diagnosen).toBe('Demenz (Leicht)');
    expect(b.details.block).toContain('Haustiere im Haushalt: Ja, hund');
    expect(b.details.block).toContain('Sonstige Informationen: Bitte anrufen');
    expect(b.details.block).toContain('Leadtyp: Exklusiv');

    expect(b.einwilligung.zeitpunkt).toBe('04.09.2026');
    expect(b.einwilligung.text).toContain('Partner-API');
    expect(b.einwilligung.text).toContain(e.extern_id);
    expect(b.einwilligung.text).toContain('Nutzungsbedingungen');
    // Alle Spalten verbatim fuers Ereignislog — Krankheiten etc. gehen nicht verloren.
    expect(b.zusatz['Budget']).toBe('2.500-3.000€');
  });

  it('Pflegegrad: "Keinen" → 0 (Kundenangabe), "Beantragt" → nicht gesetzt, kein Laerm', () => {
    expect((helfer24ZuLeadBody(zeile({ Pflegegrad: 'Keinen' }))!.body as any).angaben.pflegegrad).toBe(0);
    const beantragt = helfer24ZuLeadBody(zeile({ Pflegegrad: 'Beantragt' }))!;
    expect((beantragt.body as any).angaben.pflegegrad).toBeUndefined();
    expect(beantragt.unbekannt).toEqual([]);
    expect((helfer24ZuLeadBody(zeile({ Pflegegrad: 'Pflegegrad 5' }))!.body as any).angaben.pflegegrad).toBe(5);
  });

  it('Nachtschichten "Ja" wird NICHT geraten (Annahme greift, ehrlich markiert)', () => {
    const e = helfer24ZuLeadBody(zeile({ 'Nachtschichten benötigt': 'Ja' }))!;
    expect((e.body as any).angaben.nachteinsaetze).toBeUndefined();
    expect(e.unbekannt).toEqual([]);
  });

  it('Startdatum: alles ab 6 Monaten → "spaeter" (unser Legacy-Wert), nie "unklar"', () => {
    for (const s of ['Innerhalb von 6 monaten', 'Später als 6 monate', 'Später']) {
      expect((helfer24ZuLeadBody(zeile({ Startdatum: s }))!.body as any).care_start_timing).toBe('spaeter');
    }
    expect((helfer24ZuLeadBody(zeile({ Startdatum: 'Sofort' }))!.body as any).care_start_timing).toBe('sofort');
    expect((helfer24ZuLeadBody(zeile({ Startdatum: 'Innerhalb von 3 monaten' }))!.body as any).care_start_timing).toBe('1-2-monate');
  });

  it('"Mehr als 2 personen" → ehepaar (Preis-Maximum) UND verbatim im Kontextblock', () => {
    const b = helfer24ZuLeadBody(zeile({ 'Anzahl betreuter Personen': 'Mehr als 2 personen' }))!.body as any;
    expect(b.angaben.betreuung_fuer).toBe('ehepaar');
    expect(b.details.block).toContain('Anzahl betreuter Personen: Mehr als 2 personen');
  });

  it('Auswahlwerte: Gross-/Kleinschreibung egal; Doku-Tippfehler "Wünschenwert" gilt', () => {
    const b = helfer24ZuLeadBody(zeile({
      'Mobilität des Pflegebedürftigen': 'BETTLÄGERIG',
      'Führerschein erforderlich': 'Wünschenwert',
      'Deutschkenntnisse': 'Fließend',
      'Gewünschtes Geschlecht der Pflegekraft': 'Egal',
    }))!.body as any;
    expect(b.angaben.mobilitaet).toBe('bettlaegerig');
    expect(b.angaben.fuehrerschein).toBe('ja');
    expect(b.angaben.deutschkenntnisse).toBe('sehr-gut');
    expect(b.angaben.geschlecht).toBe('egal');
  });

  it('bewusst nicht abgebildete Werte machen keinen Laerm, fremde Werte schon', () => {
    const still = helfer24ZuLeadBody(zeile({
      'Geschlecht der/des Pflegebedürftigen': 'Männlich und weiblich',
      'Internetanschluss vorhanden': 'In arbeit',
      'Demenz vorhanden': 'Ohne demenz',
    }))!;
    expect(still.unbekannt).toEqual([]);
    expect((still.body as any).details.patient_anrede).toBeUndefined();
    expect((still.body as any).details.internet).toBeUndefined();
    expect((still.body as any).details.demenz).toBeUndefined();

    const fremd = helfer24ZuLeadBody(zeile({ 'Mobilität des Pflegebedürftigen': 'Rollstuhl' }))!;
    expect((fremd.body as any).angaben.mobilitaet).toBeUndefined();
    expect(fremd.unbekannt).toEqual(['Mobilität des Pflegebedürftigen: Rollstuhl']);
  });

  it('falsches Produkt → uebersprungen; fehlendes Produkt (nur ein Produkt im Konto) → ok', () => {
    expect(helfer24ZuLeadBody(zeile({ Produkt: 'Hausnotruf' }))!.uebersprungen).toBe('falsches Produkt: Hausnotruf');
    expect(helfer24ZuLeadBody(zeile({ Produkt: '24h-Pflege' }))!.uebersprungen).toBeUndefined();
    expect(helfer24ZuLeadBody(zeile())!.uebersprungen).toBeUndefined();
  });

  it('ohne Lead ID → null (kein Schluessel, kein Protokoll)', () => {
    const z = zeile();
    delete z['Lead ID'];
    expect(helfer24ZuLeadBody(z)).toBeNull();
  });

  it('fehlende Spalten → keine Angaben, kein Absturz (Annahmen uebernehmen)', () => {
    const e = helfer24ZuLeadBody({ 'Lead ID': 'x', 'E-mail': 'a@b.de', Name: 'A B' })!;
    expect((e.body as any).angaben).toEqual({});
    expect((e.body as any).details).toBeUndefined();
    expect(e.lieferTag).toBeUndefined();
    expect((e.body as any).einwilligung.zeitpunkt).toBe('');
  });
});

describe('Datum: Liefer Datum vs. heute (Berlin)', () => {
  it('lieferTagIso: TT.MM.JJJJ → YYYY-MM-DD, sonst undefined', () => {
    expect(lieferTagIso('23.04.2025')).toBe('2025-04-23');
    expect(lieferTagIso('4.9.2026')).toBe('2026-09-04');
    expect(lieferTagIso('2025-04-23')).toBeUndefined();
    expect(lieferTagIso(undefined)).toBeUndefined();
  });

  it('heuteBerlin: 23:30 UTC ist in Berlin schon der naechste Tag (Sommerzeit)', () => {
    expect(heuteBerlin(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
    expect(heuteBerlin(new Date('2026-07-01T21:30:00Z'))).toBe('2026-07-01');
  });
});
