/**
 * Martas Signaturkarte (Martin, 17.09.2026) — EINE Vorlage für alle Mails:
 *   - Anrufen + WhatsApp nebeneinander (Handy: dürfen umbrechen, .sig-pille)
 *   - Bewertungszeile IN der Karte unter den Knöpfen:
 *       ★★★★★ 4,9 von 5 · 126 Bewertungen →
 *   - Faktenzeile rechts: „Bestpreisgarantie, keine Vermittlungsgebühr"
 *   - Vermittler-Mails: keine Sterne, keine Kunden-Konditionen (vermittler.ts)
 *   - Handy (≤480 px): nur Symbole in runden 44-px-Knöpfen, Sterne als eigene
 *     Zeile über die volle Kartenbreite; Desktop/Outlook unverändert
 * Die Edge Function hat eine Kopie (send-scheduled-emails/martaKarte.ts);
 * unten wird geprüft, dass beide Kopien dieselbe Karte liefern.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MARTA_KARTE_MOBIL_CSS,
  bewertungsSterneHtml,
  martaKarteHtml,
} from '../../project 3/lib/marta-karte';
import * as edge from '../../project 3/supabase/functions/send-scheduled-emails/martaKarte';

const SITE = 'https://kostenrechner.primundus.de';
const STAND = { schnitt: '4,9', anzahl: 126 };
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·')
  .replace(/&rarr;/g, '→').replace(/&#9733;/g, '★').replace(/\s+/g, ' ');

describe('martaKarteHtml — Kundenmail', () => {
  const html = martaKarteHtml({ fuer: 'kunde', bewertung: STAND, siteUrl: SITE, presseLogos: true });

  it('Anrufen und WhatsApp stehen in EINER Tabellenzeile nebeneinander', () => {
    const zeile = html.match(/<tr>\s*<td class="sig-pille"[^]*?<\/tr>/)?.[0] ?? '';
    expect(zeile).toContain('href="tel:+4989200000830"');
    expect(zeile).toContain('href="https://wa.me/4989200000830"');
    expect((zeile.match(/class="sig-pille"/g) ?? []).length).toBe(2);
    expect(text(zeile)).toMatch(/^\s*Anrufen\s+WhatsApp\s*$/);
  });

  it('alte Beschriftungen sind weg, kein ✆-Zeichen mehr (sah aus wie ein kaputtes ©)', () => {
    expect(html).not.toContain('WhatsApp schreiben');
    expect(html).not.toContain('&#9990;');
    expect(html).not.toContain('✆');
    // Nummer nur noch in aria-label/title, nicht als sichtbarer Text
    expect(text(html)).not.toContain('089 200 000 830');
  });

  it('Pillen behalten ihre Farben (beige Anrufen, grün WhatsApp)', () => {
    expect(html).toMatch(/<a class="sig-pille-link" href="tel:\+4989200000830" [^>]*style="[^"]*background-color:#f0ebe4;/);
    expect(html).toMatch(/<a class="sig-pille-link" href="https:\/\/wa\.me\/4989200000830" [^>]*style="[^"]*background-color:#25D366;/);
  });

  it('Bewertungszeile steht IN der Karte, unter den Knöpfen, vor der Siegel-Spalte', () => {
    const knopf = html.indexOf('https://wa.me/4989200000830');
    const sterne = html.indexOf('&#9733;');
    const siegel = html.indexOf('sig-siegel-innen');
    expect(knopf).toBeGreaterThan(0);
    expect(sterne).toBeGreaterThan(knopf);
    expect(siegel).toBeGreaterThan(sterne);
    expect(text(html)).toContain('★★★★★ 4,9 von 5 · 126 Bewertungen →');
  });

  it('keine eigene Zeile mehr unter der Karte', () => {
    expect(html.trim().endsWith('</table>')).toBe(true);
    const nachKarte = html.slice(html.lastIndexOf('https://primundus.de/erfahrungen'));
    expect(nachKarte).toContain('Über 20 Jahre');
  });

  it('Siegel-Spalte hält mindestens 12 px Abstand zu den Knöpfen', () => {
    expect(html).toMatch(/<td style="vertical-align:top;text-align:right;padding-left:12px;">/);
  });

  it('Faktenzeile: Bestpreisgarantie statt persönlicher Ansprechpartner, gleicher grauer Stil', () => {
    expect(html).toContain('<p style="margin:0;font-size:12px;color:#555;line-height:1.4;">Bestpreisgarantie,<br>keine Vermittlungs&shy;gebühr</p>');
    expect(html).toContain('<p style="margin:0;font-size:12px;color:#555;line-height:1.4;">Über 20 Jahre<br>Erfahrung</p>');
    expect(html).not.toContain('Ansprechpartner');
  });

  it('Mobil-Regeln aus #702 bleiben: Siegel-Klassen, Umbruch bei Name/Zeiten, Logos mit max-width', () => {
    expect(html).toContain('class="sig-siegel-innen"');
    expect(html).toContain('class="sig-siegel-bild"');
    expect(html).toContain('class="sig-siegel-welt"');
    expect(html).toContain('<span style="white-space:nowrap;">Mo – So,</span> <span style="white-space:nowrap;">8 – 20 Uhr</span>');
    expect(html).toMatch(/width="68" height="14" style="display:inline-block;width:68px;max-width:100%;/);
    expect(html).not.toContain('white-space:nowrap;">Marta Kapcio');
  });

  it('Presselogos und Abstand nach unten sind wählbar', () => {
    const ohne = martaKarteHtml({ fuer: 'kunde', bewertung: STAND, siteUrl: SITE, presseLogos: false, abstandUnten: 32 });
    expect(ohne).not.toContain('/images/media/');
    expect(ohne).toContain('margin:0 0 32px 0;');
    expect(html).toContain('/images/media/die-welt.webp');
    expect(html).toContain('margin:0 0 24px 0;');
  });

  it('Foto von primundus.de, Siegel und Logos vom übergebenen siteUrl', () => {
    expect(html).toContain('src="https://primundus.de/images/marta-kapcio.jpg"');
    expect(html).toContain(`src="${SITE}/images/primundus_testsieger-2021.webp"`);
  });
});

describe('martaKarteHtml — Handy (Martin 17.09.2026, nur Media-Query ≤480 px)', () => {
  const html = martaKarteHtml({ fuer: 'kunde', bewertung: STAND, siteUrl: SITE, presseLogos: true });

  it('Knöpfe: Symbol (16×16) vor der Beschriftung, auch am Desktop und in Outlook', () => {
    const BILD = 'style="display:inline-block;width:16px;height:16px;border:0;vertical-align:middle;margin-right:6px;"';
    expect(html).toContain(`<img class="sig-pille-bild" src="${SITE}/images/mail-icon-telefon.png" alt="" width="16" height="16" ${BILD} /><span class="sig-pille-text" style="vertical-align:middle;">Anrufen</span>`);
    expect(html).toContain(`<img class="sig-pille-bild" src="${SITE}/images/mail-icon-whatsapp.png" alt="" width="16" height="16" ${BILD} /><span class="sig-pille-text" style="vertical-align:middle;">WhatsApp</span>`);
    expect(html).not.toMatch(/sig-pille-bild[^>]*display:none/);
  });

  it('Links behalten zugänglichen Text (aria-label + title)', () => {
    expect(html).toMatch(/<a class="sig-pille-link" href="tel:\+4989200000830" aria-label="[^"]*089 200 000 830[^"]*" title="[^"]*089 200 000 830[^"]*"/);
    expect(html).toMatch(/<a class="sig-pille-link" href="https:\/\/wa\.me\/4989200000830" aria-label="[^"]*WhatsApp[^"]*" title="[^"]*WhatsApp[^"]*"/);
  });

  it('Sterne: Desktop-Kopie in der linken Spalte, Handy-Kopie als eigene Zeile über die volle Kartenbreite', () => {
    const desktop = html.indexOf('<div class="sig-sterne-desktop">');
    const siegel = html.indexOf('sig-siegel-innen');
    const mobil = html.indexOf('<div class="sig-sterne-mobil" style="display:none;mso-hide:all;max-height:0;overflow:hidden;">');
    const fakten = html.indexOf('Über 20 Jahre');
    expect(desktop).toBeGreaterThan(0);
    expect(siegel).toBeGreaterThan(desktop);
    expect(mobil).toBeGreaterThan(siegel);
    expect(fakten).toBeGreaterThan(mobil);
    const mobilHtml = html.slice(mobil, html.indexOf('</div>', mobil));
    expect(mobilHtml).toContain('font-size:12px;');
    expect(text(mobilHtml)).toContain('★★★★★ 4,9 von 5 · 126 Bewertungen →');
  });

  it('Media-Query-Regeln: Symbole statt Text, 44-px-Knöpfe, Sterne-Zeile tauschen', () => {
    expect(MARTA_KARTE_MOBIL_CSS).toContain('.sig-pille-text { display: none !important; }');
    expect(MARTA_KARTE_MOBIL_CSS).toContain('.sig-pille-bild { width: 20px !important; height: 20px !important; margin: 0 !important; }');
    expect(MARTA_KARTE_MOBIL_CSS).toMatch(/\.sig-pille-link \{[^}]*width: 44px !important;[^}]*height: 44px !important;/);
    expect(MARTA_KARTE_MOBIL_CSS).toContain('.sig-sterne-desktop { display: none !important; }');
    expect(MARTA_KARTE_MOBIL_CSS).toMatch(/\.sig-sterne-mobil \{ display: block !important; max-height: none !important; overflow: visible !important; \}/);
  });

  it('Symbolbilder liegen als PNG 40×40 (2×) in project 3/public/images', () => {
    for (const datei of ['mail-icon-whatsapp.png', 'mail-icon-telefon.png', 'mail-icon-telefon-grau.png']) {
      const png = readFileSync(join(__dirname, '..', '..', 'project 3', 'public', 'images', datei));
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(40);
      expect(png.readUInt32BE(20)).toBe(40);
      expect(png[25]).toBe(6); // RGBA — transparenter Hintergrund
    }
  });
});

describe('martaKarteHtml — Vermittler', () => {
  const html = martaKarteHtml({ fuer: 'vermittler', siteUrl: SITE, presseLogos: true });

  it('keine Bewertungszeile', () => {
    expect(html).not.toContain('&#9733;');
    expect(html).not.toContain('erfahrungen');
    expect(html).not.toContain('sig-sterne-');
  });

  it('keine Kunden-Konditionen in der Faktenzeile', () => {
    expect(html).not.toMatch(/Vermittlungsgeb/);
    expect(html).not.toMatch(/Bestpreis/);
    expect(html).toContain('Persönlicher<br>Ansprechpartner,<br>7&nbsp;Tage/Woche');
  });

  it('dieselben Knöpfe wie in der Kundenmail', () => {
    expect(text(html)).toContain('Anrufen');
    expect(html).toContain('mail-icon-telefon.png');
    expect((html.match(/class="sig-pille"/g) ?? []).length).toBe(2);
  });
});

describe('bewertungsSterneHtml', () => {
  const z = bewertungsSterneHtml(STAND);

  it('Sterne gold, 4,9 fett dunkel, „126 Bewertungen →" als Link in #8B7355 halbfett, ~12,5 px', () => {
    expect(z).toMatch(/color:#D4A843;[^>]*>(&#9733;){5}</);
    expect(z).toContain('<strong style="color:#3D2B1F;">4,9</strong>');
    expect(z).toMatch(/<a href="https:\/\/primundus\.de\/erfahrungen" style="[^"]*color:#8B7355;font-weight:600;[^"]*">126 Bewertungen&nbsp;&rarr;<\/a>/);
    expect(z).toContain('font-size:12.5px;');
    expect(z).not.toContain('<img');
  });

  it('bricht nur zwischen „von 5 ·" und dem Link um', () => {
    expect(z).toMatch(/<span style="white-space:nowrap;">[^]*von 5&nbsp;&middot;<\/span> <a /);
    expect(z).toMatch(/<a [^>]*white-space:nowrap;/);
  });

  it('rundet die Sterne (4,4 → vier goldene, ein heller), Einzahl, Tausenderpunkt', () => {
    expect(bewertungsSterneHtml({ schnitt: '4,4', anzahl: 30 }))
      .toMatch(/color:#D4A843;[^>]*>(&#9733;){4}<\/span><span style="color:#E3D9CB;">&#9733;<\/span>/);
    expect(text(bewertungsSterneHtml({ schnitt: '5,0', anzahl: 1 }))).toContain('1 Bewertung →');
    expect(bewertungsSterneHtml({ schnitt: '4,8', anzahl: 1234 })).toContain('>1.234 Bewertungen&nbsp;&rarr;</a>');
  });
});

describe('MARTA_KARTE_MOBIL_CSS', () => {
  it('enthält die Siegel-Regeln aus #702', () => {
    expect(MARTA_KARTE_MOBIL_CSS).toContain('.sig-siegel-welt { display: block !important; }');
    expect(MARTA_KARTE_MOBIL_CSS).toContain('.sig-siegel-bild { width: 48px !important; }');
    expect(MARTA_KARTE_MOBIL_CSS).toContain('.sig-siegel-innen { padding: 6px 8px !important; }');
  });
});

describe('Kopie in der Edge Function (send-scheduled-emails/martaKarte.ts)', () => {
  const faelle = [
    { fuer: 'kunde' as const, bewertung: STAND, siteUrl: SITE, presseLogos: true },
    { fuer: 'kunde' as const, bewertung: { schnitt: '4,4', anzahl: 1234 }, siteUrl: SITE, presseLogos: false, abstandUnten: 32 },
    { fuer: 'vermittler' as const, siteUrl: SITE, presseLogos: true },
  ];

  it('liefert Zeichen für Zeichen dieselbe Karte', () => {
    for (const f of faelle) expect(edge.martaKarteHtml(f)).toBe(martaKarteHtml(f));
    expect(edge.bewertungsSterneHtml(STAND)).toBe(bewertungsSterneHtml(STAND));
    expect(edge.MARTA_KARTE_MOBIL_CSS).toBe(MARTA_KARTE_MOBIL_CSS);
  });
});
