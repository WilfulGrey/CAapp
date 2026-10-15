// Gebucht-Seite neu (PROTOTYP 15.10.2026): Wortlaut je Zustand gegen texte_final.md und die Kopie aus der Anreise-Mail.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  GEBUCHT_TEXTE as T,
  VERKEHRSMITTEL,
  anreiseDatum,
  anreiseZeit,
  h1Tag,
  statusTexte,
  vertragDatum,
} from '../lib/gebuchtTexte';
import { gebuchtStand, type EinsatzZeile, type GebuchtEingabe } from '../lib/gebuchtStand';

const HEUTE = '2026-10-15';
const nb = (t: string | null) => (t ?? '').replace(/ /g, ' ');

function stand(over: Partial<GebuchtEingabe>) {
  return gebuchtStand({
    heute: HEUTE,
    einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-10-19', abreise: '2026-11-29' },
    anreise: null,
    vertrag: 'unterschrieben',
    ...over,
  });
}
const DATENSATZ = { datum: '2026-10-19', von: '14:00', bis: '16:00', verkehrsmittel: 'Minibus', strasse: 'Musterstraße 1', plzOrt: '12345 Musterstadt' };
const folge = (over: Partial<EinsatzZeile>): EinsatzZeile => ({ id: 'f', status: 'gebucht', anreise: '2026-10-29', abreise: '2026-12-10', pflegekraft: 'Anna B.', bewerbungen: null, ...over });

describe('Kopie aus der Anreise-Mail (Registry #119) — gleiche Ausgabe', () => {
  const quelle = readFileSync('project 3/supabase/functions/send-scheduled-emails/kundenMails.ts', 'utf8');
  const block = (name: string) => {
    const start = quelle.indexOf(name);
    expect(start, name).toBeGreaterThan(-1);
    return quelle.slice(start, quelle.indexOf('\n}', start) + 2);
  };
  // Quelltext der Mail ohne Typen/Anführungszeichen-Stil gegen die Kopie: Die Edge Function kann nichts aus src/ laden.
  const norm = (t: string) => t.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
  it('VERKEHRSMITTEL, anreiseDatum und anreiseZeit sind zeichengleich mit kundenMails.ts', () => {
    const kopie = readFileSync('src/lib/gebuchtTexte.ts', 'utf8');
    for (const name of ['export const VERKEHRSMITTEL', 'export function anreiseDatum', 'export function anreiseZeit']) {
      const i = kopie.indexOf(name);
      expect(norm(kopie.slice(i, kopie.indexOf('\n}', i) + 2))).toBe(norm(block(name)));
    }
  });
  it('Ausgaben wie in der Mail', () => {
    expect(anreiseDatum('2026-10-12')).toBe('Montag, 12.10.2026');
    expect(anreiseZeit('14:00', '18:00')).toBe('14–18 Uhr');
    expect(anreiseZeit('14:30', null)).toBe('ab 14:30 Uhr');
    expect(anreiseZeit('14:00', '14:00')).toBe('14 Uhr');
    expect(VERKEHRSMITTEL['Sindbad']).toBe('Reisebus (Sindbad)');
    expect(VERKEHRSMITTEL['Own transport']).toBe('Eigene Anreise');
  });
  it('H1-Datum ohne Jahr, Wochentag geschützt angehängt', () => {
    expect(nb(h1Tag('2026-10-19'))).toBe('Montag, 19.10.');
    expect(h1Tag('2026-10-19')).toContain(' ');
  });
});

