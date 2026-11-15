import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as edge from '../../../project 3/supabase/functions/send-scheduled-emails/mailBausteine';
import * as design from '../../../project 3/supabase/functions/send-scheduled-emails/mailDesign';
import {
  ABLAUF_GUTE_PHASE, ANGEBOT_TITEL, FEST_TITEL, FEST_ZEILE, GARANTIE_PUNKTE, GARANTIE_TITEL, KOPF_PUNKTE, KOPF_TITEL_ZEILEN,
  LISTE_KNOPF, LISTE_TITEL, LISTE_UNVOLLSTAENDIG, LISTE_WARUM, LISTE_ZEILE, VERTRAUEN, WARUM_TITEL,
} from '../../components/portal/EinstiegMinimal';
import { ERREICHBAR, TELEFON, TELEFON_HREF, whatsappHref } from '../../lib/kontakt';

// Die Angebotsmail sieht aus wie der Minimal-Einstieg des Portals und übernimmt dessen Wortlaute. Seit Registry #168
// (Martin 15.11.2026: „A: Angebot + Erinnerungen“) baut sie sich aus mailDesign.ts im Look des Portals; Titel, „Warum
// Primundus?“ mit Bestpreisgarantie + KOPF_PUNKTE, Kennzahlen, Liste „Ihre Pflegekräfte-Auswahl“ mit LISTE_ZEILE und der Kasten
// unter der Liste (Nudge 1) kommen aus dem Portal. Dieser Test hält Mail und Portal gleich; ändert sich ein Wort im Portal, wird
// er rot, bis die Mail nachzieht. Die Konstanten der Mail liest er direkt aus mailDesign.ts (keine Deno-Importe dort außer
// Kopien, die auch hier laden), die Angebotsmail selbst als Quelltext (kundenMails.ts importiert Deno-Module).
// Bis #168 standen hier die bewussten Abweichungen (ANGEBOT_TITEL, GARANTIE_PUNKTE, „Passende Pflegekräfte“); sie sind weg.

const WURZEL = join(__dirname, '..', '..', '..');
const EDGE = 'project 3/supabase/functions/send-scheduled-emails';
const MAIL = readFileSync(join(WURZEL, `${EDGE}/kundenMails.ts`), 'utf8');
const DESIGN = readFileSync(join(WURZEL, `${EDGE}/mailDesign.ts`), 'utf8');
const ANGEBOT = MAIL.slice(MAIL.indexOf('// ── 01 Angebot'), MAIL.indexOf('// ── 02 Nudge 1'));
const PORTAL_SEITE = readFileSync(join(WURZEL, 'src/pages/CustomerPortalPage.tsx'), 'utf8');
const EINSTIEG = readFileSync(join(WURZEL, 'src/components/portal/EinstiegMinimal.tsx'), 'utf8');

/** Tags, geschützte Leerzeichen und Escapes weg, damit HTML-Zeilen mit Klartext vergleichbar sind. */
const flach = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;| /g, ' ').replace(/\s+/g, ' ');
const ohneKommentare = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm, '');
const konst = (name: string): string => {
  const m = ANGEBOT.match(new RegExp(`const ${name} = (["'])(.+?)\\1;`));
  if (!m) throw new Error(`${name} fehlt`);
  return m[2];
};
const zahl = (quelle: string, name: string): number => {
  const m = quelle.match(new RegExp(`const ${name} = (\\d+);`));
  if (!m) throw new Error(`${name} fehlt`);
  return Number(m[1]);
};

