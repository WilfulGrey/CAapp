import { describe, it, expect } from 'vitest';
import { quellenAuswertung, gruppenSumme, PORTAL_PREISE } from '../lead-kosten';

/*
 * Kosten je Quelle (Martin, 06.09.2026). Der Sinn der Trennung: eine eingekaufte
 * Quelle laesst sich nur bewerten, wenn ihre Kosten NICHT mit der Werbung
 * vermischt werden.
 */
const leads = [
  { id: 'a', source: 'rechner' },
  { id: 'b', source: 'rechner' },
  { id: 'c', source: 'chat:kosten-berechnen' },
  { id: 'd', source: 'portal:pflegehilfe.org' },
  { id: 'e', source: 'portal:pflegehilfe.org' },
  { id: 'f', source: 'portal:pflege-helfer24.de' },
  { id: 'g', source: 'portal:pflegehilfe.org', ist_test: true }, // zaehlt nicht
];
const profile = new Set(['a', 'd']);

describe('Kosten je Quelle', () => {
  it('rechnet eingekaufte Quellen mit ihrem eigenen Preis', () => {
    const { zeilen } = quellenAuswertung(leads, profile, 300);
    const ph = zeilen.find((z) => z.key === 'portal:pflegehilfe.org')!;
    expect(ph.leads).toBe(2);            // der Testlead ist raus
    expect(ph.kosten).toBe(74);          // 2 × 37 €
    expect(ph.jeLead).toBe(37);
    expect(ph.jeProfil).toBe(74);        // 1 Profil
    const ph24 = zeilen.find((z) => z.key === 'portal:pflege-helfer24.de')!;
    expect(ph24.kosten).toBe(50);        // anderer Preis, eigene Bewertung
    expect(ph24.jeProfil).toBeNull();    // kein Profil → keine erfundene Zahl
  });

  it('verteilt das Werbebudget nur auf die eigenen Quellen', () => {
    const { zeilen } = quellenAuswertung(leads, profile, 300);
    const rechner = zeilen.find((z) => z.key === 'rechner')!;
    const chat = zeilen.find((z) => z.key === 'chat:kosten-berechnen')!;
    // 3 eigene Leads → 100 € je Lead; die eingekauften bekommen nichts davon.
    expect(rechner.kosten).toBe(200);
    expect(chat.kosten).toBe(100);
    expect(gruppenSumme(zeilen, 'eigene').kosten).toBe(300);
    expect(gruppenSumme(zeilen, 'eingekauft').kosten).toBe(124);
  });

  it('meldet ein Portal ohne hinterlegten Preis', () => {
    const { ohnePreis, zeilen } = quellenAuswertung(
      [{ id: 'x', source: 'portal:pflegebund.eu' }], new Set(), 0,
    );
    expect(ohnePreis).toEqual(['pflegebund.eu']);
    expect(zeilen[0].preis).toBeNull();
    expect(zeilen[0].kosten).toBe(0);
  });

  it('kennt die vereinbarten Preise', () => {
    expect(PORTAL_PREISE['pflegehilfe.org']).toBe(37);
    expect(PORTAL_PREISE['pflege-helfer24.de']).toBe(50);
  });
});
