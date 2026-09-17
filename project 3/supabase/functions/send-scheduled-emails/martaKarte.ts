/**
 * Martas Signaturkarte — ⚠️ KOPIE von project 3/lib/marta-karte.ts (dort
 * stehen Martins Entscheidungen vom 17.09.2026 und die Begründungen).
 * Edge Functions können nicht aus lib/ importieren. src/__tests__/martaKarte.test.ts
 * prüft, dass beide Kopien Zeichen für Zeichen dieselbe Karte liefern.
 * Änderungen IMMER in beiden Dateien.
 */
import { type BewertungsStand, ERFAHRUNGEN_URL } from './bewertungenStand.ts';

export const MARTA_FOTO_URL = 'https://primundus.de/images/marta-kapcio.jpg';

export type MartaKarteOptionen = {
  /** Basis für Siegelbild und Presselogos (Kostenrechner-URL, ohne / am Ende). */
  siteUrl: string;
  /** Zeile mit den Presselogos unter den Fakten. */
  presseLogos: boolean;
  /** Abstand unter der Karte in px (Standard 24). */
  abstandUnten?: number;
} & ({ fuer: 'kunde'; bewertung: BewertungsStand } | { fuer: 'vermittler' });

/** Regeln für die Media-Query ≤480 px jeder Mail-Shell mit Karte.
 *  Handy (Martin 17.09.2026): Knöpfe nur als Symbol in runden 44-px-Flächen
 *  (passen nebeneinander), Sterne als eigene Zeile über die volle Breite.
 *  Clients ohne Media-Query (Outlook Desktop) zeigen die Desktop-Karte. */
export const MARTA_KARTE_MOBIL_CSS = `
      .sig-siegel-welt { display: block !important; }
      .sig-siegel-bild { width: 48px !important; }
      .sig-siegel-innen { padding: 6px 8px !important; }
      .sig-pille { padding: 0 8px 0 0 !important; }
      .sig-pille-link { display: inline-block !important; width: 44px !important; height: 44px !important; padding: 0 !important; border-radius: 22px !important; line-height: 44px !important; text-align: center !important; }
      .sig-pille-text { display: none !important; }
      .sig-pille-bild { display: inline-block !important; vertical-align: middle !important; }
      .sig-sterne-desktop { display: none !important; }
      .sig-sterne-mobil { display: block !important; max-height: none !important; overflow: visible !important; }`;

