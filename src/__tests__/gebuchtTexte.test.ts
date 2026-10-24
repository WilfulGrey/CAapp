// Gebucht-Seite neu (PROTOTYP 15.10.2026): Wortlaut gegen texte_final.md, Nachtrag 3, und die Kopie aus der Anreise-Mail.
// „frei" = im freigegebenen Bild aufgaben_390.png (Martin 15.10. abends: „finde ich super"), Zeichen für Zeichen.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  GEBUCHT_TEXTE as T,
  VERKEHRSMITTEL,
  anreiseDatum,
  anreiseZeit,
  einsatzTag,
  nameFest,
} from '../lib/gebuchtTexte';

const NBSP = ' ';
const nb = (t: string) => t.replace(/ /g, ' ');

/** Alle Texte als Liste (Funktionen mit Beispielwerten aufgerufen). */
function alleTexte(): string[] {
  const aus: string[] = [];
  const sammle = (wert: unknown) => {
    if (typeof wert === 'string') aus.push(wert);
    else if (typeof wert === 'function') aus.push((wert as (a: string) => string)('X'));
    else if (wert && typeof wert === 'object') Object.values(wert).forEach(sammle);
  };
  sammle(T);
  aus.push(T.bewerbungenAnsehen(1), T.bewerbungenAnsehen(2), T.bewerbungen(1), T.bewerbungen(2));
  return aus;
}

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
    expect(anreiseZeit('14:00', '16:00')).toBe('14–16 Uhr');
    expect(anreiseZeit('14:30', null)).toBe('ab 14:30 Uhr');
    expect(anreiseZeit('14:00', null)).toBe('ab 14 Uhr');
    expect(anreiseZeit('14:00', '14:00')).toBe('14 Uhr');
    expect(VERKEHRSMITTEL['Minibus']).toBe('Minibus');
    expect(VERKEHRSMITTEL['Sindbad']).toBe('Reisebus (Sindbad)');
    expect(VERKEHRSMITTEL['Own transport']).toBe('Eigene Anreise');
  });
});

describe('einsatzTag: Teile der Spalten und Text des Titels', () => {
  it('ohne Jahr: „Montag" / „19.10." / Text mit geschütztem Leerzeichen', () => {
    expect(einsatzTag('2026-10-19', false)).toEqual({ iso: '2026-10-19', wochentag: 'Montag', datum: '19.10.', jahr: null, text: `Montag,${NBSP}19.10.` });
  });
  it('mit Jahr: Jahr klein hinter dem Datum, im Text direkt angehängt', () => {
    expect(einsatzTag('2027-02-24', true)).toMatchObject({ wochentag: 'Mittwoch', datum: '24.02.', jahr: '2027', text: `Mittwoch,${NBSP}24.02.2027` });
  });
  it('nameFest: der Name bricht nie in sich um', () => {
    expect(nameFest(' Anna  B. ')).toBe(`Anna${NBSP}B.`);
  });
});

