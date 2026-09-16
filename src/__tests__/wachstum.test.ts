import { describe, it, expect } from 'vitest';
import {
  wachstum, potenzial, ergebnisJeMonat, ergebnisVergleich, pruefeMonatsEingabe, istEchterLead, berlinTag, wochenStart,
  type WLead, type WEreignis, type WEinsatz, type MonatsEinstellung,
} from '../../project 3/lib/wachstum';

// Cross-App-Import (Ausnahme wie portal-url.ts): lib/wachstum.ts lebt im
// Kostenrechner, ist aber ein pures Modul ohne Next-/Supabase-Imports — so
// läuft der Test im Pflicht-CI (root-vitest) statt als nie gestarteter Test
// unter project 3/.
/*
 * Wachstums-Ansicht im Admin (Martin, 14.09.2026). Geprüft wird, was die drei
 * Kurven verfälschen würde: Tests und interne Adressen, Tagesgrenzen in
 * Berlin, doppelt gezählte Profile und doppelt gezählte Einsatztage beim
 * Wechsel der Pflegekraft.
 */

const lead = (id: string, created_at: string, extra: Partial<WLead> = {}): WLead =>
  ({ id, created_at, source: 'rechner', email: `${id}@gmx.de`, vorname: 'Anna', nachname: 'Muster', ...extra });

describe('echte Anfragen', () => {
  it('lässt Tests und interne Adressen weg', () => {
    expect(istEchterLead(lead('a', '2026-09-01T10:00:00Z'))).toBe(true);
    expect(istEchterLead(lead('b', '2026-09-01T10:00:00Z', { ist_test: true }))).toBe(false);
    expect(istEchterLead(lead('c', '2026-09-01T10:00:00Z', { email: 'x@mamamia.app' }))).toBe(false);
    expect(istEchterLead(lead('d', '2026-09-01T10:00:00Z', { email: 'info@primundus.de' }))).toBe(false);
    expect(istEchterLead(lead('e', '2026-09-01T10:00:00Z', { vorname: 'Test' }))).toBe(false);
  });
});

describe('Tage und Wochen in Berlin', () => {
  it('ordnet 00:30 Uhr Berliner Zeit dem neuen Tag zu', () => {
    expect(berlinTag('2026-09-06T22:30:00Z')).toBe('2026-09-07');
    expect(berlinTag('2026-09-06T21:30:00Z')).toBe('2026-09-06');
  });
  it('beginnt die Woche am Montag', () => {
    expect(wochenStart('2026-09-13')).toBe('2026-09-07'); // Sonntag
    expect(wochenStart('2026-09-07')).toBe('2026-09-07'); // Montag
  });
});