describe('Angebotsmail wie das Portal (Registry #148, Look seit #168)', () => {
  it('Kontaktzeile der Signatur: Nummer, Erreichbarkeit und Links wie im Portal (src/lib/kontakt.ts)', () => {
    expect(edge.TELEFON_TEXT.replace(/&nbsp;/g, ' ')).toBe(TELEFON);
    expect(edge.TELEFON_HREF).toBe(TELEFON_HREF);
    expect(edge.WHATSAPP_HREF).toBe(whatsappHref());
    const sig = design.martaSignatur();
    expect(sig).toContain(`href="${TELEFON_HREF}"`);
    expect(sig).toContain(`href="${whatsappHref()}"`);
    expect(flach(sig)).toContain(`Fragen? ${TELEFON}, ${ERREICHBAR}, auch per WhatsApp.`);
    // Textfassung
    expect(design.martaSignaturText()).toContain(`Fragen? ${TELEFON}, ${ERREICHBAR}, auch per WhatsApp (${whatsappHref()}).`);
  });

  it('Titel, „Warum Primundus?“, Bestpreisgarantie, Punkte und Kennzahlen wörtlich wie im Portal', () => {
    expect([...design.KOPF_TITEL_ZEILEN]).toEqual([...KOPF_TITEL_ZEILEN]);
    expect(design.WARUM_TITEL).toBe(WARUM_TITEL);
    expect(design.GARANTIE_TITEL).toBe(GARANTIE_TITEL);
    expect([...design.KOPF_PUNKTE]).toEqual([...KOPF_PUNKTE]);
    expect(design.VERTRAUEN.map((v) => [...v])).toEqual(VERTRAUEN.map((v) => [...v]));
    // Gerendert: alles in dieser Reihenfolge, die Bestpreisgarantie verlinkt auf die freigegebene Seite.
    const html = flach(design.warumPrimundus({ bewertung: null }));
    let ab = 0;
    for (const t of [WARUM_TITEL, GARANTIE_TITEL, ...KOPF_PUNKTE, ...VERTRAUEN.flat()]) {
      const i = html.indexOf(t, ab);
      expect(i, t).toBeGreaterThanOrEqual(ab);
      ab = i + t.length;
    }
    expect(design.warumPrimundus({ bewertung: null })).toContain(`href="${edge.BESTPREIS_URL}"`);
    // Die Angebotsmail benutzt genau diese Bausteine.
    expect(ANGEBOT).toContain('preiskarte({');
    expect(ANGEBOT).toContain('KOPF_TITEL_ZEILEN');
    // Die Mail-Wortlaute von vor dem 13.11. sind weg (Portal: nur noch für Altansichten).
    // „Ihr persönliches Angebot“ steht nur noch im Fall ohne Preis (Vorschau seit 08.10., Titel TITEL_OHNE_PREIS), nicht mehr
    // als Kopf einer Angebotskarte.
    expect(ANGEBOT).not.toMatch(/\bANGEBOT_TITEL\b/);
    expect(ANGEBOT).toContain(`TITEL_OHNE_PREIS = ["${ANGEBOT_TITEL}", "zur 24-Stunden-Betreuung"]`);
    for (const alt of GARANTIE_PUNKTE.filter((p) => p !== 'Keine Vermittlungsgebühr')) {
      expect(ohneKommentare(ANGEBOT), alt).not.toContain(alt);
    }
    expect(MAIL).not.toMatch(/export const (ANGEBOT_TITEL|GARANTIE_PUNKTE)\b/);
  });

  it('Liste „Ihre Pflegekräfte-Auswahl“ mit Zeile und Kasten unter der Liste wörtlich wie im Portal', () => {
    expect(design.LISTE_TITEL).toBe(LISTE_TITEL);
    expect(design.LISTE_ZEILE).toBe(LISTE_ZEILE);
    expect(design.LISTE_UNVOLLSTAENDIG).toBe(LISTE_UNVOLLSTAENDIG);
    expect(design.LISTE_WARUM.replace(/ /g, ' ')).toBe(LISTE_WARUM.replace(/ /g, ' '));
    expect(design.LISTE_KNOPF).toBe(LISTE_KNOPF);
    expect(EINSTIEG).toContain('{LISTE_TITEL}');
    // Der grüne Knopf trägt fest den Portal-Text, kein anderer Knopf ist grün.
    expect(design.formularKnopf('https://x')).toContain(`>${LISTE_KNOPF}&nbsp;&rarr;</a>`);
    expect(design.formularKnopf('https://x')).toContain('bgcolor="#3D7A5C"');
    expect(design.hauptknopf('https://x', 'Y')).toContain('bgcolor="#E76F63"');
    expect(flach(design.formularHinweis('https://x'))).toContain(`${LISTE_UNVOLLSTAENDIG} ${LISTE_WARUM.replace(/ /g, ' ')}`);
  });

  it('„So geht es weiter“ vor dem Speichern: Schritte 1 und 2 wörtlich, Schritt 3 bewusst angepasst (OpenAI-Gegencheck 15.11.)', () => {
    const norm = (s: string) => s.replace(/&nbsp;| /g, ' ');
    for (const i of [0, 1]) {
      expect(norm(design.ABLAUF[i].titel)).toBe(norm(ABLAUF_GUTE_PHASE[i].titel));
      expect(norm(design.ABLAUF[i].text)).toBe(norm(ABLAUF_GUTE_PHASE[i].text));
    }
    expect(norm(design.ABLAUF[2].titel)).toBe(norm(ABLAUF_GUTE_PHASE[2].titel));
    // Gewollte Abweichung: Vertragssatz wie in allen Mails, Ich-Form statt „Wir übernehmen den Rest“; Anreise-Satz wörtlich.
    expect(norm(design.ABLAUF[2].text)).toContain('Anreise schon ab 3 Tagen möglich.');
    expect(norm(ABLAUF_GUTE_PHASE[2].text)).toContain('Anreise schon ab 3 Tagen möglich.');
    expect(design.ABLAUF[2].text).toContain('Ein Vertrag entsteht erst, wenn Sie eine Bewerbung annehmen und im Portal unterschreiben.');
    expect(design.ABLAUF[2].text).not.toContain('Wir übernehmen');
  });

  it('Zuschüsse und Heim-Vergleich: derselbe Wortlaut und derselbe Heim-Eigenanteil wie im Portal', () => {
    expect(zahl(MAIL, 'HEIM_EIGENANTEIL')).toBe(zahl(PORTAL_SEITE, 'HEIM_EIGENANTEIL'));
    for (const satz of ['Nach Zuschüssen', 'weniger als im Pflegeheim']) {
      expect(EINSTIEG).toContain(satz);
      expect(DESIGN).toContain(satz);
    }
  });

  it('Knopf „Angebot & Pflegekräfte anzeigen“ (Registry #163) ohne Zeile darunter (Registry #165); „Bewerbungen erhalten“ (FEST_TITEL) und „100% kostenfrei & unverbindlich“ (FEST_ZEILE) weder in der Mail noch im Portal', () => {
    // Martin 14.11.2026: „in der Mail würde ich den Buttontext machen: Angebot & Pflegekräfte anzeigen“.
    expect(konst('KNOPF_TITEL')).toBe('Angebot & Pflegekräfte anzeigen');
    expect(ANGEBOT).toContain('hauptknopf(start, esc(KNOPF_TITEL))');
    expect(ohneKommentare(ANGEBOT)).not.toContain(FEST_TITEL);
    expect(MAIL).not.toContain('export const KNOPF_ZEILE');
    expect(ohneKommentare(ANGEBOT)).not.toContain(FEST_ZEILE.replace('&', '&amp;'));
    expect(ohneKommentare(ANGEBOT)).not.toContain(FEST_ZEILE);
    expect(EINSTIEG).not.toContain('{FEST_TITEL}');
    expect(EINSTIEG).not.toContain('{FEST_ZEILE}');
  });

  it('Martins Wortlaute der Angebotsmail bleiben (Einleitung, Erklärsatz mit „ca.“, 60 Minuten)', () => {
    expect(ANGEBOT).toContain('"Vielen Dank für Ihre Anfrage. Hier ist Ihr Angebot zur 24-Stunden-Betreuung."');
    const sp = (t: string) => t.replace(/\\u00a0|\u00a0/g, ' ');
    expect(sp(konst('PORTAL_ERKLAERUNG'))).toBe(sp(
      'Im Kundenportal sehen Sie Ihr Angebot und passende Pflegekräfte. Beschreiben Sie einmal kurz die Pflegesituation, das dauert ca. 2 Minuten. Danach können sich Pflegekräfte direkt bei Ihnen bewerben. Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.',
    ));
  });

  it('Hinweis zu den Angaben eingekaufter Leads kommt aus herkunft.ts, ohne eigene Kopie in der Mail', () => {
    expect(MAIL).toContain('import { portalAngabenAngenommen, portalAngabenHinweisText } from "./herkunft.ts";');
    expect(ANGEBOT).toContain('portalAngabenHinweisText(a.herkunft, portalAngabenAngenommen(a.angenommeneFelder))');
    expect(MAIL).not.toContain('Diese Angaben haben wir');
  });

  it('keine Texte der alten langen Mail mehr (Einleitung, Ablauf, Häufige Fragen)', () => {
    for (const name of ['EINLEITUNG', 'EINLEITUNG_TESTSIEGER', 'SCHRITTE_ANGEBOT', 'EINLADEN_HINWEIS', 'KRAEFTE_ZEILE',
      'DEUTSCH_EINSTIEG', 'DEUTSCH_SCHLUSS', 'angebotFragen', 'VERTRAG_ZEILE', 'angebotChips', 'angebotKasten', 'kraefteKarte', 'knopfPortal']) {
      expect(MAIL, name).not.toMatch(new RegExp(`(const|function) ${name}\\b`));
    }
    expect(MAIL).not.toContain('Gerne übernehmen wir die Rund-um-Betreuung');
  });
});