describe('Wortlaut Nachtrag 3, Zeichen für Zeichen', () => {
  it('frei 15.10. abends (Bild aufgaben_390.png)', () => {
    expect(T.ihrEinsatz).toBe('Ihr Einsatz');
    expect(T.etikett.gebucht).toBe('Gebucht');
    expect(T.ihrePflegekraft).toBe('Ihre Pflegekraft');
    expect(T.anreise).toBe('Anreise');
    expect(T.abreise).toBe('Abreise');
    expect(T.geplant).toBe('geplant');
    expect(T.tagessatz).toBe('Tagessatz');
    expect(T.proTag).toBe(`${NBSP}/${NBSP}Tag`);
    expect(T.kostenuebersicht).toBe('Kostenübersicht');
    expect(T.soGehtEsWeiter).toBe('So geht es weiter');
    expect(T.vertragUnterschrieben).toBe('Vertrag unterschrieben');
    expect(T.vertragAm('12.10.2026')).toBe(`am${NBSP}12.10.2026`);
    expect(T.trenner).toBe(`${NBSP}· `);
    expect(T.vertragPdf).toBe('Vertrag als PDF');
    expect(T.anreiseOrganisiert).toBe('Anreise organisiert');
    expect(T.ankunft).toBe('Ankunft');
    expect(T.verkehrsmittel).toBe('Verkehrsmittel');
    expect(T.adresse).toBe('Adresse');
    expect(T.hierhinGebracht('Maria')).toBe('Hierhin wird Maria gebracht.');
    expect(T.stimmtNicht).toBe('Stimmt eine Angabe nicht, sagen Sie uns bitte Bescheid.');
    expect(T.nachDerAnreise).toBe('Nach der Anreise');
    expect(T.nachSatz).toBe('Wir melden uns bei Ihnen und fragen nach, ob alles gut klappt.');
    expect(nb(T.folgeAb(`Sonntag,${NBSP}29.11.`))).toBe('Folgeeinsatz ab Sonntag, 29.11.');
    expect(T.folgeSucht).toBe('Für den Folgeeinsatz suchen wir eine Pflegekraft für Sie.');
  });
  it('NEU R6 / R6b und wiederverwendete Texte', () => {
    expect(T.etikett).toEqual({ gebucht: 'Gebucht', heuteGeplant: 'Anreise heute geplant', endetBald: 'Endet bald', endetHeute: 'Endet heute', beendet: 'Beendet' });
    expect(T.vertragUnterschreiben).toBe('Vertrag unterschreiben');
    expect(T.vertragVorbereitung).toBe('Vertrag in Vorbereitung');
    expect(T.vertragFrueher).toBe('Vertrag aus früherer Buchung');
    expect(nb(T.unterschriebenAm('28.07.2026'))).toBe('unterschrieben am 28.07.2026');
    expect(T.anreiseAbgestimmt).toBe('Anreise wird abgestimmt');
    expect(T.anreisedaten).toBe('Anreisedaten');
    expect(T.anreiseHeuteOffen).toBe('Uhrzeit und Verkehrsmittel stehen hier nicht. Rufen Sie uns bitte an, falls Ihnen diese Angaben fehlen.');
    expect(T.heute).toBe('heute');
    expect(T.folgeAb(T.heute)).toBe('Folgeeinsatz ab heute');
    expect(nb(T.folgeGebucht(`Anna${NBSP}B.`))).toBe('Für den Folgeeinsatz ist Anna B. gebucht.');
    expect(T.folgeGebuchtOhneName).toBe('Für den Folgeeinsatz ist eine Pflegekraft gebucht.');
    expect(T.folgeTitel).toBe('Folgeeinsatz');
    expect(T.folgeNochNicht).toBe('Wir legen den Folgeeinsatz normalerweise einige Wochen vor dem Ende dieses Einsatzes an, oft etwa einen Monat vorher. Danach sehen Sie ihn hier und können Pflegekräfte einladen. Außerdem suchen wir selbst eine passende Pflegekraft für Sie.');
    expect(T.folgeBaldOhne).toBe('Wenn Sie eine weitere Betreuung wünschen und hier noch kein Folgeeinsatz steht, melden Sie sich bitte bei uns.');
    expect(T.zumFolgeeinsatz).toBe(`Zum Folgeeinsatz wechseln${NBSP}›`);
    expect(T.bewerbungenAnsehen(1)).toBe(`1${NBSP}Bewerbung ansehen${NBSP}›`);
    expect(T.bewerbungenAnsehen(2)).toBe(`2${NBSP}Bewerbungen ansehen${NBSP}›`);
    expect(T.ihreUnterlagen).toBe('Ihre Unterlagen');
    expect(T.aktuellerEinsatz).toBe('Ihr aktueller Einsatz');
    expect(T.naechsterEinsatz).toBe('Ihr nächster Einsatz');
    expect(T.warteSatz1).toBe('Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben.');
    expect(T.warteSatz2).toBe('Dann bekommen Sie auch eine E‑Mail.');
    expect(T.kostenGrundlage).toBe('Grundlage: Ihr Tagessatz und die angegebenen Daten für Anreise und Abreise.');
    expect(T.vertragPdfAria).toBe('Vertrag als PDF ansehen, öffnet in einem neuen Fenster');
  });
  it('freigegebene live Sätze (#116 Satz 2, Fassung 35) Zeichen für Zeichen', () => {
    expect(T.anreiseBesprechen).toBe('Marta Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu besprechen.');
    expect(T.vvSatz).toBe('Wir bereiten Ihre Vertragsdokumente vor. Marta Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen.');
    expect(T.vertragKnopf).toBe('Vertrag jetzt abschließen →');
    expect(T.vertragRueckfall).toBe('Unterschriebenen Vertrag ansehen →');
  });
  it('live Texte stehen wirklich im live Code (BookedScreen, Einsatzübersicht, Kompakt-Einstieg, Anreise-Mail)', () => {
    // Der Quelltext schreibt das geschützte Leerzeichen als Escape „\u00a0".
    const booked = readFileSync('src/components/portal/BookedScreen.tsx', 'utf8').replace(/\\u00a0/g, NBSP);
    for (const t of [T.anreiseBesprechen, T.vvSatz, T.vertragKnopf, T.vertragRueckfall, T.ihreUnterlagen, `'${T.anreisedaten}'`]) {
      expect(booked, t).toContain(t);
    }
    expect(readFileSync('src/pages/JobsOverviewPage.tsx', 'utf8')).toContain(T.sucheOhneBewerbung);
    expect(readFileSync('src/components/portal/KompaktEinstieg.tsx', 'utf8')).toContain("EINLADEN_TITEL = 'Pflegekräfte einladen'");
    const mail = readFileSync('project 3/supabase/functions/send-scheduled-emails/kundenMails.ts', 'utf8');
    expect(mail).toContain('Hierhin wird ${vorname} gebracht.');
    expect(mail).toContain('Hierhin reist ${vorname} selbst an.');
  });
});

