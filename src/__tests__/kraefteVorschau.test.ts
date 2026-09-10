import { describe, expect, it } from 'vitest';
import { bereitText, bruecke, deutschBalken, KNOPF_VOR_KONTAKT, kopfzeile, kraefteVorschauAktiv, kraftFakten, parseVorschau, PORTAL_ANZAHL, SCHRANKE, wuenscheAusAntworten } from '../../project 3/lib/kraefte-vorschau';

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

  it('Faktenzeile wie im Portal: Erfahrung und Einsätze, nie ein Datum', () => {
    expect(kraftFakten({ erfahrungJahre: 7, einsaetze: 8 })).toBe('7 J. Erfahrung · 8 Einsätze über Primundus');
    expect(kraftFakten({ erfahrungJahre: 0, einsaetze: 1 })).toBe('1 Einsatz über Primundus');
    expect(kraftFakten({ erfahrungJahre: 0, einsaetze: 0 })).toBe('bereit für den ersten Einsatz');
  });

  it('Sprachbalken: Grund 1, Mittel 2, Gut 3, sonst keine', () => {
    expect([deutschBalken('Grund'), deutschBalken('Mittel'), deutschBalken('Gut'), deutschBalken(null), deutschBalken('x')]).toEqual([1, 2, 3, 0, 0]);
  });

  it('Roter Faden: 5 wie im Portal, 3 davon vorab, Knopf kündigt Kontaktdaten an', () => {
    expect(PORTAL_ANZAHL).toBe(5);
    expect(kopfzeile().titel).toBe('✓ 5 passende Pflegekräfte gefunden');
    expect(bereitText(3)).toBe('3 davon sehen Sie gleich vorab');
    expect(bruecke(3)).toBe('Das sind 3 Ihrer 5 Pflegekräfte.');
    expect(bruecke(1)).toBe('Das ist 1 Ihrer 5 Pflegekräfte.');
    expect(KNOPF_VOR_KONTAKT.text).toBe('Kontaktdaten eingeben & Angebot ansehen\u00A0→');
    expect(KNOPF_VOR_KONTAKT.hinweis).toBe('Danach sofort: Ihr Monatspreis und alle 5 Pflegekräfte im Portal');
    expect(SCHRANKE.knopf).toBe('Angebot & Pflegekräfte anzeigen →');
  });

  it('parseVorschau lässt nur saubere Karten mit https-Foto durch, maximal drei', () => {
    const ok = { id: 1, vorname: 'Anna', alter: 52, deutschWort: 'Gut', erfahrungJahre: 7, einsaetze: 3, stufe: 'Bewährt', fotoUrl: 'https://x/a.jpg', verfuegbarAb: null };
    const out = parseVorschau({ kraefte: [ok, { ...ok, id: 2, fotoUrl: 'http://x' }, { id: 'x' }, { ...ok, id: 3 }, { ...ok, id: 4 }, { ...ok, id: 5 }] });
    expect(out.map((k) => k.id)).toEqual([1, 3, 4]);
    expect(parseVorschau(null)).toEqual([]);
    expect(parseVorschau({ kraefte: 'nein' })).toEqual([]);
  });
});
