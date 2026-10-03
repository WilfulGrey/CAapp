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
export function mKnopf(url: string, label: string, oben = 6, unten = 12, o: { schrift?: number; innen?: number } = {}): string {
  return `
    <table width="100%" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${oben}px 0 ${unten}px;border-collapse:separate;">
      <tr><td align="center" bgcolor="${F.coral}" style="background-color:${F.coral};border-radius:999px;padding:15px ${o.innen ?? 16}px;">
        <a href="${url}" target="_blank" style="display:block;color:#ffffff;text-decoration:none;font-weight:700;font-size:${o.schrift ?? 17}px;line-height:1.3;font-family:${SCHRIFT};text-align:center;">${label}</a>
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

/** Sterne wie im Kopf von primundus.de („4,9 von 5 aus 126 Bewertungen“), mittig unter einem Knopf.
 *  Gold wie Website (pm-gold) und Martas Karte; wie dort ist nur „126 Bewertungen“ dezent unterstrichen. */
export function mSterneZeile(bewertung: { schnitt: string; anzahl: number }, unten = 18): string {
  const gold = Math.min(5, Math.max(0, Math.round(Number(bewertung.schnitt.replace(",", ".")))));
  const sterne = `<span style="color:#D4A843;letter-spacing:1px;">${"&#9733;".repeat(gold)}</span>` +
    (gold < 5 ? `<span style="color:#E3D9CB;letter-spacing:1px;">${"&#9733;".repeat(5 - gold)}</span>` : "");
  const wort = bewertung.anzahl === 1 ? "Bewertung" : "Bewertungen";
  return `<p style="margin:0 0 ${unten}px;text-align:center;font-size:13.5px;line-height:1.4;color:${F.muted};"><a href="https://primundus.de/erfahrungen" style="color:${F.muted};text-decoration:none;">${sterne}&nbsp; <strong style="color:${F.ink};">${bewertung.schnitt}</strong> von 5 aus <span style="white-space:nowrap;text-decoration:underline;text-decoration-color:#D1C7BB;text-underline-offset:3px;">${bewertung.anzahl} ${wort}</span></a></p>`;
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

// Pflegekraft-Profil „V" (Martin 27.09.2026): geschlossene beige Fläche, Foto links, Name + Alter,
// Deutsch mit Punkten, Leiste „★ Stufe / N Einsätze bei uns | N Jahre / Berufserfahrung", unten
// „Profil ansehen ›". Identisch mit dem Portal (src/components/portal/PflegekraftProfil.tsx).
export const PROFIL_BEIGE = '#F6EFE4';
export const PROFIL_LINIE = '#E4D8C6';
const STERN = '#D39B2A';

function deutschPunkte(wort: string): string {
  const n = wort === 'Gut' ? 3 : wort === 'Mittel' ? 2 : wort === 'Grund' ? 1 : 0;
  if (n === 0) return '';
  return [1, 2, 3].map((i) => `<span style="display:inline-block;width:9px;height:9px;border-radius:5px;background:${i <= n ? F.taupe : PROFIL_LINIE};margin-right:3px;vertical-align:middle;"></span>`).join('') + '&nbsp;';
}

/** Das Profil einer Pflegekraft als geschlossene Einheit — in jeder Mail gleich. Alles verlinkt aufs Profil. */
export function mProfil(pk: PflegekraftDaten, profilUrl: string, unten = 0): string {
  const a = (inhalt: string, farbe = '#18181B') => `<a href="${profilUrl}" target="_blank" style="color:${farbe};text-decoration:none;">${inhalt}</a>`;
  const e = pk.einsaetze ?? 0;
  const j = pk.jahre ?? 0;
  const stufe = mStufe(pk.einsaetze, pk.jahre);
  const stern = stufe === 'Elite' || stufe === 'Stammkraft' ? `<span style="color:${STERN};">&#9733;</span>&nbsp;` : '';
  const felder: [string, string][] = [e > 0
    ? [`${stern}${stufe}`, `${e} ${e === 1 ? 'Einsatz' : 'Einsätze'} bei uns`]
    : ['Neu bei uns', 'erster Einsatz bei uns']];
  if (j > 0) felder.push([`${j} ${j === 1 ? 'Jahr' : 'Jahre'}`, 'Berufserfahrung']);
  const zellen = felder.map(([w, l], i) => `${i ? `<td width="1" style="width:1px;background:${PROFIL_LINIE};font-size:0;">&nbsp;</td>` : ''}<td align="center" width="${Math.floor(100 / felder.length)}%" style="text-align:center;padding:12px 6px;">${a(`<span style="display:block;font-size:15.5px;font-weight:800;line-height:1.3;color:${F.ink};white-space:nowrap;">${w}</span><span style="display:block;font-size:13px;line-height:1.35;color:${F.muted};white-space:nowrap;">${l}</span>`)}</td>`).join('');
  // Outlook Desktop kennt kein object-fit: dort das Bild proportional (ein Hochformat würde sonst
  // gequetscht), alle anderen quadratisch beschnitten — dasselbe Muster wie fotoImg (empfehlung.ts).
  const bild = `src="${pk.foto}" alt="${esc(pk.name)}" width="80"`;
  const foto = pk.foto
    ? `<!--[if mso]><img ${bild} style="display:block;border:0;" /><![endif]--><!--[if !mso]><!--><img ${bild} height="80" style="display:block;width:80px;height:80px;border-radius:14px;border:3px solid #ffffff;object-fit:cover;-ms-interpolation-mode:bicubic;outline:none;" /><!--<![endif]-->`
    : `<div style="width:80px;height:80px;border-radius:14px;border:3px solid #ffffff;background-color:#B5A184;color:#fff;font-size:26px;font-weight:700;line-height:80px;text-align:center;">${initialen(pk.name)}</div>`;
  const alter = pk.alter && pk.alter > 0 ? `<span style="font-weight:400;color:#71717A;">, ${pk.alter}</span>` : '';
  const deutsch = pk.deutsch ? `<p style="margin:6px 0 0;font-size:15px;color:${F.muted};">${deutschPunkte(pk.deutsch)}Deutsch ${esc(pk.deutsch.toLowerCase())}</p>` : '';
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${unten}px;background:${PROFIL_BEIGE};border-radius:16px;border-collapse:separate;">
      <tr><td style="padding:16px 16px 14px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td width="80" style="width:80px;vertical-align:middle;">${a(foto)}</td>
          <td width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;</td>
          <td style="vertical-align:middle;"><p style="margin:0;font-size:19px;font-weight:800;line-height:1.25;color:#18181B;">${a(esc(pk.name))}${alter}</p>${deutsch}</td>
        </tr></table>
      </td></tr>
      <tr><td style="border-top:1px solid ${PROFIL_LINIE};padding:0;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${zellen}</tr></table></td></tr>
      <tr><td align="center" style="border-top:1px solid ${PROFIL_LINIE};padding:11px 16px;text-align:center;font-size:14.5px;font-weight:700;">${a('Profil ansehen&nbsp;&rsaquo;', F.taupeInk)}</td></tr>
    </table>`;
}

/** Köpfe unter dem Knopf (Martin 03.10.2026: „diese paar Köpfe … und so ein Text dahinter"), wie die
 *  frühere Fünf-Gesichter-Plakette, aber mit den echten Fotos der passenden Kräfte (sonst Initialen).
 *  Nebeneinander statt überlappend: negative Abstände überleben die Mailprogramme nicht. */
export function mKoepfe(koepfe: { foto: string | null; name: string }[], text: string, url: string, unten = 10): string {
  const kopf = (k: { foto: string | null; name: string }) => k.foto
    ? `<!--[if mso]><img src="${k.foto}" alt="" width="30" style="display:block;border:0;" /><![endif]--><!--[if !mso]><!--><img src="${k.foto}" alt="" width="30" height="30" style="display:block;width:30px;height:30px;border-radius:15px;border:2px solid #ffffff;object-fit:cover;outline:none;" /><!--<![endif]-->`
    : `<div style="width:30px;height:30px;border-radius:15px;border:2px solid #ffffff;background-color:#B5A184;color:#ffffff;font-size:11px;font-weight:700;line-height:30px;text-align:center;">${initialen(k.name)}</div>`;
  const zellen = koepfe.map((k) => `<td style="padding:0 2px;"><a href="${url}" target="_blank" style="text-decoration:none;">${kopf(k)}</a></td>`).join('');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 4px;border-collapse:separate;"><tr>${zellen}</tr></table>
    <p style="margin:0 0 ${unten}px;text-align:center;font-size:14px;line-height:1.4;color:${F.muted};"><a href="${url}" target="_blank" style="color:${F.muted};text-decoration:none;">${text}</a></p>`;
}

