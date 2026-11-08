// Angebotskarte im Minimal-Einstieg (Registry #147, Fassung „CGA-Stil“): dieselbe Zahl wie der Kasten „IHR ANGEBOT“ der
// kurzen Angebotsmail (#148, send-scheduled-emails/kundenMails.ts `eigenanteilAus`).
import { describe, expect, it } from 'vitest';
import { eigenanteilAus } from '../lib/angebotZuschuss';
import type { LeadKalkulation } from '../lib/supabase';

const posten = (name: string, monat: number, drin = true) => ({
  name, label: name, beschreibung: '', betrag_monatlich: monat, betrag_jaehrlich: monat * 12, typ: 'monatlich', hinweis: null, in_kalkulation: drin,
});
// Werte wie der Vorschau-Lead (PG 4, 3.050 €; gegen `berechneZuschüsse` gerechnet, CustomerPortalPage PREVIEW).
const kalk = (fd: Record<string, unknown>, extra: ReturnType<typeof posten>[] = [], eigenanteil = 1621.75): LeadKalkulation => ({
  bruttopreis: 3050,
  eigenanteil,
  'zuschüsse': { gesamt: 1428.25, items: [posten('pflegegeld', 800), posten('entlastungsbudget_neu', 294.92), posten('steuervorteil', 333.33), ...extra] },
  aufschluesselung: [],
  formularDaten: { pflegegrad: 4, ...fd },
});

describe('eigenanteilAus (Spiegel der Mail)', () => {
  it('Preis minus die gerundeten Posten: 3.050 − 800 − 295 − 333 = 1.622', () => {
    expect(eigenanteilAus(kalk({ betreuung_fuer: '1-person' }))).toEqual({ eigen: 1622 });
    expect(eigenanteilAus(kalk({ betreuung_fuer: 'ehepaar' }))).toEqual({ eigen: 1622 });
  });
  it('Posten ohne in_kalkulation zählen nicht', () => {
    expect(eigenanteilAus(kalk({}, [posten('verhinderungspflege', 300, false)]))?.eigen).toBe(1622);
  });
  it('unbekannter Posten in der Kalkulation, Abweichung über 2 € oder keine Posten: keine Zeile', () => {
    expect(eigenanteilAus(kalk({}, [posten('verhinderungspflege', 300)]))).toBeNull();
    expect(eigenanteilAus(kalk({}, [], 1600))).toBeNull();
    expect(eigenanteilAus({ ...kalk({}), 'zuschüsse': { gesamt: 0, items: [] } })).toBeNull();
    expect(eigenanteilAus(null)).toBeNull();
  });
});
