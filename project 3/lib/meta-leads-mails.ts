// Facebook-/Instagram-Leads (Meta-Sofortformular „Anfrage"): die zwei Mails.
//   1. Team-Mail an META_LEADS_TO (Standard info@primundus.de), eine Karte je Lead.
//   2. Bestätigung an den Lead mit dem Link zum Kostenrechner.
// Pure (nur email-template + mail-bausteine), getestet in
// src/__tests__/metaLeads.test.ts. Abholung, Speichern, Versand: lib/meta-leads.ts.
//
// ALLE sichtbaren Wörter beider Mails stehen in META_LEAD_TEXTE. Wortlaut
// ändern = nur dort. Platzhalter in geschweiften Klammern füllt `fuelle()`.

import type { EmailTemplate } from './email';
import { getEmailLayout } from './email-template';
import { BESTPREIS_URL, MAIL_FARBEN as F, mKnopf, mp, mSterneZeile, mTitel } from './mail-bausteine';
import { PORTAL_PUNKTE } from './hero-punkte';
import { martaKarteHtml } from './marta-karte';
import type { BewertungsStand } from './bewertungen-stand';

export const META_LEAD_TEXTE = {
  bestaetigung: {
    // Martin 27.11.: „Facebook“ in Betreff und Titel, damit klar ist, woher die Mail kommt.
    // {kanal} = Facebook oder Instagram (Feld `platform` des Leads); unbekannt ⇒ Fassung ohne Kanal.
    betreff: 'Ihre {kanal}-Anfrage zur 24-Stunden-Betreuung',
    betreffOhneKanal: 'Ihre Anfrage zur 24-Stunden-Betreuung',
    vorschau: 'Ihren Preis und passende Pflegekräfte sehen Sie online in ca. 2 Minuten.',
    // Fassung 8 (27.11., Martin: „2“): Anrede mit dem Namen aus dem Formular über dem Titel.
    anrede: 'Hallo {name},',
    anredeOhneName: 'Hallo,',
    titel: 'Vielen Dank für Ihre {kanal}-Anfrage zur 24-Stunden-Betreuung',
    titelOhneKanal: 'Vielen Dank für Ihre Anfrage zur 24-Stunden-Betreuung',
    // Erst der Online-Weg (über dem Knopf), dann der Rückruf (über Martas Karte).
    absatz1:
      'Ihren Preis und passende Pflegekräfte sehen Sie schon jetzt online. Nach ein paar kurzen Fragen, zum Beispiel zum Pflegegrad, steht Ihr Angebot in ca.\u00a02\u00a0Minuten bereit, kostenfrei und unverbindlich. Ihre Pflegekraft kann schon in 3\u00a0Tagen anreisen.',
    absatz2:
      'Lieber persönlich beraten lassen? Unsere Pflegeberatung ruft Sie an und geht alles in Ruhe mit Ihnen durch, täglich zwischen 8 und 20 Uhr.',
    knopf: 'Angebot & Pflegekräfte ansehen',
    knopfUrl: 'https://kostenrechner.primundus.de/?utm_source=facebook&utm_medium=lead_mail&utm_campaign=meta-leads-2026-11',
    // Die Punkte unter dem Knopf der Startseite (Bestpreisgarantie + PORTAL_PUNKTE, lib/hero-punkte.ts).
    punkte: ['Bestpreisgarantie', ...PORTAL_PUNKTE],
    bestpreisUrl: BESTPREIS_URL,
    bestpreisMehr: 'Mehr Infos',
    // Nur Textfassung (im HTML steht Martas Karte).
    unterschrift: 'Marta Kapcio, Pflegeberaterin, Primundus · 089 200 000 830 · täglich 8–20 Uhr',
    fussGrund:
      'Sie erhalten diese E-Mail, weil Sie in einer Anzeige auf Facebook oder Instagram eine Anfrage gestellt haben.',
    impressum: 'Impressum',
    impressumUrl: 'https://www.primundus.de/impressum',
    datenschutz: 'Datenschutz',
    datenschutzUrl: 'https://www.primundus.de/datenschutz',
  },
  team: {
    betreffEiner: 'Facebook-Anfrage: {name}, {zeitraum}',
    betreffEinerOhneZeitraum: 'Facebook-Anfrage: {name}',
    betreffMehrere: '{anzahl} Facebook-Anfragen',
    einleitungEiner: 'Anfrage über das Formular in der Facebook-/Instagram-Anzeige. Bitte während der Telefonzeit 8–20 Uhr so schnell wie möglich zurückrufen.',
    einleitungMehrere: 'Anfragen über das Formular in der Facebook-/Instagram-Anzeige. Bitte während der Telefonzeit 8–20 Uhr so schnell wie möglich zurückrufen.',
    // Nur wenn JEDER Lead der Mail seine Bestätigung bekommen hat — sonst
    // stünde hier eine falsche Behauptung (Karte nennt dann den Grund).
    bestaetigtEiner: 'Die Bestätigungsmail mit dem Kostenrechner-Link ist schon verschickt.',
    bestaetigtMehrere: 'Die Bestätigungsmails mit dem Kostenrechner-Link sind schon verschickt.',
    ohneName: 'Ohne Namen',
    telefon: 'Telefon',
    anrufen: 'Anrufen',
    email: 'E-Mail',
    zeitraum: 'Zeitraum',
    eingang: 'Eingang',
    uhr: 'Uhr',
    kanal: 'Kanal',
    anzeige: 'Anzeige',
    formular: 'Formular',
    plattform: { fb: 'Facebook', ig: 'Instagram' } as Record<string, string>,
    // Grund, wenn ein Lead KEINE Bestätigung bekam (steht auf seiner Karte).
    ohneBestaetigung: {
      keine_email: 'Keine Bestätigungsmail versendet: keine E-Mail-Adresse im Formular.',
      zu_alt: 'Keine Bestätigungsmail versendet: Anfrage älter als 3 Tage.',
      fehlgeschlagen: 'Keine Bestätigungsmail versendet: Versandfehler.',
    },
    // Steht hinter jedem dieser Gründe: was das Team am Telefon tun soll.
    ohneBestaetigungTipp: 'Im Gespräch E-Mail-Adresse erfragen oder prüfen und den Kostenrechner-Link anbieten.',
  },
} as const;

