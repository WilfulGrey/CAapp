// Gemeinsame Bausteine aller Kundenmails (Martin 26.09.2026: „mach die Mails“,
// abgenommene Vorschau v2). Optik wie die Kundenportal-Karten: weiße Karten mit feinem Rand
// statt beiger Kästen, Koralle nur für den Hauptknopf, Bernstein-Chip für den Countdown,
// überall dieselben vier Punkte der Startseite.
//
// ⚠️ ZWEI IDENTISCHE KOPIEN: project 3/lib/mail-bausteine.ts (Next, Sofort-Mails) und
// project 3/supabase/functions/send-scheduled-emails/mailBausteine.ts (Deno, geplante Mails).
// Keine Imports — beide Laufzeiten laden die Datei ohne Pfad-Aliase. Gleichheit prüft
// src/__tests__/mails/mailBausteine.test.ts (Ausgaben beider Kopien + HERO_PUNKTE gegen
// project 3/lib/hero-punkte.ts).

export const MAIL_FARBEN = {
  ink: '#2D1F0F', text: '#4A4540', muted: '#6B6B6B', line: '#E5E3DF', shell: '#F2EDE6',
  chip: '#C9BCA8', taupe: '#8B7355', taupeInk: '#6B5A44', green: '#3D7A5C', greenDeep: '#2A5C3F',
  mint: '#E8F5EE', coral: '#E76F63', amberTint: '#FDF1E2', amberInk: '#8B5A12', grau: '#F7F5F1',
} as const;
const F = MAIL_FARBEN;
const SCHRIFT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Die Punkte der Startseite (Spiegel von project 3/lib/hero-punkte.ts, Parity-Test). */
export const MAIL_HERO_PUNKTE = [
  'Keine Vermittlungsgebühr',
  'Kein Vertrag vor Ihrer Auswahl',
  'Täglich kündbar, taggenau abgerechnet',
] as const;
export const BESTPREIS_URL = 'https://kostenrechner.primundus.de/bestpreisgarantie';
export const TELEFON_HREF = 'tel:+4989200000830';
export const TELEFON_TEXT = '089&nbsp;200&nbsp;000&nbsp;830';
export const WHATSAPP_HREF = 'https://wa.me/4989200000830';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** „Guten Tag Frau Müller" / „Guten Tag Herr X" / „Guten Tag Familie X", sonst „Guten Tag".
 *  Nie der Vorname (Martin: Anrede-Konsistenz). Nachname kommt schon bereinigt. */
export function anredeZeile(anrede: string | null | undefined, nachname: string | null | undefined): string {
  const n = (nachname ?? '').trim();
  if (n && (anrede === 'Frau' || anrede === 'Herr' || anrede === 'Familie')) return `Guten Tag ${anrede} ${n}`;
  return 'Guten Tag';
}

export const mp = (html: string, unten = 16): string =>
  `<p style="font-size:16px;line-height:1.65;color:${F.text};margin:0 0 ${unten}px;">${html}</p>`;
export const mb = (t: string): string => `<strong style="color:${F.ink};">${t}</strong>`;
export const mKlein = (t: string, unten = 16, mitte = false): string =>
  `<p style="margin:0 0 ${unten}px;font-size:14.5px;line-height:1.6;color:${F.muted};${mitte ? 'text-align:center;' : ''}">${t}</p>`;
export const mEyebrow = (t: string, unten = 6): string =>
  `<p style="margin:0 0 ${unten}px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${F.taupe};">${t}</p>`;
export const mTitel = (t: string, unten = 12, gross = 22): string =>
  `<p style="margin:0 0 ${unten}px;font-size:${gross}px;font-weight:800;line-height:1.25;letter-spacing:-.01em;color:${F.ink};">${t}</p>`;
export const mLink = (url: string, t: string): string =>
  `<a href="${url}" target="_blank" style="color:${F.taupeInk};font-weight:700;text-decoration:underline;">${t}</a>`;
export const mTrenner = (oben = 18, unten = 18): string =>
  `<div style="border-top:1px solid ${F.line};margin:${oben}px 0 ${unten}px;line-height:0;font-size:0;">&nbsp;</div>`;
export const mAbstand = (h: number): string => `<div style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</div>`;
/** Vorschautext im Posteingang (unsichtbar im Body). */
export const mVorschau = (t: string): string =>
  `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${esc(t)}</div>`;
