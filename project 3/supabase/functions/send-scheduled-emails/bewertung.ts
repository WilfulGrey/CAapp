// Bewertungsanfrage („Wie fanden Sie unser Angebot?") — Versand aus dem
// Cron an Leads, deren Anfrage 7 Tage zurückliegt (Stichtag 14.08.2026,
// Entscheidung Martin 21.08.: nur Neuanfragen, kein Bestand; Martin in CC).
//
// SYNC-HINWEIS: Das HTML-Template ist eine KOPIE von
// project 3/lib/email.ts:getBewertungsanfrageTemplate (Edge Functions können
// nicht aus lib/ importieren — gleiche Lage wie names.ts/appendJobParam).
// Änderungen am Layout IMMER an beiden Stellen nachziehen.
import { capitalizeName } from "./names.ts";

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface BewertungsLead {
  id: string;
  vorname: string | null;
  nachname: string | null;
  anrede_text: string | null;
  token: string | null;
  email: string | null;
  status: string | null;
  created_at: string;
}

// Ab wann Leads berücksichtigt werden (Anfrage-Datum) — Bestand bleibt außen vor.
export const BEWERTUNG_STICHTAG = "2026-08-14";
// Frühestens N Tage nach der Anfrage.
export const BEWERTUNG_TAGE = 7;
// Versandfenster (Europe/Berlin, Stunden) — vormittags, gut fürs Postfach der Mittagspause.
export const FENSTER_VON = 10;
export const FENSTER_BIS = 12; // exklusiv
// Obergrenze je Cron-Lauf — verteilt den Erststau statt Burst.
export const BEWERTUNG_CAP = 25;
// Martin liest mit, solange die Mail neu ist (Entscheidung 21.08.).
export const BEWERTUNG_CC = "martin@wyzzi.net";

// Statusgruppen: harte Ausschlüsse (nie senden) vs. Trigger-2-Kandidaten
// (Kunden — bekommen später die Nach-Anreise-Variante, nicht diese).
const NIE = new Set(["nicht_interessiert"]);
const KUNDE = new Set(["vertrag_abgeschlossen", "betreuung_beauftragt", "folge_einsatz"]);

export function bewertungAusschlussgrund(
  lead: BewertungsLead,
  pendingTypesFuerLead: string[],
  jetzt: Date,
): string | null {
  if (!lead.email || !lead.token) return "kein_kontakt";
  if (lead.created_at < BEWERTUNG_STICHTAG) return "vor_stichtag";
  const alterMs = jetzt.getTime() - new Date(lead.created_at).getTime();
  if (alterMs < BEWERTUNG_TAGE * 24 * 60 * 60 * 1000) return "zu_frisch";
  const s = (lead.status ?? "").toLowerCase();
  if (NIE.has(s)) return "nicht_interessiert";
  if (KUNDE.has(s)) return "kunde_trigger2";
  // Mitten in der Bewerbungsphase nicht stören — nächster Lauf prüft wieder
  // (automatisches Verschieben statt fester Reschedule-Logik).
  if (pendingTypesFuerLead.some((t) => t.startsWith("application_"))) return "bewerbungsphase";
  return null;
}

export function imBewertungsfenster(jetzt: Date): boolean {
  // en-GB liefert "10" ohne Suffix („de-DE" ergäbe „10 Uhr" → NaN).
  const stunde = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      hour12: false,
    }).format(jetzt),
  );
  return stunde >= FENSTER_VON && stunde < FENSTER_BIS;
}

// Anrede — portiert aus lib/email.ts:customerGreeting, bewusst OHNE die
// Vornamens-DB (zu groß für die Edge Function): Einzel-Token ohne Nachname
// ergibt neutrales „Guten Tag" statt Vornamens-Anrede. Nie falsch, nur
// gelegentlich neutraler als die Next-Seite.
function customerGreeting(lead: BewertungsLead): string {
  const anrede = lead.anrede_text || "";
  const n = capitalizeName(lead.nachname || "");
  if (anrede === "Frau" && n) return `Guten Tag Frau ${n}`;
  if (anrede === "Herr" && n) return `Guten Tag Herr ${n}`;
  if (anrede === "Familie" && n) return `Guten Tag Familie ${n}`;
  if (lead.vorname && n) return `Guten Tag ${capitalizeName(lead.vorname)}`;
  return "Guten Tag";
}

type Lead = BewertungsLead;

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
              <p style="margin:0 0 1px;font-size:9px;font-weight:700;color:#B5A184;white-space:nowrap;">6× in Folge</p>
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
