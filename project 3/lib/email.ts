import { Lead } from './lead-management';
import { Kalkulation, detectGenderFromName, usableNamePart as cleanNamePart } from './calculation';
import { getEmailLayout } from './email-template';
import { PORTAL_BASIS } from './portal-url';

// Eigennamen sauber großschreiben: jedes Wort + jeden Bindestrich-Teil
// kapitalisieren. Namens-Partikel (von, van, de, zu, …) bleiben klein —
// außer ganz am Anfang ("Von Stein" wenn es das erste Wort ist). ALL-CAPS
// wird normalisiert ("SANTUS" → "Santus"), gemischte Schreibung bleibt
// erhalten ("McDonald" → "McDonald"). Kunden tippen oft alles klein
// ("marco santus") — die Anrede + Kontaktdaten sollen trotzdem sauber sein.
const NAME_PARTICLES = new Set([
  'von', 'vom', 'van', 'de', 'del', 'della', 'di', 'da', 'dos', 'das',
  'der', 'den', 'ten', 'ter', 'zu', 'zur', 'zum', 'le', 'la', 'y', 'af', 'of',
]);
function capWord(w: string): string {
  if (!w) return w;
  const rest = w === w.toUpperCase() ? w.slice(1).toLowerCase() : w.slice(1);
  return w.charAt(0).toUpperCase() + rest;
}
function capitalize(name: string): string {
  if (!name) return name;
  return name.trim().split(/\s+/).map((word) =>
    word.split('-').map((part) =>
      // Partikel (von, van, de, zu, …) immer klein — auch am Anfang, weil im
      // Namen eine Anrede davorsteht ("Herr von Stein", nicht "Herr Von Stein").
      NAME_PARTICLES.has(part.toLowerCase()) ? part.toLowerCase() : capWord(part),
    ).join('-'),
  ).join(' ');
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export function getBestaetigunsEmailTemplate(email: string): EmailTemplate {
  return {
    subject: 'Ihre Anfrage ist eingegangen – Primundus 24h-Pflege',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5; color: #333; }
          .wrapper { max-width: 600px; margin: 0 auto; background: white; }
          .header { background-color: #5C4A32; padding: 30px 40px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 22px; font-weight: 600; }
          .content { padding: 40px; }
          .content p { line-height: 1.7; margin: 0 0 16px; }
          .checkmark { color: #4CAF50; font-size: 48px; text-align: center; margin: 0 0 20px; }
          .footer { background: #f5f5f5; padding: 24px 40px; text-align: center; font-size: 12px; color: #888; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="header">
            <h1>Primundus 24h-Pflege</h1>
          </div>
          <div class="content">
            <div class="checkmark">&#10003;</div>
            <p><strong>Vielen Dank fuer Ihre Anfrage!</strong></p>
            <p>Wir haben Ihre Anfrage erhalten und werden uns schnellstmoeglich bei Ihnen melden.</p>
            <p>Ihr persoenlicher Berater kontaktiert Sie in der Regel innerhalb von 24 Stunden, um alles Weitere mit Ihnen zu besprechen.</p>
            <p>Bei dringenden Fragen erreichen Sie uns unter: <strong>089 200 000 830</strong></p>
            <p>Herzliche Gruesse<br><strong>Ihr Primundus-Team</strong></p>
          </div>
          <div class="footer">
            <p>Primundus Deutschland | 24h-Pflege und Betreuung<br>
            Telefon: 089 200 000 830 | E-Mail: info@primundus.de</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Vielen Dank fuer Ihre Anfrage!

Wir haben Ihre Anfrage erhalten und werden uns schnellstmoeglich bei Ihnen melden.

Ihr persoenlicher Berater kontaktiert Sie in der Regel innerhalb von 24 Stunden.

Bei dringenden Fragen: 089 200 000 830

Herzliche Gruesse
Ihr Primundus-Team

Primundus Deutschland | 24h-Pflege und Betreuung
Telefon: 089 200 000 830 | E-Mail: info@primundus.de
    `,
  };
}

export function getKalkulationEmailTemplate(
  email: string,
  kalkulation: Kalkulation,
  leadId: string,
  siteUrl?: string,
  anrede?: string,
  vorname?: string,
  nachname?: string
): EmailTemplate {
  const baseUrl = siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';
  const eigenanteil = kalkulation.eigenanteil.toFixed(2).replace('.', ',');
  const kalkulationUrl = `${baseUrl}/kalkulation/${leadId}`;

  // Generate greeting – use explicit anrede if given, otherwise auto-detect from first name
  const effectiveAnrede = anrede || (vorname ? detectGenderFromName(vorname) : null);
  const safeVorname = cleanNamePart(vorname);
  const safeNachname = cleanNamePart(nachname);
  let greeting = 'Guten Tag';
  if (effectiveAnrede === 'Familie' && (safeNachname || safeVorname)) {
    greeting = `Guten Tag Familie ${capitalize(safeNachname || safeVorname)}`;
  } else if ((effectiveAnrede === 'Frau' || effectiveAnrede === 'Herr') && safeNachname) {
    greeting = `Guten Tag ${effectiveAnrede} ${capitalize(safeNachname)}`;
  } else if (effectiveAnrede && safeVorname) {
    // Gender known but no usable last name → first name only.
    greeting = 'Guten Tag';
  }
  // else: salutation unknown → neutral "Guten Tag," (no name).

  const content = `
    <p style="font-size: 14px; line-height: 1.4; color: #8B7355; margin: 0 0 25px 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Ihre persönliche Kalkulation</p>

    <p style="font-size: 18px; line-height: 1.6; color: #333;">${greeting},</p>

    <p style="font-size: 16px; line-height: 1.7; color: #555;">vielen Dank für Ihr Interesse an unserer 24h-Pflege. Wir haben Ihre <strong>individuelle Kostenberechnung</strong> erstellt – transparent, detailliert und sofort abrufbar.</p>

    <div style="margin: 35px 0; text-align: center;">
      <a href="${kalkulationUrl}" class="cta-button" style="display: inline-block; background: linear-gradient(135deg, #B5A184 0%, #9A8A73 100%); color: #ffffff; text-decoration: none; padding: 18px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(181, 161, 132, 0.35); transition: all 0.3s ease;">
        📄 Kalkulation jetzt ansehen & als PDF speichern
      </a>
    </div>

    <div style="background: #F5F0E8; border-radius: 8px; padding: 25px; margin: 25px 0;">
      <h3 style="color: #3D2B1F; font-size: 17px; font-weight: 600; margin: 0 0 15px 0; text-align: center;">
        Das ist in Ihrer Kalkulation enthalten:
      </h3>
      <ul style="margin: 0; padding: 0; list-style: none; text-align: left;">
        <li style="margin-bottom: 10px; padding-left: 0; font-size: 15px; color: #555; text-align: left;">
          <strong>• Individuelle Kostenberechnung</strong> basierend auf Ihren Angaben
        </li>
        <li style="margin-bottom: 10px; padding-left: 0; font-size: 15px; color: #555; text-align: left;">
          <strong>• Alle Zuschüsse & Förderungen</strong> (Pflegegeld, Entlastungsbudget, etc.)
        </li>
        <li style="margin-bottom: 0; padding-left: 0; font-size: 15px; color: #555; text-align: left;">
          <strong>• Steuervorteile</strong> und Finanzierungsoptionen
        </li>
      </ul>
    </div>

    <hr class="divider" style="border: 0; border-top: 2px solid #E5E5E5; margin: 40px 0;">

    <div style="background: #F5F0E8; border-radius: 8px; padding: 30px 25px; margin: 25px 0; border-left: 4px solid #B5A184;">
      <h3 style="color: #3D2B1F; font-size: 19px; font-weight: 600; margin: 0 0 10px 0;">So geht es jetzt weiter</h3>
      <p style="font-size: 14px; line-height: 1.6; color: #666; margin: 0 0 25px 0;">In 3 einfachen Schritten zur 24-Stunden-Betreuung</p>

      <div style="background: white; border-radius: 6px; padding: 20px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 15px 0; border-bottom: 1px solid #f0f0f0; vertical-align: top;">
              <div style="display: inline-block; width: 36px; height: 36px; background: #5C4033; color: white; border-radius: 50%; text-align: center; line-height: 36px; font-weight: bold; font-size: 16px; margin-right: 12px; vertical-align: top;">1</div>
              <div style="display: inline-block; vertical-align: top; width: calc(100% - 55px);">
                <strong style="color: #3D2B1F; font-size: 15px; display: block; margin-bottom: 6px;">Sie beauftragen uns</strong>
                <span style="color: #555; font-size: 13px; line-height: 1.5; display: block; margin-bottom: 8px;">Entscheiden Sie sich für Primundus und beauftragen Sie uns mit der Vermittlung einer passenden Pflegekraft für Ihre individuelle Situation.</span>
                <span style="display: inline-block; background: #E8F5E9; color: #2E7D32; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;">✓ Täglich kündbar</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 15px 0; border-bottom: 1px solid #f0f0f0; vertical-align: top;">
              <div style="display: inline-block; width: 36px; height: 36px; background: #5C4033; color: white; border-radius: 50%; text-align: center; line-height: 36px; font-weight: bold; font-size: 16px; margin-right: 12px; vertical-align: top;">2</div>
              <div style="display: inline-block; vertical-align: top; width: calc(100% - 55px);">
                <strong style="color: #3D2B1F; font-size: 15px; display: block; margin-bottom: 6px;">Sie erhalten Personalvorschläge</strong>
                <span style="color: #555; font-size: 13px; line-height: 1.5; display: block; margin-bottom: 8px;">Wir senden Ihnen passende Pflegekräfte-Profile zu. Sie entscheiden, welche Betreuungskraft am besten zu Ihnen und Ihren Angehörigen passt.</span>
                <span style="display: inline-block; background: #E8F5E9; color: #2E7D32; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;">👤 Erfahrene Pflegekräfte</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 15px 0; vertical-align: top;">
              <div style="display: inline-block; width: 36px; height: 36px; background: #5C4033; color: white; border-radius: 50%; text-align: center; line-height: 36px; font-weight: bold; font-size: 16px; margin-right: 12px; vertical-align: top;">3</div>
              <div style="display: inline-block; vertical-align: top; width: calc(100% - 55px);">
                <strong style="color: #3D2B1F; font-size: 15px; display: block; margin-bottom: 6px;">Die Betreuung beginnt</strong>
                <span style="color: #555; font-size: 13px; line-height: 1.5; display: block; margin-bottom: 8px;">Die Pflegekraft reist an und beginnt mit der Betreuung. Kosten entstehen erst, wenn die Pflegekraft tatsächlich bei Ihnen arbeitet.</span>
                <span style="display: inline-block; background: #E8F5E9; color: #2E7D32; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;">✓ Tagesgenaue Abrechnung</span>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <div style="margin-top: 25px; text-align: center;">
        <a href="${baseUrl}/lead?email=${encodeURIComponent(email)}" class="cta-button" style="display: inline-block; background: linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%); color: #ffffff; text-decoration: none; padding: 18px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(46, 125, 50, 0.35);">
          🎯 Jetzt Angebot anfordern
        </a>
      </div>
    </div>

    <div class="info-box" style="background-color: #E8F5E9; border-left: 4px solid #4CAF50; padding: 20px; margin: 25px 0; border-radius: 6px;">
      <strong style="color: #2E7D32; font-size: 15px;">💚 Gut zu wissen:</strong>
      <span style="color: #555; font-size: 15px;"> Die Kalkulation ist unverbindlich und Sie gehen keinerlei Verpflichtungen ein.</span>
    </div>

    <div style="background: #F5F0E8; border-radius: 8px; padding: 20px; margin: 30px 0 20px 0; border-left: 4px solid #B5A184;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Bei Fragen stehen wir Ihnen gerne zur Verfügung:</p>
      <p style="margin: 0; font-size: 20px; font-weight: 600; color: #6B5B45;">
        📞 089 200 000 830
      </p>
    </div>

    <p style="font-size: 16px; line-height: 1.7; color: #555; margin-top: 30px;">Herzliche Grüße<br><strong style="color: #3D2B1F;">Ihr Primundus-Team</strong></p>
  `;

  const preheader = `Ihr monatlicher Eigenanteil: ${eigenanteil} € - Jetzt Kalkulation ansehen`;

  const html = getEmailLayout({ content, preheader, siteUrl: baseUrl }).replace('{{EMAIL}}', email);

  return {
    subject: 'Ihre persönliche 24h-Pflege-Kalkulation',
    html,
    text: `
Ihre persönliche 24h-Pflege-Kalkulation

${greeting},

vielen Dank für Ihr Interesse an unserer 24h-Pflege. Hier ist Ihre persönliche Kostenübersicht mit:

• Individueller Kostenberechnung basierend auf Ihren Angaben
• Allen Zuschüssen und Förderungen (Pflegegeld, Entlastungsbudget, etc.)
• Steuervorteilen und Finanzierungsoptionen

---
IHR MONATLICHER EIGENANTEIL: ${eigenanteil} €
(bereits abzüglich aller Zuschüsse)
---

Diese Kalkulation können Sie in Ruhe mit Ihrer Familie besprechen, als PDF speichern oder ausdrucken.

Kalkulation jetzt ansehen & als PDF speichern:
${kalkulationUrl}

---

WIE GEHT ES WEITER?

Wenn Sie möchten, können Sie jetzt ein unverbindliches Angebot mit passenden Pflegekräfte-Profilen anfordern:

1. Wir erstellen für Sie kostenlos passende Profile
2. Ihr persönlicher Berater meldet sich innerhalb von 24 Stunden
3. Sie entscheiden in Ruhe, ob und wann Sie starten möchten

Jetzt Angebot anfordern:
${baseUrl}/lead

Gut zu wissen: Die Kalkulation ist unverbindlich und Sie gehen keinerlei Verpflichtungen ein.

Bei Fragen stehen wir Ihnen gerne telefonisch zur Verfügung: 089 200 000 830

Herzliche Grüße
Ihr Primundus-Team

---
Primundus Deutschland | 24h-Pflege und Betreuung
Telefon: 089 200 000 830 | E-Mail: info@primundus.de
www.primundus.de
    `,
  };
}

export function getEingangsbestaetigungEmailTemplate(
  lead: Lead,
  kalkulation: Kalkulation
): EmailTemplate {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';

  const fd = (kalkulation as any)?.formularDaten || {};

  const LABELS: Record<string, Record<string, string>> = {
    betreuung_fuer: { '1-person': '1 Person', 'ehepaar': '2 Personen' },
    mobilitaet: { 'mobil': 'Mobil', 'rollator': 'Eingeschränkt – Rollator', 'rollstuhl': 'Rollstuhl', 'bettlaegerig': 'Bettlägerig' },
    nachteinsaetze: { 'nein': 'Nein', 'gelegentlich': 'Gelegentlich', 'taeglich': 'Täglich (1×)', 'mehrmals': 'Mehrmals nachts' },
    deutschkenntnisse: { 'grundlegend': 'Grundlegend', 'kommunikativ': 'Kommunikativ', 'sehr-gut': 'Gut' },
    fuehrerschein: { 'ja': 'Ja', 'nein': 'Nein / nicht unbedingt' },
    geschlecht: { 'egal': 'Egal', 'weiblich': 'Weiblich', 'maennlich': 'Männlich' },
    erfahrung: { 'keine': 'Keine Anforderung', 'wuenschenswert': 'Wünschenswert', 'zwingend': 'Zwingend erforderlich' },
    weitere_personen: { 'ja': 'Ja', 'nein': 'Nein' },
    care_start_timing: { 'sofort': 'Sofort (4–7 Werktage)', '2-4-wochen': 'In 2–4 Wochen', '1-2-monate': 'In 1–2 Monaten', 'unklar': 'Ich informiere mich nur' },
  };

  const lbl = (key: string, val: string) => LABELS[key]?.[val] || val || 'Nicht angegeben';

  const betreuungFuer   = lbl('betreuung_fuer',    fd.betreuung_fuer);
  const pflegegrad      = fd.pflegegrad ? `Pflegegrad ${fd.pflegegrad}` : 'Nicht angegeben';
  const weiterePersonen = lbl('weitere_personen',  fd.weitere_personen);
  const mobilitaet      = lbl('mobilitaet',        fd.mobilitaet);
  const nachteinsaetze  = lbl('nachteinsaetze',    fd.nachteinsaetze);
  const deutschkenntnisse = lbl('deutschkenntnisse', fd.deutschkenntnisse);
  const erfahrung       = lbl('erfahrung',         fd.erfahrung);
  const fuehrerschein   = lbl('fuehrerschein',     fd.fuehrerschein);
  const geschlecht      = lbl('geschlecht',        fd.geschlecht);
  const careStartTiming = lbl('care_start_timing', lead.care_start_timing || '');

  const detectedAnrede = lead.anrede_text || detectGenderFromName(lead.vorname || '');
  const eingangsNachname = cleanNamePart(lead.nachname);
  const eingangsVorname = cleanNamePart(lead.vorname);
  let eingangsGreeting: string;
  if (detectedAnrede === 'Frau' && eingangsNachname) {
    eingangsGreeting = `Guten Tag Frau ${capitalize(eingangsNachname)}`;
  } else if (detectedAnrede === 'Herr' && eingangsNachname) {
    eingangsGreeting = `Guten Tag Herr ${capitalize(eingangsNachname)}`;
  } else if (detectedAnrede === 'Familie' && eingangsNachname) {
    eingangsGreeting = `Guten Tag Familie ${capitalize(eingangsNachname)}`;
  } else if (detectedAnrede && eingangsVorname) {
    eingangsGreeting = 'Guten Tag';
  } else {
    eingangsGreeting = 'Guten Tag';
  }

  const martaSignatur = `
    <!-- Marta Signatur-Block -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 32px 0; border: 1px solid #e8ddd0; border-radius: 12px; overflow: hidden;">
      <tr>
        <td style="padding: 18px 20px 16px; background: #ffffff;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="vertical-align: top;">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding-right: 12px; vertical-align: top;">
                      <img src="${baseUrl}/images/marta-kapcio.jpg" alt="Marta Kapcio" width="60" style="display: block; width: 60px; height: auto; border-radius: 8px;" />
                    </td>
                    <td style="vertical-align: middle;">
                      <p style="margin: 0 0 2px 0; font-size: 15px; font-weight: 700; color: #3D2B1F; white-space: nowrap; text-align: left;">Marta Kapcio</p>
                      <p style="margin: 0 0 2px 0; font-size: 13px; color: #555; white-space: nowrap; text-align: left;">Pflegeberaterin</p>
                      <p style="margin: 0; font-size: 12px; color: #9a8a73; white-space: nowrap; text-align: left;">Mo – So, 8 – 20 Uhr</p>
                    </td>
                  </tr>
                </table>
                <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 12px;">
                  <tr>
                    <td style="padding-bottom: 6px;">
                      <a href="tel:+4989200000830" style="display: inline-block; background-color: #f0ebe4; border-radius: 20px; padding: 8px 16px; text-decoration: none; font-size: 13px; font-weight: 500; color: #3D2B1F; white-space: nowrap;">&#9990; 089 200 000 830</a>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a href="https://wa.me/4989200000830" style="display: inline-block; background-color: #25D366; border-radius: 20px; padding: 8px 16px; text-decoration: none; font-size: 13px; font-weight: 600; color: #ffffff; white-space: nowrap;">WhatsApp schreiben</a>
                    </td>
                  </tr>
                </table>
              </td>
              <td style="vertical-align: top; text-align: right;">
                <table cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid #e8ddd0; border-radius: 8px; overflow: hidden; margin-left: auto;">
                  <tr>
                    <td style="padding: 8px 10px; background: #ffffff; text-align: center; vertical-align: top;">
                      <img src="${baseUrl}/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="64" style="display: block; width: 64px; height: auto; margin: 0 auto 5px auto;" />
                      <p style="margin: 0 0 1px 0; font-size: 11px; font-weight: 700; color: #3D2B1F; white-space: nowrap; text-align: center;">Testsieger <span style="color: #B5A184;">DIE WELT</span></p>
                      <p style="margin: 0; font-size: 10px; color: #888; line-height: 1.4; text-align: center;">Preis, Qualität &amp;<br>Kundenservice</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background: #f9f6f2; border-top: 1px solid #e8ddd0;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding: 12px 0; text-align: center; width: 33%; border-right: 1px solid #e8ddd0;">
                <p style="margin: 0; font-size: 12px; color: #555; line-height: 1.4; text-align: center;">Über 20 Jahre<br>Erfahrung</p>
              </td>
              <td style="padding: 12px 0; text-align: center; width: 33%; border-right: 1px solid #e8ddd0;">
                <p style="margin: 0; font-size: 12px; color: #555; line-height: 1.4; text-align: center;">60.000+<br>betreute Einsätze</p>
              </td>
              <td style="padding: 12px 0; text-align: center; width: 33%;">
                <p style="margin: 0; font-size: 12px; color: #555; line-height: 1.4; text-align: center;">Persönlicher<br>Ansprechpartner,<br>7&nbsp;Tage/Woche</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background: #ffffff; border-top: 1px solid #e8ddd0; padding: 14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/die-welt.webp" alt="DIE WELT" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/ard.webp" alt="ARD" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/ndr.webp" alt="NDR" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/sat1.webp" alt="SAT.1" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/bild-der-frau.webp" alt="Bild der Frau" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const content = `
    <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">${eingangsGreeting},</p>

    <p style="font-size: 16px; line-height: 1.7; color: #555; margin-bottom: 24px;">vielen Dank für Ihre Anfrage zur 24h-Pflege. Wir haben Ihre Angaben erhalten und werden Ihnen <strong>schnellstmöglich ein persönliches Angebot</strong> zusenden.</p>

    <!-- Angaben-Tabelle -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 24px 0; border: 1px solid #e8ddd0; border-radius: 8px; overflow: hidden;">
      <tr>
        <td style="background: #f9f6f2; padding: 6px 20px; border-bottom: 1px solid #e8ddd0;">
          <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #9a8a73; text-transform: uppercase;">Ihre Angaben im Überblick</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 4px 20px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${[
              ['Name', [lead.anrede_text, capitalize(lead.vorname || ''), capitalize(lead.nachname || '')].filter(Boolean).join(' ') || 'Nicht angegeben'],
              ['E-Mail', lead.email],
              lead.telefon ? ['Telefon', lead.telefon] : null,
              ['Betreuung für', betreuungFuer],
              ['Weitere Person im Haushalt', weiterePersonen],
              ['Pflegegrad', pflegegrad],
              ['Mobilität', mobilitaet],
              ['Nachteinsätze', nachteinsaetze],
              ['Deutschkenntnisse BK', deutschkenntnisse],
              fd.fuehrerschein ? ['Führerschein BK', fuehrerschein] : null,
              fd.geschlecht ? ['Geschlecht BK', geschlecht] : null,
              ['Betreuungsstart', careStartTiming],
            ].filter(Boolean).map((row, i, arr) => {
              const [label, value] = row as [string, string];
              const isLast = i === arr.length - 1;
              return `<tr>
                <td style="padding: 8px 0; ${isLast ? '' : 'border-bottom: 1px solid #f0ebe4;'} color: #888; font-size: 13px; width: 44%;">${label}</td>
                <td style="padding: 8px 0; ${isLast ? '' : 'border-bottom: 1px solid #f0ebe4;'} color: #333; font-size: 13px; font-weight: 600;">${value}</td>
              </tr>`;
            }).join('')}
          </table>
        </td>
      </tr>
    </table>

    <!-- Nächster Schritt -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 28px 0; border: 1px solid #e8ddd0; border-radius: 8px; overflow: hidden;">
      <tr>
        <td style="background: #f9f6f2; padding: 6px 20px; border-bottom: 1px solid #e8ddd0;">
          <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #9a8a73; text-transform: uppercase;">Nächster Schritt</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 18px 20px; text-align: left;">
          <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #3D2B1F; line-height: 1.3;">Wir senden Ihnen Ihr persönliches Angebot</p>
          <p style="margin: 0; font-size: 14px; color: #666; line-height: 1.6;">Unser Team prüft Ihre Angaben und meldet sich in Kürze – in der Regel noch am selben Werktag.</p>
        </td>
      </tr>
    </table>

    ${(() => {
      // Magic-link section — embedded only when NEXT_PUBLIC_PORTAL_URL is
      // configured AND the lead has a token (i.e. status >= angebot_requested).
      // The link is reusable for the full 14-day token_expires_at window;
      // CA app never flips token_used to true, so the customer can come
      // back to the same URL multiple times.
      const portalBase = PORTAL_BASIS;
      if (!portalBase || !lead.token) return '';
      const portalUrl = `${portalBase.replace(/\/$/, '')}/?token=${encodeURIComponent(lead.token)}`;
      return `
    <div style="background: linear-gradient(135deg, #2D5C2F 0%, #1F4421 100%); border-radius: 10px; padding: 28px; margin: 0 0 28px 0; text-align: center; color: #ffffff;">
      <h3 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">Ihr persönlicher Portal-Link</h3>
      <p style="color: #E8F5E9; font-size: 14px; line-height: 1.6; margin: 0 0 18px 0;">In Ihrem Kundenportal finden Sie passende Pflegekräfte und können direkt Kontakt aufnehmen. Der Link bleibt 14 Tage aktiv und kann jederzeit erneut verwendet werden.</p>
      <a href="${portalUrl}" style="display: inline-block; background: #ffffff; color: #2D5C2F; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px;">Pflegekraft jetzt finden →</a>
    </div>`;
    })()}

    <p style="font-size: 16px; line-height: 1.7; color: #555; margin-bottom: 20px; text-align: left;">Mit freundlichen Grüßen<br><strong style="color: #3D2B1F;">Marta Kapcio</strong></p>

    ${martaSignatur}
  `;

  const preheader = 'Ihre Anfrage ist eingegangen - Wir melden uns in Kürze';

  const html = getEmailLayout({ content, preheader, siteUrl: baseUrl }).replace('{{EMAIL}}', lead.email);

  return {
    subject: 'Ihre Anfrage ist eingegangen – Primundus 24h-Pflege',
    html,
    text: `
Ihre Anfrage ist eingegangen – Primundus 24h-Pflege

${eingangsGreeting},

vielen Dank für Ihre Anfrage zur 24h-Pflege. Wir haben Ihre Angaben erhalten und werden Ihnen schnellstmöglich ein persönliches Angebot zusenden.

IHRE ANGABEN IM ÜBERBLICK

Name: ${lead.vorname || 'Nicht angegeben'}
E-Mail: ${lead.email}
${lead.telefon ? `Telefon: ${lead.telefon}` : ''}
Betreuung für: ${betreuungFuer}
Weitere Personen: ${weiterePersonen}
Pflegegrad: ${pflegegrad}
Mobilität: ${mobilitaet}
Nachteinsätze: ${nachteinsaetze}
Deutschkenntnisse: ${deutschkenntnisse}
Erfahrung: ${erfahrung}
Führerschein: ${fuehrerschein}
Geschlecht: ${geschlecht}
Wann soll die Betreuung starten?: ${careStartTiming}

WIE GEHT ES WEITER?

Unser Team prüft Ihre Anfrage und meldet sich in Kürze mit einem passenden Angebot bei Ihnen.
${(() => {
  const portalBase = PORTAL_BASIS;
  if (!portalBase || !lead.token) return '';
  const portalUrl = `${portalBase.replace(/\/$/, '')}/?token=${encodeURIComponent(lead.token)}`;
  return `
IHR PERSÖNLICHER PORTAL-LINK

In Ihrem Kundenportal finden Sie passende Pflegekräfte und können direkt Kontakt aufnehmen. Der Link bleibt 14 Tage aktiv und kann jederzeit erneut verwendet werden.

${portalUrl}
`;
})()}
Bei Fragen stehen wir Ihnen gerne telefonisch zur Verfügung: +49 89 200 000 830

Herzliche Grüße
Ihr Primundus-Team

---
Primundus Deutschland | 24h-Pflege und Betreuung
Telefon: +49 89 200 000 830 | E-Mail: info@primundus.de
www.primundus.de
    `,
  };
}

export function getAngebotsEmailTemplate(
  lead: Lead,
  kalkulation: Kalkulation,
  options?: { isResend?: boolean }
): EmailTemplate {
  const isResend = options?.isResend === true;
  const kalkulationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/kalkulation/${lead.id}`;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';

  const anrede = lead.anrede_text || detectGenderFromName(lead.vorname || '') || '';
  const nachname = cleanNamePart(lead.nachname);
  const vorname = cleanNamePart(lead.vorname);

  let anredeText: string;
  if (anrede === 'Frau' && nachname) {
    anredeText = `Sehr geehrte Frau ${capitalize(nachname)}`;
  } else if (anrede === 'Herr' && nachname) {
    anredeText = `Sehr geehrter Herr ${capitalize(nachname)}`;
  } else if (anrede === 'Familie' && nachname) {
    anredeText = `Sehr geehrte Familie ${capitalize(nachname)}`;
  } else if (anrede && vorname) {
    anredeText = 'Guten Tag';
  } else {
    anredeText = 'Guten Tag';
  }

  const introText = isResend
    ? 'wie gewünscht senden wir Ihnen Ihr persönliches Angebot noch einmal zu.'
    : 'vielen Dank für Ihre Anfrage. Auf Grundlage Ihrer Angaben haben wir Ihr <strong>persönliches Angebot</strong> für die 24-Stunden-Betreuung zu Hause erstellt.';

  const resendNotice = isResend ? `
    <div style="background-color: #f9f6f2; border: 1px solid #e8ddd0; border-radius: 6px; padding: 12px 16px; margin-top: 32px;">
      <p style="margin: 0; font-size: 13px; color: #9a8a73; line-height: 1.5;">
        ℹ️ Diese E-Mail wurde auf Ihre Bitte hin erneut zugesendet und enthält Ihr aktuelles persönliches Angebot.
      </p>
    </div>
  ` : '';

  const kalkulationAny = kalkulation as any;
  const bruttopreis = kalkulationAny.bruttopreis || 0;
  const tagessatz = bruttopreis ? Math.round(bruttopreis / 30).toLocaleString('de-DE') : null;
  const zuschussItems: Array<{ label: string; betrag_monatlich: number }> =
    (kalkulation.zuschüsse?.items || []).filter((z: any) => z.in_kalkulation && z.betrag_monatlich > 0);
  const zuschussGesamt = zuschussItems.reduce((s, z) => s + z.betrag_monatlich, 0);
  const zuschussGesamtFormatted = zuschussGesamt > 0 ? Math.round(zuschussGesamt).toLocaleString('de-DE') : null;

  const priceBox = tagessatz ? `
    <!-- Preisbox -->
    <div style="border: 1px solid #e8ddd0; border-radius: 8px; background: #faf8f5; padding: 18px 20px; margin: 24px 0 20px 0;">
      <p style="margin: 0 0 3px 0; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: #9a8a73; text-transform: uppercase;">Tagessatz</p>
      <p style="margin: 0 0 6px 0; font-size: 30px; font-weight: 700; color: #3D2B1F; line-height: 1.1;">${tagessatz} €<span style="font-size: 16px; font-weight: 400; color: #888;">/Tag</span></p>
      <p style="margin: 0; font-size: 13px; color: #888; line-height: 1.6;">inkl. Steuern &amp; Sozialabgaben, zzgl. Kost &amp; Logis sowie Fahrtkosten je 125 €</p>
      ${zuschussGesamtFormatted ? `
      <p style="margin: 14px 0 0 0; font-size: 13px; color: #555; line-height: 1.7; padding-top: 14px; border-top: 1px solid #e8ddd0;">
        Mögliche Fördermittel bis zu <strong style="color: #5a8a4e;">${zuschussGesamtFormatted} €/Mon.</strong> – Weitere Details finden Sie im Angebot.
      </p>` : ''}
    </div>

    <!-- CTA Button -->
    <div style="margin: 0 0 24px 0; text-align: center;">
      <a href="${kalkulationUrl}" style="display: inline-block; background: linear-gradient(135deg, #B5A184 0%, #9A8A73 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(181, 161, 132, 0.35);">
        Angebot jetzt einsehen
      </a>
    </div>

    <!-- Benefits – single column -->
    <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: #9a8a73; text-transform: uppercase;">Ihre Vorteile nur bei Primundus</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 28px 0;">
      <tr><td style="padding: 4px 0; font-size: 13px; color: #5C4A32;">✓ Täglich kündbar</td></tr>
      <tr><td style="padding: 4px 0; font-size: 13px; color: #5C4A32;">✓ Tagesgenaue Abrechnung</td></tr>
      <tr><td style="padding: 4px 0; font-size: 13px; color: #5C4A32;">✓ Keine Kosten vor Anreise</td></tr>
      <tr><td style="padding: 4px 0; font-size: 13px; color: #5C4A32;">✓ Persönlicher Ansprechpartner, 7&nbsp;Tage/Woche</td></tr>
    </table>
  ` : '';

  const content = `
    <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">${anredeText},</p>

    <p style="font-size: 16px; line-height: 1.7; color: #555; margin-bottom: 20px;">${introText}</p>

    ${priceBox}

    <!-- Nächster Schritt -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 28px 0; border: 1px solid #e8ddd0; border-radius: 8px; overflow: hidden;">
      <tr>
        <td style="background: #f9f6f2; padding: 6px 20px 6px 20px; border-bottom: 1px solid #e8ddd0;">
          <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #9a8a73; text-transform: uppercase;">Nächster Schritt</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 18px 20px;">
          <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #3D2B1F; line-height: 1.3;">Wir senden Ihnen passende Personalprofile</p>
          <p style="margin: 0; font-size: 14px; color: #666; line-height: 1.6;">Geben Sie uns kurz Bescheid – per Telefon, WhatsApp oder einfach per Antwort auf diese E-Mail.</p>
        </td>
      </tr>
    </table>

    <div style="background-color: #f0f7ee; border-left: 4px solid #7aab6e; padding: 18px 20px; margin: 0 0 28px 0; border-radius: 0 6px 6px 0;">
      <p style="color: #444; font-size: 15px; margin: 0; line-height: 1.6;">Für Sie bleibt selbstverständlich alles <strong>unverbindlich</strong>, bis Sie sich für eine passende Betreuungskraft entscheiden und diese anreist.</p>
    </div>

    <p style="font-size: 16px; line-height: 1.7; color: #555; margin-top: 30px; margin-bottom: 20px;">Mit freundlichen Grüßen<br><strong style="color: #3D2B1F;">Marta Kapcio</strong></p>

    <!-- Marta Signatur-Block -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 32px 0; border: 1px solid #e8ddd0; border-radius: 12px; overflow: hidden;">
      <!-- Marta + Testsieger -->
      <tr>
        <td style="padding: 18px 20px 16px; background: #ffffff;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <!-- Photo + Info + Buttons below -->
              <td style="vertical-align: top;">
                <!-- Photo + Name row -->
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding-right: 12px; vertical-align: top;">
                      <img src="${baseUrl}/images/marta-kapcio.jpg" alt="Marta Kapcio" width="60"
                        style="display: block; width: 60px; height: auto; border-radius: 8px;" />
                    </td>
                    <td style="vertical-align: middle;">
                      <p style="margin: 0 0 2px 0; font-size: 15px; font-weight: 700; color: #3D2B1F; text-align: left; white-space: nowrap;">Marta Kapcio</p>
                      <p style="margin: 0 0 2px 0; font-size: 13px; color: #555; text-align: left; white-space: nowrap;">Pflegeberaterin</p>
                      <p style="margin: 0; font-size: 12px; color: #9a8a73; text-align: left; white-space: nowrap;">Mo – So, 8 – 20 Uhr</p>
                    </td>
                  </tr>
                </table>
                <!-- Buttons below photo/name -->
                <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 12px;">
                  <tr>
                    <td style="padding-bottom: 6px;">
                      <a href="tel:+4989200000830" style="display: inline-block; background-color: #f0ebe4; border-radius: 20px; padding: 8px 16px; text-decoration: none; font-size: 13px; font-weight: 500; color: #3D2B1F; white-space: nowrap;">&#9990; 089 200 000 830</a>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a href="https://wa.me/4989200000830" style="display: inline-block; background-color: #25D366; border-radius: 20px; padding: 8px 16px; text-decoration: none; font-size: 13px; font-weight: 600; color: #ffffff; white-space: nowrap;">WhatsApp schreiben</a>
                    </td>
                  </tr>
                </table>
              </td>
              <!-- Testsieger badge – rechts, kleiner -->
              <td style="vertical-align: top; text-align: right;">
                <table cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid #e8ddd0; border-radius: 8px; overflow: hidden; margin-left: auto;">
                  <tr>
                    <td style="padding: 8px 10px; background: #ffffff; text-align: center; vertical-align: top;">
                      <img src="${baseUrl}/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="64" style="display: block; width: 64px; height: auto; margin: 0 auto 5px auto;" />
                      <p style="margin: 0 0 1px 0; font-size: 11px; font-weight: 700; color: #3D2B1F; white-space: nowrap; text-align: center;">Testsieger <span style="color: #B5A184;">DIE WELT</span></p>
                      <p style="margin: 0; font-size: 10px; color: #888; line-height: 1.4; text-align: center;">Preis, Qualität &amp;<br>Kundenservice</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Stats row -->
      <tr>
        <td style="background: #f9f6f2; border-top: 1px solid #e8ddd0;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding: 12px 0; text-align: center; width: 33%; border-right: 1px solid #e8ddd0;">
                <p style="margin: 0; font-size: 12px; color: #555; line-height: 1.4; text-align: center;">Über 20 Jahre<br>Erfahrung</p>
              </td>
              <td style="padding: 12px 0; text-align: center; width: 33%; border-right: 1px solid #e8ddd0;">
                <p style="margin: 0; font-size: 12px; color: #555; line-height: 1.4; text-align: center;">60.000+<br>betreute Einsätze</p>
              </td>
              <td style="padding: 12px 0; text-align: center; width: 33%;">
                <p style="margin: 0; font-size: 12px; color: #555; line-height: 1.4; text-align: center;">Persönlicher<br>Ansprechpartner,<br>7&nbsp;Tage/Woche</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <!-- Media logos – kleiner -->
      <tr>
        <td style="background: #ffffff; border-top: 1px solid #e8ddd0; padding: 14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;">
                <img src="${baseUrl}/images/media/die-welt.webp" alt="DIE WELT" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" />
              </td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;">
                <img src="${baseUrl}/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" />
              </td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;">
                <img src="${baseUrl}/images/media/ard.webp" alt="ARD" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" />
              </td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;">
                <img src="${baseUrl}/images/media/ndr.webp" alt="NDR" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" />
              </td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;">
                <img src="${baseUrl}/images/media/sat1.webp" alt="SAT.1" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" />
              </td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;">
                <img src="${baseUrl}/images/media/bild-der-frau.webp" alt="Bild der Frau" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" />
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${resendNotice}
  `;

  const preheader = isResend
    ? 'Ihr persönliches Angebot zur 24-Stunden-Betreuung – erneut zugesendet'
    : 'Ihr persönliches Angebot zur 24-Stunden-Betreuung ist bereit';

  const html = getEmailLayout({ content, preheader, siteUrl: baseUrl }).replace('{{EMAIL}}', lead.email);

  const subject = isResend
    ? 'Ihr Angebot zur 24-Stunden-Betreuung (erneut zugesendet)'
    : 'Ihr persönliches Angebot zur 24-Stunden-Betreuung';

  return {
    subject,
    html,
    text: `
${subject}

${anredeText},

${isResend ? 'wie gewünscht senden wir Ihnen Ihr persönliches Angebot noch einmal zu.' : 'vielen Dank für Ihre Anfrage.'}

Auf Grundlage Ihrer Angaben haben wir ein persönliches Angebot für die Betreuung im eigenen Zuhause vorbereitet.

In dem Angebot finden Sie eine transparente Übersicht der monatlichen Kosten, mögliche Zuschüsse der Pflegekasse sowie alle wichtigen Informationen zum weiteren Ablauf.

Sie können Ihr persönliches Angebot hier einsehen:
${kalkulationUrl}

Wenn alles für Sie passt, benötigen wir lediglich eine kurze Bestätigung von Ihnen. Dann starten wir direkt mit der Auswahl passender Betreuungskräfte und bereiten parallel alle organisatorischen und vertraglichen Modalitäten vor.

Für Sie bleibt selbstverständlich alles unverbindlich, bis Sie sich für eine passende Betreuungskraft entscheiden und diese anreist.

Mit freundlichen Grüßen
Marta Kapcio

---
Primundus Deutschland | 24h-Pflege und Betreuung
Telefon: +49 89 200 000 830 | E-Mail: info@primundus.de
www.primundus.de
    `,
  };
}

export function getVertragsbestaetigungTemplate(
  lead: Lead,
  vertragId: string
): EmailTemplate {
  const vertragDetectedAnrede = lead.anrede_text || detectGenderFromName(lead.vorname || '');
  const vertragNachname = cleanNamePart(lead.nachname);
  const vertragVorname = cleanNamePart(lead.vorname);
  let vertragGreeting: string;
  if (vertragDetectedAnrede === 'Frau' && vertragNachname) {
    vertragGreeting = `Guten Tag Frau ${capitalize(vertragNachname)}`;
  } else if (vertragDetectedAnrede === 'Herr' && vertragNachname) {
    vertragGreeting = `Guten Tag Herr ${capitalize(vertragNachname)}`;
  } else if (vertragDetectedAnrede === 'Familie' && vertragNachname) {
    vertragGreeting = `Guten Tag Familie ${capitalize(vertragNachname)}`;
  } else if (vertragDetectedAnrede && vertragVorname) {
    vertragGreeting = 'Guten Tag';
  } else {
    vertragGreeting = 'Guten Tag';
  }

  return {
    subject: 'Ihre Beauftragung ist eingegangen',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #5C4A32; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; }
          .success { background: #E8F5E9; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; }
          .highlight { background: #FFF8E7; border-left: 4px solid #5C4A32; padding: 15px; margin: 20px 0; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Beauftragung eingegangen</h1>
          </div>
          <div class="content">
            <p>${vertragGreeting},</p>
            <div class="success">
              <strong>Ihre Beauftragung ist bei uns eingegangen.</strong><br>
              Anbei Ihr Vertrag als PDF.
            </div>
            <p><strong>Nächste Schritte:</strong></p>
            <ol>
              <li>Wir suchen die passende Betreuungskraft.</li>
              <li>Ihr Berater meldet sich innerhalb von 24h mit Profilen.</li>
              <li>Gemeinsam legen wir den Start fest.</li>
            </ol>
            <div class="highlight">
              <strong>Zur Erinnerung:</strong> Tägliche Kündigungsfrist, taggenaue Abrechnung. Sie zahlen erst ab dem tatsächlichen Einsatz.
            </div>
            <p><strong>Fragen?</strong> Rufen Sie uns gerne an: 089 200 000 830</p>
            <p>Herzliche Grüße<br>Ihr Primundus-Team</p>
          </div>
          <div class="footer">
            <p>Primundus Deutschland | 24h-Pflege und Betreuung<br>
            Telefon: 089 200 000 830 | E-Mail: info@primundus.de</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Ihre Beauftragung ist eingegangen ✓

${vertragGreeting},

Ihre Beauftragung ist bei uns eingegangen.
Anbei Ihr Vertrag als PDF.

Nächste Schritte:
1. Wir suchen die passende Betreuungskraft.
2. Ihr Berater meldet sich innerhalb von 24h mit Profilen.
3. Gemeinsam legen wir den Start fest.

Zur Erinnerung: Tägliche Kündigungsfrist, taggenaue
Abrechnung. Sie zahlen erst ab dem tatsächlichen Einsatz.

Fragen? 089 200 000 830

Herzliche Grüße
Ihr Primundus-Team

Primundus Deutschland | 24h-Pflege und Betreuung
Telefon: 089 200 000 830 | E-Mail: info@primundus.de
    `,
  };
}

export function getTeamNotificationTemplate(
  lead: Lead,
  status: string,
  additionalData?: any
): EmailTemplate {
  const statusEmojis = {
    info_requested: '🔵',
    angebot_requested: '🟡',
    patient_data_saved: '🔵',
    caregiver_invited: '🟢',
    caregiver_interest_shown: '💚',
    application_received: '📨',
    application_accepted_internal: '🎉',
    angebots_feedback: '💬',
    vertrag_abgeschlossen: '🟢',
  };

  const statusText = {
    info_requested: 'Neuer Lead – Kalkulation angefordert',
    angebot_requested: 'Neuer Lead – Angebot angefordert',
    patient_data_saved: 'Patientenprofil ausgefüllt',
    caregiver_invited: 'Pflegekraft angefordert',
    caregiver_interest_shown: 'Pflegekraft hat Interesse gezeigt',
    application_received: 'Bewerbung an Kunden gesendet',
    application_accepted_internal: 'Neue Buchung – Kunde hat akzeptiert',
    angebots_feedback: 'Rückmeldung zum Angebot',
    vertrag_abgeschlossen: 'Neuer Vertrag abgeschlossen!',
  };

  const emoji = statusEmojis[status as keyof typeof statusEmojis] || '📋';
  const text = statusText[status as keyof typeof statusText] || 'Lead-Update';

  const kalkulation = lead.kalkulation as any;
  const eigenanteil = kalkulation?.eigenanteil
    ? kalkulation.eigenanteil.toFixed(2).replace('.', ',')
    : 'N/A';

  const aufschluesselung = kalkulation?.aufschluesselung || [];

  const getLabel = (kategorie: string) => {
    const item = aufschluesselung.find((a: any) => a.kategorie === kategorie);
    return item?.label || 'Nicht angegeben';
  };

  const getAntwort = (kategorie: string) => {
    const item = aufschluesselung.find((a: any) => a.kategorie === kategorie);
    return item?.antwort || 'Nicht angegeben';
  };

  const betreuungFuer = getLabel('betreuung_fuer');
  const pflegegrad = getAntwort('pflegegrad');
  const weiterePersonen = getLabel('weitere_personen');
  const mobilitaet = getLabel('mobilitaet');
  const nachteinsaetze = getLabel('nachteinsaetze');
  const deutschkenntnisse = getLabel('deutschkenntnisse');
  const erfahrung = getLabel('erfahrung');
  const fuehrerschein = getLabel('fuehrerschein');
  const geschlecht = getLabel('geschlecht');
  const careStartTiming = lead.care_start_timing || 'Nicht angegeben';

  // Portal-Deeplink für Status, bei denen das Team direkt ins Kundenportal
  // einsteigen soll (Patientenprofil ansehen, Pflegekraft-Vorschau, etc.).
  const portalBase = PORTAL_BASIS;
  // Bei Bewerbungs-Status direkt zur Bewerbungs-Sektion springen (goto),
  // statt den Klicker oben auf der Portal-Startansicht abzusetzen.
  const gotoSuffix = status === 'application_received' ? '&goto=bewerbungen' : '';
  const portalUrl = portalBase && lead.token ? `${portalBase}/?token=${lead.token}${gotoSuffix}` : '';
  const CAREGIVER_NAME_STATUSES = ['caregiver_invited', 'caregiver_interest_shown', 'application_received', 'application_accepted_internal'];
  const PORTAL_CTA_STATUSES = [
    'patient_data_saved',
    'caregiver_invited',
    'caregiver_interest_shown',
    'application_received',
    'application_accepted_internal',
  ];
  const showPortalCta = PORTAL_CTA_STATUSES.includes(status) && Boolean(portalUrl);

  // Rückmeldung zum Angebot (12.08.2026): Die Antwort MUSS in der Mail
  // stehen — „Rückmeldung eingegangen" ohne den Inhalt zwingt zum Nachsehen
  // im Admin und die Mail wäre reiner Lärm.
  const feedbackText = status === 'angebots_feedback' && additionalData?.feedbackText
    ? String(additionalData.feedbackText)
    : '';

  // Pflegekraft-Name aus additionalData (nur bei Caregiver-Events).
  const caregiverName = (CAREGIVER_NAME_STATUSES.includes(status) && additionalData?.caregiverName)
    ? String(additionalData.caregiverName)
    : '';

  // Label je Event — NICHT pauschal "Eingeladene Pflegekraft". Eingeladen ist
  // sie nur bei caregiver_invited (Kunde lädt ein); Interesse / Bewerbung /
  // Buchung sind eigene Zustände.
  const caregiverLabel =
    status === 'caregiver_invited'            ? 'Eingeladene Pflegekraft'
  : status === 'caregiver_interest_shown'     ? 'Pflegekraft mit Interesse'
  : status === 'application_received'         ? 'Beworbene Pflegekraft'
  : status === 'application_accepted_internal' ? 'Akzeptierte Pflegekraft'
  :                                              'Pflegekraft';

  // Acceptance-specific data — contract_patient + contract_contact from the
  // modal's step 2 form, rendered as two tables in the team mail body.
  const contractPatient = (status === 'application_accepted_internal' && additionalData?.contractPatient && typeof additionalData.contractPatient === 'object')
    ? additionalData.contractPatient as Record<string, unknown>
    : null;
  const contractContact = (status === 'application_accepted_internal' && additionalData?.contractContact && typeof additionalData.contractContact === 'object')
    ? additionalData.contractContact as Record<string, unknown>
    : null;
  const acceptanceApplicationId = status === 'application_accepted_internal'
    ? (typeof additionalData?.applicationId === 'number' || typeof additionalData?.applicationId === 'string'
        ? String(additionalData.applicationId)
        : '')
    : '';
  const acceptanceCaregiverId = status === 'application_accepted_internal'
    ? (typeof additionalData?.caregiverId === 'number' || typeof additionalData?.caregiverId === 'string'
        ? String(additionalData.caregiverId)
        : '')
    : '';
  const renderContractTable = (title: string, data: Record<string, unknown> | null, labels: Array<[string, string]>): string => {
    if (!data) return '';
    const rows = labels
      .map(([key, label]) => {
        const v = data[key];
        if (v == null || v === '') return '';
        return `<tr><td style="padding:6px 12px 6px 0;color:#666;font-size:13px;">${label}</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#000;">${String(v)}</td></tr>`;
      })
      .join('');
    if (!rows) return '';
    return `
      <div style="background:#f9f9f9;border-radius:8px;padding:14px 16px;margin:12px 0;">
        <div style="font-weight:700;font-size:14px;color:#000;margin-bottom:8px;">${title}</div>
        <table style="border-collapse:collapse;width:100%;">${rows}</table>
      </div>`;
  };
  const contractTablesHtml = status === 'application_accepted_internal'
    ? renderContractTable('Hauptpatient (vom Kunden im Portal bestätigt)', contractPatient, [
        ['anrede', 'Anrede'],
        ['vorname', 'Vorname'],
        ['nachname', 'Nachname'],
        ['strasse', 'Straße + Nr.'],
        ['einsatzort', 'Einsatzort (PLZ, Ort)'],
        ['telefon', 'Telefon'],
        ['email', 'E-Mail'],
      ]) + renderContractTable('Kontaktperson', contractContact, [
        ['anrede', 'Anrede'],
        ['vorname', 'Vorname'],
        ['nachname', 'Nachname'],
        ['telefon', 'Telefon'],
        ['email', 'E-Mail'],
      ])
    : '';
  const renderContractText = (title: string, data: Record<string, unknown> | null, labels: Array<[string, string]>): string => {
    if (!data) return '';
    const lines = labels
      .map(([key, label]) => {
        const v = data[key];
        if (v == null || v === '') return '';
        return `${label}: ${String(v)}`;
      })
      .filter(Boolean)
      .join('\n');
    if (!lines) return '';
    return `\n${title}:\n${lines}\n`;
  };
  const contractTablesText = status === 'application_accepted_internal'
    ? renderContractText('Hauptpatient', contractPatient, [
        ['anrede', 'Anrede'],
        ['vorname', 'Vorname'],
        ['nachname', 'Nachname'],
        ['strasse', 'Straße + Nr.'],
        ['einsatzort', 'Einsatzort'],
        ['telefon', 'Telefon'],
        ['email', 'E-Mail'],
      ]) + renderContractText('Kontaktperson', contractContact, [
        ['anrede', 'Anrede'],
        ['vorname', 'Vorname'],
        ['nachname', 'Nachname'],
        ['telefon', 'Telefon'],
        ['email', 'E-Mail'],
      ])
    : '';

  // Aktionshinweis unten — Status-spezifisch.
  const actionHighlightHtml =
    status === 'application_accepted_internal' ? '<strong>🎉 Kunde hat akzeptiert — Vertragsdokumente vorbereiten und Kunden anrufen.</strong>'
  : status === 'caregiver_invited'         ? '<strong>📞 Bitte Erstkontakt mit der Pflegekraft anstoßen.</strong>'
  : status === 'caregiver_interest_shown'  ? '<strong>👀 Pflegekraft zeigt Interesse — Kunde hat Hinweis per E-Mail erhalten.</strong>'
  : status === 'application_received'      ? '<strong>📨 Bewerbung wurde an den Kunden gesendet — wartet auf Buchungsbestätigung.</strong>'
  : status === 'patient_data_saved'        ? '<strong>👀 Patientenprofil ist gefüllt — Lead ist warm.</strong>'
  : '<strong>⏰ Keine Aktion erforderlich - Lead wurde automatisch im System erfasst</strong>';
  const actionHighlightText =
    status === 'application_accepted_internal' ? '🎉 Kunde hat akzeptiert — Vertragsdokumente vorbereiten und Kunden anrufen.'
  : status === 'caregiver_invited'         ? '📞 Bitte Erstkontakt mit der Pflegekraft anstoßen.'
  : status === 'caregiver_interest_shown'  ? '👀 Pflegekraft zeigt Interesse — Kunde hat Hinweis per E-Mail erhalten.'
  : status === 'application_received'      ? '📨 Bewerbung wurde an den Kunden gesendet — wartet auf Buchungsbestätigung.'
  : status === 'patient_data_saved'        ? '👀 Patientenprofil ist gefüllt — Lead ist warm.'
  : '⏰ Keine Aktion erforderlich - Lead wurde automatisch im System erfasst';

  // Auto-Annahme-Status (Portal-Annahme → StoreConfirmation in mamamia,
  // seit 2026-07-15): true = Buchung ist bereits synchron im SA-Portal;
  // false = Automatik fehlgeschlagen → MANUELL annehmen; undefined
  // (Detektor-Pfad / ältere Clients) = kein Hinweis.
  const mamamiaAccepted = status === 'application_accepted_internal'
    ? (additionalData as Record<string, unknown> | undefined)?.mamamiaAccepted
    : undefined;
  const autoAcceptHtml = mamamiaAccepted === true
    ? `<div style="background:#EDF9EE;border-left:4px solid #2D6A4F;padding:12px 15px;margin:10px 0;"><strong>✓ Bewerbung wurde automatisch in mamamia angenommen</strong> — die Buchung ist im SA-Portal bereits sichtbar, keine manuelle Annahme nötig.</div>`
    : mamamiaAccepted === false
    ? `<div style="background:#FDF1F1;border-left:4px solid #B02A2A;padding:12px 15px;margin:10px 0;"><strong>⚠️ Automatische Annahme in mamamia FEHLGESCHLAGEN</strong> — bitte die Bewerbung im SA-Portal manuell annehmen, sonst bleibt die Buchung nur intern erfasst.</div>`
    : '';
  const autoAcceptText = mamamiaAccepted === true
    ? '✓ Bewerbung wurde automatisch in mamamia angenommen — keine manuelle Annahme nötig.\n\n'
    : mamamiaAccepted === false
    ? '⚠️ Automatische Annahme in mamamia FEHLGESCHLAGEN — bitte die Bewerbung im SA-Portal manuell annehmen!\n\n'
    : '';

  return {
    subject: `${emoji} ${text}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Courier New', monospace; font-size: 14px; color: #333; }
          .container { max-width: 800px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
          table { width: 100%; border-collapse: collapse; background: white; margin-bottom: 20px; }
          th { background: #5C4A32; color: white; padding: 10px; text-align: left; }
          td { padding: 10px; border-bottom: 1px solid #ddd; }
          .section-title { background: #B5A184; color: white; padding: 10px; margin-top: 20px; }
          .highlight { background: #FFF8E7; padding: 15px; margin: 10px 0; border-left: 4px solid #5C4A32; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>${emoji} ${text}</h2>

          ${feedbackText ? `
            <div class="highlight">
              <strong>Antwort des Kunden:</strong> ${feedbackText}
            </div>
          ` : ''}

          ${caregiverName ? `
            <div class="highlight">
              <strong>${caregiverLabel}:</strong> ${caregiverName}${status === 'application_accepted_internal' && acceptanceCaregiverId ? ` (caregiver_id ${acceptanceCaregiverId})` : ''}${status === 'application_accepted_internal' && acceptanceApplicationId ? ` · Application ${acceptanceApplicationId}` : ''}
            </div>
          ` : ''}

          ${autoAcceptHtml}

          ${contractTablesHtml}

          ${showPortalCta ? `
            <p><a href="${portalUrl}" style="display:inline-block; background:#5C4A32; color:#fff; padding:10px 18px; text-decoration:none; border-radius:6px; font-weight:bold;">➜ Im Kundenportal ansehen</a></p>
          ` : ''}

          <div class="section-title">Kontaktdaten</div>
          <table>
            <tr><th>Feld</th><th>Wert</th></tr>
            <tr><td><strong>Name</strong></td><td>${[lead.anrede_text, capitalize(lead.vorname || ''), capitalize(lead.nachname || '')].filter(Boolean).join(' ') || 'N/A'}</td></tr>
            <tr><td><strong>E-Mail</strong></td><td>${lead.email}</td></tr>
            <tr><td><strong>Telefon</strong></td><td>${lead.telefon || 'N/A'}</td></tr>
            <tr><td><strong>Status</strong></td><td>${lead.status}</td></tr>
          </table>

          <div class="section-title">Pflegesituation & Anforderungen</div>
          <table>
            <tr><th>Feld</th><th>Wert</th></tr>
            <tr><td><strong>Betreuung für</strong></td><td>${betreuungFuer}</td></tr>
            <tr><td><strong>Pflegegrad</strong></td><td>${pflegegrad}</td></tr>
            <tr><td><strong>Weitere Personen im Haushalt</strong></td><td>${weiterePersonen}</td></tr>
            <tr><td><strong>Mobilität</strong></td><td>${mobilitaet}</td></tr>
            <tr><td><strong>Nachteinsätze erforderlich</strong></td><td>${nachteinsaetze}</td></tr>
            <tr><td><strong>Wann soll die Betreuung starten?</strong></td><td>${careStartTiming}</td></tr>
          </table>

          <div class="section-title">Anforderungen an die Pflegekraft</div>
          <table>
            <tr><th>Feld</th><th>Wert</th></tr>
            <tr><td><strong>Deutschkenntnisse</strong></td><td>${deutschkenntnisse}</td></tr>
            <tr><td><strong>Erfahrung</strong></td><td>${erfahrung}</td></tr>
            <tr><td><strong>Führerschein</strong></td><td>${fuehrerschein}</td></tr>
            <tr><td><strong>Geschlecht der Pflegekraft</strong></td><td>${geschlecht}</td></tr>
          </table>

          <div class="section-title">Kosten</div>
          <table>
            <tr><th>Feld</th><th>Wert</th></tr>
            <tr><td><strong>Eigenanteil (monatlich)</strong></td><td>${eigenanteil} €</td></tr>
            <tr><td><strong>Bruttopreis</strong></td><td>${kalkulation?.bruttopreis ? kalkulation.bruttopreis.toFixed(2).replace('.', ',') : 'N/A'} €</td></tr>
            <tr><td><strong>Zuschüsse gesamt</strong></td><td>${kalkulation?.zuschüsse?.gesamt ? kalkulation.zuschüsse.gesamt.toFixed(2).replace('.', ',') : 'N/A'} €</td></tr>
          </table>

          ${additionalData && status !== 'application_accepted_internal' ? `
            <div class="section-title">Zusätzliche Daten</div>
            <table>
              ${Object.entries(additionalData).map(([key, value]) => `
                <tr><td><strong>${key}</strong></td><td>${typeof value === 'object' ? JSON.stringify(value) : value}</td></tr>
              `).join('')}
            </table>
          ` : ''}

          <div class="highlight">
            ${actionHighlightHtml}
          </div>
          <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin/leads/${lead.id}" style="color: #0066CC; font-weight: bold;">➜ Lead im Admin-Panel öffnen</a></p>
        </div>
      </body>
      </html>
    `,
    text: `
${emoji} ${text}
${feedbackText ? `
Antwort des Kunden: ${feedbackText}
` : ''}${caregiverName ? `
${caregiverLabel}: ${caregiverName}${status === 'application_accepted_internal' && acceptanceCaregiverId ? ` (caregiver_id ${acceptanceCaregiverId})` : ''}${status === 'application_accepted_internal' && acceptanceApplicationId ? ` · Application ${acceptanceApplicationId}` : ''}
` : ''}${autoAcceptText}${contractTablesText}${showPortalCta ? `
➜ Im Kundenportal ansehen: ${portalUrl}
` : ''}
=== KONTAKTDATEN ===
Name: ${[lead.anrede_text, capitalize(lead.vorname || ''), capitalize(lead.nachname || '')].filter(Boolean).join(' ') || 'N/A'}
E-Mail: ${lead.email}
Telefon: ${lead.telefon || 'N/A'}
Status: ${lead.status}

=== PFLEGESITUATION & ANFORDERUNGEN ===
Betreuung für: ${betreuungFuer}
Pflegegrad: ${pflegegrad}
Weitere Personen im Haushalt: ${weiterePersonen}
Mobilität: ${mobilitaet}
Nachteinsätze erforderlich: ${nachteinsaetze}
Wann soll die Betreuung starten?: ${careStartTiming}

=== ANFORDERUNGEN AN DIE PFLEGEKRAFT ===
Deutschkenntnisse: ${deutschkenntnisse}
Erfahrung: ${erfahrung}
Führerschein: ${fuehrerschein}
Geschlecht der Pflegekraft: ${geschlecht}

=== KOSTEN ===
Eigenanteil (monatlich): ${eigenanteil} €
Bruttopreis: ${kalkulation?.bruttopreis ? kalkulation.bruttopreis.toFixed(2).replace('.', ',') : 'N/A'} €
Zuschüsse gesamt: ${kalkulation?.zuschüsse?.gesamt ? kalkulation.zuschüsse.gesamt.toFixed(2).replace('.', ',') : 'N/A'} €

${additionalData && status !== 'application_accepted_internal' ? `
=== ZUSÄTZLICHE DATEN ===
${Object.entries(additionalData).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n')}
` : ''}

${actionHighlightText}

Lead im Admin-Panel: ${process.env.NEXT_PUBLIC_SITE_URL}/admin/leads/${lead.id}
    `,
  };
}

export function getVertragEmailTemplate(
  lead: Lead,
  options: {
    subject?: string;
    anschreiben?: string;
    vertragsBeginn?: string;
    vertragsDauer?: string;
    tagessatz?: string;
    agName?: string;
    leName?: string;
  } = {}
): EmailTemplate {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';
  const anrede = lead.anrede_text || detectGenderFromName(lead.vorname || '');
  const nachname = cleanNamePart(lead.nachname);
  const vorname = cleanNamePart(lead.vorname);

  let anredeText: string;
  if (anrede === 'Frau' && nachname) anredeText = `Sehr geehrte Frau ${capitalize(nachname)}`;
  else if (anrede === 'Herr' && nachname) anredeText = `Sehr geehrter Herr ${capitalize(nachname)}`;
  else if (anrede === 'Familie' && nachname) anredeText = `Sehr geehrte Familie ${capitalize(nachname)}`;
  else if (anrede && vorname) anredeText = 'Guten Tag';
  else anredeText = 'Guten Tag';

  const subject = options.subject || `Ihr Dienstleistungsvertrag – PRIMUNDUS Deutschland`;

  const tagessatzDisplay = options.tagessatz && options.tagessatz !== '_______________' ? options.tagessatz : null;

  const conditionsRows = [
    { icon: '€', label: 'Tagessatz', value: tagessatzDisplay ? `${tagessatzDisplay}/Tag` : 'Gemäß Vertrag § 4' },
    { icon: '🚗', label: 'Fahrtkosten', value: '125 € je Strecke (internationaler Transfer)' },
    { icon: '🏠', label: 'Kost & Logis', value: 'Frei für die Betreuungsperson (Zimmer + Verpflegung)' },
    { icon: '📅', label: 'Feiertage', value: 'Doppelter Tagessatz (§ 4.8)' },
    { icon: '☀️', label: 'Sommermonate Juli & August', value: '+ 200 €/Monat Aufschlag (§ 4.9)' },
  ];

  const martaSignatur = `
    <!-- Marta Signatur-Block -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 32px 0; border: 1px solid #e8ddd0; border-radius: 12px; overflow: hidden;">
      <tr>
        <td style="padding: 18px 20px 16px; background: #ffffff;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="vertical-align: top;">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding-right: 12px; vertical-align: top;">
                      <img src="${baseUrl}/images/marta-kapcio.jpg" alt="Marta Kapcio" width="60" style="display: block; width: 60px; height: auto; border-radius: 8px;" />
                    </td>
                    <td style="vertical-align: middle;">
                      <p style="margin: 0 0 2px 0; font-size: 15px; font-weight: 700; color: #3D2B1F; white-space: nowrap; text-align: left;">Marta Kapcio</p>
                      <p style="margin: 0 0 2px 0; font-size: 13px; color: #555; white-space: nowrap; text-align: left;">Pflegeberaterin</p>
                      <p style="margin: 0; font-size: 12px; color: #9a8a73; white-space: nowrap; text-align: left;">Mo – So, 8 – 20 Uhr</p>
                    </td>
                  </tr>
                </table>
                <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 12px;">
                  <tr>
                    <td style="padding-bottom: 6px;">
                      <a href="tel:+4989200000830" style="display: inline-block; background-color: #f0ebe4; border-radius: 20px; padding: 8px 16px; text-decoration: none; font-size: 13px; font-weight: 500; color: #3D2B1F; white-space: nowrap;">&#9990; 089 200 000 830</a>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a href="https://wa.me/4989200000830" style="display: inline-block; background-color: #25D366; border-radius: 20px; padding: 8px 16px; text-decoration: none; font-size: 13px; font-weight: 600; color: #ffffff; white-space: nowrap;">WhatsApp schreiben</a>
                    </td>
                  </tr>
                </table>
              </td>
              <td style="vertical-align: top; text-align: right;">
                <table cellpadding="0" cellspacing="0" role="presentation" style="border: 1px solid #e8ddd0; border-radius: 8px; overflow: hidden; margin-left: auto;">
                  <tr>
                    <td style="padding: 8px 10px; background: #ffffff; text-align: center; vertical-align: top;">
                      <img src="${baseUrl}/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="64" style="display: block; width: 64px; height: auto; margin: 0 auto 5px auto;" />
                      <p style="margin: 0 0 1px 0; font-size: 11px; font-weight: 700; color: #3D2B1F; white-space: nowrap; text-align: center;">Testsieger <span style="color: #B5A184;">DIE WELT</span></p>
                      <p style="margin: 0; font-size: 10px; color: #888; line-height: 1.4; text-align: center;">Preis, Qualität &amp;<br>Kundenservice</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background: #f9f6f2; border-top: 1px solid #e8ddd0;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding: 12px 0; text-align: center; width: 33%; border-right: 1px solid #e8ddd0;">
                <p style="margin: 0; font-size: 12px; color: #555; line-height: 1.4; text-align: center;">Über 20 Jahre<br>Erfahrung</p>
              </td>
              <td style="padding: 12px 0; text-align: center; width: 33%; border-right: 1px solid #e8ddd0;">
                <p style="margin: 0; font-size: 12px; color: #555; line-height: 1.4; text-align: center;">60.000+<br>betreute Einsätze</p>
              </td>
              <td style="padding: 12px 0; text-align: center; width: 33%;">
                <p style="margin: 0; font-size: 12px; color: #555; line-height: 1.4; text-align: center;">Persönlicher<br>Ansprechpartner,<br>7&nbsp;Tage/Woche</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background: #ffffff; border-top: 1px solid #e8ddd0; padding: 14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/die-welt.webp" alt="DIE WELT" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/ard.webp" alt="ARD" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/ndr.webp" alt="NDR" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/sat1.webp" alt="SAT.1" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
              <td style="text-align: center; vertical-align: middle; padding: 0 4px;"><img src="${baseUrl}/images/media/bild-der-frau.webp" alt="Bild der Frau" height="14" style="display: inline-block; height: 14px; width: auto; opacity: 0.4; filter: grayscale(100%);" /></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const detailRows = [
    options.agName ? `<tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap;font-size:13px;">Auftraggeber</td><td style="padding:6px 0;font-weight:600;font-size:13px;">${options.agName}</td></tr>` : '',
    options.leName ? `<tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap;font-size:13px;">Leistungsempfänger</td><td style="padding:6px 0;font-weight:600;font-size:13px;">${options.leName}</td></tr>` : '',
    options.vertragsBeginn && options.vertragsBeginn !== '_______________' ? `<tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap;font-size:13px;">Vertragsbeginn</td><td style="padding:6px 0;font-weight:600;font-size:13px;">${options.vertragsBeginn}</td></tr>` : '',
    options.vertragsDauer ? `<tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap;font-size:13px;">Vertragsdauer</td><td style="padding:6px 0;font-weight:600;font-size:13px;">${options.vertragsDauer}</td></tr>` : '',
  ].filter(Boolean).join('');

  const content = `
    <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">${anredeText},</p>

    <p style="font-size: 16px; line-height: 1.7; color: #555; margin-bottom: 24px;">anbei erhalten Sie Ihren <strong>Dienstleistungsvertrag mit PRIMUNDUS Deutschland</strong>. Bitte prüfen Sie alle Angaben sorgfältig, unterzeichnen Sie den Vertrag und senden Sie uns ein Exemplar zurück – per E-Mail, Fax oder Post.</p>

    ${detailRows ? `
    <!-- Vertragsdetails -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 24px 0; border: 1px solid #e8ddd0; border-radius: 8px; overflow: hidden;">
      <tr>
        <td style="background: #f9f6f2; padding: 6px 20px; border-bottom: 1px solid #e8ddd0;">
          <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #9a8a73; text-transform: uppercase;">Ihre Vertragsdetails</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 4px 20px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${detailRows}
          </table>
        </td>
      </tr>
    </table>` : ''}

    <!-- Konditionen -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 28px 0; border: 1px solid #e8ddd0; border-radius: 8px; overflow: hidden;">
      <tr>
        <td style="background: #f9f6f2; padding: 6px 20px; border-bottom: 1px solid #e8ddd0;">
          <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #9a8a73; text-transform: uppercase;">Ihre Konditionen im Überblick</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 4px 20px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${conditionsRows.map((row, i, arr) => {
              const isLast = i === arr.length - 1;
              return `<tr>
                <td style="padding: 9px 12px 9px 0; ${isLast ? '' : 'border-bottom: 1px solid #f0ebe4;'} color: #888; font-size: 13px; width: 44%; white-space: nowrap;">${row.label}</td>
                <td style="padding: 9px 0; ${isLast ? '' : 'border-bottom: 1px solid #f0ebe4;'} color: #333; font-size: 13px; font-weight: 600;">${row.value}</td>
              </tr>`;
            }).join('')}
          </table>
        </td>
      </tr>
    </table>

    <p style="font-size: 14px; line-height: 1.7; color: #888; margin-bottom: 28px;">Den vollständigen Vertrag finden Sie im Anhang dieser E-Mail. Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.</p>

    <p style="font-size: 16px; line-height: 1.7; color: #555; margin-bottom: 20px; text-align: left;">Mit freundlichen Grüßen<br><strong style="color: #3D2B1F;">Marta Kapcio</strong></p>

    ${martaSignatur}
  `;

  const preheader = 'Ihr Dienstleistungsvertrag mit PRIMUNDUS Deutschland – bitte lesen und unterschreiben';

  const html = getEmailLayout({ content, preheader, siteUrl: baseUrl }).replace('{{EMAIL}}', lead.email);

  const text = `${anredeText},

anbei erhalten Sie Ihren Dienstleistungsvertrag mit PRIMUNDUS Deutschland.

Ihre Konditionen:
- Tagessatz: ${tagessatzDisplay ? `${tagessatzDisplay}/Tag` : 'Gemäß Vertrag § 4'}
- Fahrtkosten: 125 € je Strecke
- Kost & Logis: Frei (Zimmer + Verpflegung)
- Feiertage: Doppelter Tagessatz (§ 4.8)
- Juli & August: + 200 €/Monat Aufschlag (§ 4.9)
${options.vertragsBeginn && options.vertragsBeginn !== '_______________' ? `\nVertragsbeginn: ${options.vertragsBeginn}` : ''}${options.vertragsDauer ? `\nVertragsdauer: ${options.vertragsDauer}` : ''}

Den vollständigen Vertrag finden Sie im Anhang.

Mit freundlichen Grüßen
Marta Kapcio · Pflegeberaterin

PRIMUNDUS Deutschland · Telefon: 089 200 000 830 · info@primundus.de`;

  return { subject, html, text };
}

export async function sendConfirmationEmail(data: {
  to: string;
  template: EmailTemplate;
  attachments?: any[];
}): Promise<{ success: boolean; error?: string }> {
  return sendEmail(data.to, data.template, data.attachments);
}

// ─────────────────────────────────────────────────────────────────────────
// Caregiver-Event-Mails (Mail A: Interesse, Mail B: Bewerbung erhalten)
// Beide teilen sich Wrapper, Pflegekraft-Kachel, Trust-Zeile, Marta-Sig.
// Trigger sind Bridge-Events `caregiver_interest_shown` und
// `application_received` (siehe app/api/lead-event/route.ts).
// ─────────────────────────────────────────────────────────────────────────

// Bulletproof CTA-Button — Outlook-Safe (Word-Renderer). Schlüssel-Tricks:
//   - <table align="center"> statt <div text-align:center>
//   - bgcolor-HTML-Attribut + CSS-Fallback auf <td>
//   - Padding auf <td>, NICHT auf <a> (Outlook ignoriert Padding auf inline-Elementen)
function bulletproofButton(url: string, label: string, bgColor: string = '#2A9D5C'): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto;border-collapse:separate;">
      <tr>
        <td align="center" bgcolor="${bgColor}" style="background-color:${bgColor};border-radius:8px;padding:13px 34px;">
          <a href="${url}" target="_blank" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.4;">${label}</a>
        </td>
      </tr>
    </table>`;
}

// Email-sichere nummerierte Schritt-Liste. Statt <ol> (inkonsistentes
// Spacing über Clients) eine Tabelle mit Nummern-Badge + Titel + Beschreibung
// pro Zeile. Wird in Mail A / Mail B als "So geht es weiter"-Block genutzt
// damit der nächste Schritt unübersehbar ist (Funnel stockte hier).
function buildStepsList(steps: { title: string; desc: string }[]): string {
  const rows = steps.map((s, i) => `
    <tr>
      <td style="vertical-align:top;width:34px;padding:0 12px 14px 0;">
        <table cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td width="26" height="26" align="center" valign="middle" bgcolor="#8B7355" style="background-color:#8B7355;border-radius:50%;color:#ffffff;font-size:13px;font-weight:700;line-height:26px;text-align:center;">${i + 1}</td>
        </tr></table>
      </td>
      <td style="vertical-align:top;padding:0 0 14px 0;">
        <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#2D1F0F;line-height:1.4;">${s.title}</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#555;">${s.desc}</p>
      </td>
    </tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 14px;">${rows}</table>`;
}

// "Lieber persönlich?"-Hinweis — senkt die Portal-Hürde: der Kunde kann
// jeden Schritt auch ohne Portal per Telefon / WhatsApp / Mail-Antwort
// erledigen. Wird in Mail A + Mail B unter die Schritt-Liste gehängt.
const PERSOENLICH_HINWEIS_TEXT =
  'Lieber persönlich? Rufen Sie uns gerne direkt an (089 200 000 830) oder schreiben Sie per WhatsApp (wa.me/4989200000830) — oder antworten Sie einfach auf diese E-Mail. Ganz wie es für Sie am bequemsten ist.';
function persoenlichHinweisHtml(): string {
  return `<p style="font-size:14px;line-height:1.65;color:#555;margin:4px 0 16px;">Lieber persönlich? Rufen Sie uns gerne <a href="tel:+4989200000830" style="color:#0066CC;text-decoration:none;white-space:nowrap;">direkt an</a> oder schreiben Sie per <a href="https://wa.me/4989200000830" style="color:#25D366;text-decoration:none;font-weight:600;white-space:nowrap;">WhatsApp</a> — oder antworten Sie einfach auf diese E-Mail. Ganz wie es für Sie am bequemsten ist.</p>`;
}

// Preis-PS — kurzer, unaufdringlicher Reinforcer für alle Nurture-Mails
// (NICHT Buchungsbestätigung — da schon gebucht). Bewusst als P.S., damit
// es den Hauptinhalt nicht überlagert, aber an jedem Touchpoint präsent ist.
// Die frühere Bestpreis-Garantie („unterbieten wir es") ist am 18.08.2026 auf
// Entscheidung des Inhabers entfallen — sie war nicht belegbar. An ihre Stelle
// tritt die belegbare Gebührenfreiheit (USP 4).
const BESTPREIS_PS_TEXT =
  'P.S. Bei uns fällt keine Vermittlungsgebühr an. Keine Anzahlung, keine Aufnahmegebühr, keine Bearbeitungspauschale — der Monatspreis, den Sie sehen, ist der Preis.';
function bestpreisPsHtml(): string {
  return `<p style="font-size:13px;line-height:1.65;color:#777;margin:18px 0 0;border-top:1px solid #f0ebe4;padding-top:14px;"><strong style="color:#5C4A32;">P.S.</strong> Bei uns fällt <strong style="color:#2D1F0F;">keine Vermittlungsgebühr</strong> an. Keine Anzahlung, keine Aufnahmegebühr, keine Bearbeitungspauschale — der Monatspreis, den Sie sehen, ist der Preis.</p>`;
}

export interface CaregiverDisplay {
  name: string;                  // "Maria K." — caller liefert schon gekürzt
  badgeLevel?: string;           // LEGACY (Alt-Wörter Starter…Platin) — wird für
                                 // die Karte NICHT mehr gerendert; die Stufe wird
                                 // aus einsatzCount/yearsExperience abgeleitet
                                 // (caregiverTierLabel, wortgleich zum Portal).
  yearsExperience?: number;
  einsatzCount?: number;
  age?: number;                  // Alter in Jahren (aus year_of_birth)
  germanLevel?: string;          // 3-Stufen-Wort: "Grund" | "Mittel" | "Gut"
                                 // (NICHT CEFR — die 5 mamamia-Stufen werden
                                 // zusammengefasst; Quelle: detect-caregiver-
                                 // events germanLevelLabel bzw. im Portal
                                 // GERMANY_SKILL_LEVELS. Wortgleich in Mail
                                 // und Portal — nie roh CEFR ausgeben.)
  photoUrl?: string;             // vollständige URL — leer = Initialen-Avatar
  aboutText?: string;            // 2-3 Satz AI-Beschreibung
}

// Konditionen einer konkreten Bewerbung (aus der Mamamia-Application, via
// detect-caregiver-events → lead-event-metadata). Nur für Mail 12 (Bewerbung).
export interface OfferInfo {
  salary?: number | null;        // Monatssatz €/Monat (Mamamia application.salary)
  arrivalAt?: string | null;     // Anreisedatum (ISO, application.arrival_at)
  departureAt?: string | null;   // vorauss. Abreisedatum (ISO, application.departure_at)
  arrivalFee?: number | null;    // Anreisekosten € (application.arrival_fee)
  departureFee?: number | null;  // Abreisekosten € (application.departure_fee)
}

function caregiverInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Erfahrungsstufe der Pflegekraft — WORTGLEICH zum Kunden- und SA-Portal
// (src/lib/mamamia/badge.ts + components/portal/shared.ts `nurseLevel`, sowie
// mamamia-sadash `caregiverBadge.js`). Basis seit 12.08.2026: AUSSCHLIESSLICH
// die Zahl UNSERER Einsätze (`hp_total_jobs` → einsatzCount). Erfahrungsjahre
// zählen NICHT in die Stufe (Selbstauskunft), entscheiden aber ohne Einsätze
// das Ersatzwort. Kein Medaillen-Badge mehr — die Stufe steht als fettes Wort
// vor der Faktenzeile (Martin, 11.08.: „viel moderner und klarer").
//   Elite ≥12 · Stammkraft ≥6 · Bewährt ≥2 · Bekannt ≥1
//   0 Einsätze: Jahre>0 → „Berufserfahren", sonst „Neu dabei".
function caregiverTierLabel(einsatzCount?: number, yearsExperience?: number): string {
  const jobs = einsatzCount ?? 0;
  if (jobs >= 12) return 'Elite';
  if (jobs >= 6) return 'Stammkraft';
  if (jobs >= 2) return 'Bewährt';
  if (jobs >= 1) return 'Bekannt';
  return (yearsExperience ?? 0) > 0 ? 'Berufserfahren' : 'Neu dabei';
}

// Faktenzeile wie im Portal (`nurseFacts`): Jahre Erfahrung · Einsätze. Die
// Ø-Einsatzdauer aus dem Portal fehlt in der Mail-Pipeline (kein history-Feld
// in den lead-event-Metadaten) und bleibt daher weg. Ist nichts vorhanden,
// füllt ein ehrlicher Satz die Zeile statt eines Strichs.
function caregiverFactsLine(cg: CaregiverDisplay): string {
  const teile: string[] = [];
  if (cg.yearsExperience && cg.yearsExperience > 0) teile.push(`${cg.yearsExperience} ${cg.yearsExperience === 1 ? 'Jahr' : 'Jahre'} Erfahrung`);
  if (cg.einsatzCount && cg.einsatzCount > 0) teile.push(`${cg.einsatzCount} ${cg.einsatzCount === 1 ? 'Einsatz' : 'Einsätze'}`);
  return teile.length > 0 ? teile.join(' &middot; ') : 'bereit für den ersten Einsatz';
}

function customerGreeting(lead: Lead): string {
  const anrede = lead.anrede_text || detectGenderFromName(lead.vorname || '');
  const n = capitalize(lead.nachname || '');
  if (anrede === 'Frau' && n)     return `Guten Tag Frau ${n}`;
  if (anrede === 'Herr' && n)     return `Guten Tag Herr ${n}`;
  if (anrede === 'Familie' && n)  return `Guten Tag Familie ${n}`;
  // Vorname als Anrede nur wenn wir ihn als echten Vornamen einschätzen:
  //   (a) in der Namens-DB (detectGenderFromName liefert Geschlecht), ODER
  //   (b) es gibt einen separaten Nachnamen → der Parser hatte 2+ Tokens,
  //       also ist das erste Token sehr wahrscheinlich ein Vorname
  //       ("Tomasz Kowalski" → "Guten Tag Tomasz", auch wenn Tomasz nicht
  //       in der DB ist).
  // Reiner Einzel-Token, nicht in DB → vermutlich Nachname. Seit der
  // Kostenrechner nur ein freies "Name"-Feld hat (PR #298), tippen Kunden
  // oft nur ihren Nachnamen ("Zielke"), der fälschlich als vorname geparst
  // wird. Dann lieber neutral "Guten Tag" als "Guten Tag Zielke".
  if (lead.vorname && (detectGenderFromName(lead.vorname) || n)) {
    return `Guten Tag ${capitalize(lead.vorname)}`;
  }
  return 'Guten Tag';
}

// Marta-Signatur-Karte — zentral für alle Caregiver-Event-Mails (A/B/C) und
// das neue Mail-11-Layout. Identisch zur Eingangsbestätigung, damit die
// gesamte Mail-Reihe optisch zusammenpasst.
function caregiverMartaSig(baseUrl: string): string {
  return `
    <p style="font-size:16px;line-height:1.7;color:#555;margin-top:24px;margin-bottom:16px;">Mit freundlichen Grüßen<br><strong style="color:#3D2B1F;">Marta Kapcio</strong></p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px 0;border:1px solid #e8ddd0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:18px 20px 16px;background:#ffffff;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="vertical-align:top;">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding-right:12px;vertical-align:top;">
                      <img src="${baseUrl}/images/marta-kapcio.jpg" alt="Marta Kapcio" width="60" style="display:block;width:60px;height:auto;border-radius:8px;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Marta Kapcio</p>
                      <p style="margin:0 0 2px;font-size:13px;color:#555;white-space:nowrap;">Pflegeberaterin</p>
                      <p style="margin:0;font-size:12px;color:#9a8a73;white-space:nowrap;">Mo – So, 8 – 20 Uhr</p>
                    </td>
                  </tr>
                </table>
                <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:12px;">
                  <tr><td style="padding-bottom:6px;">
                    <a href="tel:+4989200000830" style="display:inline-block;background-color:#f0ebe4;border-radius:20px;padding:8px 16px;text-decoration:none;font-size:13px;font-weight:500;color:#3D2B1F;white-space:nowrap;">&#9990; 089 200 000 830</a>
                  </td></tr>
                  <tr><td>
                    <a href="https://wa.me/4989200000830" style="display:inline-block;background-color:#25D366;border-radius:20px;padding:8px 16px;text-decoration:none;font-size:13px;font-weight:600;color:#ffffff;white-space:nowrap;">WhatsApp schreiben</a>
                  </td></tr>
                </table>
              </td>
              <td style="vertical-align:top;text-align:right;">
                <table cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;margin-left:auto;">
                  <tr><td style="padding:8px 10px;background:#ffffff;text-align:center;vertical-align:top;">
                    <img src="${baseUrl}/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="64" style="display:block;width:64px;height:auto;margin:0 auto 5px;" />
                    <p style="margin:0 0 1px;font-size:11px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Testsieger <span style="color:#B5A184;">DIE WELT</span></p>
                    <p style="margin:0;font-size:10px;color:#888;line-height:1.4;">Preis, Qualität &amp;<br>Kundenservice</p>
                  </td></tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="background:#f9f6f2;border-top:1px solid #e8ddd0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td style="padding:12px 0;text-align:center;width:33%;border-right:1px solid #e8ddd0;"><p style="margin:0;font-size:12px;color:#555;line-height:1.4;">Über 20 Jahre<br>Erfahrung</p></td>
          <td style="padding:12px 0;text-align:center;width:33%;border-right:1px solid #e8ddd0;"><p style="margin:0;font-size:12px;color:#555;line-height:1.4;">60.000+<br>betreute Einsätze</p></td>
          <td style="padding:12px 0;text-align:center;width:33%;"><p style="margin:0;font-size:12px;color:#555;line-height:1.4;">Persönlicher<br>Ansprechpartner,<br>7&nbsp;Tage/Woche</p></td>
        </tr></table>
      </td></tr>
    </table>`;
}

// Gemeinsame HTML-Shell (Header + Content + Footer) für alle Caregiver-
// Event-Mails und Mail 11. Nur `content` unterscheidet sich.
// Ein-Klick-Abmelde-URL (token-basiert). Seite /abmelden liegt in der
// kostenrechner-Next.js-App (gleiche Domain wie baseUrl). Leerer String,
// wenn kein Token vorhanden → Link wird dann weggelassen.
function customerUnsubscribeUrl(lead: Lead): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';
  return lead.token
    ? `${baseUrl.replace(/\/$/, '')}/abmelden?token=${encodeURIComponent(lead.token)}`
    : '';
}

function caregiverMailShell(baseUrl: string, leadEmail: string, content: string, unsubscribeUrl?: string): string {
  const unsubLink = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Keine E-Mails mehr erhalten</a>`
    : '';
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Primundus 24h-Pflege</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
    @media only screen and (max-width: 600px) {
      .email-content { padding: 30px 20px !important; }
      .cond-top-cell { display: block !important; width: 100% !important; padding: 18px 22px 16px !important; border-right: none !important; border-bottom: 1px solid #ebe2d2 !important; }
      .cond-top-cell:last-child { border-bottom: none !important; }
    }
  </style>
</head>
<body>
  <div style="width:100%;background-color:#f4f4f4;padding:20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center">
      <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <div style="background:#ffffff;padding:24px 40px 20px 40px;border-bottom:1px solid #f0ebe4;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td style="vertical-align:middle;">
              <img src="${baseUrl}/images/Primundus-Logo_V6.png" alt="Primundus Logo" width="160" style="display:block;width:160px;max-width:160px;height:auto;" />
            </td>
            <td style="vertical-align:middle;text-align:right;">
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin-left:auto;"><tr>
                <td style="text-align:center;vertical-align:middle;padding-right:8px;border-right:1px solid #f0ebe4;">
                  <img src="${baseUrl}/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="36" style="display:block;width:36px;height:auto;" />
                </td>
                <td style="text-align:left;padding-left:8px;">
                  <p style="margin:0 0 1px;font-size:10px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Testsieger</p>
                  <p style="margin:0 0 1px;font-size:10px;color:#B5A184;white-space:nowrap;font-weight:600;">DIE WELT</p>
                  <p style="margin:0;font-size:9px;color:#aaa;white-space:nowrap;">Preis &amp; Qualit&auml;t</p>
                </td>
              </tr></table>
            </td>
          </tr></table>
        </div>
        <div class="email-content" style="padding:40px 40px 32px;text-align:left;">${content}</div>
        <div style="background-color:#f8f9fa;padding:30px;text-align:center;border-top:1px solid #e0e0e0;">
          <div style="font-weight:600;font-size:15px;color:#3D2B1F;margin-bottom:6px;">Primundus Deutschland</div>
          <div style="font-size:13px;color:#666;line-height:1.8;">
            24h-Pflege und Betreuung zu Hause<br>
            <a href="tel:+4989200000830" style="color:#0066CC;text-decoration:none;">+49 89 200 000 830</a> |
            <a href="mailto:info@primundus.de" style="color:#0066CC;text-decoration:none;">info@primundus.de</a><br>
            <a href="https://primundus.de" style="color:#0066CC;text-decoration:none;">www.primundus.de</a>
          </div>
          <div style="font-size:12px;color:#999;margin-top:16px;line-height:1.5;">
            Diese E-Mail wurde versendet an: ${leadEmail}<br>
            Primundus Deutschland<br><br>
            Sie erhalten diese E-Mail, weil Sie eine Kalkulation auf primundus.de angefordert haben.${unsubLink}
          </div>
        </div>
      </div>
    </td></tr></table>
  </div>
</body>
</html>`;
}

// Kompakte Pflegekraft-Kachel (Foto/Initialen · Name · Alter · Badge ·
// Erfahrung·Einsätze · Deutsch + "Profil ansehen"-Link). Gemeinsam für
// Mail 11 (Interesse) und Mail 12 (Bewerbung), damit beide identisch wirken.
// Kein grüner Button, keine Bio. Badge bewusst als Emoji-Medaille (📅 SVG
// rendert in Gmail/Outlook nicht).
  // Abstand Foto→Text als EIGENE Spalte, nicht als padding-right an der
  // Foto-Zelle: mehrere Mail-Renderer verwerfen padding an einer <td>, die
  // zugleich eine feste width traegt — dann klebt der Name am Bild (Martin
  // 18.08. mit Screenshot: "viel zu eng name und bild", gemessener Abstand
  // ~1 px statt 16). In Chrome war das NICHT reproduzierbar, das Padding
  // greift dort; die leere Spalte kommt ganz ohne padding-Unterstuetzung aus
  // und ist damit unabhaengig vom Client. Text mittig statt oben, sonst
  // haengen zwei kurze Zeilen an der Oberkante eines 76-px-Fotos.
function caregiverKachelHtml(cg: CaregiverDisplay, portalUrl: string): string {
  const firstName = cg.name.split(' ')[0];
  // Abgerundetes Quadrat wie im Portal (MatchCard: `rounded-xl`), nicht mehr
  // der runde Avatar — Mail und Portal zeigen dieselbe Karte.
  const photoHtml = cg.photoUrl
    ? `<img src="${cg.photoUrl}" alt="${cg.name}" width="76" style="display:block;width:76px;height:76px;border-radius:12px;object-fit:cover;" />`
    : `<div style="width:76px;height:76px;border-radius:12px;background-color:#B5A184;color:#fff;font-size:26px;font-weight:700;line-height:76px;text-align:center;">${caregiverInitials(cg.name)}</div>`;

  // Alter dezent hinter dem Namen ("Grazyna J., 70") — Portal-Stil.
  const ageSuffix = cg.age ? `<span style="font-weight:400;color:#71717A;">, ${cg.age}</span>` : '';
  const deutschLine = cg.germanLevel
    ? `<p style="margin:0;font-size:15px;color:#71717A;">Deutsch ${cg.germanLevel}</p>`
    : '';
  // Stufe als fettes Wort vor der Faktenzeile (kein Medaillen-Badge mehr) —
  // exakt wie die Portal-Karte: „Bewährt: 12 Jahre Erfahrung · 3 Einsätze".
  const tier = caregiverTierLabel(cg.einsatzCount, cg.yearsExperience);
  const factsHtml = `<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#71717A;"><span style="font-weight:700;color:#18181B;">${tier}:</span> ${caregiverFactsLine(cg)}</p>`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 26px;border:1px solid #ECE7DF;border-radius:14px;background:#ffffff;overflow:hidden;">
      <tr><td style="padding:18px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td width="76" style="vertical-align:middle;width:76px;">${photoHtml}</td>
            <td width="18" style="width:18px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="vertical-align:middle;">
              <p style="margin:0 0 3px;font-size:18px;font-weight:700;color:#18181B;line-height:1.3;">${cg.name}${ageSuffix}</p>
              ${deutschLine}
            </td>
          </tr>
        </table>
        ${factsHtml}
        <div style="border-top:1px solid #ECE7DF;margin:14px 0 0;padding-top:14px;">
          <a href="${portalUrl}" style="color:#8B7355;text-decoration:none;font-weight:700;font-size:15px;">${firstName}s Profil ansehen &rarr;</a>
        </div>
      </td></tr>
    </table>`;
}

// Gemeinsamer Frame für beide Caregiver-Event-Mails. Nur Subject, Intro-HTML,
// "So geht es weiter"-HTML und CTA-Text sind je Mail unterschiedlich.
function buildCaregiverEventEmail(opts: {
  lead: Lead;
  caregiver: CaregiverDisplay;
  subject: string;
  introHtml: string;       // erster Absatz nach Greeting
  middleHtml: string;      // "So geht es weiter"-Absatz
  ctaText: string;         // Button-Text
  portalUrl: string;       // URL hinter dem Button
  plainSummary: string;    // Plaintext-Fallback (intro + middle, ohne HTML)
  psHtml?: string;         // optionales P.S. (z.B. Gebührenfreiheit) — vor der Sig
  psText?: string;         // Plaintext-Pendant des P.S.
}): EmailTemplate {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';
  const greeting = customerGreeting(opts.lead);
  const cg = opts.caregiver;

  // Stufe + Fakten wortgleich zum Portal (caregiverTierLabel/caregiverFactsLine).
  const tier = caregiverTierLabel(cg.einsatzCount, cg.yearsExperience);
  const factsHtml = `<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#71717A;"><span style="font-weight:700;color:#18181B;">${tier}:</span> ${caregiverFactsLine(cg)}</p>`;
  const ageSuffix = cg.age ? `<span style="font-weight:400;color:#71717A;">, ${cg.age}</span>` : '';
  const deutschLine = cg.germanLevel
    ? `<p style="margin:0;font-size:15px;color:#71717A;">Deutsch ${cg.germanLevel}</p>`
    : '';

  // Plaintext-Reflex der Kachel (nur für den Text-Teil unten).
  const metaParts: string[] = [];
  if (cg.yearsExperience && cg.yearsExperience > 0) metaParts.push(`${cg.yearsExperience} ${cg.yearsExperience === 1 ? 'Jahr' : 'Jahre'} Erfahrung`);
  if (cg.einsatzCount && cg.einsatzCount > 0)       metaParts.push(`${cg.einsatzCount} ${cg.einsatzCount === 1 ? 'Einsatz' : 'Einsätze'}`);

  const photoHtml = cg.photoUrl
    ? `<img src="${cg.photoUrl}" alt="${cg.name}" width="76" style="display:block;width:76px;height:76px;border-radius:12px;object-fit:cover;" />`
    : `<div style="width:76px;height:76px;border-radius:12px;background-color:#B5A184;color:#fff;font-size:26px;font-weight:700;line-height:76px;text-align:center;">${caregiverInitials(cg.name)}</div>`;

  const kachel = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 22px 0;border:1px solid #ECE7DF;border-radius:14px;overflow:hidden;">
      <tr><td style="padding:18px 20px;background:#ffffff;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td width="76" style="vertical-align:middle;width:76px;">${photoHtml}</td>
            <td width="18" style="width:18px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="vertical-align:middle;">
              <p style="margin:0 0 3px;font-size:18px;font-weight:700;color:#18181B;line-height:1.3;">${cg.name}${ageSuffix}</p>
              ${deutschLine}
            </td>
          </tr>
        </table>
        ${factsHtml}
      </td></tr>
    </table>`;

  const martaSig = caregiverMartaSig(baseUrl);

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${greeting},</p>
    ${opts.introHtml}
    ${kachel}
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:12px;"><strong style="color:#2D1F0F;">So geht es weiter:</strong></p>
    ${opts.middleHtml}
    ${bulletproofButton(opts.portalUrl, opts.ctaText)}
    <div style="font-size:12px;color:#888;line-height:1.8;margin:0 0 18px;text-align:center;">
      <span style="color:#2D6A4F;font-weight:600;">✓ Keine Vertragsbindung</span>&ensp;&middot;&ensp;
      <span style="color:#2D6A4F;font-weight:600;">✓ Tagesgenaue Abrechnung</span>&ensp;&middot;&ensp;
      <span style="color:#2D6A4F;font-weight:600;">✓ Kosten erst bei Anreise</span>
    </div>
    <div style="background:#EEF6F0;border-left:3px solid #4CAF50;padding:12px 14px;border-radius:0 6px 6px 0;font-size:14px;color:#555;line-height:1.6;">
      Für Sie bleibt alles <strong>unverbindlich</strong>, bis Sie sich für eine passende Betreuungskraft entscheiden und diese anreist.
    </div>
    ${opts.psHtml ?? ''}
    ${martaSig}`;

  const html = caregiverMailShell(baseUrl, opts.lead.email, content, customerUnsubscribeUrl(opts.lead));

  // Plaintext-Fallback. Knapper als HTML — Mail-Clients ohne HTML-Rendering
  // sehen einen lesbaren Reflex von Intro + Pflegekraft + nächster Schritt.
  const text = `${greeting},

${opts.plainSummary}

PFLEGEKRAFT
${cg.name}${cg.age ? `, ${cg.age}` : ''} · ${tier}
${metaParts.length > 0 ? metaParts.join(' · ') + '\n' : ''}${opts.ctaText.replace(/\s*→\s*$/, '')}: ${opts.portalUrl}

✓ Keine Vertragsbindung  ·  ✓ Tagesgenaue Abrechnung  ·  ✓ Kosten erst bei Anreise

Für Sie bleibt alles unverbindlich, bis Sie sich für eine passende
Betreuungskraft entscheiden und diese anreist.
${opts.psText ? '\n' + opts.psText + '\n' : ''}
Mit freundlichen Grüßen
Marta Kapcio — Pflegeberaterin
Tel: 089 200 000 830  ·  WhatsApp: https://wa.me/4989200000830

Primundus Deutschland
www.primundus.de
`;

  return { subject: opts.subject, html, text };
}

// Customer-Mail bei `patient_data_saved` (Mail D). Wird einmal pro Lead
// ausgelöst (DB-Dedupe), sobald der Kunde im Portal die Pflegesituation
// vollständig erfasst hat. Nutzt denselben Visual-Frame wie die Caregiver-
// Event-Mails — bewusst KEINE Pflegekraft-Kachel, weil zu diesem Zeitpunkt
// noch keine spezifische Pflegekraft im Spiel ist. Stattdessen schiebt die
// Mail den Kunden in den nächsten Action-Schritt: selbst Pflegekräfte
// anschauen + einladen, statt passiv zu warten.
export function getPatientDataSavedEmailTemplate(
  lead: Lead,
  portalUrl: string,
): EmailTemplate {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';
  const greeting = customerGreeting(lead);
  const subject = 'Ihre Pflegedaten sind bei uns eingegangen';

  const introHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">vielen Dank — Ihre Pflegesituation ist nun vollständig erfasst. Passende Pflegekräfte können sich jetzt ein Bild machen und sich bei Ihnen bewerben oder ihr Interesse bekunden.</p>`;

  const actionHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:20px;">In der Zwischenzeit müssen Sie nicht warten: Im Kundenportal sehen Sie sofort <strong style="color:#2D1F0F;">verfügbare Pflegekräfte</strong>, die zu Ihrem Bedarf passen, und können sie persönlich einladen, sich bei Ihnen zu bewerben.</p>`;

  const ctaText = 'Jetzt Pflegekräfte ansehen und einladen →';

  const outroHtml = `<p style="font-size:14px;line-height:1.65;color:#555;margin:18px 0 0;">Bei Fragen erreichen Sie uns telefonisch unter <a href="tel:+4989200000830" style="color:#0066CC;text-decoration:none;">+49 89 200 000 830</a> oder per E-Mail an <a href="mailto:info@primundus.de" style="color:#0066CC;text-decoration:none;">info@primundus.de</a>.</p>`;

  // Marta-Sig — identisch zu buildCaregiverEventEmail, damit die Mail-Reihe
  // optisch konsistent bleibt.
  const martaSig = `
    <p style="font-size:16px;line-height:1.7;color:#555;margin-top:24px;margin-bottom:16px;">Mit freundlichen Grüßen<br><strong style="color:#3D2B1F;">Marta Kapcio</strong></p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px 0;border:1px solid #e8ddd0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:18px 20px 16px;background:#ffffff;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="vertical-align:top;">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding-right:12px;vertical-align:top;">
                      <img src="${baseUrl}/images/marta-kapcio.jpg" alt="Marta Kapcio" width="60" style="display:block;width:60px;height:auto;border-radius:8px;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Marta Kapcio</p>
                      <p style="margin:0 0 2px;font-size:13px;color:#555;white-space:nowrap;">Pflegeberaterin</p>
                      <p style="margin:0;font-size:12px;color:#9a8a73;white-space:nowrap;">Mo – So, 8 – 20 Uhr</p>
                    </td>
                  </tr>
                </table>
                <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:12px;">
                  <tr><td style="padding-bottom:6px;">
                    <a href="tel:+4989200000830" style="display:inline-block;background-color:#f0ebe4;border-radius:20px;padding:8px 16px;text-decoration:none;font-size:13px;font-weight:500;color:#3D2B1F;white-space:nowrap;">&#9990; 089 200 000 830</a>
                  </td></tr>
                  <tr><td>
                    <a href="https://wa.me/4989200000830" style="display:inline-block;background-color:#25D366;border-radius:20px;padding:8px 16px;text-decoration:none;font-size:13px;font-weight:600;color:#ffffff;white-space:nowrap;">WhatsApp schreiben</a>
                  </td></tr>
                </table>
              </td>
              <td style="vertical-align:top;text-align:right;">
                <table cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;margin-left:auto;">
                  <tr><td style="padding:8px 10px;background:#ffffff;text-align:center;vertical-align:top;">
                    <img src="${baseUrl}/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="64" style="display:block;width:64px;height:auto;margin:0 auto 5px;" />
                    <p style="margin:0 0 1px;font-size:11px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Testsieger <span style="color:#B5A184;">DIE WELT</span></p>
                    <p style="margin:0;font-size:10px;color:#888;line-height:1.4;">Preis, Qualität &amp;<br>Kundenservice</p>
                  </td></tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="background:#f9f6f2;border-top:1px solid #e8ddd0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td style="padding:12px 0;text-align:center;width:33%;border-right:1px solid #e8ddd0;"><p style="margin:0;font-size:12px;color:#555;line-height:1.4;">Über 20 Jahre<br>Erfahrung</p></td>
          <td style="padding:12px 0;text-align:center;width:33%;border-right:1px solid #e8ddd0;"><p style="margin:0;font-size:12px;color:#555;line-height:1.4;">60.000+<br>betreute Einsätze</p></td>
          <td style="padding:12px 0;text-align:center;width:33%;"><p style="margin:0;font-size:12px;color:#555;line-height:1.4;">Persönlicher<br>Ansprechpartner,<br>7&nbsp;Tage/Woche</p></td>
        </tr></table>
      </td></tr>
    </table>`;

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${greeting},</p>
    ${introHtml}
    ${actionHtml}
    ${bulletproofButton(portalUrl, ctaText)}
    <div style="font-size:12px;color:#888;line-height:1.8;margin:0 0 18px;text-align:center;">
      <span style="color:#2D6A4F;font-weight:600;">✓ Keine Vertragsbindung</span>&ensp;&middot;&ensp;
      <span style="color:#2D6A4F;font-weight:600;">✓ Tagesgenaue Abrechnung</span>&ensp;&middot;&ensp;
      <span style="color:#2D6A4F;font-weight:600;">✓ Kosten erst bei Anreise</span>
    </div>
    ${outroHtml}
    ${martaSig}`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Primundus 24h-Pflege</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
    @media only screen and (max-width: 600px) {
      .email-content { padding: 30px 20px !important; }
      .cond-top-cell { display: block !important; width: 100% !important; padding: 18px 22px 16px !important; border-right: none !important; border-bottom: 1px solid #ebe2d2 !important; }
      .cond-top-cell:last-child { border-bottom: none !important; }
    }
  </style>
</head>
<body>
  <div style="width:100%;background-color:#f4f4f4;padding:20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center">
      <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <div style="background:#ffffff;padding:24px 40px 20px 40px;border-bottom:1px solid #f0ebe4;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td style="vertical-align:middle;">
              <img src="${baseUrl}/images/Primundus-Logo_V6.png" alt="Primundus Logo" width="160" style="display:block;width:160px;max-width:160px;height:auto;" />
            </td>
            <td style="vertical-align:middle;text-align:right;">
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin-left:auto;"><tr>
                <td style="text-align:center;vertical-align:middle;padding-right:8px;border-right:1px solid #f0ebe4;">
                  <img src="${baseUrl}/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="36" style="display:block;width:36px;height:auto;" />
                </td>
                <td style="text-align:left;padding-left:8px;">
                  <p style="margin:0 0 1px;font-size:10px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Testsieger</p>
                  <p style="margin:0 0 1px;font-size:10px;color:#B5A184;white-space:nowrap;font-weight:600;">DIE WELT</p>
                  <p style="margin:0;font-size:9px;color:#aaa;white-space:nowrap;">Preis &amp; Qualit&auml;t</p>
                </td>
              </tr></table>
            </td>
          </tr></table>
        </div>
        <div class="email-content" style="padding:40px 40px 32px;text-align:left;">${content}</div>
        <div style="background-color:#f8f9fa;padding:30px;text-align:center;border-top:1px solid #e0e0e0;">
          <div style="font-weight:600;font-size:15px;color:#3D2B1F;margin-bottom:6px;">Primundus Deutschland</div>
          <div style="font-size:13px;color:#666;line-height:1.8;">
            24h-Pflege und Betreuung zu Hause<br>
            <a href="tel:+4989200000830" style="color:#0066CC;text-decoration:none;">+49 89 200 000 830</a> |
            <a href="mailto:info@primundus.de" style="color:#0066CC;text-decoration:none;">info@primundus.de</a><br>
            <a href="https://primundus.de" style="color:#0066CC;text-decoration:none;">www.primundus.de</a>
          </div>
          <div style="font-size:12px;color:#999;margin-top:16px;line-height:1.5;">
            Diese E-Mail wurde versendet an: ${lead.email}<br>
            Primundus Deutschland<br><br>
            Sie erhalten diese E-Mail, weil Sie eine Kalkulation auf primundus.de angefordert haben.${customerUnsubscribeUrl(lead) ? `<br><a href="${customerUnsubscribeUrl(lead)}" style="color:#999;text-decoration:underline;">Keine E-Mails mehr erhalten</a>` : ''}
          </div>
        </div>
      </div>
    </td></tr></table>
  </div>
</body>
</html>`;

  const text = `${greeting},

vielen Dank — Ihre Pflegesituation ist nun vollständig erfasst. Passende Pflegekräfte können sich jetzt ein Bild machen und sich bei Ihnen bewerben oder ihr Interesse bekunden.

In der Zwischenzeit müssen Sie nicht warten: Im Kundenportal sehen Sie sofort verfügbare Pflegekräfte, die zu Ihrem Bedarf passen, und können sie persönlich einladen, sich bei Ihnen zu bewerben.

Jetzt Pflegekräfte ansehen und einladen: ${portalUrl}

✓ Keine Vertragsbindung  ·  ✓ Tagesgenaue Abrechnung  ·  ✓ Kosten erst bei Anreise

Bei Fragen erreichen Sie uns telefonisch unter +49 89 200 000 830 oder per E-Mail an info@primundus.de.

Mit freundlichen Grüßen
Marta Kapcio — Pflegeberaterin
Tel: 089 200 000 830  ·  WhatsApp: https://wa.me/4989200000830

Primundus Deutschland
www.primundus.de
`;

  return { subject, html, text };
}

// ─── „Aktualisiertes Angebot" (offer_updated) ────────────────────────────────
// Der Berater hat preisrelevante Angaben des Kunden korrigiert (SA-Portal),
// die Lead-Kalkulation wurde bereits serverseitig neu geschrieben (direkter
// Supabase-Write mit Service-Key — NICHT über diesen token-authentifizierten
// Endpoint, damit ein Kunde mit seinem Magic-Link-Token seinen eigenen Preis
// nicht manipulieren kann). Diese Mail informiert den Kunden: alter → neuer
// Monatspreis, geänderte Angaben, CTA ins Portal. Wird nur verschickt, wenn
// der Berater das Häkchen „Aktualisiertes Angebot per Mail senden" gesetzt hat.
export interface OfferUpdatedInfo {
  oldBruttopreis: number;
  newBruttopreis: number;
  newEigenanteil?: number | null;
  changed?: Array<{ name?: string; alt?: string; neu?: string }>;
}

// Minimaler HTML-Escape für die Änderungs-Labels — die kommen zwar aus dem
// SA-Portal (vertrauenswürdig), aber der Endpoint ist token-authentifiziert,
// also defensiv escapen statt roh interpolieren.
function escBasic(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getOfferUpdatedEmailTemplate(
  lead: Lead,
  info: OfferUpdatedInfo,
  portalUrl: string,
): EmailTemplate {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';
  const greeting = customerGreeting(lead);
  const fmt = (n: number) => Math.round(n).toLocaleString('de-DE');
  const subject = 'Ihr aktualisiertes Betreuungsangebot';

  const oldP = fmt(info.oldBruttopreis);
  const newP = fmt(info.newBruttopreis);
  const changed = (info.changed ?? []).filter((c) => c && (c.name || c.alt || c.neu));

  const changedHtml = changed.length
    ? `<p style="font-size:15px;line-height:1.75;color:#444;margin:0 0 10px;">Folgende Angaben wurden angepasst:</p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:12px;overflow:hidden;margin:0 0 22px;">
        ${changed
          .map(
            (c, i) => `<tr>
          <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#3D2B1F;white-space:nowrap;vertical-align:top;${i ? 'border-top:1px solid #f0ebe4;' : ''}">${escBasic(c.name)}</td>
          <td style="padding:10px 14px;font-size:13px;color:#999;vertical-align:top;${i ? 'border-top:1px solid #f0ebe4;' : ''}">${escBasic(c.alt) || '—'}</td>
          <td style="padding:10px 6px;font-size:13px;color:#9a8a73;vertical-align:top;${i ? 'border-top:1px solid #f0ebe4;' : ''}">→</td>
          <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#2D1F0F;vertical-align:top;${i ? 'border-top:1px solid #f0ebe4;' : ''}">${escBasic(c.neu) || '—'}</td>
        </tr>`,
          )
          .join('')}
      </table>`
    : '';

  const eigenanteilHtml =
    info.newEigenanteil != null && Number.isFinite(info.newEigenanteil)
      ? `<p style="font-size:14px;line-height:1.65;color:#555;margin:0 0 20px;text-align:center;">Ihr voraussichtlicher Eigenanteil nach Zuschüssen: <strong style="color:#2D1F0F;">${fmt(info.newEigenanteil)} €/Monat</strong></p>`
      : '';

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${greeting},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">Ihre Betreuungsangaben wurden aktualisiert. Dadurch ändert sich der monatliche Gesamtpreis Ihres Angebots — Ihr Angebot im Kundenportal ist bereits auf dem neuen Stand.</p>
    ${changedHtml}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:12px;overflow:hidden;margin:0 0 14px;">
      <tr>
        <td class="cond-top-cell" style="width:50%;padding:18px 22px 16px;border-right:1px solid #ebe2d2;background:#faf8f5;text-align:center;">
          <p style="margin:0 0 4px;font-size:11px;color:#9a8a73;text-transform:uppercase;letter-spacing:.05em;font-weight:700;">Bisher</p>
          <p style="margin:0;font-size:19px;color:#999;"><span style="text-decoration:line-through;">${oldP} €</span><span style="font-size:13px;">/Monat</span></p>
        </td>
        <td class="cond-top-cell" style="width:50%;padding:18px 22px 16px;background:#ffffff;text-align:center;">
          <p style="margin:0 0 4px;font-size:11px;color:#2D6A4F;text-transform:uppercase;letter-spacing:.05em;font-weight:700;">Neu</p>
          <p style="margin:0;font-size:23px;font-weight:800;color:#2D1F0F;">${newP} €<span style="font-size:14px;font-weight:600;color:#555;">/Monat</span></p>
        </td>
      </tr>
    </table>
    ${eigenanteilHtml}
    ${bulletproofButton(portalUrl, 'Aktualisiertes Angebot ansehen →')}
    <p style="font-size:14px;line-height:1.65;color:#555;margin:18px 0 0;">Bei Fragen zur Anpassung erreichen Sie uns telefonisch unter <a href="tel:+4989200000830" style="color:#0066CC;text-decoration:none;">+49 89 200 000 830</a> oder per E-Mail an <a href="mailto:info@primundus.de" style="color:#0066CC;text-decoration:none;">info@primundus.de</a>.</p>
    ${caregiverMartaSig(baseUrl)}`;

  const html = caregiverMailShell(baseUrl, lead.email, content, customerUnsubscribeUrl(lead) || undefined);

  const changedText = changed.length
    ? `Folgende Angaben wurden angepasst:\n${changed.map((c) => `- ${c.name ?? ''}: ${c.alt ?? '—'} → ${c.neu ?? '—'}`).join('\n')}\n\n`
    : '';
  const text = `${greeting},

Ihre Betreuungsangaben wurden aktualisiert. Dadurch ändert sich der monatliche Gesamtpreis Ihres Angebots — Ihr Angebot im Kundenportal ist bereits auf dem neuen Stand.

${changedText}Bisher: ${oldP} €/Monat
Neu: ${newP} €/Monat
${info.newEigenanteil != null && Number.isFinite(info.newEigenanteil) ? `Ihr voraussichtlicher Eigenanteil nach Zuschüssen: ${fmt(info.newEigenanteil)} €/Monat\n` : ''}
Aktualisiertes Angebot ansehen: ${portalUrl}

Bei Fragen zur Anpassung erreichen Sie uns telefonisch unter +49 89 200 000 830 oder per E-Mail an info@primundus.de.

Mit freundlichen Grüßen
Marta Kapcio — Pflegeberaterin
Tel: 089 200 000 830  ·  WhatsApp: https://wa.me/4989200000830

Primundus Deutschland
www.primundus.de
`;

  return { subject, html, text };
}

// Mail 11 (Mail A — Interesse). Eigenständiges Layout (NICHT
// buildCaregiverEventEmail), damit Mail B/C unberührt bleiben:
// kompakte Pflegekraft-Kachel (Foto · Name·Alter · Badge · Erfahrung ·
// Deutsch · „Profil ansehen"-Link, kein grüner Button, keine Bio),
// „Was Sie als Nächstes tun können"-Schritte und Gebühren-Box mit der
// abgestimmten Formulierung. Header/Footer/Signatur über die geteilten
// Helper (caregiverMailShell / caregiverMartaSig).
export function getCaregiverInterestEmailTemplate(
  lead: Lead,
  caregiver: CaregiverDisplay,
  portalUrl: string,
): EmailTemplate {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';
  const greeting = customerGreeting(lead);
  const cg = caregiver;
  const firstName = cg.name.split(' ')[0];
  const psLabel = 'font-size:11px;font-weight:700;color:#9a8a73;letter-spacing:.08em;text-transform:uppercase;';

  const kachel = caregiverKachelHtml(cg, portalUrl);

  // Nur für den Plaintext-Reflex der Kachel.
  const metaParts: string[] = [];
  if (cg.yearsExperience && cg.yearsExperience > 0) metaParts.push(`${cg.yearsExperience} ${cg.yearsExperience === 1 ? 'Jahr' : 'Jahre'} Erfahrung`);
  if (cg.einsatzCount && cg.einsatzCount > 0)       metaParts.push(`${cg.einsatzCount} ${cg.einsatzCount === 1 ? 'Einsatz' : 'Einsätze'}`);

  const stepRow = (n: string, title: string, desc: string, last = false) => `
      <tr>
        <td style="vertical-align:top;width:34px;padding:0 12px ${last ? '0' : '14px'} 0;">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td width="26" height="26" align="center" valign="middle" bgcolor="#8B7355" style="background-color:#8B7355;border-radius:50%;color:#ffffff;font-size:13px;font-weight:700;line-height:26px;text-align:center;">${n}</td>
          </tr></table>
        </td>
        <td style="vertical-align:top;padding:0 0 ${last ? '0' : '14px'} 0;">
          <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#2D1F0F;line-height:1.4;">${title}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#555;">${desc}</p>
        </td>
      </tr>`;

  const stepsTable = `
    <p style="font-size:15px;line-height:1.75;color:#2D1F0F;margin:0 0 16px;"><strong>Was Sie als Nächstes tun können:</strong></p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 26px;">
      ${stepRow('1', 'Profil in Ruhe ansehen', `Im Portal finden Sie ${firstName}s vollständige Erfahrung, bisherige Einsätze und Sprachkenntnisse.`)}
      ${stepRow('2', 'Einladen, sich zu bewerben', `Wenn Sie ebenfalls den Eindruck haben, dass ${firstName} passt, laden Sie sie mit einem Klick ein, sich bei Ihnen formal zu bewerben.`)}
      ${stepRow('3', 'Konkrete Bewerbung erhalten', `Die formale Bewerbung erhalten Sie per E-Mail und sehen sie auch im Portal — mit Anreisedatum, Reisekosten und allen Konditionen. Erst dann entscheiden Sie verbindlich.`, true)}
    </table>`;

  const bestpreisBox = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 8px;background:#FAF8F4;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:16px 24px 20px;">
        <p style="margin:0 0 6px;${psLabel}color:#B8860B;">Keine Vermittlungsgebühr</p>
        <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#2D1F0F;">Als <strong>Direktanbieter ohne Vermittler</strong> sparen wir die Provision — und geben diesen Vorteil direkt an Sie weiter.</p>
        <p style="margin:0;font-size:14px;line-height:1.65;color:#2D1F0F;">Keine Anzahlung, keine Aufnahmegebühr, keine Bearbeitungspauschale — <strong>der Monatspreis ist der Preis.</strong></p>
      </td></tr>
    </table>`;

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${greeting},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:24px;">eine Pflegekraft hat Interesse an Ihrer Betreuungsstelle. Schauen Sie sich ihr Profil in Ruhe an — und laden Sie sie ein, sich zu bewerben, oder lehnen Sie ab.</p>
    ${kachel}
    ${stepsTable}
    ${bestpreisBox}
    <p style="font-size:15px;line-height:1.75;color:#444;margin:30px 0 18px;">Wenn Sie Fragen zu ${firstName}s Profil haben oder Unterstützung bei der Einschätzung möchten — rufen Sie mich an, schreiben Sie mir per WhatsApp oder antworten Sie einfach auf diese E-Mail. Ich bin gerne für Sie da.</p>
    ${caregiverMartaSig(baseUrl)}`;

  const html = caregiverMailShell(baseUrl, lead.email, content, customerUnsubscribeUrl(lead));

  const metaPlain = metaParts.length > 0 ? metaParts.join(' · ') : '';
  const text = `${greeting},

eine Pflegekraft hat Interesse an Ihrer Betreuungsstelle. Schauen Sie sich ihr Profil in Ruhe an — und laden Sie sie ein, sich zu bewerben, oder lehnen Sie ab.

PFLEGEKRAFT
${cg.name}${cg.age ? `, ${cg.age}` : ''} · ${caregiverTierLabel(cg.einsatzCount, cg.yearsExperience)}
${metaPlain ? metaPlain + '\n' : ''}${cg.germanLevel ? `Deutsch ${cg.germanLevel}\n` : ''}${firstName}s Profil ansehen: ${portalUrl}

WAS SIE ALS NÄCHSTES TUN KÖNNEN
1. Profil in Ruhe ansehen — im Portal finden Sie ${firstName}s vollständige Erfahrung, bisherige Einsätze und Sprachkenntnisse.
2. Einladen, sich zu bewerben — wenn Sie ebenfalls den Eindruck haben, dass ${firstName} passt, laden Sie sie mit einem Klick ein, sich bei Ihnen formal zu bewerben.
3. Konkrete Bewerbung erhalten — die formale Bewerbung erhalten Sie per E-Mail und sehen sie auch im Portal, mit Anreisedatum, Reisekosten und allen Konditionen. Erst dann entscheiden Sie verbindlich.

Keine Vermittlungsgebühr: Keine Anzahlung, keine Aufnahmegebühr, keine Bearbeitungspauschale — der Monatspreis, den Sie sehen, ist der Preis.

Wenn Sie Fragen zu ${firstName}s Profil haben oder Unterstützung bei der Einschätzung möchten — rufen Sie mich an, schreiben Sie mir per WhatsApp oder antworten Sie einfach auf diese E-Mail. Ich bin gerne für Sie da.

Mit freundlichen Grüßen
Marta Kapcio — Pflegeberaterin
Tel: 089 200 000 830  ·  WhatsApp: https://wa.me/4989200000830

Primundus Deutschland
www.primundus.de
`;

  return { subject: 'Eine Pflegekraft interessiert sich für Ihre Anfrage', html, text };
}

// Deutsche Datumsausgabe aus ISO (tz-sicher — nur der YYYY-MM-DD-Teil zählt).
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function formatGermanDate(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return `${Number(m[3])}. ${MONTHS_DE[Number(m[2]) - 1]} ${m[1]}`;
}
// Berührt der Einsatzzeitraum die Sommermonate Juli/August? (Monatsweise von
// Anreise bis Abreise prüfen.) Nur wenn beide Daten vorliegen.
function rangeTouchesSummer(arr?: string | null, dep?: string | null): boolean {
  const a = /^(\d{4})-(\d{2})/.exec(arr ?? '');
  const b = /^(\d{4})-(\d{2})/.exec(dep ?? '');
  if (!a || !b) return false;
  let y = Number(a[1]); let mo = Number(a[2]);
  const ey = Number(b[1]); const em = Number(b[2]);
  while (y < ey || (y === ey && mo <= em)) {
    if (mo === 7 || mo === 8) return true;
    mo += 1; if (mo > 12) { mo = 1; y += 1; }
  }
  return false;
}

// Mail 12 (Mail B — Bewerbung). Eigenständiges Layout mit Konditionen-Bühne
// (Tagessatz/Monatssatz + Detail-Tabelle aus der konkreten Mamamia-Bewerbung).
// Mail A/C bleiben unberührt. `offer` ist optional — fehlt es (Alt-Events,
// fehlende Daten), wird die Konditionen-Bühne weggelassen.
export function getApplicationReceivedEmailTemplate(
  lead: Lead,
  caregiver: CaregiverDisplay,
  portalUrl: string,
  offer?: OfferInfo,
): EmailTemplate {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';
  const greeting = customerGreeting(lead);
  const cg = caregiver;
  const firstName = cg.name.split(' ')[0];
  const psLabel = 'font-size:11px;font-weight:700;color:#9a8a73;letter-spacing:.08em;text-transform:uppercase;';
  const fmtEuro = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const applicationViewUrl = portalUrl + (portalUrl.includes('?') ? '&' : '?') + 'view=application';

  // ── Konditionen aus der Bewerbung ─────────────────────────────────────────
  const salary = offer?.salary && offer.salary > 0 ? offer.salary : 0;
  const tagessatz = salary > 0 ? Math.round(salary / 30) : 0;
  const zuschuesse = (lead as any).kalkulation?.zuschüsse?.gesamt ?? 0;
  const eigenanteil = salary > 0 ? Math.max(0, salary - zuschuesse) : 0;
  const anreiseDatum = formatGermanDate(offer?.arrivalAt);
  const abreiseDatum = formatGermanDate(offer?.departureAt);
  const showSummer = rangeTouchesSummer(offer?.arrivalAt, offer?.departureAt);
  const hasConditions = salary > 0 || !!anreiseDatum || !!abreiseDatum;

  // Detail-Zeilen (nur befüllte zeigen).
  const detailRow = (label: string, sub: string, value: string) =>
    `<tr>
      <td style="padding:5px 0;color:#888;">${label}${sub ? `<br><span style="font-size:12px;color:#aaa;">${sub}</span>` : ''}</td>
      <td style="padding:5px 0;color:#2D1F0F;font-weight:600;text-align:right;">${value}</td>
    </tr>`;
  const detailRows: string[] = [];
  if (anreiseDatum) detailRows.push(detailRow('Anreisedatum', '', anreiseDatum));
  if (abreiseDatum) detailRows.push(detailRow('Abreisedatum (voraussichtlich)', '', abreiseDatum));
  if (offer?.arrivalFee != null) detailRows.push(detailRow('Anreisekosten', '', `${fmtEuro(offer.arrivalFee)}&nbsp;€`));
  if (offer?.departureFee != null) detailRows.push(detailRow('Abreisekosten', '', `${fmtEuro(offer.departureFee)}&nbsp;€`));
  if (showSummer) detailRows.push(detailRow('Sommerzuschlag', 'Juli &amp; August', '6,67&nbsp;€&nbsp;/&nbsp;Tag'));
  detailRows.push(detailRow('Feiertagszuschlag', 'an ausgewählten Feiertagen', 'doppelter Tagessatz'));
  detailRows.push(detailRow('Kündigungsfrist', '', 'täglich'));

  const konditionen = hasConditions ? `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;background:#FAF8F4;border-radius:10px;overflow:hidden;">
      ${salary > 0 ? `
      <tr>
        <td class="cond-top-cell" style="width:50%;padding:22px 24px 18px;border-right:1px solid #ebe2d2;vertical-align:top;">
          <p style="margin:0 0 8px;${psLabel}">Tagessatz</p>
          <p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#2D1F0F;line-height:1.15;">${fmtEuro(tagessatz)}&nbsp;€<span style="font-size:14px;font-weight:500;color:#9a8a73;"> / Tag</span></p>
          <p style="margin:0;font-size:12px;color:#9a8a73;line-height:1.5;">inkl. Steuern &amp; Sozialabgaben</p>
        </td>
        <td class="cond-top-cell" style="width:50%;padding:22px 24px 18px;vertical-align:top;">
          <p style="margin:0 0 8px;${psLabel}">Monatssatz</p>
          <p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#2D1F0F;line-height:1.15;">${fmtEuro(salary)}&nbsp;€<span style="font-size:14px;font-weight:500;color:#9a8a73;"> / Monat</span></p>
          <p style="margin:0;font-size:12px;color:#9a8a73;line-height:1.5;">${zuschuesse > 0 ? `rechn. Eigenanteil ca. ${fmtEuro(eigenanteil)}&nbsp;€` : 'inkl. Steuern &amp; Sozialabgaben'}</p>
        </td>
      </tr>` : ''}
      <tr>
        <td colspan="2" style="padding:16px 24px 16px;${salary > 0 ? 'border-top:1px solid #ebe2d2;' : ''}">
          <p style="margin:0 0 12px;${psLabel}">Konditionen im Detail</p>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;color:#555;line-height:1.7;">
            ${detailRows.join('')}
          </table>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:14px 24px 18px;border-top:1px solid #ebe2d2;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#666;"><a href="https://kundenportal.primundus.de/primundus-mustervertrag.pdf" target="_blank" style="color:#8B7355;text-decoration:none;font-weight:600;">Mustervertrag vorab einsehen &rarr;</a></p>
        </td>
      </tr>
    </table>` : '';

  const cta = `
    <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 30px;border-collapse:separate;">
      <tr>
        <td align="center" bgcolor="#2A9D5C" style="background-color:#2A9D5C;background-image:linear-gradient(180deg,#34B36C 0%,#2A9D5C 100%);border-radius:10px;padding:17px 44px;box-shadow:0 2px 6px rgba(42,157,92,0.25);">
          <a href="${applicationViewUrl}" target="_blank" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;letter-spacing:0.01em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.4;">Bewerbung prüfen&nbsp;&nbsp;&rarr;</a>
        </td>
      </tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->`;

  const stepRow = (n: string, title: string, desc: string, last = false) => `
      <tr>
        <td style="vertical-align:top;width:34px;padding:0 12px ${last ? '0' : '14px'} 0;">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td width="26" height="26" align="center" valign="middle" bgcolor="#8B7355" style="background-color:#8B7355;border-radius:50%;color:#ffffff;font-size:13px;font-weight:700;line-height:26px;text-align:center;">${n}</td>
          </tr></table>
        </td>
        <td style="vertical-align:top;padding:0 0 ${last ? '0' : '14px'} 0;">
          <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#2D1F0F;line-height:1.4;">${title}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#555;">${desc}</p>
        </td>
      </tr>`;

  const stepsTable = `
    <p style="font-size:15px;line-height:1.75;color:#2D1F0F;margin:8px 0 16px;"><strong>So geht es weiter:</strong></p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;">
      ${stepRow('1', `${firstName}s Profil in Ruhe ansehen`, `Im Portal finden Sie ${firstName}s vollständige Erfahrung, bisherige Einsätze und Sprachkenntnisse.`)}
      ${stepRow('2', 'Konditionen prüfen', 'Tagessatz, Anreise- und Abreisedatum, Reisekosten und etwaige Zuschläge im Detail durchgehen.')}
      ${stepRow('3', 'Annehmen oder ablehnen', `Wenn ${firstName} passt: Kontaktdaten ergänzen und Pflegekraft beauftragen. Andernfalls die Bewerbung mit einem Klick ablehnen.`, true)}
    </table>`;

  const bestpreisBox = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 8px;background:#FAF8F4;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:16px 24px 20px;">
        <p style="margin:0 0 6px;${psLabel}color:#B8860B;">Keine Vermittlungsgebühr</p>
        <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#2D1F0F;">Als <strong>Direktanbieter ohne Vermittler</strong> sparen wir die Provision — und geben diesen Vorteil direkt an Sie weiter.</p>
        <p style="margin:0;font-size:14px;line-height:1.65;color:#2D1F0F;">Keine Anzahlung, keine Aufnahmegebühr, keine Bearbeitungspauschale — <strong>der Monatspreis ist der Preis.</strong></p>
      </td></tr>
    </table>`;

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${greeting},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;"><strong style="color:#2D1F0F;">${cg.name}</strong> hat sich auf Ihre Betreuungsstelle beworben. Hier sind die Konditionen ihrer Bewerbung im Überblick.</p>
    ${caregiverKachelHtml(cg, portalUrl)}
    ${konditionen}
    ${cta}
    ${stepsTable}
    ${bestpreisBox}
    <p style="font-size:15px;line-height:1.75;color:#444;margin:28px 0 18px;">Wenn Sie Fragen zu ${firstName}s Bewerbung haben oder Unterstützung bei der Entscheidung möchten — rufen Sie mich an, schreiben Sie mir per WhatsApp oder antworten Sie einfach auf diese E-Mail. Ich bin gerne für Sie da.</p>
    ${caregiverMartaSig(baseUrl)}`;

  const html = caregiverMailShell(baseUrl, lead.email, content, customerUnsubscribeUrl(lead));

  // ── Plaintext ─────────────────────────────────────────────────────────────
  const condPlain = hasConditions ? `KONDITIONEN
${salary > 0 ? `Tagessatz: ${fmtEuro(tagessatz)} € / Tag (inkl. Steuern & Sozialabgaben)\nMonatssatz: ${fmtEuro(salary)} € / Monat${zuschuesse > 0 ? ` — rechn. Eigenanteil ca. ${fmtEuro(eigenanteil)} €` : ''}\n` : ''}${anreiseDatum ? `Anreisedatum: ${anreiseDatum}\n` : ''}${abreiseDatum ? `Abreisedatum (voraussichtlich): ${abreiseDatum}\n` : ''}${offer?.arrivalFee != null ? `Anreisekosten: ${fmtEuro(offer.arrivalFee)} €\n` : ''}${offer?.departureFee != null ? `Abreisekosten: ${fmtEuro(offer.departureFee)} €\n` : ''}${showSummer ? 'Sommerzuschlag (Juli & August): 6,67 € / Tag\n' : ''}Feiertagszuschlag (an ausgewählten Feiertagen): doppelter Tagessatz
Kündigungsfrist: täglich
Mustervertrag: https://kundenportal.primundus.de/primundus-mustervertrag.pdf

` : '';

  const text = `${greeting},

${cg.name} hat sich auf Ihre Betreuungsstelle beworben. Hier sind die Konditionen ihrer Bewerbung im Überblick.

${condPlain}Bewerbung prüfen: ${applicationViewUrl}

SO GEHT ES WEITER
1. ${firstName}s Profil in Ruhe ansehen — im Portal finden Sie ${firstName}s vollständige Erfahrung, bisherige Einsätze und Sprachkenntnisse.
2. Konditionen prüfen — Tagessatz, Anreise- und Abreisedatum, Reisekosten und etwaige Zuschläge im Detail durchgehen.
3. Annehmen oder ablehnen — wenn ${firstName} passt: Kontaktdaten ergänzen und Pflegekraft beauftragen. Andernfalls die Bewerbung mit einem Klick ablehnen.

Keine Vermittlungsgebühr: Keine Anzahlung, keine Aufnahmegebühr, keine Bearbeitungspauschale — der Monatspreis, den Sie sehen, ist der Preis.

Wenn Sie Fragen zu ${firstName}s Bewerbung haben oder Unterstützung bei der Entscheidung möchten — rufen Sie mich an, schreiben Sie mir per WhatsApp oder antworten Sie einfach auf diese E-Mail. Ich bin gerne für Sie da.

Mit freundlichen Grüßen
Marta Kapcio — Pflegeberaterin
Tel: 089 200 000 830  ·  WhatsApp: https://wa.me/4989200000830

Primundus Deutschland
www.primundus.de
`;

  return { subject: 'Sie haben eine neue Bewerbung erhalten', html, text };
}

// Customer-Mail bei Buchungsbestätigung (Mail C). Wird ausgelöst, wenn der
// Kunde im Portal eine Bewerbung akzeptiert (Event
// `application_accepted_internal` an /api/lead-event). Team-Mail mit
// Vertragsdaten wird parallel über getTeamNotificationTemplate verschickt.
export function getBookingConfirmedEmailTemplate(
  lead: Lead,
  caregiver: CaregiverDisplay,
  portalUrl: string,
): EmailTemplate {
  const firstName = caregiver.name.split(' ')[0];
  const introHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">schön, dass Sie sich für <strong style="color:#2D1F0F;">${caregiver.name}</strong> entschieden haben. <strong style="color:#2D1F0F;">Ihre Buchung ist bei uns eingegangen</strong> — wir kümmern uns jetzt um alle weiteren Schritte.</p>`;
  const middleHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:20px;">Wir stoßen die Vertragsunterlagen an und stimmen den Anreisetermin mit ${firstName} ab. Innerhalb der nächsten Werktage meldet sich Ihr persönlicher Ansprechpartner bei Ihnen, um die letzten Details zu klären — zum Beispiel den genauen Tag der Anreise, Zimmer und Schlüsselübergabe.</p>`;
  return buildCaregiverEventEmail({
    lead,
    caregiver,
    subject: 'Buchung bestätigt — wir kümmern uns um alle weiteren Schritte',
    introHtml,
    middleHtml,
    ctaText: 'Status im Portal ansehen →',
    portalUrl,
    plainSummary: `schön, dass Sie sich für ${caregiver.name} entschieden haben. Ihre Buchung ist bei uns eingegangen — wir kümmern uns jetzt um alle weiteren Schritte. Wir stoßen die Vertragsunterlagen an und stimmen den Anreisetermin mit ${firstName} ab. Innerhalb der nächsten Werktage meldet sich Ihr persönlicher Ansprechpartner bei Ihnen, um die letzten Details zu klären — zum Beispiel den genauen Tag der Anreise, Zimmer und Schlüsselübergabe.`,
  });
}

// ─── Token regeneration — magic-link expired → send a new one ─────────────
// Triggered by /api/lead-regenerate-token when the customer clicks
// "Neuen Link senden" in the portal, or when admin uses the
// "Token rotieren + Mail an Kunden" button. Same look-and-feel as the
// Eingangsbestätigung but stripped down to a single CTA — the customer
// just needs the new link.
export function getTokenRegenerationEmailTemplate(
  lead: Lead,
  portalUrl: string,
): EmailTemplate {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://primundus.de';
  const greeting = customerGreeting(lead);

  const martaSignatur = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 32px 0; border: 1px solid #e8ddd0; border-radius: 12px; overflow: hidden;">
      <tr>
        <td style="padding: 18px 20px 16px; background: #ffffff;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="vertical-align: top;">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding-right: 12px; vertical-align: top;">
                      <img src="${baseUrl}/images/marta-kapcio.jpg" alt="Marta Kapcio" width="60" style="display: block; width: 60px; height: auto; border-radius: 8px;" />
                    </td>
                    <td style="vertical-align: middle;">
                      <p style="margin: 0 0 2px 0; font-size: 15px; font-weight: 700; color: #3D2B1F; white-space: nowrap; text-align: left;">Marta Kapcio</p>
                      <p style="margin: 0 0 2px 0; font-size: 13px; color: #555; white-space: nowrap; text-align: left;">Pflegeberaterin</p>
                      <p style="margin: 0; font-size: 12px; color: #9a8a73; white-space: nowrap; text-align: left;">Mo – So, 8 – 20 Uhr</p>
                    </td>
                  </tr>
                </table>
                <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 12px;">
                  <tr>
                    <td style="padding-bottom: 6px;">
                      <a href="tel:+4989200000830" style="display: inline-block; background-color: #f0ebe4; border-radius: 20px; padding: 8px 16px; text-decoration: none; font-size: 13px; font-weight: 500; color: #3D2B1F; white-space: nowrap;">&#9990; 089 200 000 830</a>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a href="https://wa.me/4989200000830" style="display: inline-block; background-color: #25D366; border-radius: 20px; padding: 8px 16px; text-decoration: none; font-size: 13px; font-weight: 600; color: #ffffff; white-space: nowrap;">WhatsApp schreiben</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const content = `
    <p style="font-size: 17px; font-weight: 700; color: #3D2B1F; margin: 0 0 16px 0; line-height: 1.5;">${greeting},</p>
    <p style="font-size: 16px; line-height: 1.7; color: #555; margin: 0 0 20px 0;">Ihr vorheriger Zugangslink zum Kundenportal ist abgelaufen oder wurde ungültig. Wir haben Ihnen einen neuen, frischen Link erstellt — Sie können einfach hier weitermachen, wo Sie aufgehört haben.</p>

    <div style="background: linear-gradient(135deg, #2D5C2F 0%, #1F4421 100%); border-radius: 10px; padding: 28px; margin: 0 0 28px 0; text-align: center; color: #ffffff;">
      <h3 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">Ihr neuer Portal-Link</h3>
      <p style="color: #E8F5E9; font-size: 14px; line-height: 1.6; margin: 0 0 18px 0;">Im Portal sehen Sie passende Pflegekräfte, eingegangene Bewerbungen und können Ihre Patientenangaben jederzeit aktualisieren.</p>
      <a href="${portalUrl}" style="display: inline-block; background: #ffffff; color: #2D5C2F; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px;">Zum Kundenportal →</a>
    </div>

    <p style="font-size: 13px; color: #888; line-height: 1.7; margin: 0 0 24px 0;">Aus Sicherheitsgründen ist auch dieser Link 14 Tage gültig. Falls Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren — der alte Link bleibt deaktiviert.</p>

    <p style="font-size: 16px; line-height: 1.7; color: #555; margin: 0 0 20px 0;">Bei Fragen melden Sie sich gerne — wir sind 7 Tage die Woche für Sie da.</p>

    <p style="font-size: 16px; line-height: 1.7; color: #555; margin-bottom: 20px; text-align: left;">Mit freundlichen Grüßen<br><strong style="color: #3D2B1F;">Marta Kapcio</strong></p>

    ${martaSignatur}
  `;

  const preheader = 'Ihr neuer Zugangslink zum Primundus-Kundenportal';
  const html = getEmailLayout({ content, preheader, siteUrl: baseUrl }).replace('{{EMAIL}}', lead.email);

  return {
    subject: 'Ihr neuer Zugangslink zum Kundenportal – Primundus',
    html,
    text: `
Ihr neuer Zugangslink zum Kundenportal – Primundus

${greeting},

Ihr vorheriger Zugangslink ist abgelaufen oder wurde ungültig. Wir haben Ihnen einen neuen, frischen Link erstellt — Sie können einfach hier weitermachen, wo Sie aufgehört haben.

IHR NEUER PORTAL-LINK
${portalUrl}

Aus Sicherheitsgründen ist auch dieser Link 14 Tage gültig. Falls Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren — der alte Link bleibt deaktiviert.

Bei Fragen melden Sie sich gerne — wir sind 7 Tage die Woche für Sie da.

Mit freundlichen Grüßen
Marta Kapcio
Pflegeberaterin · Mo – So, 8 – 20 Uhr
+49 89 200 000 830
WhatsApp: https://wa.me/4989200000830

---
Primundus Deutschland | 24h-Pflege und Betreuung
Telefon: +49 89 200 000 830 | E-Mail: info@primundus.de
www.primundus.de
    `,
  };
}

// Email transport — kept on nodemailer/Ionos SMTP per user decision.
// Signature accepts string | string[] so multi-recipient callers from
// the cherry-picked content layer (e.g. Vertrag template) keep working;
// nodemailer happily takes a comma-joined string in the `to` field.
export async function sendEmail(
  to: string | string[],
  template: EmailTemplate,
  attachments?: any[],
  options?: { skipBcc?: boolean; extraBcc?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ionos.de',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      // Mandate the STARTTLS upgrade on the submission port. Amazon SES
      // rejects any plaintext session, and we never want to silently send
      // credentials in the clear — requireTLS makes a failed upgrade error
      // out instead. Harmless for Ionos (its 587 speaks STARTTLS too).
      requireTLS: true,
      tls: { minVersion: 'TLSv1.2' },
      // Bound the handshake/send so a choking provider fails fast and
      // visibly instead of hanging the request — the Render→Ionos stalls
      // are exactly what pushed customer mail onto the scheduled pipeline.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
      },
    });

    const toAddr = Array.isArray(to) ? to.join(', ') : to;

    // Optional BCC for ops visibility — every outgoing customer mail
    // copies to info@primundus.de + info@mamamia.app by default. Disable by
    // setting SMTP_BCC=  (empty) on the deploy. Comma-separated for multiple.
    // Callers can opt out per-call via options.skipBcc (e.g. when the `to`
    // already IS the ops audience, like the admin resend-to-BCC endpoint).
    const bccRaw = process.env.SMTP_BCC ?? 'info@primundus.de,info@mamamia.app';
    // extraBcc: per-call zusätzliche BCC-Empfänger (kommasepariert), an den
    // Default-Ops-BCC angehängt. Genutzt z.B. für Accept-Mails
    // (application_accepted_internal), die über das Standard-Publikum hinaus
    // an weitere interne Adressen kopiert werden sollen.
    const bccAddr = options?.skipBcc
      ? ''
      : [bccRaw.trim(), options?.extraBcc?.trim()].filter(Boolean).join(',');

    const mailOptions: any = {
      from: `"${process.env.SMTP_FROM_NAME || 'Primundus 24h-Pflege'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: toAddr,
      // Reply-To auf das überwachte Team-Postfach (nicht die Absender-/
      // SMTP_FROM-Adresse kostenrechner@primundus.de). Die Mails bitten den
      // Kunden ausdrücklich, "einfach auf diese E-Mail zu antworten" — die
      // Antwort soll bei info@primundus.de landen. Spiegelt send-scheduled-emails.
      replyTo: 'info@primundus.de',
      subject: template.subject,
      text: template.text,
      html: template.html,
    };

    if (bccAddr) {
      mailOptions.bcc = bccAddr;
    }

    if (attachments && attachments.length > 0) {
      // Pass `cid` through so callers can inline images (CID-embed) — the
      // caregiver-photo flow relies on this: nodemailer renders the image
      // inline when an <img src="cid:xxx"> in the HTML matches an
      // attachment with `cid: 'xxx'`.
      mailOptions.attachments = attachments.map((att: any) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType || 'application/octet-stream',
        ...(att.cid ? { cid: att.cid } : {}),
      }));
    }

    await transporter.sendMail(mailOptions);
    console.log(`Email sent via SMTP to: ${toAddr}${bccAddr ? ` (bcc: ${bccAddr})` : ''}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('SMTP send error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Caregiver-Foto als Inline-Attachment (CID-Embed)
// ─────────────────────────────────────────────────────────────────────────
// Hintergrund: Mamamia liefert das Caregiver-Foto als presigned S3-URL mit
// 30 Min Gültigkeit. Beim Live-Versand reicht das meistens (Gmail/Outlook
// cachen das Bild beim ersten Öffnen), aber: wenn der Empfänger die Mail
// >30 Min ungeöffnet liegen lässt UND sein Mailclient kein Image-Proxy hat,
// fehlt das Foto. Außerdem komplett kaputt im BCC-Resend-Flow.
//
// Fix: vor dem Versand das Bild von S3 fetchen, als nodemailer-Attachment
// mit `cid:` einbetten, im HTML auf `cid:xxx` referenzieren. Bild liegt
// dann physikalisch in der Mail — kein S3-Refresh mehr nötig.

export async function fetchInlineCaregiverPhoto(
  url: string | undefined | null,
): Promise<{ filename: string; content: Buffer; contentType: string; cid: string } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn(`fetchInlineCaregiverPhoto: HTTP ${res.status} for ${url.slice(0, 80)}…`);
      return null;
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) {
      console.warn(`fetchInlineCaregiverPhoto: non-image content-type "${ct}" for ${url.slice(0, 80)}…`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) {
      // Schutz gegen 0-Byte oder absurd große Bilder.
      console.warn(`fetchInlineCaregiverPhoto: skip — size ${buf.length}`);
      return null;
    }
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const cid = `caregiver-photo-${Math.random().toString(36).slice(2, 10)}@primundus.de`;
    return {
      filename: `caregiver.${ext}`,
      content: buf,
      contentType: ct,
      cid,
    };
  } catch (e) {
    console.warn('fetchInlineCaregiverPhoto error:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// High-Level-Wrapper für die drei Customer-Caregiver-Mails. Versucht, das
// Foto inline einzubetten — fallback ohne Foto-Override (Template rendert
// dann die alte S3-URL, was im Live-Flow <30 Min immer noch funktioniert).
//
// Trick: wir geben den Template-Buildern ein Caregiver-Objekt mit
// photoUrl="cid:..." — die rendern dann <img src="cid:..."> ohne dass die
// Builder selbst geändert werden müssen.
export type CaregiverMailEvent =
  | 'caregiver_interest_shown'
  | 'application_received'
  | 'application_accepted_internal';

export async function buildCustomerCaregiverMailWithInlinePhoto(
  event: CaregiverMailEvent,
  lead: Lead,
  caregiver: CaregiverDisplay,
  portalUrl: string,
  offer?: OfferInfo,
): Promise<{ template: EmailTemplate; attachments?: any[] }> {
  const inline = await fetchInlineCaregiverPhoto(caregiver.photoUrl);

  const caregiverForTemplate: CaregiverDisplay = inline
    ? { ...caregiver, photoUrl: `cid:${inline.cid}` }
    : caregiver;

  const template =
    event === 'caregiver_interest_shown'      ? getCaregiverInterestEmailTemplate(lead, caregiverForTemplate, portalUrl)
  : event === 'application_accepted_internal' ? getBookingConfirmedEmailTemplate(lead, caregiverForTemplate, portalUrl)
  :                                             getApplicationReceivedEmailTemplate(lead, caregiverForTemplate, portalUrl, offer);

  return inline
    ? { template, attachments: [inline] }
    : { template };
}

// ── Bewertungsanfrage (Mail F) ───────────────────────────────────────────
//
// Geht an Leads, die Preis UND Betreuungskraefte gesehen haben — also an die,
// die den Unterschied tatsaechlich erlebt haben. Nicht an `nicht_interessiert`.
//
// Die Frage steht in der MAIL, nicht erst auf der Zielseite (Martin,
// 19.08.2026): ein Klick weniger, und der Kunde landet direkt dort, wo seine
// Antwort hingehoert — beim Bewertungslink oder beim Textfeld. Die Seite
// /feedback wertet dafuer ?a=… aus.
//
// Aufbau bewusst identisch zu den uebrigen Kundenmails (mail-templates/):
// gleicher Kopf mit Logo und Testsieger-Block, gleicher gruener CTA-Knopf,
// gleicher Fuss. Ein eigenes Layout fiel sofort als Fremdkoerper auf.
// SYNC-HINWEIS: Kopie dieses Templates lebt in
// supabase/functions/send-scheduled-emails/bewertung.ts (Cron-Versand).
// Layout-Änderungen immer an beiden Stellen nachziehen.
export function getBewertungsanfrageTemplate(
  lead: Lead,
  feedbackBaseUrl: string,
): EmailTemplate {
  const greeting = customerGreeting(lead);
  const tk = encodeURIComponent(lead.token ?? '');
  const link = (a: 'hilfreich' | 'teils' | 'nein') =>
    `${feedbackBaseUrl}/feedback?token=${tk}&a=${a}`;
  const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const cdn = 'https://kostenrechner.primundus.de/images';

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Primundus 24h-Pflege</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:${SANS}; line-height:1.6; color:#333333; background-color:#f4f4f4; }
  .email-wrapper { width:100%; background-color:#f4f4f4; padding:20px 0; }
  .email-container { max-width:600px; margin:0 auto; background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1); }
  .email-header { background:#ffffff; padding:24px 40px 20px 40px; border-bottom:1px solid #f0ebe4; }
  .email-content { padding:36px 40px 32px; text-align:left; }
  .email-footer { background-color:#f8f9fa; padding:30px; text-align:center; border-top:1px solid #e0e0e0; }
  @media only screen and (max-width:600px) { .email-content { padding:28px 20px; } .email-header { padding:20px; } }
</style></head>
<body>
<div class="email-wrapper">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center">
  <div class="email-container">

    <div class="email-header">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="vertical-align:middle;">
          <img src="${cdn}/Primundus-Logo_V6.png" alt="Primundus Logo" width="160"
               style="display:block;width:160px;max-width:160px;height:auto;" />
        </td>
        <td style="vertical-align:middle;text-align:right;">
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin-left:auto;"><tr>
            <td style="text-align:center;vertical-align:middle;padding-right:8px;border-right:1px solid #f0ebe4;">
              <img src="${cdn}/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="36"
                   style="display:block;width:36px;height:auto;" />
            </td>
            <td style="text-align:left;padding-left:8px;">
              <p style="margin:0 0 1px 0;font-size:10px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Testsieger</p>
              <p style="margin:0 0 1px 0;font-size:10px;color:#B5A184;white-space:nowrap;font-weight:600;">DIE WELT</p>
              <p style="margin:0;font-size:9px;color:#aaa;white-space:nowrap;">Preis &amp; Qualit&auml;t</p>
            </td>
          </tr></table>
        </td>
      </tr></table>
    </div>

    <div class="email-content">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#333333;">${greeting},</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#333333;">
        sch&ouml;n, dass Sie Ihre Anfrage zur 24-Stunden-Pflege bei uns gestellt haben.
      </p>
      <p style="margin:0 0 26px;font-size:16px;line-height:1.65;color:#333333;">
        Wir wollten kurz nachfragen, wie Ihnen unser System gefallen hat:
        <strong>War es f&uuml;r Sie hilfreich, den Preis sofort zu sehen und die passenden
        Betreuungskr&auml;fte &mdash; bevor Sie irgendeinen Vertrag schlie&szlig;en m&uuml;ssen?</strong>
      </p>

      <!-- Ein grosser gefuellter Knopf im Primundus-Ton, darunter zwei
           gleich breite in Beige (Martin, 19.08.: "schon als button ... nur in
           der richtigen farbe"). Feste Prozentbreiten, weil Outlook flexbox
           nicht kennt. -->
      <!--[if mso]>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>
      <![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin:0 auto;border-collapse:separate;">
        <tr><td align="center" bgcolor="#8B7355"
                style="background-color:#8B7355;background-image:linear-gradient(180deg,#9C8365 0%,#8B7355 100%);
                       border-radius:10px;padding:17px 24px;box-shadow:0 2px 6px rgba(139,115,85,0.28);">
          <a href="${link('hilfreich')}" target="_blank"
             style="color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;
                    letter-spacing:0.01em;font-family:${SANS};line-height:1.4;">&#128077;&nbsp;&nbsp;Ja, das war hilfreich</a>
        </td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="margin:10px auto 0;border-collapse:separate;">
        <tr>
          <td width="49%" align="center" bgcolor="#F0EBE4"
              style="background-color:#F0EBE4;border-radius:10px;padding:13px 10px;">
            <a href="${link('teils')}" target="_blank"
               style="color:#3D2B1F;text-decoration:none;font-weight:600;font-size:14px;
                      font-family:${SANS};line-height:1.4;white-space:nowrap;">&#128528;&nbsp; Teilweise</a>
          </td>
          <td width="2%" style="font-size:0;line-height:0;">&nbsp;</td>
          <td width="49%" align="center" bgcolor="#F0EBE4"
              style="background-color:#F0EBE4;border-radius:10px;padding:13px 10px;">
            <a href="${link('nein')}" target="_blank"
               style="color:#3D2B1F;text-decoration:none;font-weight:600;font-size:14px;
                      font-family:${SANS};line-height:1.4;white-space:nowrap;">&#128078;&nbsp; Nein</a>
          </td>
        </tr>
      </table>
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->

      <!-- Marta-Block wie in den uebrigen Kundenmails (mail-templates/02, 04):
           Bild links, Name/Rolle/Zeiten rechts, darunter die Kontaktwege.
           Die Pillen bewusst kleiner und leiser als die Antwort-Knoepfe darueber —
           sie sollen nicht mit ihnen um den Klick konkurrieren (Martin, 19.08.). -->
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
             style="margin-top:30px;border-top:1px solid #f0ebe4;padding-top:22px;"><tr>
        <td style="vertical-align:top;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">
            Vielen Dank schon jetzt f&uuml;r Ihre R&uuml;ckmeldung &mdash; und melden Sie sich
            jederzeit, wenn ich Ihnen weiterhelfen kann.
          </p>
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td style="padding-right:12px;vertical-align:top;">
              <img src="${cdn}/marta-kapcio.jpg" alt="Marta Kapcio" width="60"
                   style="display:block;width:60px;height:auto;border-radius:8px;" />
            </td>
            <td style="vertical-align:middle;">
              <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Marta Kapcio</p>
              <p style="margin:0 0 2px;font-size:13px;color:#555;white-space:nowrap;">Pflegeberaterin</p>
              <p style="margin:0;font-size:12px;color:#9a8a73;white-space:nowrap;">Mo &ndash; So, 8 &ndash; 20 Uhr</p>
            </td>
          </tr></table>
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:12px;"><tr>
            <td style="padding-right:6px;">
              <a href="tel:+4989200000830"
                 style="display:inline-block;background-color:#ffffff;border:1px solid #dcdcdc;
                        border-radius:16px;padding:6px 13px;text-decoration:none;font-size:12px;
                        font-weight:500;color:#777777;white-space:nowrap;font-family:${SANS};">&#9990; 089 200 000 830</a>
            </td>
            <td style="padding-right:6px;">
              <a href="https://wa.me/4989200000830"
                 style="display:inline-block;background-color:#ffffff;border:1px solid #dcdcdc;
                        border-radius:16px;padding:6px 13px;text-decoration:none;font-size:12px;
                        font-weight:500;color:#777777;white-space:nowrap;font-family:${SANS};">WhatsApp</a>
            </td>
            <td>
              <a href="mailto:info@primundus.de"
                 style="display:inline-block;background-color:#ffffff;border:1px solid #dcdcdc;
                        border-radius:16px;padding:6px 13px;text-decoration:none;font-size:12px;
                        font-weight:500;color:#777777;white-space:nowrap;font-family:${SANS};">info@primundus.de</a>
            </td>
          </tr></table>
        </td>
      </tr></table>
    </div>

    <div class="email-footer">
      <div style="font-weight:600;font-size:15px;color:#3D2B1F;margin-bottom:6px;">Primundus Deutschland</div>
      <div style="font-size:13px;color:#666;line-height:1.8;">
        24h-Pflege und Betreuung zu Hause<br>
        <a href="tel:+4989200000830" style="color:#0066CC;text-decoration:none;">+49 89 200 000 830</a> |
        <a href="https://wa.me/4989200000830" style="color:#0066CC;text-decoration:none;">WhatsApp</a> |
        <a href="mailto:info@primundus.de" style="color:#0066CC;text-decoration:none;">info@primundus.de</a><br>
        <a href="https://primundus.de" style="color:#0066CC;text-decoration:none;">www.primundus.de</a>
      </div>
      <div style="font-size:12px;color:#999;margin-top:16px;line-height:1.5;">
        Diese E-Mail wurde versendet an: ${lead.email ?? ''}<br><br>
        Sie erhalten diese E-Mail, weil Sie eine Kalkulation auf primundus.de angefordert haben.
        <a href="${feedbackBaseUrl}/abmelden?token=${tk}" style="color:#999;text-decoration:underline;">Abmelden</a>
      </div>
    </div>

  </div>
</td></tr></table>
</div>
</body></html>`;

  const text = `${greeting},

sch\u00f6n, dass Sie Ihre Anfrage zur 24-Stunden-Pflege bei uns gestellt haben.

Wir wollten kurz nachfragen, wie Ihnen unser System gefallen hat: War es f\u00fcr Sie
hilfreich, den Preis sofort zu sehen und die passenden Betreuungskr\u00e4fte \u2014 bevor
Sie irgendeinen Vertrag schlie\u00dfen m\u00fcssen?

[Daumen hoch] Ja, das war hilfreich: ${link('hilfreich')}
Teilweise: ${link('teils')}
Nein, eher nicht: ${link('nein')}

Herzliche Gr\u00fc\u00dfe
Marta Kapcio \u2014 Pflegeberaterin
089 200 000 830 \u00b7 info@primundus.de

Primundus Deutschland
www.primundus.de
`;

  // Betreff von Martin gewaehlt (19.08.): sagt sofort, worum es geht.
  // Verworfen: „Kurze Frage zu Ihrer Anfrage“ (Serienbrief-Ton) und
  // „Hat Ihnen das geholfen?“ (zu vage).
  return { subject: 'Wie fanden Sie unser Angebot?', html, text };
}
