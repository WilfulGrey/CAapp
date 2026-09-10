import { describe, expect, it } from 'vitest';
import { deutschBalken, KNOPF_VOR_KONTAKT, kopfzeile, kraefteVorschauAktiv, kraftFakten, parseVorschau, SCHRANKE, wuenscheAusAntworten } from '../../project 3/lib/kraefte-vorschau';

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

  it('Roter Faden: Kopfzeile zählt die Karten, Schranke kündigt Kontaktdaten und Preis in dieser Reihenfolge an', () => {
    expect(kopfzeile(3).titel).toBe('✓ 3 passende Pflegekräfte gefunden');
    expect(kopfzeile(1).titel).toBe('✓ 1 passende Pflegekraft gefunden');
    expect(KNOPF_VOR_KONTAKT.text).toBe('Preis & Profile freischalten →');
    expect(KNOPF_VOR_KONTAKT.hinweis).toMatch(/^Nächster Schritt: Name, E-Mail und Telefon/);
    expect(SCHRANKE.titel).toBe('Fast geschafft: Ihre Kontaktdaten');
    expect(SCHRANKE.knopf).toBe('Jetzt freischalten →');
  });

  it('parseVorschau lässt nur saubere Karten mit https-Foto durch, maximal drei', () => {
    const ok = { id: 1, vorname: 'Anna', alter: 52, deutschWort: 'Gut', erfahrungJahre: 7, einsaetze: 3, stufe: 'Bewährt', fotoUrl: 'https://x/a.jpg', verfuegbarAb: null };
    const out = parseVorschau({ kraefte: [ok, { ...ok, id: 2, fotoUrl: 'http://x' }, { id: 'x' }, { ...ok, id: 3 }, { ...ok, id: 4 }, { ...ok, id: 5 }] });
    expect(out.map((k) => k.id)).toEqual([1, 3, 4]);
    expect(parseVorschau(null)).toEqual([]);
    expect(parseVorschau({ kraefte: 'nein' })).toEqual([]);
  });
});
