// Mails und kleine HTML-Seiten für Kundenbewertungen (primundus.de/erfahrungen).
// Pure (nur email-template + bewertungen), getestet in
// src/__tests__/bewertungenMails.test.ts. Logik und Umgebungsvariablen: lib/bewertungen.ts.

import type { EmailTemplate } from './email';
import { getEmailLayout } from './email-template';
import {
  AKTIONEN,
  berlinDatumZeit,
  berlinTagText,
  ERFAHRUNGEN_URL,
  sterneText,
  type BewertungStatus,
  type ModerationsAktion,
} from './bewertungen';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const STERN_FARBE = '#D99A1E';

function esc(wert: unknown): string {
  return String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Nutzertext mit Zeilenumbrüchen für HTML. */
function absatz(text: string): string {
  return esc(text).replace(/\n/g, '<br>');
}

function einzeilig(wert: string): string {
  return wert.replace(/[\r\n]+/g, ' ').trim();
}

export interface BewertungAnzeige {
  sterne: number;
  text: string;
  name: string;
  ort: string | null;
  /** null bei im Admin eingetragenen Bewertungen. */
  email: string | null;
  erstellt_am: string;
}

// ─── 1. Bestätigungsmail an die Person, die bewertet hat ──────────────────

export function bestaetigungsMail(p: {
  sterne: number;
  text: string;
  name: string;
  ort: string | null;
  email: string;
  link: string;
  /** Basis-URL für Logo/Siegel im Layout (Kostenrechner). */
  basis: string;
}): EmailTemplate {
  const sterne = sterneText(p.sterne);
  const wer = [p.name, p.ort].filter(Boolean).join(', ');
  const link = esc(p.link);

  const content = `
      <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#333333;">Guten Tag,</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#333333;">
        vielen Dank für Ihre Bewertung von Primundus. Das haben Sie geschrieben:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-collapse:separate;">
        <tr><td bgcolor="#FAF7F2" style="background-color:#FAF7F2;border-left:4px solid #B5A184;border-radius:4px;padding:16px 18px;">
          <p style="margin:0 0 8px;font-size:22px;line-height:1.2;letter-spacing:2px;color:${STERN_FARBE};">${sterne}
            <span style="font-size:13px;letter-spacing:0;color:#777777;">&nbsp;${p.sterne} von 5 Sternen</span></p>
          <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#333333;">${absatz(p.text)}</p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#777777;">${esc(wer)}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-size:16px;line-height:1.65;color:#333333;">
        Bitte bestätigen Sie mit einem Klick, dass die Bewertung von Ihnen stammt:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 12px;border-collapse:separate;">
        <tr><td align="center" bgcolor="#8B7355" style="background-color:#8B7355;border-radius:8px;padding:14px 34px;">
          <a href="${link}" target="_blank" style="color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;font-family:${SANS};line-height:1.4;">Bewertung bestätigen</a>
        </td></tr>
      </table>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:#999999;text-align:center;">
        Falls der Knopf nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
        <a href="${link}" style="color:#8B7355;word-break:break-all;">${link}</a>
      </p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#333333;">Danach prüfen wir die Bewertung und veröffentlichen sie auf primundus.de/erfahrungen. Wir veröffentlichen positive und kritische Bewertungen.</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#333333;">Der Link gilt 7 Tage.</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#333333;">Haben Sie keine Bewertung geschrieben? Dann ignorieren Sie diese E-Mail.</p>
      <p style="margin:0;font-size:16px;line-height:1.65;color:#333333;">Mit freundlichen Grüßen<br>Ihr Primundus-Team</p>`;

  const html = getEmailLayout({
    content,
    preheader: 'Ein Klick bestätigt Ihre Bewertung von Primundus.',
    siteUrl: p.basis,
    grund: 'Sie erhalten diese E-Mail, weil mit dieser Adresse eine Bewertung auf primundus.de/erfahrungen abgegeben wurde.',
  }).replace('{{EMAIL}}', esc(p.email));

  const text = `Guten Tag,

vielen Dank für Ihre Bewertung von Primundus. Das haben Sie geschrieben:

${sterne} (${p.sterne} von 5 Sternen)
${p.text}
${wer}

Bitte bestätigen Sie mit einem Klick, dass die Bewertung von Ihnen stammt:
Bewertung bestätigen: ${p.link}

Danach prüfen wir die Bewertung und veröffentlichen sie auf primundus.de/erfahrungen. Wir veröffentlichen positive und kritische Bewertungen.

Der Link gilt 7 Tage.

Haben Sie keine Bewertung geschrieben? Dann ignorieren Sie diese E-Mail.

Mit freundlichen Grüßen
Ihr Primundus-Team

Primundus Deutschland
www.primundus.de
`;

  return { subject: 'Bitte bestätigen Sie Ihre Bewertung', html, text };
}

// ─── 2. Team-Mail zur Freigabe ───────────────────────────────────────────

export interface LeadTreffer {
  name: string;
  erstellt_am: string;
  status: string;
  adminUrl: string;
}

export function teamMail(p: {
  bewertung: BewertungAnzeige;
  /** null = keiner gefunden, 'fehler' = Suche fehlgeschlagen. */
  lead: LeadTreffer | null | 'fehler';
  links: Record<ModerationsAktion, string>;
}): EmailTemplate {
  const b = p.bewertung;
  const lead = p.lead === 'fehler' ? null : p.lead;
  const sterne = sterneText(b.sterne);
  const subject = `Neue Bewertung zur Freigabe: ${sterne} von ${einzeilig(b.name)}`;

  const daten: Array<[string, string]> = [
    ['Sterne', `${sterne} (${b.sterne} von 5)`],
    ['Name', b.name],
    ['Ort', b.ort || '(keine Angabe)'],
    ['E-Mail', b.email || '(keine)'],
    ['Eingang', berlinDatumZeit(b.erstellt_am)],
  ];

  const leadSatz = lead
    ? `Passender Lead: ${lead.name || '(ohne Namen)'}, angelegt am ${berlinTagText(lead.erstellt_am)}, Status ${lead.status}.`
    : p.lead === 'fehler'
      ? 'Die Lead-Suche ist fehlgeschlagen (siehe Server-Log). Ob die Person Kunde ist, bitte selbst prüfen.'
      : 'Kein Lead mit dieser E-Mail-Adresse gefunden. Ob die Person Kunde ist, bitte selbst prüfen.';

  const reihenfolge: ModerationsAktion[] = ['freigeben', 'freigeben_kunde', 'ablehnen'];
  const farben: Record<ModerationsAktion, string> = { freigeben: '#2A7A4B', freigeben_kunde: '#1F5F8B', ablehnen: '#9B2C2C' };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background-color: #5C4A32; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${esc(subject)}</h2>
      </div>
      <div style="border: 2px solid #5C4A32; border-top: none; border-radius: 0 0 8px 8px; padding: 20px;">
        <p style="margin: 0 0 6px; font-size: 22px; color: ${STERN_FARBE}; letter-spacing: 2px;">${sterne}</p>
        <p style="margin: 0 0 16px; font-size: 15px; color: #222; line-height: 1.55; background: #FAF7F2; border-left: 4px solid #B5A184; padding: 12px 14px;">${absatz(b.text)}</p>
        <table style="border-collapse: collapse; font-size: 14px; margin-bottom: 14px;">
          ${daten.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:4px 0;color:#222;">${esc(v)}</td></tr>`).join('')}
        </table>
        <p style="margin: 0 0 18px; font-size: 14px; color: #222;">${esc(leadSatz)}${lead ? ` <a href="${esc(lead.adminUrl)}" style="color:#8B7355;">Lead im Admin öffnen</a>` : ''}</p>
        <p style="margin: 0 0 10px; font-size: 14px; color: #444;">Die Links öffnen eine Seite mit einem Knopf. Erst der Klick auf den Knopf ändert etwas.</p>
        ${reihenfolge.map((a) => `
        <p style="margin: 0 0 10px;"><a href="${esc(p.links[a])}" style="display:inline-block;background:${farben[a]};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:6px;">${esc(AKTIONEN[a].mailText)}</a></p>`).join('')}
      </div>
    </div>`;

  const text = [
    subject,
    '',
    b.text,
    '',
    ...daten.map(([k, v]) => `${k}: ${v}`),
    '',
    leadSatz,
    ...(lead ? [`Lead im Admin: ${lead.adminUrl}`] : []),
    '',
    'Die Links öffnen eine Seite mit einem Knopf. Erst der Klick auf den Knopf ändert etwas.',
    ...reihenfolge.map((a) => `${AKTIONEN[a].mailText}: ${p.links[a]}`),
  ].join('\n');

  return { subject, html, text };
}

// ─── 3. Kleine HTML-Seiten (Moderation) ──────────────────────────────────

function seite(titel: string, inhalt: string): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(titel)}</title>
<style>
  body { margin:0; background:#f4f1ec; font-family:${SANS}; color:#2b2b2b; line-height:1.55; }
  main { max-width:560px; margin:32px auto; background:#fff; border-radius:10px; padding:28px 24px; box-shadow:0 2px 8px rgba(0,0,0,.08); }
  h1 { font-size:20px; margin:0 0 16px; color:#3D2B1F; }
  .sterne { font-size:24px; letter-spacing:2px; color:${STERN_FARBE}; margin:0 0 8px; }
  .text { background:#FAF7F2; border-left:4px solid #B5A184; padding:12px 14px; margin:0 0 12px; }
  .meta { font-size:14px; color:#666; margin:0 0 20px; }
  .hinweis { background:#f3f3f3; border-radius:6px; padding:12px 14px; margin:0 0 16px; }
  button { font:inherit; font-size:16px; font-weight:700; color:#fff; border:0; border-radius:8px; padding:14px 22px; cursor:pointer; width:100%; }
  .freigeben { background:#2A7A4B; } .freigeben_kunde { background:#1F5F8B; } .ablehnen { background:#9B2C2C; }
  .klein { font-size:13px; color:#777; margin-top:18px; }
  a { color:#8B7355; }
  @media (max-width:600px) { main { margin:0; border-radius:0; } }
</style></head>
<body><main>${inhalt}</main></body></html>`;
}

export function hinweisSeite(titel: string, text: string): string {
  return seite(titel, `<h1>${esc(titel)}</h1><p>${esc(text)}</p>`);
}

export function moderationsSeite(p: {
  bewertung: BewertungAnzeige;
  status: BewertungStatus;
  kundeBestaetigt: boolean;
  token: string;
  aktion: ModerationsAktion;
  plan: { art: 'aendern' } | { art: 'erledigt' } | { art: 'nicht_moeglich'; grund: string };
}): string {
  const b = p.bewertung;
  const statusText: Record<BewertungStatus, string> = {
    unbestaetigt: 'noch nicht per E-Mail bestätigt',
    bestaetigt: 'bestätigt, wartet auf Freigabe',
    veroeffentlicht: p.kundeBestaetigt ? 'veröffentlicht, als bestätigter Kunde markiert' : 'veröffentlicht',
    abgelehnt: 'abgelehnt',
  };
  const kopf = `
    <h1>Bewertung prüfen</h1>
    <p class="sterne">${sterneText(b.sterne)}</p>
    <p class="text">${absatz(b.text)}</p>
    <p class="meta">${esc([[b.name, b.ort].filter(Boolean).join(', '), b.email].filter(Boolean).join(' · '))}<br>
      Eingang ${esc(berlinDatumZeit(b.erstellt_am))} · Stand: ${esc(statusText[p.status])}</p>`;

  let aktion: string;
  if (p.plan.art === 'aendern') {
    aktion = `
    <form method="post" action="/api/bewertungen/moderation">
      <input type="hidden" name="t" value="${esc(p.token)}">
      <input type="hidden" name="aktion" value="${esc(p.aktion)}">
      <button type="submit" class="${esc(p.aktion)}">${esc(AKTIONEN[p.aktion].knopf)}</button>
    </form>`;
  } else if (p.plan.art === 'erledigt') {
    aktion = `<p class="hinweis">Schon erledigt. Es ist nichts mehr zu tun.</p>`;
  } else {
    aktion = `<p class="hinweis">${esc(p.plan.grund)}</p>`;
  }

  const andere = (['freigeben', 'freigeben_kunde', 'ablehnen'] as ModerationsAktion[])
    .filter((a) => a !== p.aktion)
    .map((a) => `<a href="/api/bewertungen/moderation?t=${encodeURIComponent(p.token)}&amp;aktion=${a}">${esc(AKTIONEN[a].mailText)}</a>`)
    .join(' · ');

  return seite('Bewertung prüfen', `${kopf}${aktion}<p class="klein">Andere Aktion: ${andere}</p>`);
}

export function ergebnisSeite(aktion: ModerationsAktion): string {
  if (aktion === 'ablehnen') {
    return seite('Bewertung abgelehnt', '<h1>Erledigt</h1><p>Bewertung abgelehnt. Sie wird nicht veröffentlicht.</p>');
  }
  const kunde = aktion === 'freigeben_kunde' ? '<p>Sie ist als bestätigter Kunde markiert.</p>' : '';
  return seite(
    'Bewertung veröffentlicht',
    `<h1>Erledigt</h1>
    <p>Bewertung veröffentlicht. Sie erscheint innerhalb von etwa 5 Minuten auf primundus.de/erfahrungen.</p>
    ${kunde}
    <p><a href="${ERFAHRUNGEN_URL}">primundus.de/erfahrungen öffnen</a></p>`,
  );
}