describe('Wortlaut-Wächter (N3.2 Regel 11, N3.7, N3.8)', () => {
  const alle = alleTexte();
  it('nichts behaupten: kein „kommt", „ist da", „übernimmt", „angekommen", „startet"; „läuft" nur im live Text der Einsatzübersicht', () => {
    for (const t of alle) {
      expect(t, t).not.toMatch(/\bkommt\b|ist da\b|übernimmt|angekommen|startet|ist bei Ihnen/);
      if (t !== T.sucheOhneBewerbung) expect(t, t).not.toMatch(/läuft/);
    }
  });
  it('was entfällt, steht nicht mehr in den Texten', () => {
    const zusammen = alle.join('\n');
    expect(zusammen).not.toMatch(/Laut Ihrem Vertrag|Alle Kosten im Überblick|Weniger anzeigen|Eine Kopie|Alle meine Einsätze|pauschal je 125|Buchung bestätigt|reist am|Gebuchter Einsatz bis|Bitte schließen Sie noch|Dienstleistungsvertrag|Vertragsbeginn|Hinweis/);
  });
  it('„E‑Mail" mit geschütztem Bindestrich, „›" per NBSP am Wort, keine Tilde', () => {
    for (const t of alle) {
      expect(t, t).not.toMatch(/E-Mail/);
      expect(t, t).not.toMatch(/ ›/);
      expect(t, t).not.toMatch(/~/);
    }
  });
  it('keine Gedankenstriche in neuen Texten (Striche nur in Zeitbereichen und im live Text der Einsatzübersicht)', () => {
    const neu = [T.etikett.heuteGeplant, T.etikett.endetBald, T.etikett.endetHeute, T.etikett.beendet, T.vertragUnterschreiben,
      T.vertragVorbereitung, T.vertragFrueher, T.unterschriebenAm('X'), T.anreiseAbgestimmt, T.anreiseHeuteOffen, T.folgeGebucht('X'),
      T.folgeGebuchtOhneName, T.folgeTitel, T.folgeNochNicht, T.folgeBaldOhne, T.zumFolgeeinsatz, T.bewerbungenAnsehen(2), T.trenner, T.kostenGrundlage];
    for (const t of neu) expect(t, t).not.toMatch(/[—–]/);
  });
  it('nie „wir vermitteln", nie Martin', () => {
    for (const t of alle) expect(t, t).not.toMatch(/vermitteln|Martin/);
  });
});