describe('Wachstum', () => {
  const leads: WLead[] = [
    lead('a', '2026-09-01T08:00:00Z'),
    lead('b', '2026-09-02T08:00:00Z', { source: 'portal:pflegehilfe.org' }),
    lead('c', '2026-09-08T08:00:00Z'),
    lead('t', '2026-09-08T08:00:00Z', { ist_test: true }),
    lead('alt', '2026-06-01T08:00:00Z'),
  ];
  const ereignisse: WEreignis[] = [
    { lead_id: 'a', event_type: 'patient_data_saved', created_at: '2026-09-01T09:00:00Z' },
    { lead_id: 'a', event_type: 'caregiver_invited', created_at: '2026-09-09T09:00:00Z' }, // zweites Ereignis: kein zweites Profil
    { lead_id: 'b', event_type: 'application_received', created_at: '2026-09-03T09:00:00Z' }, // Team-Profil
    { lead_id: 't', event_type: 'patient_data_saved', created_at: '2026-09-08T09:00:00Z' }, // Test zählt nicht
    { lead_id: 'c', event_type: 'portal_opened', created_at: '2026-09-08T09:00:00Z' }, // kein Profil
  ];
  const einsaetze: WEinsatz[] = [
    // Kunde alt: erster Einsatz bis 05.09., Wechsel mit zwei Tagen Überlappung, läuft über heute hinaus
    { lead_id: 'alt', status: 'abgeschlossen', anreise: '2026-08-20', abreise: '2026-09-05' },
    { lead_id: 'alt', status: 'gebucht', anreise: '2026-09-04', abreise: '2026-11-30' },
    // Kunde a: reist am 10.09. an
    { lead_id: 'a', status: 'gebucht', anreise: '2026-09-10', abreise: '2026-10-20' },
    // nur geplant und Test: zählen nicht
    { lead_id: 'c', status: 'geplant', anreise: '2026-09-09', abreise: null },
    { lead_id: 't', status: 'gebucht', anreise: '2026-09-01', abreise: '2026-09-30' },
  ];
  const w = wachstum({ leads, ereignisse, einsaetze, von: '2026-09-01', heute: '2026-09-13' });

  it('legt Wochen ab Montag an, die erste und die laufende Woche sind kürzer', () => {
    expect(w.wochen.map((x) => [x.start, x.tage, x.laufend])).toEqual([
      ['2026-08-31', 6, false],
      ['2026-09-07', 7, true],
    ]);
  });

  it('zählt Anfragen getrennt nach eigen und eingekauft, ohne Tests', () => {
    expect(w.wochen[0].anfragenEigen).toBe(1);
    expect(w.wochen[0].anfragenGekauft).toBe(1);
    expect(w.wochen[1].anfragenEigen).toBe(1);
  });

  it('zählt ein Profil einmal, am Tag des ersten Ereignisses, auch Team-Profile', () => {
    expect(w.wochen[0].profileEigen).toBe(1);
    expect(w.wochen[0].profileGekauft).toBe(1);
    expect(w.wochen[1].profileEigen).toBe(0);
  });

  it('zählt einen Kunden je Tag höchstens einmal und nur bis heute', () => {
    const tag = (t: string) => w.tage.find((x) => x.tag === t)?.kunden;
    expect(tag('2026-09-04')).toBe(1); // Überlappung beim Wechsel: trotzdem 1
    expect(tag('2026-09-09')).toBe(1);
    expect(tag('2026-09-10')).toBe(2);
    expect(w.tage.at(-1)).toEqual({ tag: '2026-09-13', kunden: 2 });
  });

  it('rechnet den Wochenschnitt über die gezeigten Tage', () => {
    expect(w.wochen[0].kundenSchnitt).toBe(1); // 01.–06.09. je 1 Kunde
    expect(w.wochen[1].kundenSchnitt).toBe(1.6); // 07.–09.09. je 1, 10.–13.09. je 2 → 11/7
  });

  it('zählt neue Kunden in der Woche der ersten Anreise', () => {
    expect(w.wochen[0].neueKunden).toBe(0); // Kunde alt kam im August
    expect(w.wochen[1].neueKunden).toBe(1); // Kunde a am 10.09.
  });
});

