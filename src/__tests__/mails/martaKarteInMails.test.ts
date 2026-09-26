import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { martaKarteHtml } from '../../../project 3/lib/marta-karte';

// Martas Signaturkarte (Martin, 17.09.2026) gab es in sieben Code-Kopien
// plus den Vorlagen in mail-templates/. Jetzt baut sie EINE Funktion
// (lib/marta-karte.ts, Kopie in der Edge Function — Gleichheit prüft
// martaKarte.test.ts). Dieser Test bewacht die Quellen: keine eingebettete
// Karte mehr, Kundenmails mit Sternen, Vermittler ohne, jede Mail-Shell mit
// den Handy-Regeln, statische Vermittler-Vorlagen = gerenderte Karte.

const WURZEL = join(__dirname, '..', '..', '..');
const lies = (datei: string) => readFileSync(join(WURZEL, datei), 'utf8');
const EMAIL = 'project 3/lib/email.ts';
const EDGE = 'project 3/supabase/functions/send-scheduled-emails/index.ts';

// Merkmale einer eingebetteten Karte (Siegel-Spalte / alter WhatsApp-Knopf).
const KARTEN_MERKMALE = ['sig-siegel-innen', 'WhatsApp schreiben', 'betreute Einsätze'];

describe('Martas Karte kommt aus einer Vorlage', () => {
  for (const datei of [EMAIL, EDGE]) {
    it(`${datei}: keine eingebettete Kopie der Karte`, () => {
      const quelle = lies(datei);
      for (const m of KARTEN_MERKMALE) expect(quelle, m).not.toContain(m);
    });
  }

  it('lib/email.ts: alle Kundenkarten mit Bewertung, keine Vermittler-Karte', () => {
    const aufrufe = lies(EMAIL).match(/martaKarteHtml\(\{[^}]*\}\)/g) ?? [];
    expect(aufrufe.length).toBeGreaterThanOrEqual(6);
    for (const a of aufrufe) {
      expect(a).toContain("fuer: 'kunde'");
      expect(a).toContain('bewertung');
    }
  });

  it('Edge Function: buildMartaSig nutzt die Vorlage; Vermittler-Aufrufe ohne Sterne', () => {
    const quelle = lies(EDGE);
    const start = quelle.indexOf('function buildMartaSig(');
    expect(quelle.slice(start, quelle.indexOf('\n}\n', start))).toContain('martaKarteHtml(');
    const vermittler = quelle.match(/signatur:\s*buildMartaSig\([^)]*\)/g) ?? [];
    expect(vermittler.length).toBeGreaterThanOrEqual(4);
    for (const a of vermittler) expect(a).toContain('"vermittler"');
    const kunden = (quelle.match(/buildMartaSig\([^)]*\)/g) ?? []).filter((a) => !a.includes('"vermittler"'));
    expect(kunden.length).toBeGreaterThanOrEqual(6);
    // Die neuen Kundenmails (kundenMails.ts, 26.09.2026) bekommen die Karte über den Kontext.
    expect(quelle.slice(quelle.indexOf('function kundenKontext('))).toMatch(/marta: buildMartaSig\(siteUrl\)/);
    const neu = lies('project 3/supabase/functions/send-scheduled-emails/kundenMails.ts');
    expect((neu.match(/\$\{k\.marta\}/g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(neu).not.toContain('martaKarteHtml');
  });

  it('Edge Function lädt den Bewertungsstand pro Aufruf, bevor Mails gebaut werden', () => {
    expect(lies(EDGE).match(/bewertungsStand = await ladeBewertungsStand\(/g)).toHaveLength(2);
  });

  it('jede Mail-Shell mit Karte trägt die Handy-Regeln der Karte', () => {
    expect(lies('project 3/lib/email-template.ts')).toContain('${MARTA_KARTE_MOBIL_CSS}');
    expect(lies(EDGE)).toContain('${MARTA_KARTE_MOBIL_CSS}');
    // caregiverMailShell + Shell der Pflegedaten-Mail
    expect(lies(EMAIL).match(/\$\{MARTA_KARTE_MOBIL_CSS\}/g)).toHaveLength(2);
  });

  it('Bewertungsanfrage und Vermittler-Modul bleiben ohne Sterne', () => {
    for (const datei of [
      'project 3/supabase/functions/send-scheduled-emails/bewertung.ts',
      'project 3/supabase/functions/send-scheduled-emails/vermittler.ts',
    ]) {
      const quelle = lies(datei);
      expect(quelle).not.toContain('bewertungsSterneHtml');
      expect(quelle).not.toContain('martaKarteHtml');
    }
  });

  it('kein ✆-Zeichen mehr in Kundenmails, Hörer-Symbol als Bild (Martin 17.09.2026)', () => {
    for (const datei of [EMAIL, EDGE, 'project 3/lib/marta-karte.ts',
      'project 3/supabase/functions/send-scheduled-emails/martaKarte.ts',
      'project 3/supabase/functions/send-scheduled-emails/bewertung.ts']) {
      const quelle = lies(datei);
      expect(quelle, datei).not.toContain('&#9990;');
      expect(quelle.replace(/\/\*[^]*?\*\/|\/\/[^\n]*/g, ''), datei).not.toContain('✆');
    }
    // Bewertungsanfrage (beide Kopien): graues Hörer-Symbol vor der Nummer
    for (const datei of [EMAIL, 'project 3/supabase/functions/send-scheduled-emails/bewertung.ts']) {
      expect(lies(datei), datei).toContain('mail-icon-telefon-grau.png');
    }
  });

  it('statische Vermittler-Vorlagen enthalten genau die gerenderte Vermittler-Karte', () => {
    const karte = martaKarteHtml({ fuer: 'vermittler', siteUrl: 'https://kostenrechner.primundus.de', presseLogos: true }).trim();
    for (const datei of ['mail-templates/15-vermittler-angebot.html', 'mail-templates/19-vermittler-kraefte.html']) {
      const quelle = lies(datei);
      expect(quelle, datei).toContain(karte);
      expect(quelle, datei).toContain('.sig-pille');
    }
  });
});
