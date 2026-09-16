import { describe, expect, it } from 'vitest';
import {
  KNOPF_KONTAKT,
  KONTAKT_KEY,
  kontaktVariante,
  STUFEN,
  STUFEN_FUSS,
  stufenZaehler,
} from '../../project 3/lib/kontakt-stufen';

// Registry #76 (Martin 16.09.2026): Kontakt in drei Schritten als 50/50 gegen
// das heutige Formular; Lead schon mit E-Mail, Nummer danach.

function speicher(vorbelegt: Record<string, string> = {}) {
  const m = new Map(Object.entries(vorbelegt));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

describe('kontaktVariante', () => {
  it('würfelt 50/50 und merkt sich das Ergebnis je Sitzung', () => {
    const s = speicher();
    expect(kontaktVariante('', s, () => 0.2)).toBe('stufen');
    expect(s.m.get(KONTAKT_KEY)).toBe('stufen');
    // zweiter Aufruf: gemerkt, der Würfel zählt nicht mehr
    expect(kontaktVariante('', s, () => 0.9)).toBe('stufen');
    expect(kontaktVariante('', speicher(), () => 0.7)).toBe('alt');
  });
  it('?kontakt= erzwingt und überschreibt das Gemerkte', () => {
    const s = speicher({ [KONTAKT_KEY]: 'alt' });
    expect(kontaktVariante('?kontakt=stufen&start=1', s)).toBe('stufen');
    expect(s.m.get(KONTAKT_KEY)).toBe('stufen');
    expect(kontaktVariante('?kontakt=alt', s)).toBe('alt');
    expect(kontaktVariante('?kontakt=quatsch', speicher({ [KONTAKT_KEY]: 'stufen' }))).toBe('stufen');
  });
  it('ohne Storage (Safari privat) zählt nur der Parameter, sonst alt', () => {
    const kaputt = { getItem: () => { throw new Error('gesperrt'); }, setItem: () => { throw new Error('gesperrt'); } };
    expect(kontaktVariante('?kontakt=stufen', kaputt)).toBe('stufen');
    expect(kontaktVariante('', kaputt, () => 0.1)).toBe('alt');
    expect(kontaktVariante('', null, () => 0.1)).toBe('stufen');
  });
});

describe('Texte der drei Schritte', () => {
  it('letzter Knopf = derselbe wie im heutigen Formular, passt in eine Zeile', () => {
    expect(STUFEN.telefon.knopf).toBe(KNOPF_KONTAKT);
    expect(KNOPF_KONTAKT).toBe('Preis & Pflegekräfte ansehen →');
    expect(KNOPF_KONTAKT.length).toBeLessThanOrEqual(38);
  });
  it('kein Werbeanruf, kein Sofortangebot, kein „brauchen wir"', () => {
    const alles = JSON.stringify({ STUFEN, STUFEN_FUSS });
    expect(alles).not.toMatch(/Werbeanruf/i);
    expect(alles).not.toMatch(/Sofortangebot/);
    expect(alles).not.toMatch(/brauchen/);
  });
  it('Zähler und Reihenfolge', () => {
    expect(stufenZaehler('name')).toBe('Angabe 1 von 3');
    expect(stufenZaehler('telefon')).toBe('Angabe 3 von 3');
    expect(STUFEN.name.text).toContain('noch 3 kurze Angaben');
    expect(STUFEN.telefon.ohne).toBe('Ohne Rückrufnummer weiter');
  });
});