describe('Potenzialentwicklung im laufenden Monat', () => {
  // heute = Mo 14.09.2026, Monatsende 30.09.
  const leads: WLead[] = [
    lead('bleibt', '2026-07-01T08:00:00Z'),
    lead('geht', '2026-07-01T08:00:00Z'),
    lead('wechsel', '2026-07-01T08:00:00Z'),
    lead('neu', '2026-09-01T08:00:00Z'),
    lead('sucht', '2026-09-05T08:00:00Z', { status: 'angebot_requested' }),
    lead('ueberfaellig', '2026-08-25T08:00:00Z', { status: 'angebot_requested' }),
    lead('zualt', '2026-08-01T08:00:00Z', { status: 'angebot_requested' }),
    lead('ohneprofil', '2026-09-05T08:00:00Z', { status: 'angebot_requested' }),
    lead('keininteresse', '2026-09-05T08:00:00Z', { status: 'nicht_interessiert' }),
    lead('oktober', '2026-09-05T08:00:00Z', { status: 'angebot_requested' }),
  ];
  const profil = (id: string): WEreignis => ({ lead_id: id, event_type: 'patient_data_saved', created_at: '2026-09-06T09:00:00Z' });
  const ereignisse = ['sucht', 'ueberfaellig', 'zualt', 'keininteresse', 'oktober', 'neu'].map(profil);
  const einsaetze: WEinsatz[] = [
    { lead_id: 'bleibt', status: 'gebucht', anreise: '2026-08-01', abreise: '2026-11-30' },
    { lead_id: 'geht', status: 'gebucht', anreise: '2026-08-01', abreise: '2026-09-20' },           // endet ohne Nachfolge
    { lead_id: 'wechsel', status: 'gebucht', anreise: '2026-08-01', abreise: '2026-09-18' },
    { lead_id: 'wechsel', status: 'gebucht', anreise: '2026-09-18', abreise: '2026-11-15' },        // Wechsel ohne Lücke
    { lead_id: 'neu', status: 'gebucht', anreise: '2026-09-22', abreise: '2026-11-22' },            // neuer Kunde
    { lead_id: 'sucht', status: 'geplant', anreise: '2026-09-25', abreise: null },
    { lead_id: 'ueberfaellig', status: 'geplant', anreise: '2026-09-05', abreise: null },          // 9 Tage überfällig → ab heute
    { lead_id: 'zualt', status: 'geplant', anreise: '2026-08-20', abreise: null },                  // 25 Tage überfällig → raus
    { lead_id: 'ohneprofil', status: 'geplant', anreise: '2026-09-20', abreise: null },            // kein Profil → raus
    { lead_id: 'keininteresse', status: 'geplant', anreise: '2026-09-20', abreise: null },         // nicht interessiert → raus
    { lead_id: 'oktober', status: 'geplant', anreise: '2026-10-05', abreise: null },               // Start nach Monatsende → raus
    { lead_id: 'neu', status: 'geplant', anreise: '2026-09-22', abreise: null },                   // schon gebucht → nicht doppelt
  ];
  const p = potenzial({ leads, ereignisse, einsaetze, heute: '2026-09-14' });
  const tag = (t: string) => p.tage.find((x) => x.tag === t)!;

  it('rechnet den ganzen Monat, bis heute als Ist', () => {
    expect(p.monatsEnde).toBe('2026-09-30');
    expect(p.tage).toHaveLength(30);
    expect(tag('2026-09-13')).toMatchObject({ fest: 3, potenzial: 0, vergangen: true });
    expect(p.jetzt).toBe(3);
  });

  it('trennt neue Kunden von Wechseln und zählt Abgänge ohne Nachfolge', () => {
    expect(p.anreisenNeu).toBe(1);
    expect(p.anreisenWechsel).toBe(1);
    expect(p.abgaenge).toBe(1);
    expect(tag('2026-09-21').fest).toBe(2); // „geht“ ist weg, „neu“ noch nicht da
    expect(p.festAmMonatsende).toBe(3);    // 3 + 1 neu − 1 Abgang
  });

  it('zählt als Potenzial nur Suchende mit fertigem Profil, Start bis Monatsende, höchstens 14 Tage überfällig', () => {
    expect(p.inSuche).toBe(2);
    expect(tag('2026-09-14').potenzial).toBe(1); // überfällig → ab heute
    expect(tag('2026-09-24').potenzial).toBe(1);
    expect(tag('2026-09-25').potenzial).toBe(2);
  });
});