export const mAbschnitt = (eyebrow: string, titel: string): string => `${mAbstand(8)}${mEyebrow(eyebrow)}${mTitel(titel, 14)}`;

/** Weiße Karte mit feinem Rand (Portal: rounded-card). */
export function mKarte(inhalt: string, o: { rand?: string; unten?: number; breite?: string } = {}): string {
  const rand = o.rand ?? F.line;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${o.unten ?? 24}px;border:${o.breite ?? '1.5px'} solid ${rand};border-radius:20px;background:#ffffff;border-collapse:separate;">
      <tr><td style="padding:22px 18px 20px;">${inhalt}</td></tr>
    </table>`;
}

/** Hauptknopf über die volle Breite, Koralle. Innenabstand am <td>, damit Outlook ihn zeigt. */
export function mKnopf(url: string, label: string, oben = 6, unten = 12): string {
  return `
    <table width="100%" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${oben}px 0 ${unten}px;border-collapse:separate;">
      <tr><td align="center" bgcolor="${F.coral}" style="background-color:${F.coral};border-radius:999px;padding:15px 16px;">
        <a href="${url}" target="_blank" style="display:block;color:#ffffff;text-decoration:none;font-weight:700;font-size:17px;line-height:1.3;font-family:${SCHRIFT};text-align:center;">${label}</a>
      </td></tr>
    </table>`;
}

/** Zweiter Knopf: weiß mit Rand (Portal: „Vielleicht später" / „Passt nicht"). */
export function mKnopfHell(url: string, label: string, unten = 12): string {
  return `
    <table width="100%" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${unten}px;border-collapse:separate;">
      <tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;border:1.5px solid ${F.chip};border-radius:999px;padding:13px 16px;">
        <a href="${url}" target="_blank" style="display:block;color:${F.taupeInk};text-decoration:none;font-weight:700;font-size:16px;line-height:1.3;font-family:${SCHRIFT};text-align:center;">${label}</a>
      </td></tr>
    </table>`;
}

/** „Lieber am Telefon? 089 … · WhatsApp" unter dem Knopf. */
export const mKontakt = (): string => mKlein(
  `Lieber am Telefon? <a href="${TELEFON_HREF}" style="color:${F.taupeInk};font-weight:700;text-decoration:none;">${TELEFON_TEXT}</a> &middot; <a href="${WHATSAPP_HREF}" style="color:${F.taupeInk};font-weight:700;text-decoration:none;">WhatsApp</a>`,
  24, true);

/** Die vier Punkte der Startseite (+ optional Sterne), wie unter „Angebot prüfen" im Portal. */
export function mPunkte(bewertung: { schnitt: string; anzahl: number } | null, oben = 4): string {
  const zeile = (t: string) => `<tr><td style="width:26px;padding:0 0 9px;vertical-align:top;color:${F.coral};font-weight:800;font-size:16px;line-height:1.45;">&#10003;</td><td style="padding:0 0 9px;font-size:15px;line-height:1.45;color:${F.ink};">${t}</td></tr>`;
  const sterne = bewertung
    ? `<p style="margin:6px 0 0;font-size:14.5px;color:${F.muted};"><span style="color:#E3A93B;letter-spacing:1px;">&#9733;&#9733;&#9733;&#9733;&#9733;</span>&nbsp; <strong style="color:${F.ink};">${bewertung.schnitt}</strong> von 5 &middot; <a href="https://primundus.de/erfahrungen" style="color:${F.muted};white-space:nowrap;">${bewertung.anzahl} Bewertungen</a></p>`
    : '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:${oben}px 0 2px;">
      ${MAIL_HERO_PUNKTE.map(zeile).join('')}
      ${zeile(`Bestpreisgarantie <a href="${BESTPREIS_URL}" style="color:${F.greenDeep};font-weight:700;text-decoration:underline;">Mehr Infos</a>`)}
    </table>${sterne}`;
}

/** Bernstein-Chip wie der Countdown im Portal (ohne Datum im Text). */
export const mChip = (t: string, unten = 16): string =>
  `<p style="margin:0 0 ${unten}px;"><span style="display:inline-block;background:${F.amberTint};color:${F.amberInk};font-weight:700;font-size:15px;line-height:1.3;border-radius:999px;padding:9px 16px;">${t}</span></p>`;

export type MailSchritt = { titel: string; text?: string; zustand?: 'fertig' | 'jetzt' | 'offen' };
/** Schritte mit Kreisen wie „Stand heute" / „So geht es weiter" im Portal. */
export function mSchritte(liste: MailSchritt[], linien = false): string {
  const reihe = (s: MailSchritt, i: number) => {
    const z = s.zustand ?? 'offen';
    const kreis = z === 'fertig' ? `background-color:${F.mint};color:${F.greenDeep};`
      : z === 'jetzt' ? `background-color:${F.taupe};color:#ffffff;` : `background-color:${F.shell};color:${F.taupe};`;
    const letzte = i === liste.length - 1;
    const rand = linien && i > 0 ? `border-top:1px solid ${F.line};` : '';
    const unten = letzte ? 0 : linien ? 14 : 16;
    return `
      <tr>
        <td style="vertical-align:top;width:42px;padding:${linien ? 14 : 0}px 12px ${unten}px 0;${rand}">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td width="30" height="30" align="center" valign="middle" style="${kreis}width:30px;height:30px;border-radius:15px;font-size:14px;font-weight:800;line-height:30px;text-align:center;">${z === 'fertig' ? '&#10003;' : i + 1}</td>
          </tr></table>
        </td>
        <td style="vertical-align:top;padding:${linien ? 17 : 3}px 0 ${unten}px 0;${rand}">
          <p style="margin:0;font-size:16px;font-weight:700;line-height:1.35;color:${z === 'fertig' ? '#9a8f84' : F.ink};">${s.titel}</p>
          ${s.text ? `<p style="margin:3px 0 0;font-size:14.5px;line-height:1.55;color:${F.muted};">${s.text}</p>` : ''}
        </td>
      </tr>`;
  };
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${liste.map(reihe).join('')}</table>`;
}

// ── Pflegekraft ────────────────────────────────────────────────────────────

/** Stufe WORTGLEICH zu Portal und SA-Portal: nur UNSERE Einsätze zählen. */
export function mStufe(einsaetze: number | null | undefined, jahre: number | null | undefined): string {
  const j = einsaetze ?? 0;
  if (j >= 12) return 'Elite';
  if (j >= 6) return 'Stammkraft';
  if (j >= 2) return 'Bewährt';
  if (j >= 1) return 'Bekannt';
  return (jahre ?? 0) > 0 ? 'Berufserfahren' : 'Neu bei Primundus';
}

export function mFakten(jahre: number | null | undefined, einsaetze: number | null | undefined): string {
  const teile: string[] = [];
  if (jahre && jahre > 0) teile.push(`${jahre} ${jahre === 1 ? 'Jahr' : 'Jahre'} Erfahrung`);
  if (einsaetze && einsaetze > 0) teile.push(`${einsaetze} ${einsaetze === 1 ? 'Einsatz' : 'Einsätze'}`);
  return teile.length > 0 ? teile.join(' &middot; ') : 'bereit für den ersten Einsatz';
}

function initialen(name: string): string {
  const t = name.trim().split(/\s+/).filter(Boolean);
  if (t.length === 0) return '?';
  if (t.length === 1) return t[0].charAt(0).toUpperCase();
  return (t[0].charAt(0) + t[t.length - 1].charAt(0)).toUpperCase();
}

export type PflegekraftDaten = {
  /** „Maria K." (schon gekürzt) */
  name: string;
  alter?: number | null;
  /** Wort „Grund" | „Mittel" | „Gut" (nie CEFR) */
  deutsch?: string | null;
  jahre?: number | null;
  einsaetze?: number | null;
  /** Vollständige Bild-URL oder `cid:…`; leer → Initialen */
  foto?: string | null;
};

/** EINE Pflegekraft-Box für alle Mails — Zeichen für Zeichen wie caregiverKachelHtml in
 *  lib/email.ts (Mail A/B/C), damit die ganze Reihe gleich aussieht (Registry: einheitliche
 *  Pflegekräfte-Box). Abstand Foto→Text als eigene Spalte: manche Clients verwerfen padding an
 *  einer <td> mit fester Breite. `ohneRahmen` für den Einsatz in einer Karte. */
export function mPflegekraft(pk: PflegekraftDaten, profilUrl: string, o: { ohneRahmen?: boolean; linkText?: string } = {}): string {
  const vorname = pk.name.split(' ')[0];
  const foto = pk.foto
    ? `<img src="${pk.foto}" alt="${esc(pk.name)}" width="76" style="display:block;width:76px;height:76px;border-radius:12px;object-fit:cover;" />`
    : `<div style="width:76px;height:76px;border-radius:12px;background-color:#B5A184;color:#fff;font-size:26px;font-weight:700;line-height:76px;text-align:center;">${initialen(pk.name)}</div>`;
  const alter = pk.alter && pk.alter > 0 ? `<span style="font-weight:400;color:#71717A;">, ${pk.alter}</span>` : '';
  const deutsch = pk.deutsch ? `<p style="margin:0;font-size:15px;color:#71717A;">Deutsch ${esc(pk.deutsch)}</p>` : '';
  const stufe = `<span style="display:inline-block;font-size:12px;font-weight:700;letter-spacing:.03em;color:#ffffff;background:${F.taupe};border-radius:999px;padding:4px 12px;white-space:nowrap;vertical-align:middle;">${mStufe(pk.einsaetze, pk.jahre)}</span>`;
  const inhalt = `
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td width="76" style="vertical-align:middle;width:76px;">${foto}</td>
            <td width="18" style="width:18px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="vertical-align:middle;">
              <p style="margin:0 0 3px;font-size:18px;font-weight:700;color:#18181B;line-height:1.3;">${esc(pk.name)}${alter}</p>
              ${deutsch}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#71717A;">${stufe}<span style="vertical-align:middle;">&nbsp;&nbsp;${mFakten(pk.jahre, pk.einsaetze)}</span></p>
        <div style="border-top:1px solid #ECE7DF;margin:14px 0 0;padding-top:14px;">
          <a href="${profilUrl}" target="_blank" style="color:${F.taupe};text-decoration:none;font-weight:700;font-size:15px;">${o.linkText ?? `${esc(vorname)}s Profil ansehen`} &rarr;</a>
        </div>`;
  if (o.ohneRahmen) return inhalt;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 26px;border:1px solid #ECE7DF;border-radius:14px;background:#ffffff;overflow:hidden;">
      <tr><td style="padding:18px 20px;">${inhalt}</td></tr>
    </table>`;
}