describe('statusTexte: H1 und Satz je Zustand (texte_final.md, Abschnitt 1)', () => {
  const st = (s: ReturnType<typeof stand>, over: Partial<Parameters<typeof statusTexte>[0]> = {}) => {
    const t = statusTexte({ stand: s, heute: HEUTE, pflegekraft: 'Maria K.', folge: null, ...over });
    return { h1: nb(t.h1), satz: nb(t.satz) };
  };
  it('VO: T1 „Buchung bestätigt" (wie Mail C) + live Satz, mit und ohne Namen gleich, kein Pronomen', () => {
    const vo = { h1: 'Buchung bestätigt', satz: 'Bitte schließen Sie noch Ihren Betreuungsvertrag ab.' };
    expect(st(stand({ vertrag: 'offen' }))).toEqual(vo);
    expect(st(stand({ vertrag: 'offen' }), { pflegekraft: null })).toEqual(vo);
    expect(st(stand({ vertrag: 'offen' }), { pflegekraft: 'Pavel K.' })).toEqual(vo);
    expect(vo.satz).not.toMatch(/ist (sie|er) gebucht|Letzter Schritt|eingeplant/);
  });
  it('VV und AF: „Anreise am …" mit den freigegebenen Sätzen', () => {
    expect(st(stand({ vertrag: 'vorbereitung' }))).toEqual({ h1: 'Anreise am Montag, 19.10.', satz: 'Wir bereiten Ihre Vertragsdokumente vor. Marta Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen.' });
    expect(st(stand({}))).toEqual({ h1: 'Anreise am Montag, 19.10.', satz: 'Ihr Vertrag ist unterschrieben. Marta Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu besprechen.' });
  });
  it('AD und AT', () => {
    expect(st(stand({ anreise: DATENSATZ }))).toEqual({ h1: 'Maria K. reist am Montag, 19.10. an', satz: 'Wir haben die Anreise Ihrer Pflegekraft organisiert.' });
    expect(st(stand({ anreise: DATENSATZ }), { pflegekraft: null }).h1).toBe('Ihre Pflegekraft reist am Montag, 19.10. an');
    const at = stand({ einsatz: { id: 'j1', status: 'gebucht', anreise: HEUTE, abreise: '2026-11-29' }, anreise: { ...DATENSATZ, datum: HEUTE } });
    expect(st(at)).toEqual({ h1: 'Maria K. reist heute an', satz: 'Wir haben die Anreise Ihrer Pflegekraft organisiert.' });
    const atOhne = stand({ einsatz: { id: 'j1', status: 'gebucht', anreise: HEUTE, abreise: '2026-11-29' } });
    expect(st(atOhne)).toEqual({ h1: 'Anreise heute geplant', satz: '' });
  });
  it('L: „Gebuchter Einsatz bis …", kein Satz', () => {
    expect(st(stand({ einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-10-01', abreise: '2026-11-29' } }))).toEqual({ h1: 'Gebuchter Einsatz bis Sonntag, 29.11.', satz: '' });
  });
  const eb = stand({ einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-09-01', abreise: '2026-10-26' } });
  it('EB, Folgekraft gebucht: zwei Daten aus zwei Quellen (Befund 2)', () => {
    expect(st(eb, { folge: folge({}) })).toEqual({
      h1: 'Anna B. übernimmt ab Donnerstag, 29.10.',
      satz: 'Anna B. ist Ihre nächste Pflegekraft. Der Einsatz von Maria K. endet am Montag, 26.10.',
    });
    expect(st(eb, { folge: folge({ anreise: HEUTE }) }).h1).toBe('Anna B. übernimmt ab heute');
    // T2: ohne Namen der jetzigen Pflegekraft Genitiv mit „jetzigen" (nicht „von Ihrer Pflegekraft").
    expect(st(eb, { folge: folge({}), pflegekraft: null }).satz).toBe('Anna B. ist Ihre nächste Pflegekraft. Der Einsatz Ihrer jetzigen Pflegekraft endet am Montag, 26.10.');
  });
  it('EB, Folgekraft gebucht ohne Namen: Rückfall', () => {
    expect(st(eb, { folge: folge({ pflegekraft: null }) })).toEqual({ h1: 'Einsatz endet am Montag, 26.10.', satz: 'Ihre nächste Pflegekraft übernimmt ab Donnerstag, 29.10.' });
  });
  it('EB, Folgeeinsatz geplant / keiner', () => {
    expect(st(eb, { folge: folge({ status: 'geplant', pflegekraft: null }) })).toEqual({ h1: 'Einsatz endet am Montag, 26.10.', satz: 'Für die Zeit danach suchen wir eine Pflegekraft für Sie.' });
    expect(st(eb)).toEqual({ h1: 'Einsatz endet am Montag, 26.10.', satz: '' });
    const ebHeute = stand({ einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-09-01', abreise: HEUTE } });
    expect(st(ebHeute).h1).toBe('Einsatz endet heute');
  });
  it('B: live Wortlaut', () => {
    const b = stand({ einsatz: { id: 'j1', status: 'abgeschlossen', anreise: '2026-05-19', abreise: '2026-07-19' } });
    expect(st(b)).toEqual({ h1: 'Einsatz beendet', satz: 'Der Einsatz vom 19.05.2026 bis 19.07.2026 ist abgeschlossen. Ihre Unterlagen bleiben jederzeit zugänglich.' });
  });
  it('ohne belegtes Datum keine H1 mit Datum', () => {
    expect(statusTexte({ stand: stand({ einsatz: { id: 'j1', status: 'gebucht', anreise: null, abreise: null } }), heute: HEUTE, pflegekraft: 'Maria K.', folge: null }).h1).toBeNull();
  });
});

describe('vertragDatum: Berliner Tag (Registry #20), nie der UTC-Tag', () => {
  it('ISO-Zeitstempel nach 22/23 Uhr UTC ist in Berlin schon der nächste Tag', () => {
    expect(vertragDatum('2026-10-12T22:30:00Z')).toBe('13.10.2026'); // Sommerzeit, 00:30 in Berlin
    expect(vertragDatum('2026-10-12T21:59:00Z')).toBe('12.10.2026');
    expect(vertragDatum('2026-01-05T23:30:00+00:00')).toBe('06.01.2026'); // Winterzeit
  });
  it('contract_snapshot.datum kommt schon als „dd.mm.yyyy" und bleibt; Kalendertag bleibt; Unlesbares ⇒ null', () => {
    expect(vertragDatum('12.10.2026')).toBe('12.10.2026');
    expect(vertragDatum('2026-10-12')).toBe('12.10.2026');
    expect(vertragDatum('quatsch')).toBeNull();
    expect(vertragDatum('')).toBeNull();
    expect(vertragDatum(null)).toBeNull();
  });
});

describe('Wortlaut-Wächter', () => {
  const alle = Object.values(T).map((t) => (typeof t === 'function' ? (t as (...a: string[]) => string)('X', 'Y', 'Z') : t)).join('\n');
  it('nichts, was die Spezifikation streicht oder ohne Beleg behauptet', () => {
    expect(alle).not.toMatch(/ kommt |läuft bis|Es fehlt|Abreise geplant am|Vielen Dank —|\bFolgt\b|Zur Hälfte|ist angekommen|ist bei Ihnen|im Einsatz ist/);
  });
  it('freigegebene und live Texte Zeichen für Zeichen', () => {
    expect(nb(T.afSatz)).toBe('Ihr Vertrag ist unterschrieben. Marta Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu besprechen.');
    expect(T.vertragKnopf).toBe('Vertrag jetzt abschließen →');
    expect(T.reisekosten).toBe('Anreise und Abreise pauschal je 125 €.');
    expect(T.kostenAuf).toBe('Alle Kosten im Überblick');
    expect(T.kostenZu).toBe('Weniger anzeigen');
    expect(T.sucheOhneBewerbung).toBe('Suchlauf läuft — noch keine Bewerbungen');
    expect(T.kopieMail).toBe('Eine Kopie haben Sie auch per E\u2011Mail erhalten.');
    expect(T.kontaktA).toBe('Ihr Kontakt zur Agentur');
    expect(T.ihrePflegekraft).toBe('Ihre Pflegekraft');
    expect(T.voSatz).toBe('Bitte schließen Sie noch Ihren Betreuungsvertrag ab.');
  });
  it('Nachtrag 15.10. (T1–T6): Endwortlaut Zeichen für Zeichen', () => {
    expect(T.voH1).toBe('Buchung bestätigt');
    expect(T.ebFolgeSatzOhneJetzigenNamen('Anna B.', 'Montag, 26.10.')).toBe('Anna B. ist Ihre nächste Pflegekraft. Der Einsatz Ihrer jetzigen Pflegekraft endet am Montag, 26.10.');
    expect(T.kostenQuelle('12.10.2026')).toBe('Laut Ihrem Vertrag vom 12.10.2026');
    expect(T.kostenGrundlage).toBe('Grundlage: Ihr Tagessatz und die angegebenen Daten für Anreise und Abreise.');
    expect(T.dokumentFrueher).toBe('Dienstleistungsvertrag zur früheren Buchung');
    expect(T.unterschriebenMitBeginn('28.07.2026', '01.08.2026')).toBe('unterschrieben am 28.07.2026, Vertragsbeginn 01.08.2026');
    // T5: geschütztes Leerzeichen zwischen Zahl und Wort und vor „›"
    expect(T.folgeHinweis(1)).toBe('Folgeeinsatz: 1\u00a0Bewerbung ansehen\u00a0›');
    expect(T.folgeHinweis(2)).toBe('Folgeeinsatz: 2\u00a0Bewerbungen ansehen\u00a0›');
    expect(T.folgeHinweisSprung(1)).toBe('1\u00a0Bewerbung für Ihren Folgeeinsatz\u00a0›');
    expect(T.folgeHinweisSprung(2)).toBe('2\u00a0Bewerbungen für Ihren Folgeeinsatz\u00a0›');
    // T6: Zeichen
    expect(T.warteSatz2).toBe('Dann bekommen Sie auch eine E\u2011Mail.');
    expect(T.einladen).toBe('Pflegekräfte einladen\u00a0›');
    expect(T.alleEinsaetze).toBe('Alle meine Einsätze\u00a0›');
  });
  it('jedes „E-Mail" mit geschütztem Bindestrich, jedes „›" hängt per NBSP am Wort; keine Gedankenstriche in NEU-Texten', () => {
    expect(alle).not.toMatch(/E-Mail/);
    expect(alle).not.toMatch(/ ›/);
    const neu = [T.voH1, T.voSatz, T.ebFolgeSatzOhneJetzigenNamen('X', 'Y'), T.kostenGrundlage, T.dokumentFrueher,
      T.unterschriebenMitBeginn('X', 'Y'), T.folgeHinweis(2), T.folgeHinweisSprung(2), T.kartenAria('X'), T.kartenAriaOhneName];
    for (const t of neu) expect(t, t).not.toMatch(/[—–]|~/);
  });
  it('live Satz „Bitte schließen Sie noch Ihren Betreuungsvertrag ab." steht wirklich im live BookedScreen', () => {
    expect(readFileSync('src/components/portal/BookedScreen.tsx', 'utf8')).toContain(T.voSatz);
  });
  it('live Texte stehen wirklich im Trunk-Code', () => {
    const faq = readFileSync('src/components/portal/FaqListe.tsx', 'utf8');
    expect(faq).toContain(T.reisekosten);
    const einstieg = readFileSync('src/components/portal/EinstiegVorSpeichern.tsx', 'utf8');
    expect(einstieg).toContain(T.kostenAuf);
    expect(einstieg).toContain(T.kostenZu);
    const uebersicht = readFileSync('src/pages/JobsOverviewPage.tsx', 'utf8');
    expect(uebersicht).toContain(T.sucheOhneBewerbung);
    const mail = readFileSync('project 3/supabase/functions/send-scheduled-emails/kundenMails.ts', 'utf8');
    expect(mail).toContain('Hierhin wird ${vorname} gebracht.');
    expect(mail).toContain('Hierhin reist ${vorname} selbst an.');
  });
});