describe('Ergebnis je Monat', () => {
  // heute = Mo 14.09.2026
  const leads: WLead[] = [
    lead('k1', '2026-07-01T08:00:00Z'),
    lead('k2', '2026-07-01T08:00:00Z'),
    lead('k3', '2026-09-01T08:00:00Z'),
    lead('k4', '2026-09-01T08:00:00Z'),
    lead('p1', '2026-09-05T08:00:00Z', { source: 'portal:pflegehilfe.org' }),
    lead('p2', '2026-08-20T08:00:00Z', { source: 'portal:pflege-helfer24.de' }),
    lead('p3', '2026-09-06T08:00:00Z', { source: 'portal:pflegena.com' }),
    lead('t', '2026-09-07T08:00:00Z', { source: 'portal:pflegehilfe.org', ist_test: true }),
  ];
  const einsaetze: WEinsatz[] = [
    { lead_id: 'k1', status: 'gebucht', anreise: '2026-08-01', abreise: '2026-11-30' },       // ganzer August und September
    { lead_id: 'k2', status: 'abgeschlossen', anreise: '2026-08-17', abreise: '2026-08-31' },
    { lead_id: 'k2', status: 'gebucht', anreise: '2026-08-30', abreise: '2026-09-20' },       // Wechsel mit Überlappung
    { lead_id: 'k3', status: 'gebucht', anreise: '2026-09-25', abreise: null },               // reist noch an, offen
    { lead_id: 'k4', status: 'geplant', anreise: '2026-09-10', abreise: null },               // nur Suche: zählt nicht
  ];
  const adsKosten = [
    { tag: '2026-08-10', kosten_netto: 100 }, { tag: '2026-08-11', kosten_netto: '200' },
    { tag: '2026-09-01', kosten_netto: 50 }, { tag: '2026-09-02', kosten_netto: 70 },
    { tag: '2026-09-14', kosten_netto: 999 },                                                 // heute, unvollständig
  ];
  const einstellungen: MonatsEinstellung[] = [
    { monat: '2026-08-01', provision_je_kunde: 600, variabel_je_kunde: 60, gemeinkosten: [{ posten: 'Personal', betrag: 1000 }, { posten: 'Steuerberater', betrag: 200 }] },
  ];
  const portalPreise = { 'pflegehilfe.org': 37, 'pflege-helfer24.de': 50, 'pflegena.com': 0 };
  const r = ergebnisJeMonat({ leads, einsaetze, adsKosten, einstellungen, portalPreise, heute: '2026-09-14' });
  const monat = (m: string) => r.find((x) => x.monat === m)!;

  it('legt jeden Monat seit Mai an, der laufende ist hochgerechnet', () => {
    expect(r.map((x) => [x.monat, x.laufend])).toEqual([
      ['2026-05', false], ['2026-06', false], ['2026-07', false], ['2026-08', false], ['2026-09', true],
    ]);
  });

  it('rechnet Provision je Einsatztag, einen Kunden beim Wechsel nur einmal', () => {
    const a = monat('2026-08');
    expect(a.einsatztage).toBe(46);            // k1 31 Tage + k2 17.–31.08. (30./31.08. nicht doppelt)
    expect(a.provision).toBe(920);            // 46 × 600 / 30
    expect(a.variabel).toBe(92);
    expect(a.deckungsbeitrag).toBe(828);
    expect(a.kundenSchnitt).toBe(1.5);
  });

  it('zählt im laufenden Monat die gebuchten Tage bis Monatsende, geplante nicht', () => {
    expect(monat('2026-09').einsatztage).toBe(56); // k1 30 + k2 1.–20.09. + k3 25.–30.09.
  });

  it('nimmt Werbung automatisch: Google hochgerechnet aus vollen Tagen, eingekaufte Anfragen zum Stückpreis', () => {
    expect(monat('2026-08').werbungGoogle).toBe(300);
    expect(monat('2026-08').werbungEingekauft).toBe(50);
    expect(monat('2026-09').werbungGoogle).toBe(1800);   // (50 + 70) / 2 Tage × 30, der heutige Tag zählt nicht
    expect(monat('2026-09').werbungEingekauft).toBe(37); // Pflegehilfe 37 + Pflegena 0, Test zählt nicht
  });

  it('übernimmt Gemeinkosten aus dem letzten früheren Monat, davor gibt es keine', () => {
    expect(monat('2026-08')).toMatchObject({ quelle: 'eigen', gemeinkosten: 1200, ergebnis: -722 });
    expect(monat('2026-09')).toMatchObject({ quelle: 'uebernommen', uebernommenAus: '2026-08', gemeinkosten: 1200, provisionJeKunde: 600 });
    expect(monat('2026-07')).toMatchObject({ quelle: 'keine', gemeinkosten: null, provisionJeKunde: 550, variabelJeKunde: 50, kostenGedecktAb: null });
  });

  it('vergleicht mit dem Vormonat: mehr Deckungsbeitrag, mehr Werbung, Ergebnis', () => {
    expect(ergebnisVergleich(monat('2026-08'), monat('2026-09'))).toEqual({
      kundenMehr: 0.4,              // 56/30 − 46/31
      deckungsbeitragMehr: 180,     // 1.008 − 828
      googleMehr: 1500, eingekauftMehr: -13, werbungMehr: 1487,
      gemeinkostenMehr: 0,
      ergebnisMehr: -1307,          // −2.029 − (−722)
      vorGemeinkosten: false,
    });
    // Juli ohne Gemeinkosten: verglichen wird das Ergebnis vor Gemeinkosten
    const v = ergebnisVergleich(monat('2026-07'), monat('2026-08'));
    expect(v.vorGemeinkosten).toBe(true);
    expect(v.gemeinkostenMehr).toBeNull();
    expect(v.ergebnisMehr).toBe(478);   // (828 − 350) − (0 − 0)
  });

  it('nennt die Kundenzahl, ab der Werbung und Gemeinkosten gedeckt sind', () => {
    expect(monat('2026-08').kostenGedecktAb).toBe(2.8); // 1.550 € / (540 € × 31/30)
    expect(monat('2026-09').kostenGedecktAb).toBe(5.6); // 3.037 € / 540 €
  });
});