export type BewerbungsAngebot = {
  /** Tagessatz in € (gerundet) oder null */
  tagessatz: number | null;
  /** „15.10.2026 – 10.12.2026" oder nur Anreise; null → Zeile fehlt */
  zeitraum: string | null;
  /** Reisekosten je Fahrt in € oder null */
  reisekosten: number | null;
};

/** Karte „Neue Bewerbung" wie AppCard im Portal: grüner Rand, Pflegekraft, Angebot, Knopf
 *  „Angebot prüfen" (öffnet die Bewerbung), optional die vier Punkte + Sterne. */
export function mBewerbungsKarte(pk: PflegekraftDaten, angebot: BewerbungsAngebot, url: string,
  punkte: { bewertung: { schnitt: string; anzahl: number } | null } | null): string {
  const zeileUnten = [
    angebot.zeitraum ? `<span style="white-space:nowrap;">${esc(angebot.zeitraum)}</span>` : '',
    angebot.reisekosten != null ? `<span style="white-space:nowrap;">Reisekosten à ${angebot.reisekosten}&nbsp;€</span>` : '',
  ].filter(Boolean).join(' &middot; ');
  const kasten = (angebot.tagessatz || zeileUnten) ? `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0 18px;background:${F.grau};border-radius:14px;border-collapse:separate;">
      <tr><td style="padding:14px 16px;">
        ${angebot.tagessatz ? `<p style="margin:0;font-size:13.5px;color:${F.muted};">Tagessatz</p>
        <p style="margin:2px 0 ${zeileUnten ? 8 : 0}px;font-size:26px;font-weight:800;color:${F.ink};line-height:1.1;">${angebot.tagessatz}&nbsp;€<span style="font-size:14.5px;font-weight:500;color:${F.muted};">&nbsp;/&nbsp;Tag</span></p>` : ''}
        ${zeileUnten ? `<p style="margin:0;font-size:14.5px;line-height:1.5;color:${F.text};">${zeileUnten}</p>` : ''}
      </td></tr>
    </table>` : mAbstand(16);
  const kopf = `<p style="margin:0 0 14px;font-size:16px;font-weight:700;color:${F.greenDeep};">&#9993;&nbsp; Neue Bewerbung</p>`;
  return mKarte(`${kopf}${mPflegekraft(pk, url, { ohneRahmen: true })}${kasten}${mKnopf(url, 'Angebot prüfen', 0, punkte ? 16 : 0)}${punkte ? mPunkte(punkte.bewertung) : ''}`,
    { rand: F.green, unten: 22, breite: '2px' });
}