/** Kompakte Zeile einer Pflegekraft (Vorschlag 03.10.2026, Martin: „viel kompakter"): Foto 56 px,
 *  Name + Alter, darunter Deutsch mit Punkten, dann Erfahrung und Einsätze. Ganze Zeile verlinkt. */
export function mProfilZeile(pk: PflegekraftDaten, profilUrl: string, unten = 8): string {
  const a = (inhalt: string, farbe = '#18181B') => `<a href="${profilUrl}" target="_blank" style="color:${farbe};text-decoration:none;">${inhalt}</a>`;
  const bild = `src="${pk.foto}" alt="${esc(pk.name)}" width="56"`;
  const foto = pk.foto
    ? `<!--[if mso]><img ${bild} style="display:block;border:0;" /><![endif]--><!--[if !mso]><!--><img ${bild} height="56" style="display:block;width:56px;height:56px;border-radius:12px;border:0;object-fit:cover;-ms-interpolation-mode:bicubic;outline:none;" /><!--<![endif]-->`
    : `<div style="width:56px;height:56px;border-radius:12px;background-color:#B5A184;color:#fff;font-size:19px;font-weight:700;line-height:56px;text-align:center;">${initialen(pk.name)}</div>`;
  const alter = pk.alter && pk.alter > 0 ? `<span style="font-weight:400;color:#71717A;">, ${pk.alter}</span>` : '';
  // Wie die Zeilen im Portal (Martin 03.10.: keine Sterne, Bewertungen je Pflegekraft gibt es nicht):
  // Deutsch mit den Punkten des Profils, darunter Erfahrung und Einsätze bei uns als Zahl.
  const j = pk.jahre ?? 0;
  const e = pk.einsaetze ?? 0;
  const deutsch = pk.deutsch ? `${deutschPunkte(pk.deutsch)}Deutsch ${esc(pk.deutsch.toLowerCase())}` : '';
  // Jede Angabe bleibt zusammen; auf schmalen Handys bricht die Zeile nur am Punkt.
  const fakten = [j > 0 ? `${j} ${j === 1 ? 'Jahr' : 'Jahre'} Erfahrung` : '', e > 0 ? `${e} ${e === 1 ? 'Einsatz' : 'Einsätze'} bei uns` : '']
    .filter(Boolean).map((t) => `<span style="white-space:nowrap;">${t}</span>`).join(' · ');
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${unten}px;background:${PROFIL_BEIGE};border-radius:14px;border-collapse:separate;">
      <tr>
        <td width="56" style="width:56px;padding:10px 0 10px 10px;vertical-align:middle;">${a(foto)}</td>
        <td style="padding:10px 12px 10px 12px;vertical-align:middle;">
          <p style="margin:0;font-size:17px;font-weight:800;line-height:1.25;color:#18181B;">${a(esc(pk.name))}${alter}</p>
          ${deutsch ? `<p style="margin:4px 0 0;font-size:14px;line-height:1.35;color:${F.muted};">${a(deutsch, F.muted)}</p>` : ''}
          ${fakten ? `<p style="margin:2px 0 0;font-size:13.5px;line-height:1.35;color:${F.muted};">${a(fakten, F.muted)}</p>` : ''}
        </td>
      </tr>
    </table>`;
}

/** Textfassung des Profils (Nur-Text-Mail), dieselben Angaben wie mProfil. */
export function mProfilText(pk: PflegekraftDaten): string {
  const kopf = [pk.name + (pk.alter && pk.alter > 0 ? `, ${pk.alter}` : ''), pk.deutsch ? `Deutsch ${pk.deutsch.toLowerCase()}` : ''].filter(Boolean).join(' · ');
  const e = pk.einsaetze ?? 0;
  const j = pk.jahre ?? 0;
  const teile = [
    e > 0 ? `${mStufe(pk.einsaetze, pk.jahre)}: ${e} ${e === 1 ? 'Einsatz' : 'Einsätze'} bei uns` : 'Neu bei uns',
    j > 0 ? `${j} ${j === 1 ? 'Jahr' : 'Jahre'} Berufserfahrung` : '',
  ].filter(Boolean);
  return `${kopf}\n${teile.join(' · ')}`;
}

/** Karte mit Kopfleiste (Bewerbung grün, Interesse grün, Empfehlung neutral): Kopf gehört zur Karte,
 *  das Profil steht darin als eigene Einheit. */
export function mKopfKarte(kopf: string, art: 'gruen' | 'neutral', inhalt: string, unten = 22): string {
  const rand = art === 'gruen' ? `2px solid ${F.green}` : `1.5px solid ${F.line}`;
  const kopfStil = art === 'gruen' ? `background:${F.mint};color:${F.greenDeep};` : `background:${F.shell};color:${F.taupeInk};`;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${unten}px;border:${rand};border-radius:20px;background:#ffffff;border-collapse:separate;">
      <tr><td style="${kopfStil}border-radius:18px 18px 0 0;padding:12px 18px;font-size:15.5px;font-weight:800;line-height:1.3;">${kopf}</td></tr>
      <tr><td style="padding:16px 16px 18px;">${inhalt}</td></tr>
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

/** Karte „Neue Bewerbung" wie AppCard im Portal („V"): Kopfleiste, Profil, darunter Tagessatz,
 *  Zeitraum, Knopf „Angebot prüfen" (öffnet die Bewerbung), optional die vier Punkte + Sterne. */
export function mBewerbungsKarte(pk: PflegekraftDaten, angebot: BewerbungsAngebot, url: string,
  punkte: { bewertung: { schnitt: string; anzahl: number } | null } | null): string {
  const zeile = [
    angebot.zeitraum ? `<span style="white-space:nowrap;">${esc(angebot.zeitraum)}</span>` : '',
    angebot.reisekosten != null ? `<span style="white-space:nowrap;">Reisekosten à ${angebot.reisekosten}&nbsp;€</span>` : '',
  ].filter(Boolean).join(' &middot; ');
  const preis = angebot.tagessatz
    ? `<p style="margin:0;font-size:13.5px;color:${F.muted};">Tagessatz</p><p style="margin:2px 0 0;font-size:26px;font-weight:800;color:${F.ink};line-height:1.1;">${angebot.tagessatz}&nbsp;€<span style="font-size:14.5px;font-weight:500;color:${F.muted};">&nbsp;/&nbsp;Tag</span></p>`
    : '';
  const angebotHtml = (preis || zeile)
    ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:18px 0 16px;"><tr><td style="padding:0 2px;">${preis}${zeile ? `<p style="margin:${preis ? 6 : 0}px 0 0;font-size:14.5px;line-height:1.5;color:${F.text};">${zeile}</p>` : ''}</td></tr></table>`
    : mAbstand(16);
  return mKopfKarte('&#9993;&nbsp; Neue Bewerbung', 'gruen',
    `${mProfil(pk, url)}${angebotHtml}${mKnopf(url, 'Angebot prüfen', 0, punkte ? 16 : 0)}${punkte ? mPunkte(punkte.bewertung) : ''}`);
}