/** Antworten der Formularfrage „Wann benötigen Sie Unterstützung zu Hause?" (Meta-Formular 11/2026, Fassung 5). */
export const ZEITRAUM_ANTWORTEN = ['So bald wie möglich', 'Innerhalb der nächsten 4 Wochen', 'Später oder noch unklar'] as const;

/** Bestätigungen gehen nur an Leads, die höchstens so alt sind (erste Abholung holt auch ältere). */
export const BESTAETIGUNG_MAX_ALTER_STUNDEN = 72;

export interface FbLead {
  id: string;
  form_id: string | null;
  form_name: string | null;
  ad_name: string | null;
  campaign_name: string | null;
  platform: string | null;
  created_time: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  fields: Record<string, string>;
}

export type BestaetigungsStand = 'verschickt' | keyof typeof META_LEAD_TEXTE.team.ohneBestaetigung;

// ─── Helfer ──────────────────────────────────────────────────────────────

function esc(wert: unknown): string {
  return String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const einzeilig = (wert: string): string => wert.replace(/[\r\n]+/g, ' ').trim();

/** Ersetzt {schluessel} durch werte[schluessel]. */
export function fuelle(vorlage: string, werte: Record<string, string | number>): string {
  return vorlage.replace(/\{(\w+)\}/g, (ganz, k: string) => (k in werte ? String(werte[k]) : ganz));
}

/**
 * Name aus dem Formular für die Anrede: Leerraum glätten; nur wer alles klein oder
 * alles groß getippt hat, bekommt große Anfangsbuchstaben (auch nach „-“).
 * Gemischte Schreibweise bleibt, wie sie ist („von der Heide“). Leer ⇒ null.
 */
export function anredeName(name: string | null | undefined): string | null {
  const n = einzeilig(String(name ?? '')).replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (n !== n.toLowerCase() && n !== n.toUpperCase()) return n;
  const gross = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return n.toLowerCase().split(' ').map((w) => w.split('-').map(gross).join('-')).join(' ');
}

/** Für Vergleiche: klein, ohne Akzente, `_` als Leerzeichen, ohne Satzzeichen am Rand. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/[?:!.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Meta liefert Schlüssel/Antworten oft als „so_bald_wie_möglich" — lesbar machen, nichts erfinden. */
function lesbar(s: string): string {
  const t = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/\?$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Feste Kontaktfelder des Formulars — alles andere sind Antworten auf eigene Fragen. */
const KONTAKT_FELDER = new Set([
  'full_name', 'name', 'first_name', 'last_name', 'email', 'work_email', 'phone_number', 'phone', 'work_phone_number',
  // Deutsches Formular (Graph API 27.11.2026): Meta benennt die Kontaktfelder nach der Formularsprache.
  'vollständiger_name', 'e-mail-adresse', 'e-mail', 'telefonnummer',
]);

/** Ist dieser Formular-Schlüssel die Frage nach dem Zeitraum („Für wann …", „Ab wann …")? */
export function istZeitraumFeld(schluessel: string): boolean {
  const k = norm(schluessel);
  return /(^| )wann( |$)/.test(k) || k.includes('zeitraum');
}

/** Antwort auf die Zeitraum-Frage — bekannte Antwort im Wortlaut des Formulars, sonst lesbar gemacht. */
export function zeitraumAus(fields: Record<string, string> | null | undefined): string | null {
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (!v || !istZeitraumFeld(k)) continue;
    const treffer = ZEITRAUM_ANTWORTEN.find((a) => norm(a) === norm(v));
    return treffer ?? lesbar(v);
  }
  return null;
}

/** Weitere Antworten (ohne Kontaktfelder und ohne Zeitraum) als [Frage, Antwort]. */
export function weitereAntworten(fields: Record<string, string> | null | undefined): Array<[string, string]> {
  return Object.entries(fields ?? {})
    .filter(([k, v]) => v && !KONTAKT_FELDER.has(k) && !istZeitraumFeld(k))
    .map(([k, v]) => [lesbar(k), lesbar(v)]);
}

/** Plausible einzelne Adresse (für Reply-To); sonst null. */
export function mailAdresse(wert: string | null | undefined): string | null {
  const v = (wert ?? '').trim();
  return /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(v) ? v : null;
}

const telHref = (telefon: string): string => 'tel:' + telefon.replace(/[^\d+]/g, '');

/** „Mi., 25.11., 14:32" in deutscher Zeit. */
export function berlinZeit(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function plattformText(p: string | null): string | null {
  if (!p) return null;
  return META_LEAD_TEXTE.team.plattform[p.toLowerCase()] ?? p;
}

// ─── 1. Team-Mail ────────────────────────────────────────────────────────

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function zeilenFuer(l: FbLead, stand: BestaetigungsStand): { daten: Array<[string, string]>; hinweis: string | null } {
  const T = META_LEAD_TEXTE.team;
  const daten: Array<[string, string]> = [];
  if (l.phone) daten.push([T.telefon, l.phone]);
  if (l.email) daten.push([T.email, l.email]);
  const zeitraum = zeitraumAus(l.fields);
  if (zeitraum) daten.push([T.zeitraum, zeitraum]);
  daten.push(...weitereAntworten(l.fields));
  daten.push([T.eingang, `${berlinZeit(l.created_time)} ${T.uhr}`]);
  const kanal = plattformText(l.platform);
  if (kanal) daten.push([T.kanal, kanal]);
  if (l.ad_name) daten.push([T.anzeige, l.ad_name]);
  else if (l.form_name) daten.push([T.formular, l.form_name]);
  return { daten, hinweis: stand === 'verschickt' ? null : `${T.ohneBestaetigung[stand]} ${T.ohneBestaetigungTipp}` };
}

export function metaLeadTeamMail(
  eintraege: Array<{ lead: FbLead; bestaetigung: BestaetigungsStand }>,
): EmailTemplate {
  const T = META_LEAD_TEXTE.team;
  const einer = eintraege.length === 1 ? eintraege[0].lead : null;
  const nameVon = (l: FbLead) => einzeilig(l.name || l.phone || l.email || T.ohneName);

  let subject: string;
  if (einer) {
    const zeitraum = zeitraumAus(einer.fields);
    subject = zeitraum
      ? fuelle(T.betreffEiner, { name: nameVon(einer), zeitraum: einzeilig(zeitraum) })
      : fuelle(T.betreffEinerOhneZeitraum, { name: nameVon(einer) });
  } else {
    subject = fuelle(T.betreffMehrere, { anzahl: eintraege.length });
  }

  const alleBestaetigt = eintraege.every((e) => e.bestaetigung === 'verschickt');
  const einleitung = [
    einer ? T.einleitungEiner : T.einleitungMehrere,
    alleBestaetigt ? (einer ? T.bestaetigtEiner : T.bestaetigtMehrere) : '',
  ].filter(Boolean).join(' ');

  const karten = eintraege.map(({ lead, bestaetigung }) => {
    const { daten, hinweis } = zeilenFuer(lead, bestaetigung);
    const knopf = lead.phone
      ? `<p style="margin:14px 0 0;"><a href="${esc(telHref(lead.phone))}" style="display:inline-block;background:${F.coral};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;font-family:${SANS};padding:11px 22px;border-radius:999px;">${esc(T.anrufen)}</a></p>`
      : '';
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;border:1.5px solid ${F.line};border-radius:14px;background:#ffffff;border-collapse:separate;">
          <tr><td style="padding:16px 18px;font-family:${SANS};">
            <p style="margin:0 0 10px;font-size:19px;font-weight:800;color:${F.ink};">${esc(lead.name || T.ohneName)}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:14px;line-height:1.5;">
              ${daten.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:${F.muted};white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:3px 0;color:${F.ink};vertical-align:top;">${k === T.telefon ? `<strong>${esc(v)}</strong>` : esc(v)}</td></tr>`).join('')}
            </table>
            ${hinweis ? `<p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:${F.amberInk};background:${F.amberTint};padding:8px 10px;border-radius:8px;">${esc(hinweis)}</p>` : ''}
            ${knopf}
          </td></tr>
        </table>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${F.shell};">
  <div style="max-width:640px;margin:0 auto;padding:20px 12px;font-family:${SANS};">
    <div style="background-color:#5C4A32;color:#ffffff;padding:16px 20px;border-radius:12px 12px 0 0;">
      <p style="margin:0;font-size:18px;font-weight:700;line-height:1.35;">${esc(subject)}</p>
    </div>
    <div style="background:#ffffff;border:2px solid #5C4A32;border-top:none;border-radius:0 0 12px 12px;padding:18px 16px 6px;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${F.text};">${esc(einleitung)}</p>
      ${karten}
    </div>
  </div>
</body></html>`;

  const text = [
    subject,
    '',
    einleitung,
    '',
    ...eintraege.flatMap(({ lead, bestaetigung }) => {
      const { daten, hinweis } = zeilenFuer(lead, bestaetigung);
      return [lead.name || T.ohneName, ...daten.map(([k, v]) => `${k}: ${v}`), ...(hinweis ? [hinweis] : []), ''];
    }),
  ].join('\n');

  return { subject, html, text };
}

// ─── 2. Bestätigung an den Lead ──────────────────────────────────────────

export function metaLeadBestaetigung(
  lead: Pick<FbLead, 'name' | 'email'> & Partial<Pick<FbLead, 'platform'>>,
  bewertung: BewertungsStand,
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL || 'https://kostenrechner.primundus.de',
): EmailTemplate {
  const B = META_LEAD_TEXTE.bestaetigung;
  const site = siteUrl.replace(/\/$/, '');

  // Punkte wie unter dem Knopf der Startseite, untereinander (zwei Spalten brachen auf 390 px um), Haken in Koralle.
  const zeile = (t: string) =>
    `<tr><td style="width:24px;padding:0 0 7px;vertical-align:top;color:${F.coral};font-weight:800;font-size:15px;line-height:1.4;">&#10003;</td><td style="padding:0 0 7px;font-size:15px;line-height:1.4;color:${F.ink};">${t}</td></tr>`;
  const punkte = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 8px;">
        ${B.punkte.map((t, i) => zeile(i === 0 ? `${esc(t)} &nbsp;<a href="${esc(B.bestpreisUrl)}" style="color:${F.greenDeep};font-weight:700;text-decoration:underline;white-space:nowrap;">${esc(B.bestpreisMehr)}</a>` : esc(t))).join('')}
      </table>`;

  const name = anredeName(lead.name);
  const anrede = name ? fuelle(B.anrede, { name }) : B.anredeOhneName;
  const kanal = META_LEAD_TEXTE.team.plattform[(lead.platform ?? '').toLowerCase()];
  const titel = kanal ? fuelle(B.titel, { kanal }) : B.titelOhneKanal;
  // Wörter mit Bindestrich bleiben zusammen („Facebook-Anfrage“, „24-Stunden-Betreuung“),
  // sonst bricht der Titel auf dem Handy mitten im Wort um; das letzte Wort hängt am vorletzten.
  const titelHtml = (t: string) =>
    t.split(' ').map((w) => (w.includes('-') ? `<span style="white-space:nowrap;">${esc(w)}</span>` : esc(w)))
      .reduce((acc, w, i, alle) => (i === 0 ? w : acc + (i === alle.length - 1 ? '&nbsp;' : ' ') + w), '');
  const betreff = kanal ? fuelle(B.betreff, { kanal }) : B.betreffOhneKanal;

  const content = `
      <p style="margin:0 0 6px;font-size:17px;line-height:1.4;color:${F.ink};">${esc(anrede)}</p>
      ${mTitel(titelHtml(titel), 14, 24)}
      ${mp(esc(B.absatz1).replace(/ (\S+)$/, '&nbsp;$1'), 8)}
      ${mKnopf(esc(B.knopfUrl), esc(B.knopf), 8, 16)}
      ${punkte}
      ${mSterneZeile(bewertung, 24)}
      ${mp(esc(B.absatz2).replace(/ (\S+)$/, '&nbsp;$1'), 14)}
      ${martaKarteHtml({ fuer: 'kunde', bewertung, siteUrl: site, presseLogos: true, sterne: false, abstandUnten: 8 })}`;

  const fussLink = (url: string, t: string) => `<a href="${esc(url)}" style="color:#999999;text-decoration:underline;">${esc(t)}</a>`;
  const grund = `${esc(B.fussGrund)}<br><br>${fussLink(B.impressumUrl, B.impressum)} &middot; ${fussLink(B.datenschutzUrl, B.datenschutz)}`;

  const html = getEmailLayout({ content, preheader: esc(B.vorschau), siteUrl: site, grund }).replace('{{EMAIL}}', esc(lead.email ?? ''));

  const text = [
    anrede,
    '',
    titel,
    '',
    B.absatz1,
    '',
    `${B.knopf}: ${B.knopfUrl}`,
    '',
    B.punkte.join(' · '),
    `${bewertung.schnitt} von 5 aus ${bewertung.anzahl} Bewertungen`,
    '',
    B.absatz2,
    '',
    B.unterschrift,
    '',
    B.fussGrund,
    `${B.impressum}: ${B.impressumUrl}`,
    `${B.datenschutz}: ${B.datenschutzUrl}`,
    '',
  ].join('\n');

  return { subject: betreff, html, text };
}
