import { describe, expect, it } from 'vitest';
import {
  ABLAUF_KEY,
  ablaufVariante,
  euro,
  HEIM_EIGENANTEIL,
  KONTAKT_NACH_PREIS,
  PREIS_SEITE,
  WARTE_KURZ_ENDE_MS,
  WARTE_KURZ_MS,
  zuschussNamen,
} from '../../project 3/lib/preis-zuerst';

// Registry #77 (Martin 17.09.2026): Preis vor den Kontaktdaten, 50/50 gegen den heutigen Weg.

function speicher(vorbelegt: Record<string, string> = {}) {
  const m = new Map(Object.entries(vorbelegt));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

describe('ablaufVariante', () => {
  it('würfelt 50/50 und merkt sich das Ergebnis je Sitzung', () => {
    const s = speicher();
    expect(ablaufVariante('', s, () => 0.2)).toBe('preis');
    expect(s.m.get(ABLAUF_KEY)).toBe('preis');
    expect(ablaufVariante('', s, () => 0.9)).toBe('preis');
    expect(ablaufVariante('', speicher(), () => 0.7)).toBe('alt');
  });
  it('?ablauf= erzwingt und überschreibt das Gemerkte', () => {
    const s = speicher({ [ABLAUF_KEY]: 'alt' });
    expect(ablaufVariante('?start=1&ablauf=preis', s)).toBe('preis');
    expect(s.m.get(ABLAUF_KEY)).toBe('preis');
    expect(ablaufVariante('?ablauf=alt', s)).toBe('alt');
    expect(ablaufVariante('?ablauf=quatsch', speicher({ [ABLAUF_KEY]: 'preis' }))).toBe('preis');
  });
  it('ohne Storage (Safari privat) zählt nur der Parameter, sonst der heutige Weg', () => {
    const kaputt = { getItem: () => { throw new Error('gesperrt'); }, setItem: () => { throw new Error('gesperrt'); } };
    expect(ablaufVariante('?ablauf=preis', kaputt)).toBe('preis');
    expect(ablaufVariante('', kaputt, () => 0.1)).toBe('alt');
    expect(ablaufVariante('', null, () => 0.1)).toBe('preis');
  });
});

describe('Zahlen der Preisseite', () => {
  it('Euro ohne Nachkommastellen, deutsches Tausenderzeichen', () => {
    expect(euro(3050)).toBe('3.050\u00A0€');
    expect(euro(1621.75)).toBe('1.622\u00A0€');
    expect(euro(950)).toBe('950\u00A0€');
  });
  it('Heimvergleich nur, wenn zuhause günstiger ist — mit dem vdek-Wert des Portals', () => {
    expect(HEIM_EIGENANTEIL).toBe(3364);
    expect(PREIS_SEITE.heim(1621.75)).toBe('Zum Vergleich: Im Pflegeheim zahlen Sie im ersten Jahr durchschnittlich 3.364\u00A0€ im Monat selbst – zuhause rund 1.742\u00A0€ weniger.');
    expect(PREIS_SEITE.heim(3364)).toBeNull();
    expect(PREIS_SEITE.heim(3900)).toBeNull();
  });
  it('Zuschuss-Namen: nur Posten der Kalkulation, Kurznamen, „und" vor dem letzten', () => {
    const items = [
      { name: 'pflegegeld', label: 'Pflegegeld', in_kalkulation: true },
      { name: 'entlastungsbudget_neu', label: 'Entlastungsbudget (3.539 Euro/Jahr ab Pflegegrad 2)', in_kalkulation: true },
      { name: 'verhinderungspflege', label: 'Verhinderungspflege', in_kalkulation: false },
      { name: 'steuervorteil', label: 'Steuerliche Absetzbarkeit', in_kalkulation: true },
    ];
    expect(zuschussNamen(items)).toBe('Pflegegeld, Entlastungsbudget und Steuervorteil');
    expect(zuschussNamen([items[3]])).toBe('Steuervorteil');
    expect(zuschussNamen([])).toBe('');
    expect(PREIS_SEITE.zuschussLabel).toBe('Nach Zuschüssen');
    expect(PREIS_SEITE.zuschussWert(1621.75)).toBe('ca. 1.622\u00A0€');
  });
});

describe('Texte', () => {
  it('ein Knopf, ein Versprechen: Preisseite und letzter Kontakt-Knopf tragen dieselben Worte, kurz genug für Luft im Knopf', () => {
    expect(PREIS_SEITE.knopf).toBe('Alle 5 Pflegekräfte ansehen\u00A0→');
    expect(KONTAKT_NACH_PREIS.knopf).toBe(PREIS_SEITE.knopf);
    expect(PREIS_SEITE.knopf.length).toBeLessThanOrEqual(30);
  });
  it('ruhige Seite (Runde 2): höchstens eine Zeile unter dem Knopf, fünf gleichförmige Konditionen', () => {
    expect(PREIS_SEITE.unterKnopf.length).toBeLessThanOrEqual(34);
    expect(PREIS_SEITE.haken).toHaveLength(5);
  });
  it('hinter dem Preis verspricht der Kontakt nicht noch einmal den Preis', () => {
    expect(KONTAKT_NACH_PREIS.kopf(3050)).toBe('Ihr Preis: 3.050\u00A0€');
    expect(KONTAKT_NACH_PREIS.emailText).not.toMatch(/sehen Sie gleich/);
    expect(KONTAKT_NACH_PREIS.knopf).not.toMatch(/Preis/);
    expect(KONTAKT_NACH_PREIS.textAlt).not.toMatch(/Preis sehen/);
  });
  it('kein Werbeanruf, kein Sofortangebot, kein „brauchen/benötigen", „ca." statt Tilde', () => {
    const alles = JSON.stringify({ PREIS_SEITE, KONTAKT_NACH_PREIS }) + PREIS_SEITE.zuschussWert(1) + (PREIS_SEITE.heim(1) ?? '');
    expect(alles).not.toMatch(/Werbeanruf/i);
    expect(alles).not.toMatch(/Sofortangebot/);
    expect(alles).not.toMatch(/brauchen|benötigen/);
    expect(alles).not.toMatch(/~/);
  });
  it('Warteseite im Ablauf Preis: ca. 3 s statt 10,7 s', () => {
    const gesamt = WARTE_KURZ_MS.reduce((a, b) => a + b, 0) + 300 + WARTE_KURZ_ENDE_MS;
    expect(gesamt).toBeGreaterThanOrEqual(2500);
    expect(gesamt).toBeLessThanOrEqual(4000);
  });
});
