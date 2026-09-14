import { describe, it, expect } from 'vitest';
import { wachstum, istEchterLead, berlinTag, wochenStart, type WLead, type WEreignis, type WEinsatz } from '../../project 3/lib/wachstum';

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

  it('füllt die Kacheln rollierend bis heute', () => {
    expect(w.kacheln).toEqual({
      kundenHeute: 2, kundenVor30: 0, // 14.08.: Kunde alt kam erst am 20.08.
      anfragen7Eigen: 1, anfragen7Gekauft: 0,
      profile7Eigen: 0, profile7Gekauft: 0,
      neueKunden30: 2,
    });
  });
});
