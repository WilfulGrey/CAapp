import { describe, expect, it } from 'vitest';
import {
  KNOPF_KONTAKT,
  KONTAKT_KEY,
  kontaktStandard,
  kontaktVariante,
  STUFEN,
} from '../../project 3/lib/kontakt-stufen';
import { SCHRANKE } from '../../project 3/lib/kraefte-vorschau';

// Registry #76 (Martin 16.09.2026): Kontakt in drei Schritten als 50/50 gegen
// das heutige Formular; Lead schon mit E-Mail, Nummer danach.

function speicher(vorbelegt: Record<string, string> = {}) {
  const m = new Map(Object.entries(vorbelegt));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

describe('kontaktVariante', () => {
  it('würfelt nicht mehr selbst: ohne Parameter und ohne Gemerktes gilt der Standard des Ablaufs (Registry #77)', () => {
    const s = speicher();
    expect(kontaktVariante('', s)).toBe('alt');
    expect(kontaktVariante('', s, 'stufen')).toBe('stufen');
    // der Standard wird NICHT gemerkt — er folgt dem Ablauf
    expect(s.m.has(KONTAKT_KEY)).toBe(false);
  });
  it('?kontakt= erzwingt, klebt je Sitzung und schlägt den Standard', () => {
    const s = speicher({ [KONTAKT_KEY]: 'alt' });
    expect(kontaktVariante('?kontakt=stufen&start=1', s)).toBe('stufen');
    expect(s.m.get(KONTAKT_KEY)).toBe('stufen');
    expect(kontaktVariante('', s, 'alt')).toBe('stufen');
    expect(kontaktVariante('?kontakt=alt', s, 'stufen')).toBe('alt');
    expect(kontaktVariante('?kontakt=quatsch', speicher({ [KONTAKT_KEY]: 'stufen' }))).toBe('stufen');
  });
  it('ohne Storage (Safari privat) zählt der Parameter, sonst der Standard', () => {
    const kaputt = { getItem: () => { throw new Error('gesperrt'); }, setItem: () => { throw new Error('gesperrt'); } };
    expect(kontaktVariante('?kontakt=stufen', kaputt)).toBe('stufen');
    expect(kontaktVariante('', kaputt)).toBe('alt');
    expect(kontaktVariante('', kaputt, 'stufen')).toBe('stufen');
    expect(kontaktVariante('', null, 'stufen')).toBe('stufen');
  });

  // Registry #80 (Martin 18.09.2026): der Ablauf gibt die Kontaktform vor — ohne Preis drei Schritte,
  // hinter der Preisseite die eine Seite. Gewürfelt wird beim Ablauf, nicht hier.
  it('Standard folgt dem Ablauf: alt → drei Schritte, preis → eine Seite', () => {
    expect(kontaktStandard('alt')).toBe('stufen');
    expect(kontaktStandard('preis')).toBe('alt');
    const s = speicher();
    expect(kontaktVariante('', s, kontaktStandard('alt'))).toBe('stufen');
    expect(s.m.has(KONTAKT_KEY)).toBe(false);
  });
  it('?kontakt=seite ist die eine Seite und klebt wie ?kontakt=alt', () => {
    const s = speicher();
    expect(kontaktVariante('?kontakt=seite', s, 'stufen')).toBe('alt');
    expect(s.m.get(KONTAKT_KEY)).toBe('alt');
    expect(kontaktVariante('', s, 'stufen')).toBe('alt');
  });
});

describe('Texte der drei Schritte', () => {
  it('Kontrolle behält den Knopf des Trunks; letzter Knopf der Stufen = Kräfte-Vorschau („alle 5“), eine Zeile', () => {
    expect(KNOPF_KONTAKT).toBe('Preis & Pflegekräfte ansehen →');
    expect(STUFEN.telefon.knopf).toBe(SCHRANKE.knopf);
    expect(STUFEN.telefon.knopf).toContain('alle 5 Pflegekräfte');
    expect(STUFEN.telefon.knopf.length).toBeLessThanOrEqual(38);
  });
  it('Runde 2/3 (Martin 16.09.): kein Drei-Schritte-Hinweis, kein „schicken“ beim Sofortpreis, keine falsche „nächste Seite“, Mail-Kopie bestätigt', () => {
    expect(STUFEN.name.text).toBe('');
    expect(STUFEN.email.frage).not.toMatch(/schick|send/i);
    expect(STUFEN.email.text).toMatch(/^Ihren Preis sehen Sie gleich/);
    expect(STUFEN.email.text).toMatch(/per E-Mail/);
    expect(STUFEN.email.text).not.toMatch(/nächsten Seite/);
    expect(STUFEN.telefon.frage).toMatch(/Rückfragen zu Ihrer Betreuung\?$/);
    expect(STUFEN.telefon.text).toBe('');
    expect(STUFEN.telefon.bestaetigung).toMatch(/Kopie .* per E-Mail unterwegs an$/);
    expect(STUFEN.telefon.bestaetigung).not.toMatch(/erhalten/);
  });
  it('kein Werbeanruf, kein Sofortangebot, kein „brauchen wir"', () => {
    const alles = JSON.stringify(STUFEN);
    expect(alles).not.toMatch(/Werbeanruf/i);
    expect(alles).not.toMatch(/Sofortangebot/);
    expect(alles).not.toMatch(/brauchen/);
  });
  it('grauer Weg ohne Nummer', () => {
    expect(STUFEN.telefon.ohne).toBe('Ohne Rückrufnummer weiter');
  });
});
