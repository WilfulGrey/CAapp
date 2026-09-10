import { describe, expect, it } from 'vitest';
import { deutschBalken, hakenAusAntworten, kopfzeile, kraefteVorschauAktiv, kraftFakten, kraftZeile, parseVorschau, PORTAL_ANZAHL, SCHRANKE, VERLAUF, WARTE, wuenscheAusAntworten } from '../../project 3/lib/kraefte-vorschau';

function speicher(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

describe('Kräfte-Vorschau (Rechner)', () => {
  it('Schalter: ?kraefte=1 schaltet ein und merkt sich das, ?kraefte=0 schaltet aus', () => {
    const s = speicher();
    expect(kraefteVorschauAktiv('?kraefte=1&start=1', s)).toBe(true);
    expect(kraefteVorschauAktiv('?start=1', s)).toBe(true);
    expect(kraefteVorschauAktiv('?kraefte=0', s)).toBe(false);
    expect(kraefteVorschauAktiv('', s)).toBe(false);
    expect(kraefteVorschauAktiv('', null)).toBe(false);
  });

  it('Wünsche: nur Deutsch, Geschlecht, Führerschein', () => {
    expect(wuenscheAusAntworten({ germanLevel: 'sehr-gut', gender: '', driving: 'ja' }))
      .toEqual({ deutsch: 'sehr-gut', geschlecht: null, fuehrerschein: 'ja' });
  });

  it('Portal-Optik der Karte: Faktenzeile und Sprachbalken', () => {
    expect(kraftFakten({ erfahrungJahre: 12, einsaetze: 31 })).toBe('12 J. Erfahrung · 31 Einsätze über Primundus');
    expect(kraftFakten({ erfahrungJahre: 0, einsaetze: 1 })).toBe('1 Einsatz über Primundus');
    expect(kraftFakten({ erfahrungJahre: 0, einsaetze: 0 })).toBe('bereit für den ersten Einsatz');
    expect([deutschBalken('Grund'), deutschBalken('Mittel'), deutschBalken('Gut'), deutschBalken(null)]).toEqual([1, 2, 3, 0]);
  });

  it('Zeile unter dem Namen: Deutsch klein, Jahre ausgeschrieben', () => {
    expect(kraftZeile({ deutschWort: 'Gut', erfahrungJahre: 10 })).toBe('Deutsch: gut · 10 Jahre Erfahrung');
    expect(kraftZeile({ deutschWort: null, erfahrungJahre: 1 })).toBe('1 Jahr Erfahrung');
    expect(kraftZeile({ deutschWort: 'Mittel', erfahrungJahre: 0 })).toBe('Deutsch: mittel');
  });

  it('Häkchen: Wortlaut der Angebotsmail, höchstens zwei, Auffüllen mit Einsätzen und Verfügbarkeit', () => {
    expect(hakenAusAntworten({ mobility: 'rollstuhl', nightCare: 'gelegentlich', driving: 'ja' }, { einsaetze: 12 }))
      .toEqual(['Erfahrung mit Rollstuhlpatienten', 'Erfahrung mit nächtlichen Einsätzen']);
    expect(hakenAusAntworten({ mobility: 'rollator', nightCare: 'nein' }, { einsaetze: 0 }))
      .toEqual(['Erfahrung mit eingeschränkter Mobilität', 'Ab sofort verfügbar']);
    expect(hakenAusAntworten({ mobility: 'mobil', nightCare: 'nein', driving: 'ja' }, { einsaetze: 1 }))
      .toEqual(['Führerschein vorhanden', '1 Einsatz über Primundus']);
    expect(hakenAusAntworten({}, { einsaetze: 0 })).toEqual(['Ab sofort verfügbar']);
  });

  it('Martins Aufbau: Warte-Screen, Kopf, Verlauf, Schranke', () => {
    expect(PORTAL_ANZAHL).toBe(5);
    expect(WARTE.schritt1).toBe('Sofortangebot berechnet');
    expect(WARTE.schritt2Fertig(5)).toBe('5 passende Pflegekräfte gefunden');
    expect(WARTE.schritt3).toBe('Verfügbarkeit geprüft');
    expect(WARTE.schritt3Fertig(5)).toBe('alle 5 ab sofort verfügbar');
    expect(kopfzeile()).toBe('5 passende Pflegekräfte – sofort verfügbar');
    expect(VERLAUF.weitere()).toBe('+ 3 weitere passende Pflegekräfte');
    expect(VERLAUF.angebot).toBe('und Ihr persönliches Sofortangebot');
    expect(VERLAUF.knopf).toBe('Alle Pflegekräfte & Sofortangebot ansehen\u00A0→');
    expect(VERLAUF.hinweis).toBe('Dafür benötigen wir nur noch Ihre Kontaktdaten.');
    expect(SCHRANKE.knopf).toBe(VERLAUF.knopf);
  });

  it('parseVorschau lässt nur saubere Karten mit https-Foto durch, maximal drei', () => {
    const ok = { id: 1, vorname: 'Anna', alter: 52, deutschWort: 'Gut', erfahrungJahre: 7, einsaetze: 3, stufe: 'Bewährt', fotoUrl: 'https://x/a.jpg', verfuegbarAb: null };
    const out = parseVorschau({ kraefte: [ok, { ...ok, id: 2, fotoUrl: 'http://x' }, { id: 'x' }, { ...ok, id: 3 }, { ...ok, id: 4 }, { ...ok, id: 5 }] });
    expect(out.map((k) => k.id)).toEqual([1, 3, 4]);
    expect(parseVorschau(null)).toEqual([]);
    expect(parseVorschau({ kraefte: 'nein' })).toEqual([]);
  });
});
