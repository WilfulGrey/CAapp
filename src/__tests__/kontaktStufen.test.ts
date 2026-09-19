import { describe, expect, it } from 'vitest';
import {
  KNOPF_KONTAKT,
  KONTAKT_KEY,
  KONTAKT_TEST,
  kontaktStandard,
  kontaktVariante,
  LOS_KEY,
  LOS_TAGE,
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
  const TAG = 24 * 60 * 60 * 1000;
  // Der eine Test (Registry #80, Martin 19.09.): drei Schritte gegen das alte Formular, im Ablauf alt, Los klebt 30 Tage.
  it('Standard folgt dem Ablauf: alt → Los (solange der Test läuft), preis → eine Seite', () => {
    expect(KONTAKT_TEST.aktiv).toBe(true);
    expect(KONTAKT_TEST.anteilStufen).toBe(0.5);
    expect(kontaktStandard('alt')).toBe('wuerfeln');
    expect(kontaktStandard('preis')).toBe('alt');
    expect(kontaktStandard('alt', { aktiv: false, anteilStufen: 0.5 })).toBe('alt');
  });
  it('würfelt einmal, merkt das Los 30 Tage und zieht danach kein neues', () => {
    const sitzung = speicher(); const los = speicher(); const t0 = 1_800_000_000_000;
    expect(kontaktVariante('', sitzung, 'wuerfeln', () => 0.2, los, t0)).toBe('stufen');
    expect(JSON.parse(los.m.get(LOS_KEY)!)).toEqual({ v: 'stufen', t: t0 });
    expect(sitzung.m.has(KONTAKT_KEY)).toBe(false);
    // 29 Tage später, neue Sitzung, anderes Würfelergebnis — das alte Los gilt
    expect(kontaktVariante('', speicher(), 'wuerfeln', () => 0.9, los, t0 + 29 * TAG)).toBe('stufen');
    // 31 Tage später fällt ein neues Los
    expect(kontaktVariante('', speicher(), 'wuerfeln', () => 0.9, los, t0 + 31 * TAG)).toBe('alt');
    expect(JSON.parse(los.m.get(LOS_KEY)!)).toEqual({ v: 'alt', t: t0 + 31 * TAG });
    // genau 0,5 fällt auf das alte Formular (< anteilStufen = Stufen)
    expect(kontaktVariante('', speicher(), 'wuerfeln', () => 0.5, speicher(), t0)).toBe('alt');
    expect(LOS_TAGE).toBe(30);
  });
  it('Zwang schlägt das Los und klebt je Sitzung; ?kontakt=seite ist die eine Seite', () => {
    const sitzung = speicher(); const los = speicher({ [LOS_KEY]: JSON.stringify({ v: 'stufen', t: 1_800_000_000_000 }) });
    expect(kontaktVariante('?kontakt=seite', sitzung, 'wuerfeln', () => 0.1, los, 1_800_000_000_000)).toBe('alt');
    expect(sitzung.m.get(KONTAKT_KEY)).toBe('alt');
    expect(kontaktVariante('', sitzung, 'wuerfeln', () => 0.1, los, 1_800_000_000_000)).toBe('alt');
    expect(kontaktVariante('?kontakt=stufen', speicher(), 'alt')).toBe('stufen');
    expect(kontaktVariante('?kontakt=alt', speicher(), 'stufen')).toBe('alt');
    expect(kontaktVariante('?kontakt=quatsch', speicher({ [KONTAKT_KEY]: 'stufen' }))).toBe('stufen');
  });
  it('feste Vorgabe wird nie gemerkt; ohne Los-Speicher oder mit kaputtem Los fällt es auf alt', () => {
    const s = speicher();
    expect(kontaktVariante('', s, 'alt')).toBe('alt');
    expect(kontaktVariante('', s, 'stufen')).toBe('stufen');
    expect(s.m.size).toBe(0);
    expect(kontaktVariante('', speicher(), 'wuerfeln', () => 0.1, null)).toBe('alt');
    expect(kontaktVariante('', speicher(), 'wuerfeln', () => 0.1, speicher({ [LOS_KEY]: 'kaputt' }), 1)).toBe('stufen');
    const kaputt = { getItem: () => { throw new Error('gesperrt'); }, setItem: () => { throw new Error('gesperrt'); } };
    expect(kontaktVariante('?kontakt=stufen', kaputt, 'wuerfeln', () => 0.9, kaputt)).toBe('stufen');
    expect(kontaktVariante('', kaputt, 'wuerfeln', () => 0.1, kaputt)).toBe('alt');
  });
  it('Test aus: kontaktStandard liefert alt, das alte Los wird nicht mehr gelesen', () => {
    const aus = { aktiv: false, anteilStufen: 0.5 };
    const los = speicher({ [LOS_KEY]: JSON.stringify({ v: 'stufen', t: 1_800_000_000_000 }) });
    expect(kontaktVariante('', speicher(), kontaktStandard('alt', aus), () => 0.1, los, 1_800_000_000_000, aus)).toBe('alt');
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
