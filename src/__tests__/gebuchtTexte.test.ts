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
  it('VO', () => {
    expect(st(stand({ vertrag: 'offen' }))).toEqual({ h1: 'Letzter Schritt: Ihr Vertrag', satz: 'Wir haben Maria K. für Sie eingeplant. Mit Ihrer Unterschrift ist sie gebucht.' });
    expect(st(stand({ vertrag: 'offen' }), { pflegekraft: null }).satz).toBe('Wir haben Ihre Pflegekraft für Sie eingeplant. Mit Ihrer Unterschrift ist sie gebucht.');
    expect(st(stand({ vertrag: 'offen' }), { pflegekraft: 'Pavel K.', pflegekraftMaennlich: true }).satz).toBe('Wir haben Pavel K. für Sie eingeplant. Mit Ihrer Unterschrift ist er gebucht.');
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
    expect(st(eb, { folge: folge({}), pflegekraft: null }).satz).toBe('Anna B. ist Ihre nächste Pflegekraft. Der Einsatz von Ihrer Pflegekraft endet am Montag, 26.10.');
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
    expect(T.kopieMail).toBe('Eine Kopie haben Sie auch per E-Mail erhalten.');
    expect(T.kontaktA).toBe('Ihr Kontakt zur Agentur');
    expect(T.ihrePflegekraft).toBe('Ihre Pflegekraft');
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
