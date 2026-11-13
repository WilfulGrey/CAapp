import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as edge from '../../../project 3/supabase/functions/send-scheduled-emails/mailBausteine';
import { ANGEBOT_TITEL, FEST_TITEL, FEST_ZEILE, GARANTIE_PUNKTE, GARANTIE_TITEL, VERTRAUEN } from '../../components/portal/EinstiegMinimal';
import { ERREICHBAR, TELEFON, TELEFON_HREF, whatsappHref } from '../../lib/kontakt';

// Die Angebotsmail sieht aus wie der Minimal-Einstieg des Portals (Registry #148, Martin 08.11.2026: „genauso wie im
// Portal“) und übernimmt dessen Wortlaute: Titel der Angebotskarte, Bestpreisgarantie mit den drei Punkten, Kennzahlen,
// Knopf „Bewerbungen erhalten“ mit Zeile darunter, Heim-Vergleich. Dieser Test hält Mail und Portal gleich; ändert sich
// ein Wort im Portal, wird er rot, bis die Mail nachzieht. Gelesen wird der Quelltext der Mail, weil die Edge-Funktion
// Deno-Module importiert.

const WURZEL = join(__dirname, '..', '..', '..');
const MAIL = readFileSync(join(WURZEL, 'project 3/supabase/functions/send-scheduled-emails/kundenMails.ts'), 'utf8');
const ANGEBOT = MAIL.slice(MAIL.indexOf('// ── 01 Angebot'), MAIL.indexOf('// ── 02 Nudge 1'));
const PORTAL_SEITE = readFileSync(join(WURZEL, 'src/pages/CustomerPortalPage.tsx'), 'utf8');
const EINSTIEG = readFileSync(join(WURZEL, 'src/components/portal/EinstiegMinimal.tsx'), 'utf8');

/** Tags und geschützte Leerzeichen weg, damit HTML-Zeilen mit Klartext vergleichbar sind. */
const flach = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
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

describe('Angebotsmail wie das Portal (Registry #148)', () => {
  it('Kontaktzeile: Nummer, Erreichbarkeit und Links wie im Portal (src/lib/kontakt.ts)', () => {
    expect(edge.TELEFON_TEXT.replace(/&nbsp;/g, ' ')).toBe(TELEFON);
    expect(edge.TELEFON_HREF).toBe(TELEFON_HREF);
    expect(edge.WHATSAPP_HREF).toBe(whatsappHref());
    // HTML: Links aus den Bausteinen, Erreichbarkeit im Wortlaut des Portals.
    expect(ANGEBOT).toContain('kontaktLink(TELEFON_HREF, TELEFON_TEXT)');
    expect(ANGEBOT).toContain('kontaktLink(WHATSAPP_HREF, "WhatsApp")');
    expect(flach(ANGEBOT)).toContain(`, ${ERREICHBAR}, auch per`);
    // Textfassung
    expect(ANGEBOT).toContain(`Fragen? ${TELEFON}, ${ERREICHBAR}, auch per WhatsApp (\${WHATSAPP_HREF}).`);
  });

  it('Angebotskarte: Titel, Bestpreisgarantie mit den Punkten und Kennzahlen wie im Portal', () => {
    expect(konst('ANGEBOT_TITEL')).toBe(ANGEBOT_TITEL);
    const punkte = ANGEBOT.match(/const GARANTIE_PUNKTE = (\[[^\]]+\]) as const;/);
    expect(punkte, 'GARANTIE_PUNKTE fehlt').not.toBeNull();
    expect(JSON.parse(punkte![1])).toEqual([GARANTIE_TITEL, ...GARANTIE_PUNKTE]);
    for (const [wert, wort] of VERTRAUEN) {
      expect(ANGEBOT).toContain(`spalte("${wert}", "${wort}"`);
      expect(ANGEBOT).toContain(`${wert} ${wort}`);
    }
    expect(EINSTIEG).toContain('Passende Pflegekräfte');
    expect(ANGEBOT).toContain('Passende Pflegekräfte');
  });

  it('Zuschüsse und Heim-Vergleich: derselbe Wortlaut und derselbe Heim-Eigenanteil wie im Portal', () => {
    expect(zahl(MAIL, 'HEIM_EIGENANTEIL')).toBe(zahl(PORTAL_SEITE, 'HEIM_EIGENANTEIL'));
    for (const satz of ['Nach Zuschüssen', 'weniger als im Pflegeheim']) {
      expect(EINSTIEG).toContain(satz);
      expect(ANGEBOT).toContain(satz);
    }
  });

  it('Knopf „Bewerbungen erhalten“ mit Zeile darunter wie der feste Knopf im Portal', () => {
    expect(konst('KNOPF_TITEL')).toBe(FEST_TITEL);
    expect(konst('KNOPF_ZEILE').replace(/&amp;/g, '&')).toBe(FEST_ZEILE);
  });

  it('Hinweis zu den Angaben eingekaufter Leads kommt aus herkunft.ts, ohne eigene Kopie in der Mail', () => {
    expect(MAIL).toContain('import { portalAngabenAngenommen, portalAngabenHinweisText } from "./herkunft.ts";');
    expect(ANGEBOT).toContain('portalAngabenHinweisText(a.herkunft, portalAngabenAngenommen(a.angenommeneFelder))');
    expect(MAIL).not.toContain('Diese Angaben haben wir');
  });

  it('keine Texte der alten langen Mail mehr (Einleitung, Ablauf, Häufige Fragen)', () => {
    for (const name of ['EINLEITUNG', 'EINLEITUNG_TESTSIEGER', 'SCHRITTE_ANGEBOT', 'EINLADEN_HINWEIS', 'KRAEFTE_ZEILE',
      'DEUTSCH_EINSTIEG', 'DEUTSCH_SCHLUSS', 'angebotFragen', 'VERTRAG_ZEILE', 'angebotChips']) {
      expect(MAIL, name).not.toMatch(new RegExp(`(const|function) ${name}\\b`));
    }
    expect(MAIL).not.toContain('Gerne übernehmen wir die Rund-um-Betreuung');
  });
});
