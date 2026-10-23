import { describe, expect, it } from 'vitest';
import {
  ABLAUF_KEY,
  ABLAUF_STANDARD,
  ABLAUF_TEST,
  ablaufVariante,
  euro,
  HEIM_EIGENANTEIL,
  KONTAKT_NACH_PREIS,
  KONTAKT_SEITE,
  MARTA_KARTE,
  PREIS_SEITE,
  WARTE_KURZ_ENDE_MS,
  WARTE_KURZ_MS,
  zuschussNamen,
} from '../../project 3/lib/preis-zuerst';
import { HERO_PUNKTE } from '../../project 3/lib/hero-punkte';

// Registry #77 (Martin 17.09.2026): Preis vor den Kontaktdaten, 50/50 gegen den heutigen Weg.

function speicher(vorbelegt: Record<string, string> = {}) {
  const m = new Map(Object.entries(vorbelegt));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

describe('ablaufVariante', () => {
  // Registry #80 (Martin 19.09.): Preis zuerst ist aus — alle laufen den alten Weg, ?ablauf=preis bleibt als Schalter.
  it('Preis zuerst ist aus: ohne Parameter und ohne Gemerktes läuft jeder alt, nichts wird gemerkt', () => {
    expect(ABLAUF_TEST.aktiv).toBe(false);
    expect(ABLAUF_STANDARD).toBe('alt');
    const s = speicher();
    expect(ablaufVariante('?start=1', s)).toBe('alt');
    expect(ablaufVariante('', s, () => 0.1)).toBe('alt');
    expect(s.m.has(ABLAUF_KEY)).toBe(false);
  });
  it('?ablauf=preis zeigt die Preisseite weiter und klebt je Sitzung; ?ablauf=alt holt zurück', () => {
    const s = speicher();
    expect(ablaufVariante('?start=1&ablauf=preis', s)).toBe('preis');
    expect(s.m.get(ABLAUF_KEY)).toBe('preis');
    expect(ablaufVariante('', s)).toBe('preis');
    expect(ablaufVariante('?ablauf=alt', s)).toBe('alt');
    expect(ablaufVariante('?ablauf=quatsch', speicher())).toBe('alt');
  });
  it('ein späterer Ablauf-Test würfelt nur, wenn er aktiv ist — und merkt das Los', () => {
    const t = { aktiv: true, anteilPreis: 0.5 };
    const s = speicher();
    expect(ablaufVariante('', s, () => 0.2, t)).toBe('preis');
    expect(s.m.get(ABLAUF_KEY)).toBe('preis');
    expect(ablaufVariante('', s, () => 0.9, t)).toBe('preis');
    expect(ablaufVariante('', speicher(), () => 0.7, t)).toBe('alt');
    expect(ablaufVariante('', null, () => 0.2, t)).toBe('alt');
  });
  it('ohne Storage (Safari privat) zählt der Parameter, sonst der Standard', () => {
    const kaputt = { getItem: () => { throw new Error('gesperrt'); }, setItem: () => { throw new Error('gesperrt'); } };
    expect(ablaufVariante('?ablauf=preis', kaputt)).toBe('preis');
    expect(ablaufVariante('', kaputt)).toBe('alt');
    expect(ablaufVariante('', null)).toBe('alt');
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
  it('ein Knopf, ein Versprechen: Martins Wortlaut auf der Preisseite UND als letzter Kontakt-Knopf, eine Zeile', () => {
    expect(PREIS_SEITE.knopf).toBe('Speichern & Pflegekräfte ansehen\u00A0→');
    expect(KONTAKT_NACH_PREIS.knopf).toBe(PREIS_SEITE.knopf);
    expect(PREIS_SEITE.knopf.length).toBeLessThanOrEqual(38);
  });
  it('ruhige Seite (Runde 2): höchstens eine kurze Zeile unter dem Knopf', () => {
    expect(PREIS_SEITE.unterKnopf.length).toBeLessThanOrEqual(34);
  });
  it('hinter dem Preis verspricht der Kontakt nicht noch einmal den Preis', () => {
    expect(KONTAKT_NACH_PREIS.kopf(3050)).toBe('Ihr Preis: 3.050\u00A0€');
    expect(KONTAKT_NACH_PREIS.emailText).not.toMatch(/sehen Sie gleich/);
  });
  it('kein Werbeanruf, kein Sofortangebot, kein „brauchen/benötigen", „ca." statt Tilde', () => {
    const alles = JSON.stringify({ PREIS_SEITE, KONTAKT_NACH_PREIS, KONTAKT_SEITE }) + PREIS_SEITE.zuschussWert(1) + (PREIS_SEITE.heim(1) ?? '');
    expect(alles).not.toMatch(/Werbeanruf/i);
    expect(alles).not.toMatch(/Sofortangebot/);
    expect(alles).not.toMatch(/brauchen|benötigen/);
    expect(alles).not.toMatch(/~/);
  });
  it('Kontaktseite: nimmt den geklickten Knopf auf, ein Knopf mit denselben Worten, kein „Portal", Martins Telefon-Satz', () => {
    expect(KONTAKT_SEITE.frage).toBe('Für wen dürfen wir Ihre Preisberechnung speichern?');
    expect(KONTAKT_SEITE.knopf).toBe(PREIS_SEITE.knopf);
    expect(KONTAKT_SEITE.lohn).toMatch(/5 Pflegekräfte/);
    expect(KONTAKT_SEITE.telefonHinweis).toBe('Nur bei Rückfragen oder wenn etwas dringend geklärt werden muss.');
    expect(JSON.stringify(KONTAKT_SEITE)).not.toMatch(/Portal|Fast geschafft|Nur noch/);
    expect(Object.keys(KONTAKT_SEITE.label)).toEqual(['name', 'email', 'phone']);
  });
  it('unter dem Knopf wie auf der Startseite: dieselben drei Punkte aus EINER Quelle, keine Bewertungszahl im Code', () => {
    expect([...HERO_PUNKTE]).toEqual(['Keine Vermittlungsgebühr', 'Kein Vertrag vor Ihrer Auswahl', 'Täglich kündbar, taggenau abgerechnet']);
    expect(JSON.stringify(PREIS_SEITE)).not.toMatch(/Google|4[.,]\d von 5|126/);
    expect(MARTA_KARTE.frage).toBe('Kann ich Ihnen weiterhelfen?');
    expect(MARTA_KARTE.text).toMatch(/Zuschüssen und Förderung/);
    expect(PREIS_SEITE.marta).toBe(MARTA_KARTE); // dieselbe Karte auf Preis- und Kontaktseite
  });
  it('Warteseite im Ablauf Preis: ca. 3 s statt 10,7 s', () => {
    const gesamt = WARTE_KURZ_MS.reduce((a, b) => a + b, 0) + 300 + WARTE_KURZ_ENDE_MS;
    expect(gesamt).toBeGreaterThanOrEqual(2500);
    expect(gesamt).toBeLessThanOrEqual(4000);
  });
});
