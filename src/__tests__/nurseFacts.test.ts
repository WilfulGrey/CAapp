import { describe, it, expect } from 'vitest';
import { nurseFacts, einsaetzeText, isEmail, einsatzortHinweis } from '../components/portal/shared';

// Faktenzeile der Pflegekraft-Karten. Vorher stand ohne `care_experience`
// wörtlich „—" als einzige Qualifikationszeile, und ohne Einsätze blieb die
// Zeile nach dem Label leer (Martin, 13.08.).

describe('nurseFacts', () => {
  it('voller Fall: Jahre + Einsätze über Primundus — ohne Ø-Dauer (Martin, 03.09.)', () => {
    expect(nurseFacts({ experience: '4 J. Erfahrung', history: { assignments: 9, avgDurationMonths: 2.3 } }))
      .toBe('4 J. Erfahrung · 9 Einsätze über Primundus');
  });

  it('Einsätze ohne Jahre: der Strich fällt weg, kein „— · 3 Einsätze"', () => {
    expect(nurseFacts({ experience: '—', history: { assignments: 3, avgDurationMonths: 2.3 } }))
      .toBe('3 Einsätze über Primundus');
  });

  it('Jahre ohne Einsätze: nur die Jahre', () => {
    expect(nurseFacts({ experience: '4 J. Erfahrung' })).toBe('4 J. Erfahrung');
  });

  it('gar nichts: kurzer ehrlicher Satz statt leerem Strich', () => {
    expect(nurseFacts({ experience: '—' })).toBe('bereit für den ersten Einsatz');
    expect(nurseFacts({ experience: '' })).toBe('bereit für den ersten Einsatz');
  });

  it('Einzahl: „1 Einsatz über Primundus" — nicht „1 Einsätze" (Prod-Screenshot 13.08.)', () => {
    expect(nurseFacts({ experience: '—', history: { assignments: 1, avgDurationMonths: 0.23 } }))
      .toBe('1 Einsatz über Primundus');
  });

  // Wächter: die Durchschnittsdauer darf nicht zurückkommen — auch nicht
  // über einen anderen Wortlaut. Der Kunde sah „Ø 10 Wochen pro Einsatz"
  // und konnte damit nichts anfangen (Martin, 03.09.2026).
  it('keine Durchschnittsdauer, egal welche history-Werte', () => {
    for (const avg of [0.25, 1, 2.5, 12]) {
      const s = nurseFacts({ experience: '4 J. Erfahrung', history: { assignments: 5, avgDurationMonths: avg } });
      expect(s).not.toMatch(/Ø|Woche|pro Einsatz/);
      expect(s).toBe('4 J. Erfahrung · 5 Einsätze über Primundus');
    }
  });

  // Derselbe Wortlaut speist auch das Pill im Profil-Modal („Letzte
  // Einsätze") — dort stand bis 03.09. „14 Einsätze · Ø 12 Wo.".
  it('einsaetzeText: Einzahl/Mehrzahl, immer „über Primundus", nie Ø', () => {
    expect(einsaetzeText(1)).toBe('1 Einsatz über Primundus');
    expect(einsaetzeText(14)).toBe('14 Einsätze über Primundus');
    expect(einsaetzeText(0)).toBe('0 Einsätze über Primundus');
  });
});

describe('isEmail (Registry #52)', () => {
  it('lehnt Doppel-Domain und Leerzeichen ab, nimmt normale Adressen', () => {
    expect(isEmail('catarina-stein@t-online.de@t-online.de')).toBe(false);
    expect(isEmail('a b@x.de')).toBe(false);
    expect(isEmail('nur-text')).toBe(false);
    expect(isEmail(' ok@example.de ')).toBe(true);
  });
});

describe('einsatzortHinweis (Registry #65)', () => {
  const ok = { plz: '76229', ort: 'Karlsruhe', eingabe: '76229 Karlsruhe',
               lookupFehler: false, keinTreffer: false, abgelehnt: false };

  it('gewähltes Paar aus der Liste ist in Ordnung', () => {
    expect(einsatzortHinweis(ok)).toBeNull();
  });

  it('Ausfall der Ortssuche schlägt alles andere', () => {
    // Auch wenn die PLZ formal passt: erst sagen, dass wir gerade nicht suchen
    // können — sonst behaupten wir „kennen wir nicht" ohne nachgesehen zu haben.
    expect(einsatzortHinweis({ ...ok, lookupFehler: true, keinTreffer: true }))
      .toMatch(/nicht erreichbar/);
  });

  it('getippter Ortsname ohne Auswahl verlangt die Liste, nicht die PLZ', () => {
    // Fix vom 12.08.2026: das Feld zeigt „Karlsruhe", „bitte PLZ eingeben" wäre gelogen.
    expect(einsatzortHinweis({ ...ok, plz: '', ort: 'Karlsruhe', eingabe: 'Karlsruhe' }))
      .toMatch(/Vorschlagsliste/);
  });

  it('zu kurze Ziffernfolge verlangt 5 Stellen', () => {
    expect(einsatzortHinweis({ ...ok, plz: '6130', ort: '', eingabe: '6130' }))
      .toMatch(/5-stellige/);
  });

  it('Mamamia kennt die PLZ nicht → Satz über Deutschland, mit der PLZ darin', () => {
    const m = einsatzortHinweis({ ...ok, plz: '50348', ort: '', eingabe: '50348', keinTreffer: true });
    expect(m).toContain('50348');
    expect(m).toMatch(/innerhalb Deutschlands/);
  });

  it('vom Save-Wall abgelehnte PLZ sagt dasselbe wie kein Treffer', () => {
    // Draft/Prefill: PLZ 5-stellig UND ort gefüllt — ohne dieses Flag käme null
    // und der Kunde stünde in der Schleife Speichern → Weiter → Speichern.
    expect(einsatzortHinweis({ ...ok, plz: '50348', ort: 'Lüdinghausen', abgelehnt: true }))
      .toMatch(/innerhalb Deutschlands/);
  });

  it('5-stellige PLZ ohne gewählten Ort verlangt die Liste', () => {
    expect(einsatzortHinweis({ ...ok, ort: '', eingabe: '76229' }))
      .toMatch(/Vorschlagsliste/);
  });

  it('abgelehnt gilt nur für die abgelehnte PLZ (Flag wird vom Aufrufer verglichen)', () => {
    expect(einsatzortHinweis({ ...ok, abgelehnt: false })).toBeNull();
  });
});
