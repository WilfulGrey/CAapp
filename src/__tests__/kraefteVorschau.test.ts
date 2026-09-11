import { describe, expect, it } from 'vitest';
import { deutschBalken, hakenAusAntworten, kopfzeile, kraefteVorschauAktiv, kraftFakten, kraftZeile, parseVorschau, PORTAL_ANZAHL, SCHRANKE, VERLAUF, WARTE, wuenscheAusAntworten } from '../../project 3/lib/kraefte-vorschau';

function speicher(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

describe('Kräfte-Vorschau (Rechner)', () => {
  it('Schalter: seit 10.09. für alle an; ?kraefte=0 schaltet aus und merkt sich das, ?kraefte=1 wieder ein', () => {
    const s = speicher();
    expect(kraefteVorschauAktiv('?start=1', s)).toBe(true);
    expect(kraefteVorschauAktiv('', null)).toBe(true);
    expect(kraefteVorschauAktiv('?kraefte=0', s)).toBe(false);
    expect(kraefteVorschauAktiv('', s)).toBe(false);
    expect(kraefteVorschauAktiv('?kraefte=1&start=1', s)).toBe(true);
    expect(kraefteVorschauAktiv('', s)).toBe(true);
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

  it('Strecke v2 (11.09.): Warte-Screen, Kopf, Verlauf, Schranke', () => {
    expect(PORTAL_ANZAHL).toBe(5);
    // Warte-Screen bleibt bis aufs Wort „Preis" (Martin: „das ist so richtig").
    expect(WARTE.text).toBe('Wir berechnen Ihren Preis und suchen passende Pflegekräfte.');
    expect(WARTE.schritt1).toBe('Preis berechnet');
    expect(WARTE.schritt2Fertig(5)).toBe('5 passende Pflegekräfte gefunden');
    expect(WARTE.schritt3).toBe('Verfügbarkeit geprüft');
    expect(WARTE.schritt3Fertig(5)).toBe('alle 5 ab sofort verfügbar');
    expect(kopfzeile().titel).toBe('5 passende Pflegekräfte');
    expect(kopfzeile().text).toBe('Sofort verfügbar, persönlich auf Ihre Angaben abgestimmt');
    expect(VERLAUF.weitere()).toBe('+ 3 weitere passende Pflegekräfte');
    expect(VERLAUF.preis).toBe('Ihr persönlicher Preis ist ebenfalls berechnet.');
    expect(VERLAUF.knopf).toBe('Preis & alle 5 Pflegekräfte ansehen\u00A0→');
    expect(VERLAUF.hinweis).toBe('Dafür benötigen wir nur noch Ihre Kontaktdaten.');
    expect(SCHRANKE.kopf).toBe('✓ Ihr Preis ist berechnet');
    expect(SCHRANKE.text).toBe('Damit wir Preis und Profile für Sie speichern und zusenden können, brauchen wir kurz Ihre Kontaktdaten.');
    expect(SCHRANKE.telefonHinweis).toBe('für Rückfragen');
    expect(SCHRANKE.fussnote).toBe('Sofort sichtbar · kostenlos · unverbindlich');
  });

  it('Vorschau und Kontakt tragen DENSELBEN Knopf, und er passt in eine Zeile', () => {
    // Martin 11.09.: der Kunde hat dieses Versprechen geklickt, der nächste
    // Knopf löst es ein. Und 10.09.: „Button nicht über 2 Zeilen".
    expect(SCHRANKE.knopf).toBe(VERLAUF.knopf);
    expect(VERLAUF.knopf.length).toBeLessThanOrEqual(38);
  });

  it('niemand verspricht mehr „keine Werbeanrufe" oder nennt das Ergebnis „Sofortangebot"', () => {
    const alles = JSON.stringify({ WARTE: { ...WARTE }, VERLAUF: { ...VERLAUF }, SCHRANKE, weitere: VERLAUF.weitere(), kopf: kopfzeile() });
    expect(alles).not.toMatch(/Werbeanruf/i);
    expect(alles).not.toMatch(/Sofortangebot/);
  });

  it('parseVorschau lässt nur saubere Karten mit https-Foto durch, maximal drei', () => {
    const ok = { id: 1, vorname: 'Anna', alter: 52, deutschWort: 'Gut', erfahrungJahre: 7, einsaetze: 3, stufe: 'Bewährt', fotoUrl: 'https://x/a.jpg', verfuegbarAb: null };
    const out = parseVorschau({ kraefte: [ok, { ...ok, id: 2, fotoUrl: 'http://x' }, { id: 'x' }, { ...ok, id: 3 }, { ...ok, id: 4 }, { ...ok, id: 5 }] });
    expect(out.map((k) => k.id)).toEqual([1, 3, 4]);
    expect(parseVorschau(null)).toEqual([]);
    expect(parseVorschau({ kraefte: 'nein' })).toEqual([]);
  });
});