function tausender(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** „★★★★★ 4,9 von 5 · 126 Bewertungen →" — Umbruch nur vor dem Link.
 *  Desktop 12,5 px unter den Knöpfen, Handy 12 px über die volle Breite. */
export function bewertungsSterneHtml(stand: BewertungsStand, groessePx = 12.5, abstandObenPx = 10): string {
  const gold = Math.min(5, Math.max(0, Math.round(Number(stand.schnitt.replace(',', '.')))));
  const sterne =
    `<span style="color:#D4A843;letter-spacing:1px;">${'&#9733;'.repeat(gold)}</span>` +
    (gold < 5 ? `<span style="color:#E3D9CB;">${'&#9733;'.repeat(5 - gold)}</span>` : '');
  const wort = stand.anzahl === 1 ? 'Bewertung' : 'Bewertungen';
  return `<p style="margin:${abstandObenPx}px 0 0;font-size:${groessePx}px;line-height:1.5;color:#555;text-align:left;"><span style="white-space:nowrap;">${sterne}&nbsp;<strong style="color:#3D2B1F;">${stand.schnitt}</strong> von 5&nbsp;&middot;</span> <a href="${ERFAHRUNGEN_URL}" style="color:#8B7355;font-weight:600;text-decoration:none;white-space:nowrap;">${tausender(stand.anzahl)} ${wort}&nbsp;&rarr;</a></p>`;
}

const PILLE = 'display:inline-block;border-radius:20px;padding:8px 16px;text-decoration:none;font-size:13px;white-space:nowrap;';
const FAKT = 'margin:0;font-size:12px;color:#555;line-height:1.4;';
// Symbolbilder der Knöpfe (40×40-PNG, 2× für scharfe Darstellung): nur auf dem Handy.
const SYMBOL = 'display:none;mso-hide:all;width:20px;height:20px;border:0;vertical-align:middle;';

const LOGOS: [datei: string, alt: string, breite: number][] = [
  ['die-welt.webp', 'DIE WELT', 68],
  ['frankfurter-allgemeine.webp', 'Frankfurter Allgemeine', 103],
  ['ard.webp', 'ARD', 38],
  ['ndr.webp', 'NDR', 21],
  ['sat1.webp', 'SAT.1', 45],
  ['bild-der-frau.webp', 'Bild der Frau', 12],
];

export function martaKarteHtml(o: MartaKarteOptionen): string {
  const site = o.siteUrl.replace(/\/$/, '');
  const sterne = o.fuer === 'kunde' ? `
            <div class="sig-sterne-desktop">${bewertungsSterneHtml(o.bewertung)}</div>` : '';
  // Handy-Kopie der Sterne: am Desktop versteckt (mso-hide für Outlook),
  // die Media-Query blendet sie ein und die Desktop-Kopie aus.
  const sterneHandy = o.fuer === 'kunde' ? `
      <div class="sig-sterne-mobil" style="display:none;mso-hide:all;max-height:0;overflow:hidden;">${bewertungsSterneHtml(o.bewertung, 12, 12)}</div>` : '';
  const dritterFakt = o.fuer === 'kunde'
    // &shy;: auf 360–390 px ist die Faktenzelle ~110 px breit, das Wort nicht.
    ? 'Bestpreisgarantie,<br>keine Vermittlungs&shy;gebühr'
    : 'Persönlicher<br>Ansprechpartner,<br>7&nbsp;Tage/Woche';
  // Feste Breite = Logo bei 14 px Höhe; max-width lässt die Leiste auf
  // schmalen Bildschirmen gleichmäßig schrumpfen (Outlook nimmt die
  // width/height-Attribute, max-width kennt es nicht — dort ist Platz).
  const logos = o.presseLogos ? `
  <tr>
    <td style="background:#ffffff;border-top:1px solid #e8ddd0;padding:12px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${LOGOS.map(([datei, alt, breite]) => `
        <td style="text-align:center;vertical-align:middle;padding:0 4px;"><img src="${site}/images/media/${datei}" alt="${alt}" width="${breite}" height="14" style="display:inline-block;width:${breite}px;max-width:100%;height:auto;opacity:0.4;filter:grayscale(100%);" /></td>`).join('')}
      </tr></table>
    </td>
  </tr>` : '';
  return `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${o.abstandUnten ?? 24}px 0;border:1px solid #e8ddd0;border-radius:12px;overflow:hidden;">
  <tr>
    <td style="padding:18px 20px 16px;background:#ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="vertical-align:top;">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="padding-right:12px;vertical-align:top;">
                  <img src="${MARTA_FOTO_URL}" alt="Marta Kapcio" width="60" style="display:block;width:60px;height:auto;border-radius:8px;" />
                </td>
                <td style="vertical-align:middle;">
                  <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#3D2B1F;text-align:left;">Marta Kapcio</p>
                  <p style="margin:0 0 2px;font-size:13px;color:#555;text-align:left;">Pflegeberaterin</p>
                  <p style="margin:0;font-size:12px;color:#9a8a73;text-align:left;"><span style="white-space:nowrap;">Mo – So,</span> <span style="white-space:nowrap;">8 – 20 Uhr</span></p>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:12px;">
              <tr>
                <td class="sig-pille" style="padding-right:6px;"><a class="sig-pille-link" href="tel:+4989200000830" aria-label="Marta anrufen: 089 200 000 830" title="Marta anrufen: 089 200 000 830" style="${PILLE}background-color:#f0ebe4;font-weight:500;color:#3D2B1F;"><span class="sig-pille-text">&#9990; Anrufen</span><img class="sig-pille-bild" src="${site}/images/mail-icon-telefon.png" alt="Anrufen" width="20" height="20" style="${SYMBOL}" /></a></td>
                <td class="sig-pille"><a class="sig-pille-link" href="https://wa.me/4989200000830" aria-label="WhatsApp an Marta: 089 200 000 830" title="WhatsApp an Marta: 089 200 000 830" style="${PILLE}background-color:#25D366;font-weight:600;color:#ffffff;"><span class="sig-pille-text">WhatsApp</span><img class="sig-pille-bild" src="${site}/images/mail-icon-whatsapp.png" alt="WhatsApp" width="20" height="20" style="${SYMBOL}" /></a></td>
              </tr>
            </table>${sterne}
          </td>
          <td style="vertical-align:top;text-align:right;padding-left:12px;">
            <table cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;margin-left:auto;">
              <tr>
                <td class="sig-siegel-innen" style="padding:8px 10px;background:#ffffff;text-align:center;vertical-align:top;">
                  <img class="sig-siegel-bild" src="${site}/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="64" style="display:block;width:64px;height:auto;margin:0 auto 5px;" />
                  <p style="margin:0 0 1px;font-size:11px;font-weight:700;color:#3D2B1F;text-align:center;"><span style="white-space:nowrap;">6× Testsieger</span> <span class="sig-siegel-welt" style="color:#B5A184;white-space:nowrap;">DIE WELT</span></p>
                  <p style="margin:0;font-size:10px;color:#888;line-height:1.4;text-align:center;"><span style="white-space:nowrap;">Preis, Qualität &amp;</span><br>Kundenservice</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>${sterneHandy}
    </td>
  </tr>
  <tr>
    <td style="background:#f9f6f2;border-top:1px solid #e8ddd0;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding:12px 4px;text-align:center;width:33%;border-right:1px solid #e8ddd0;"><p style="${FAKT}">Über 20 Jahre<br>Erfahrung</p></td>
        <td style="padding:12px 4px;text-align:center;width:33%;border-right:1px solid #e8ddd0;"><p style="${FAKT}">60.000+<br>betreute Einsätze</p></td>
        <td style="padding:12px 4px;text-align:center;width:33%;"><p style="${FAKT}">${dritterFakt}</p></td>
      </tr></table>
    </td>
  </tr>${logos}
</table>`;
}