describe('Eingabe der Monatskosten', () => {
  it('nimmt Zahlen und Texte mit Komma, lässt Zeilen ohne Betrag weg', () => {
    const r = pruefeMonatsEingabe({
      monat: '2026-09', provision_je_kunde: '550', variabel_je_kunde: 50,
      gemeinkosten: [{ posten: ' Personal ', betrag: '1200,50' }, { posten: '', betrag: '' }, { posten: 'Versicherungen', betrag: '' }, { posten: 'Steuerberater', betrag: 300 }],
    });
    expect(r).toEqual({ ok: true, wert: { monat: '2026-09-01', provision_je_kunde: 550, variabel_je_kunde: 50,
      gemeinkosten: [{ posten: 'Personal', betrag: 1200.5 }, { posten: 'Steuerberater', betrag: 300 }] } });
  });
  it('lehnt mehrdeutige und ungültige Angaben ab', () => {
    const basis = { monat: '2026-09', provision_je_kunde: 550, variabel_je_kunde: 50, gemeinkosten: [] as unknown[] };
    expect(pruefeMonatsEingabe({ ...basis, gemeinkosten: [{ posten: 'Miete', betrag: '1.200' }] }).ok).toBe(false); // Tausenderpunkt?
    expect(pruefeMonatsEingabe({ ...basis, gemeinkosten: [{ posten: '', betrag: 500 }] }).ok).toBe(false);
    expect(pruefeMonatsEingabe({ ...basis, gemeinkosten: [{ posten: 'Miete', betrag: -5 }] }).ok).toBe(false);
    expect(pruefeMonatsEingabe({ ...basis, monat: '2026-13' }).ok).toBe(false);
    expect(pruefeMonatsEingabe({ ...basis, provision_je_kunde: 'viel' }).ok).toBe(false);
    expect(pruefeMonatsEingabe({ ...basis, gemeinkosten: Array.from({ length: 31 }, (_, i) => ({ posten: `P${i}`, betrag: 1 })) }).ok).toBe(false);
  });
});
