// Kundenmails der Warteschlange, neu nach der abgenommenen Vorschau v2 (Martin 26.09.2026:
// „mach die Mails", roter Faden mit dem Kundenportal, „Bewerbungen erhalten" als Knopf).
// Aus index.ts herausgelöst, weil index.ts beim Import einen Server startet — hier sind die
// Mails testbar (_tests/kundenMails.test.ts).
//
// Jede Mail liefert Betreff, Vorschautext (Posteingang), den HTML-Inhalt OHNE Hülle und die
// Textfassung. Hülle (buildEmailWrapper) und Martas Karte (buildMartaSig, Bewertungsstand pro
// Aufruf) setzt index.ts über den Kontext.
//
// Regeln der Vorschau: Anrede „Guten Tag Frau …", Marta schreibt in Ich-Form, ein Hauptknopf je
// Mail, „Bewerbungen erhalten" öffnet die Pflegesituation (goto=anfragen), dieselben vier Punkte
// wie die Startseite, „Anreise ab 3 Tagen", jede Bewerbung 72 Stunden reserviert. Zahlen nur
// aus echten Daten; fehlt etwas, fällt der Satz weg.
import {
  BESTPREIS_URL,
  MAIL_FARBEN as F,
  TELEFON_HREF,
  TELEFON_TEXT,
  WHATSAPP_HREF,
  mAbstand,
  mb,
  mBewerbungsKarte,
  mChip,
  mEyebrow,
  mKarte,
  mKlein,
  mKnopf,
  mKnopfHell,
  mKontakt,
  mp,
  mProfilText,
  mSchritte,
  mTitel,
  mTrenner,
  mVorschau,
  type BewerbungsAngebot,
  type PflegekraftDaten,
} from "./mailBausteine.ts";
import { esc, zahlwort } from "./empfehlung.ts";
import { portalAngabenAngenommen, portalAngabenHinweisText } from "./herkunft.ts";
import { ABSCHIED_SATZ, RUECKMELDUNG_KNOEPFE, rueckmeldungLink } from "./kette.ts";
import { type ErinnerungStufe, genitiv, reserviertRest } from "./stopRegeln.ts";

export type Kontext = {
  /** „Guten Tag Frau Müller" (ohne Komma). */
  anrede: string;
  /** Kostenrechner-Basis, z. B. https://kostenrechner.primundus.de */
  site: string;
  /** Portal-Link mit Token und Parametern; ohne Token die Website. */
  portal: (param?: Record<string, string | null | undefined>) => string;
  token: string | null;
  /** Grußformel + Martas Karte (HTML). */
  marta: string;
  /** Bewertungsstand dieses Laufs (wie in Martas Karte); fehlt er, fällt die Sternezeile weg. */
  bewertung?: { schnitt: string; anzahl: number } | null;
};

export type KundenMail = { betreff: string; vorschau: string; html: string; text: string };

/** Portal-Link: `${basis}/?token=…&goto=…&m=…`. Leere Parameter fallen weg. */
export function portalLink(portalBase: string, token: string | null | undefined, siteUrl: string,
  param: Record<string, string | null | undefined> = {}): string {
  if (!portalBase || !token) return siteUrl;
  const teile = [`token=${encodeURIComponent(token)}`];
  for (const [k, v] of Object.entries(param)) if (v) teile.push(`${k}=${encodeURIComponent(v)}`);
  return `${portalBase.replace(/\/$/, "")}/?${teile.join("&")}`;
}

// ── gemeinsame Stücke ─────────────────────────────────────────────────────

const gruss = (k: Kontext) => mp(`${esc(k.anrede)},`, 14);
const euro = (n: number) => Math.round(n).toLocaleString("de-DE");
/** HTML → Text für die Textfassung (Tags raus, Entities zurück). */
export function klartext(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&rarr;/g, "→")
    .replace(/&amp;/g, "&")
    .replace(/&#10003;/g, "✓")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export const MARTA_TEXT = `Mit freundlichen Grüßen
Marta Kapcio, Ihre Ansprechpartnerin bei Primundus
Tel: 089 200 000 830 · WhatsApp: https://wa.me/4989200000830

Primundus Deutschland | www.primundus.de`;

const KONTAKT_TEXT = "Lieber am Telefon? 089 200 000 830 · WhatsApp: https://wa.me/4989200000830";

const pflegekraefte = (n: number) => (n === 1 ? "Pflegekraft" : "Pflegekräfte");

const pkText = mProfilText;

// ── 01 Angebot (eingangsbestaetigung) ─────────────────────────────────────

/** Heim-Vergleich aus der Kalkulation des Kunden — vdek-Bundesdurchschnitt, Stand 01.07.2026.
 *  Bei neuen Werten hier UND im Portal (CustomerPortalPage, HEIM_EIGENANTEIL) ändern. */
export const HEIM_EIGENANTEIL = 3364;
export function heimVergleich(kalk: Record<string, unknown> | null | undefined): { eigen: number; diff: number } | null {
  const e = typeof kalk?.eigenanteil === "number" ? Math.round(kalk.eigenanteil as number) : NaN;
  if (!Number.isFinite(e) || e <= 0 || e >= HEIM_EIGENANTEIL) return null;
  return { eigen: e, diff: HEIM_EIGENANTEIL - e };
}

function heimHtml(h: { eigen: number; diff: number }, unten: number): string {
  return `<p style="margin:0 0 6px;font-size:16px;line-height:1.5;color:${F.ink};">Zuhause statt Pflegeheim: rund <strong style="color:${F.greenDeep};">${euro(h.diff)}&nbsp;€ weniger</strong> im Monat.</p>
    ${mKlein(`Heim-Eigenanteil im 1. Jahr ${euro(HEIM_EIGENANTEIL)}&nbsp;€, zuhause mit Primundus nach Zuschüssen etwa ${euro(h.eigen)}&nbsp;€. Quelle: vdek-Auswertung, Stand 1. Juli 2026.`, unten)}`;
}
function heimText(h: { eigen: number; diff: number }): string {
  return `Zuhause statt Pflegeheim: rund ${euro(h.diff)} € weniger im Monat. (Heim-Eigenanteil im 1. Jahr ${euro(HEIM_EIGENANTEIL)} €, zuhause mit Primundus nach Zuschüssen etwa ${euro(h.eigen)} €. Quelle: vdek-Auswertung, Stand 1. Juli 2026.)`;
}

/* Eigenanteil in der Angebotsmail (Vorschlag 08.10.2026, Martin: „maximal conversionsstark mit infos"; einziger belegter
   Einwand ist „zu teuer"). Posten aus der Kalkulation des Kunden (`zuschüsse.items`, nur `in_kalkulation`) — dieselbe Rechnung
   wie „Kosten im Überblick" im Portal. Martin 03.10.: „eigenanteil betrachtet immer 3 dinge: geldleistungen,
   entlastungsbudget und steuerersparnis"; 18.09.: der Preis bleibt Bruttopreis, die Posten senken nur den Eigenanteil.
   Unbekannter Posten → keine Zeile „Nach Zuschüssen“ (seit #148 auch kein Heimvergleich als Ersatz; lieber nichts als eine
   falsche Zahl). */
const ZUSCHUSS_WORT: Record<string, string> = {
  pflegegeld: "Pflegegeld",
  entlastungsbudget_neu: "Entlastungsbudget",
  steuervorteil: "Steuerersparnis",
};
export type ZuschussPosten = { name: string; wort: string; monat: number; jahr: number };
export type Eigenanteil = { brutto: number; eigen: number; posten: ZuschussPosten[]; pflegegrad: number | null; ehepaar: boolean };

export function eigenanteilAus(kalk: Record<string, any> | null | undefined): Eigenanteil | null {
  const brutto = typeof kalk?.bruttopreis === "number" ? kalk.bruttopreis : 0;
  const items = kalk?.["zuschüsse"]?.items;
  if (!brutto || !Array.isArray(items) || typeof kalk?.eigenanteil !== "number") return null;
  const drin = items.filter((z: any) => z?.in_kalkulation && Number(z.betrag_monatlich) > 0);
  if (!drin.length || drin.some((z: any) => !ZUSCHUSS_WORT[z.name])) return null;
  const posten = drin.map((z: any) => ({
    name: String(z.name), wort: ZUSCHUSS_WORT[z.name], monat: Math.round(Number(z.betrag_monatlich)), jahr: Math.round(Number(z.betrag_jaehrlich)),
  }));
  // Angezeigter Eigenanteil = Preis minus die GERUNDETEN Posten, damit die Rechnung mit den Posten im Portal aufgeht. Weicht
  // das um mehr als 2 € von der Kalkulation ab, stimmt etwas nicht → keine Zeile.
  const eigen = brutto - posten.reduce((s: number, p: ZuschussPosten) => s + p.monat, 0);
  if (eigen <= 0 || eigen >= brutto || Math.abs(eigen - kalk.eigenanteil) > 2) return null;
  const pg = Number(kalk?.formularDaten?.pflegegrad);
  return { brutto, eigen, posten, pflegegrad: Number.isFinite(pg) ? pg : null, ehepaar: kalk?.formularDaten?.betreuung_fuer === "ehepaar" };
}

/* Angebotsmail wie das Portal (Registry #148; Martin 08.11.2026: „Ich finde, das haben wir jetzt ganz gut gemacht mit dem
   kompakten Preis und dann direkt die Pflegekräfte … Ich würde das genauso machen wie im Portal. Machst du die Mail mit einem
   Einleitungssatz und dann …“). Aufbau wie der Minimal-Einstieg des Portals (Registry #147, live 08.11.): Anrede, ein Satz,
   Kasten „Ihr persönliches Angebot“ (Preis, grün „Nach Zuschüssen“, grau Pflegeheim-Vergleich, vier Punkte, Kennzahlen),
   eingekaufte Leads den Hinweis zu den Angaben, die passenden Pflegekräfte als Zeilen mit Foto, Preis und „Ansehen“ (ins
   Profil) und dem Textlink „Alle Pflegekräfte anzeigen“, die Erklärung zum Portal, EIN Knopf „Angebot & Pflegekräfte
   anzeigen →“ / „100% kostenfrei & unverbindlich“ (oben ins Portal, Registry #163; bis 14.11.2026 „Bewerbungen erhalten →“ ins
   Formular), Gruß und Kontakt. Wortlaute aus dem Portal (Gleichlauf-Test
   src/__tests__/mails/angebotsmailWortlaut.test.ts); Betreff und Vorschau wie vorher. Das Siegel steht weiter im Kopf der Hülle. */
export type AngebotKraft = { caregiverId: number; vorname: string; alter: number | null; erfahrungJahre: number; deutschWort: string | null; cid: string | null };
export type AngebotEingabe = {
  kalkulation: Record<string, any> | null | undefined;
  /** Anzeigename des Portals bei eingekauften Leads, sonst null. */
  herkunft: string | null;
  /** `kalkulation.angenommene_felder` (api/portal-lead), roh. Nur mit `herkunft` gelesen: leere Liste = „übernommen",
   *  sonst (auch fehlend, Altbestand) „vorsichtig angenommen". */
  angenommeneFelder?: unknown;
  portalBetreff: string;
  resubmit: boolean;
  /** Passende Pflegekräfte aus der Empfehlung (mamamia), bis zu fünf, mit `cid` des angehängten Fotos; null → kein Abschnitt. */
  empfehlung?: { sichtbar: number; kraefte?: AngebotKraft[] } | null;
};

/** Wortlaute wie im Portal (src/components/portal/EinstiegMinimal.tsx: ANGEBOT_TITEL, GARANTIE_*, VERTRAUEN, FEST_*). */
export const ANGEBOT_TITEL = "Ihr persönliches Angebot";
export const GARANTIE_PUNKTE = ["Bestpreisgarantie", "Keine Vorauszahlung", "Keine Vermittlungsgebühr", "Keine Mindestlaufzeit"] as const;
/** Hauptknopf (Registry #163, 14.11.2026, Martin: „in der Mail würde ich den Buttontext machen: Angebot & Pflegekräfte anzeigen“);
 *  führt seitdem oben ins Portal (Angebot und Liste), bis dahin „Bewerbungen erhalten“ ins Formular. */
export const KNOPF_TITEL = "Angebot & Pflegekräfte anzeigen";
export const ALLE_KRAEFTE = "Alle Pflegekräfte anzeigen";
/** Über dem Knopf: was im Portal passiert (Martin 08.11.: „erklären, dass man im Portal nicht nur das Angebot sieht, sondern
 *  auch passende Pflegekräfte. Diese können sich auch direkt bei Ihnen bewerben. Sie müssen nur die Situation einmal kurz
 *  beschreiben …“; Fassung OpenAI 08.11., ohne „nicht nur … sondern auch“, Handlung direkt vor dem Knopf). */
export const PORTAL_ERKLAERUNG = "Im Kundenportal sehen Sie Ihr Angebot und passende Pflegekräfte. Beschreiben Sie einmal kurz die Pflegesituation, das dauert etwa 2\u00a0Minuten. Danach können sich Pflegekräfte direkt bei Ihnen bewerben. Erste Rückmeldungen kommen häufig innerhalb von 60\u00a0Minuten.";
export const KNOPF_ZEILE = "100% kostenfrei &amp; unverbindlich";
/** So viele Pflegekräfte zeigt die Mail höchstens; index.ts lädt nur für diese Fotos. */
export const ANGEBOT_KRAEFTE_MAX = 5;
const GOLD = "#D4A843";

/** „1 Jahr Erfahrung" / „12 Jahre Erfahrung", „Deutsch Gut" — wie `zeilenFakten` im Portal. */
export function kraftFakten(k: Pick<AngebotKraft, "erfahrungJahre" | "deutschWort">): string[] {
  const teile: string[] = [];
  if (k.erfahrungJahre > 0) teile.push(k.erfahrungJahre === 1 ? "1 Jahr Erfahrung" : `${k.erfahrungJahre} Jahre Erfahrung`);
  if (k.deutschWort) teile.push(`Deutsch ${k.deutschWort}`);
  return teile;
}

/** Kasten „Ihr persönliches Angebot" wie die Angebotskarte im Portal. Tabellen und Inline-Stile (Outlook: eckig). */
function angebotKasten(brutto: number, eigen: Eigenanteil | null, bewertung: Kontext["bewertung"], unten = 14): string {
  const heim = eigen && HEIM_EIGENANTEIL > eigen.eigen ? HEIM_EIGENANTEIL - eigen.eigen : 0;
  const zuschuss = eigen
    ? `<p style="margin:8px 0 0;font-size:16px;font-weight:700;line-height:1.4;color:${F.green};">Nach Zuschüssen <span style="white-space:nowrap;">ca. ${euro(eigen.eigen)}&nbsp;€ im Monat</span></p>${heim
      ? `<p style="margin:2px 0 0;font-size:14.5px;line-height:1.45;color:${F.muted};">rund ${euro(heim)}&nbsp;€ weniger als im Pflegeheim</p>` : ""}`
    : "";
  const haken = `<span style="color:${F.green};font-weight:700;">&#10003;</span>`;
  const punkte = GARANTIE_PUNKTE.map((p, i) => `<tr><td width="22" style="width:22px;padding:${i ? 5 : 0}px 0 0;vertical-align:top;font-size:15px;line-height:1.4;">${haken}</td><td style="padding:${i ? 5 : 0}px 0 0;font-size:15px;line-height:1.4;color:${F.greenDeep};">${i === 0
    ? `<a href="${BESTPREIS_URL}" target="_blank" style="color:${F.greenDeep};text-decoration:none;">${p}</a>` : p}</td></tr>`).join("");
  const spalte = (gross: string, klein: string, rand: boolean) =>
    `<td valign="top" style="padding:0 ${rand ? 0 : 8}px 0 0;"><p style="margin:0;font-size:15px;font-weight:700;line-height:1.35;color:${F.ink};white-space:nowrap;">${gross}</p><p style="margin:1px 0 0;font-size:12.5px;line-height:1.35;color:${F.muted};white-space:nowrap;">${klein}</p></td>`;
  const sterne = bewertung
    ? spalte(`${esc(bewertung.schnitt)} <span style="color:${GOLD};font-size:12px;letter-spacing:1px;">&#9733;&#9733;&#9733;&#9733;&#9733;</span>`, `${bewertung.anzahl} Bewertungen`, false)
    : "";
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${unten}px;border:1px solid ${F.line};border-radius:18px;background:#ffffff;border-collapse:separate;">
      <tr><td style="padding:16px 16px 14px;">
        <p style="margin:0;font-size:14.5px;line-height:1.4;color:${F.muted};">${ANGEBOT_TITEL}</p>
        <p style="margin:2px 0 0;line-height:1.15;"><span style="font-size:32px;font-weight:800;letter-spacing:-.01em;color:${F.ink};">${euro(brutto)}&nbsp;€</span><span style="font-size:16px;color:${F.muted};">&nbsp;/ Monat</span></p>
        ${zuschuss}
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="${F.mint}" style="margin:14px 0 0;background-color:${F.mint};border-radius:14px;border-collapse:separate;">
          <tr><td style="padding:12px 14px;"><table cellpadding="0" cellspacing="0" role="presentation">${punkte}</table></td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:14px 0 0;border-top:1px solid ${F.line};">
          <tr><td style="padding:12px 0 0;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
            ${sterne}${spalte("20 Jahre", "Erfahrung", false)}${spalte("6× in Folge", "Testsieger", true)}
          </tr></table></td></tr>
        </table>
      </td></tr>
    </table>`;
}

/** Foto rund (Outlook: eckig) oder Initialen auf Taupe, 56 px wie im Portal. */
function kraftFoto(k: AngebotKraft): string {
  if (k.cid) {
    const bild = `src="cid:${k.cid}" alt="" width="56"`;
    return `<!--[if mso]><img ${bild} style="display:block;border:0;" /><![endif]--><!--[if !mso]><!--><img ${bild} height="56" style="display:block;width:56px;height:56px;border-radius:28px;border:0;object-fit:cover;outline:none;" /><!--<![endif]-->`;
  }
  const ini = (k.vorname.trim()[0] ?? "P").toUpperCase();
  return `<div style="width:56px;height:56px;border-radius:28px;background-color:#B5A184;color:#ffffff;font-size:20px;font-weight:700;line-height:56px;text-align:center;">${esc(ini)}</div>`;
}

/** Karte „Passende Pflegekräfte" mit Zeilen wie im Portal: Foto, Vorname und Alter, Erfahrung, Deutsch, rechts Preis und
 *  „Ansehen“ (öffnet im Portal das Profil dieser Pflegekraft, `cg=`). In der Mail „Ansehen“ statt „Einladen“ (Martin 08.11.:
 *  „ob Einladen nicht immer verwirrend ist, vor allen Dingen in so einer Mail … weil die das noch gar nicht verstehen, was
 *  Einladen bedeutet“; der Tipp lädt auch niemanden ein, er öffnet das Profil). Darunter der Textlink „Alle Pflegekräfte
 *  anzeigen“ (Martin: „damit es nach mehr klingt“) zur Liste im Portal. */
function kraefteKarte(kraefte: AngebotKraft[], brutto: number, profil: (k: AngebotKraft) => string, alle: string, unten = 18): string {
  const zeilen = kraefte.map((k) => {
    const link = profil(k);
    const alter = k.alter ? `<span style="font-weight:400;color:${F.muted};">, ${k.alter}</span>` : "";
    const fakten = kraftFakten(k).map((t) => `<p style="margin:1px 0 0;font-size:13.5px;line-height:1.4;color:${F.muted};">${t}</p>`).join("");
    const preis = brutto ? `<p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:${F.ink};white-space:nowrap;">${euro(brutto)}&nbsp;€</p>` : "";
    return `<tr><td style="border-top:1px solid ${F.line};padding:12px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td width="56" valign="middle" style="width:56px;"><a href="${link}" target="_blank" style="text-decoration:none;">${kraftFoto(k)}</a></td>
        <td valign="middle" style="padding:0 8px 0 12px;"><a href="${link}" target="_blank" style="text-decoration:none;">
          <p style="margin:0;font-size:16.5px;font-weight:700;line-height:1.3;color:${F.ink};"><span style="text-decoration:underline;text-decoration-color:${F.chip};">${esc(k.vorname)}</span>${alter}</p>${fakten}</a></td>
        <td valign="middle" align="right" style="white-space:nowrap;">${preis}<table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr><td align="center" style="border:1.5px solid ${F.green};border-radius:10px;padding:7px 14px;"><a href="${link}" target="_blank" style="color:${F.greenDeep};font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap;">Ansehen</a></td></tr></table></td>
      </tr></table>
    </td></tr>`;
  }).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${unten}px;border:1px solid ${F.line};border-radius:18px;background:#ffffff;border-collapse:separate;">
      <tr><td style="padding:14px 16px 2px;">
        <p style="margin:0 0 10px;font-size:16px;font-weight:700;line-height:1.4;color:${F.ink};">Passende Pflegekräfte <span style="display:inline-block;margin-left:4px;padding:0 8px;border-radius:999px;background:${F.grau};font-size:13px;font-weight:700;color:${F.muted};">${kraefte.length}</span></p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${zeilen}
          <tr><td style="border-top:1px solid ${F.line};padding:12px 0 14px;"><a href="${alle}" target="_blank" style="color:${F.taupeInk};font-size:15px;font-weight:700;text-decoration:none;">${ALLE_KRAEFTE}&nbsp;&rsaquo;</a></td></tr>
        </table>
      </td></tr>
    </table>`;
}

/** Hauptknopf: „Angebot & Pflegekräfte anzeigen →" und darunter „100% kostenfrei & unverbindlich". */
function knopfPortal(url: string, unten = 22): string {
  return `
    <table width="100%" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${unten}px;border-collapse:separate;">
      <tr><td align="center" bgcolor="${F.coral}" style="background-color:${F.coral};border-radius:12px;padding:12px 16px;">
        <a href="${url}" target="_blank" style="display:block;color:#ffffff;text-decoration:none;text-align:center;">
          <span style="display:block;font-size:17px;font-weight:700;line-height:1.3;">${esc(KNOPF_TITEL)}&nbsp;&rarr;</span>
          <span style="display:block;margin-top:2px;font-size:13px;font-weight:500;line-height:1.3;">${KNOPF_ZEILE}</span>
        </a>
      </td></tr>
    </table>`;
}

const kontaktLink = (href: string, t: string) => `<a href="${href}" style="color:${F.taupeInk};font-weight:700;text-decoration:none;white-space:nowrap;">${t}</a>`;

export function angebotMail(k: Kontext, a: AngebotEingabe): KundenMail {
  const kalk = a.kalkulation ?? {};
  const brutto = typeof kalk.bruttopreis === "number" && kalk.bruttopreis > 0 ? kalk.bruttopreis : 0;
  const eigen = brutto ? eigenanteilAus(kalk) : null;
  const n = a.empfehlung ? Math.max(1, Math.min(5, a.empfehlung.sichtbar || 1)) : 0;
  const kraefte = (a.empfehlung?.kraefte ?? []).slice(0, ANGEBOT_KRAEFTE_MAX);
  // Der Hauptknopf führt oben ins Portal (Angebot und Pflegekräfte), die Zeilen zu den Pflegekräften.
  const start = k.portal({ m: "eb" });
  const zuKraeften = k.portal({ m: "eb", goto: "matches" });
  const zumProfil = (x: AngebotKraft) => k.portal({ cg: String(x.caregiverId), m: "eb" });

  // Eingekaufte Leads nennen das Portal (herkunft.ts), erneute Anfragen den angepassten Stand.
  const einstieg = a.herkunft
    ? `vielen Dank für Ihre Anfrage über ${mb(esc(a.herkunft))}. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.`
    : a.resubmit
    ? "vielen Dank für Ihre erneute Anfrage. Ich habe Ihre Angaben übernommen und Ihr Angebot angepasst."
    : "vielen Dank für Ihre Anfrage. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.";
  /* Eingekaufte Leads: woher die Angaben stammen und ob wir Lücken mit dem teureren Wert gefüllt haben (Bedingungen wie
     bis #148 in index.ts: jede `herkunft`, Färbung nach `angenommene_felder`). Rechner-Leads haben keine Herkunft. */
  const hinweis = a.herkunft ? portalAngabenHinweisText(a.herkunft, portalAngabenAngenommen(a.angenommeneFelder)) : null;

  /* Vorschau (Vorschlag 08.10.2026): Preis, Kündbarkeit und der nächste Schritt; der Betreff nennt schon die Pflegekräfte. */
  const vorschau = brutto
    ? `${euro(brutto)} € im Monat, täglich kündbar${n === 0 ? ", ohne Vermittlungsgebühr."
      : `. ${n === 1 ? "Eine passende Pflegekraft ist" : `${zahlwort(n, true)} passende Pflegekräfte sind`} für Sie ausgewählt.`}`
    : "Ihr persönliches Angebot zur 24-Stunden-Betreuung.";

  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp(einstieg, 16)}
    ${brutto ? angebotKasten(brutto, eigen, k.bewertung, hinweis ? 10 : 14) : ""}
    ${hinweis ? mKlein(esc(hinweis), 16) : ""}
    ${kraefte.length ? kraefteKarte(kraefte, brutto, zumProfil, zuKraeften) : ""}
    ${mp(PORTAL_ERKLAERUNG, 14)}
    ${knopfPortal(start)}
    <p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:${F.text};">Viele Grüße<br><strong style="color:${F.ink};">Marta Kapcio</strong><br><span style="font-size:14.5px;color:${F.muted};">Pflegeberaterin bei Primundus</span></p>
    ${mKlein(`Fragen? ${kontaktLink(TELEFON_HREF, TELEFON_TEXT)}, täglich <span style="white-space:nowrap;">8–20&nbsp;Uhr</span>, auch per ${kontaktLink(WHATSAPP_HREF, "WhatsApp")}.`, 0)}`;

  const heim = eigen && HEIM_EIGENANTEIL > eigen.eigen ? HEIM_EIGENANTEIL - eigen.eigen : 0;
  const kasten = brutto
    ? `${ANGEBOT_TITEL.toUpperCase()}
${euro(brutto)} € / Monat
${eigen ? `Nach Zuschüssen ca. ${euro(eigen.eigen)} € im Monat\n${heim ? `rund ${euro(heim)} € weniger als im Pflegeheim\n` : ""}` : ""}${GARANTIE_PUNKTE.map((p, i) => `✓ ${p}${i === 0 ? `: ${BESTPREIS_URL}` : ""}`).join("\n")}
${k.bewertung ? `★★★★★ ${k.bewertung.schnitt} · ${k.bewertung.anzahl} Bewertungen · ` : ""}20 Jahre Erfahrung · 6× in Folge Testsieger

`
    : "";
  const kraefteText = kraefte.length
    ? `PASSENDE PFLEGEKRÄFTE (${kraefte.length})
${kraefte.map((x) => `- ${x.vorname}${x.alter ? `, ${x.alter}` : ""}${kraftFakten(x).length ? ` · ${kraftFakten(x).join(" · ")}` : ""}${brutto ? ` · ${euro(brutto)} €` : ""} · Ansehen: ${zumProfil(x)}`).join("\n")}
${ALLE_KRAEFTE}: ${zuKraeften}

`
    : "";
  const text = `${k.anrede},

${klartext(einstieg)}

${kasten}${hinweis ? `${hinweis}\n\n` : ""}${kraefteText}${PORTAL_ERKLAERUNG}

${KNOPF_TITEL} (100% kostenfrei & unverbindlich): ${start}

Viele Grüße
Marta Kapcio
Pflegeberaterin bei Primundus

Fragen? 089 200 000 830, täglich 8–20 Uhr, auch per WhatsApp (${WHATSAPP_HREF}).

Primundus Deutschland | www.primundus.de`;

  /* Betreff (Vorschlag 08.10.2026): nennt, was in der Mail steckt — Angebot UND Pflegekräfte. Ohne „– Primundus", der
     Absender heißt schon „Primundus 24h-Pflege". Eingekaufte Anfragen behalten ihren Betreff. */
  const betreff = a.herkunft
    ? a.portalBetreff
    : n === 0
    ? (a.resubmit ? "Ihr aktualisiertes Angebot zur 24-Stunden-Betreuung – Primundus" : "Ihr Angebot zur 24-Stunden-Betreuung – Primundus")
    : `${a.resubmit ? "Ihr aktualisiertes Angebot" : "Ihr Angebot"} und ${n === 1 ? "eine passende Pflegekraft" : `${n} passende Pflegekräfte`}`;
  return { betreff, vorschau, html, text };
}

// ── 02 Nudge 1 (profil_nudge_1, +4 h) ─────────────────────────────────────

export type FuenfListe = { html: string; text: string; vornamen: string[] };

export function nudge1Betreff(n: number): string {
  if (n <= 0) return "Passende Pflegekräfte – es fehlen nur 2 Minuten";
  return n === 1 ? "Eine passende Pflegekraft – es fehlen nur 2 Minuten" : `${zahlwort(n, true)} passende Pflegekräfte – es fehlen nur 2 Minuten`;
}

export function nudge1Vorschau(vornamen: string[]): string {
  const [a, b] = vornamen;
  const n = vornamen.length;
  if (n === 0) return "Noch kann sich keine Pflegekraft bei Ihnen bewerben. Es fehlen nur 2 Minuten.";
  if (n === 1) return `${a} könnte sich bei Ihnen bewerben.`;
  if (n === 2) return `${a} und ${b} könnten sich bei Ihnen bewerben.`;
  const rest = n - 2;
  return `${a}, ${b} und ${rest === 1 ? "eine weitere" : `${zahlwort(rest)} weitere`} könnten sich bei Ihnen bewerben.`;
}

export function nudge1Mail(k: Kontext, liste: FuenfListe | null): KundenMail {
  const n = liste?.vornamen.length ?? 0;
  const url = k.portal({ goto: "anfragen", m: "pn1" });
  const vorschau = nudge1Vorschau(liste?.vornamen ?? []);
  const einstieg = n === 0 ? ""
    : n === 1 ? "diese Pflegekraft passt zu Ihren Angaben und ist zum gewünschten Start frei:"
    : `diese ${zahlwort(n)} Pflegekräfte passen zu Ihren Angaben und sind zum gewünschten Start frei:`;
  const kern = n === 0
    ? "passende Pflegekräfte können sich bei Ihnen bewerben, sobald die Pflegesituation da ist. Das dauert 2 Minuten, vieles ist schon ausgefüllt. Jede Bewerbung bekommen Sie per E-Mail, mit Anreisetermin und Preis. Ein Vertrag entsteht erst, wenn Sie zusagen."
    : `${n === 1 ? "Bewerben kann sich die Pflegekraft" : "Bewerben können sie sich"}, sobald die Pflegesituation da ist. Das dauert 2 Minuten, vieles ist schon ausgefüllt. Jede Bewerbung bekommen Sie per E-Mail, mit Anreisetermin und Preis. Ein Vertrag entsteht erst, wenn Sie zusagen.`;
  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${n ? `${mp(einstieg, 4)}${liste!.html}` : ""}
    ${mp(kern, 20)}
    ${mKnopf(url, "Bewerbungen erhalten", 0, 14)}
    ${mKontakt()}
    ${k.marta}`;
  const text = `${k.anrede},

${n ? `${einstieg}\n\n${liste!.text}\n\n` : ""}${kern}

Bewerbungen erhalten: ${url}

${KONTAKT_TEXT}

${MARTA_TEXT}`;
  return { betreff: nudge1Betreff(n), vorschau, html, text };
}

// ── 03 Nudge 2 (profil_nudge_2, +28 h) ────────────────────────────────────

export function nudge2Mail(k: Kontext): KundenMail {
  const url = k.portal({ goto: "anfragen", m: "pn2" });
  const vorschau = "Noch kann sich keine Pflegekraft bei Ihnen bewerben. Es fehlen nur ein paar Angaben.";
  const tel = `<a href="${TELEFON_HREF}" style="color:${F.taupeInk};font-weight:700;text-decoration:none;">${TELEFON_TEXT}</a>`;
  const wa = `<a href="${WHATSAPP_HREF}" style="color:${F.taupeInk};font-weight:700;text-decoration:none;">WhatsApp</a>`;
  const satz1 = "bei Ihnen kann sich noch keine Pflegekraft bewerben. Dafür fehlen ein paar Angaben zur Pflegesituation, zum Beispiel zur Mobilität und zum Einsatzort. Das dauert 2 Minuten, vieles haben Sie bei Ihrer Anfrage schon angegeben.";
  const satz2 = (t: string, w: string) => `Wenn Sie das lieber zusammen mit mir erledigen möchten, rufen Sie mich an unter ${t} oder schreiben Sie mir per ${w}, wann es Ihnen passt. Ich gehe die Fragen mit Ihnen am Telefon durch und trage alles für Sie ein.`;
  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp(satz1)}
    ${mp(satz2(tel, wa), 22)}
    ${mKnopf(url, "Bewerbungen erhalten", 0, 24)}
    ${k.marta}`;
  const text = `${k.anrede},

${satz1}

${satz2("089 200 000 830", "WhatsApp (https://wa.me/4989200000830)")}

Bewerbungen erhalten: ${url}

${MARTA_TEXT}`;
  return { betreff: "Soll ich die Angaben mit Ihnen zusammen ausfüllen?", vorschau, html, text };
}

// ── 04 Vier Dinge (warum_primundus, +48 h) ────────────────────────────────

const VIER_DINGE: [string, string][] = [
  ["Bei uns ist alles transparent.", "Ihren Preis kennen Sie sofort. Passende Pflegekräfte sehen Sie mit Profil, Erfahrung und Deutschkenntnissen und wählen selbst aus, bevor Sie sich festlegen."],
  ["Sie binden sich nicht.", "Kein Vertrag vor Ihrer Auswahl. Danach täglich kündbar und taggenau abgerechnet. Kosten entstehen erst ab Anreise."],
  ["Sie zahlen nie zu viel.", "Keine Vermittlungsgebühr: Als Direktanbieter sparen wir die Provision. Die Pflegekraft verdient mehr, und Sie zahlen trotzdem weniger. Dazu gilt unsere Bestpreisgarantie."],
  ["Sie sind nie allein.", "Über 20 Jahre Erfahrung, mehr als 60.000 Einsätze, 6× in Folge Testsieger bei DIE WELT. Und ich bin 7 Tage die Woche Ihre Ansprechpartnerin."],
];

export function vierDingeMail(k: Kontext, kalkulation: Record<string, unknown> | null | undefined): KundenMail {
  const url = k.portal({ goto: "anfragen", m: "wp" });
  const heim = heimVergleich(kalkulation);
  const vorschau = "Preis und Pflegekräfte sofort sehen, täglich kündbar, keine Vermittlungsgebühr.";
  const punkt = (t: string, d: string) => `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 18px;"><tr>
      <td style="vertical-align:top;width:40px;padding:0 12px 0 0;">
        <table cellpadding="0" cellspacing="0" role="presentation"><tr><td width="28" height="28" align="center" valign="middle" style="background-color:${F.mint};color:${F.greenDeep};width:28px;height:28px;border-radius:14px;font-size:14px;font-weight:800;line-height:28px;text-align:center;">&#10003;</td></tr></table>
      </td>
      <td style="vertical-align:top;padding:2px 0 0;">
        <p style="margin:0 0 3px;font-size:16.5px;font-weight:800;line-height:1.35;color:${F.ink};">${t}</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:${F.text};">${d}</p>
      </td>
    </tr></table>`;
  const mitLink = (d: string) => d.replace("Bestpreisgarantie.", `<a href="${BESTPREIS_URL}" style="color:${F.greenDeep};font-weight:700;">Bestpreisgarantie</a>.`);
  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp("falls Sie gerade Anbieter vergleichen: Diese vier Dinge sind bei Primundus anders.", 22)}
    ${VIER_DINGE.map(([t, d]) => punkt(t, mitLink(d))).join("")}
    ${heim ? `${mTrenner(4, 18)}${heimHtml(heim, 22)}` : mAbstand(6)}
    ${mKnopf(url, "Bewerbungen erhalten", 0, 14)}
    ${mKontakt()}
    ${k.marta}`;
  const text = `${k.anrede},

falls Sie gerade Anbieter vergleichen: Diese vier Dinge sind bei Primundus anders.

${VIER_DINGE.map(([t, d]) => `✓ ${t} ${d}`).join("\n")}
Bestpreisgarantie: ${BESTPREIS_URL}
${heim ? `\n${heimText(heim)}\n` : ""}
Bewerbungen erhalten: ${url}

${KONTAKT_TEXT}

${MARTA_TEXT}`;
  return { betreff: "Vier Dinge, die Primundus anders macht", vorschau, html, text };
}

// ── 05 Nachfass 2 (+72 h) ─────────────────────────────────────────────────

export function nachfass2Mail(k: Kontext): KundenMail {
  const url = k.portal({ goto: "anfragen", m: "nf2" });
  const vorschau = "Für Sie stehen Pflegekräfte bereit. Ich helfe Ihnen gern beim Anfragen.";
  const s1 = "für Sie stehen Pflegekräfte bereit, die Ihre Betreuung übernehmen würden. Bewerben können sie sich, sobald die Angaben zur Pflegesituation da sind.";
  const s2 = "Das müssen Sie nicht allein machen. Rufen Sie mich an oder antworten Sie kurz auf diese E-Mail, dann gehen wir alles gemeinsam durch. Die Bewerbungen bekommen Sie danach per E-Mail, ohne jede Verpflichtung.";
  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp(s1)}
    ${mp(s2, 22)}
    ${mKnopf(url, "Bewerbungen erhalten", 0, 14)}
    ${mKontakt()}
    ${k.marta}`;
  const text = `${k.anrede},

${s1}

${s2}

Bewerbungen erhalten: ${url}

${KONTAKT_TEXT}

${MARTA_TEXT}`;
  return { betreff: "Ihre Betreuung – kann ich Ihnen etwas abnehmen?", vorschau, html, text };
}

// ── 06 Nachfass 3 (Abschied, +120 h) ──────────────────────────────────────

/** Knöpfe der Abschiedsmail. Mit Token → /rueckmeldung, ohne → Mail an info@ (Lead-Ref im Betreff). */
export function nachfass3Mail(k: Kontext, leadRef: string): KundenMail {
  const mailto = (betreff: string, satz: string) =>
    `mailto:info@primundus.de?subject=${encodeURIComponent(`${betreff} — ${leadRef}`)}&body=${encodeURIComponent(`Guten Tag Frau Kapcio,\n\n${satz}\n`)}`;
  const ja = k.token ? rueckmeldungLink(k.site, k.token, "interesse") : mailto("Habe noch Interesse", "ich habe noch Interesse, bitte melden Sie sich bei mir.");
  const spaeter = k.token ? rueckmeldungLink(k.site, k.token, "aktuell-nicht") : mailto("Aktuell nicht — vielleicht später", "aktuell brauche ich noch keine Pflegekraft, vielleicht später.");
  const nein = k.token ? rueckmeldungLink(k.site, k.token, "nicht-relevant") : mailto("Nicht mehr relevant", "das Thema ist für mich nicht mehr relevant.");
  const vorschau = "Ein Klick genügt: Interesse, später oder nicht mehr relevant.";
  const frage = mKarte(`
    ${mEyebrow("Ihre Rückmeldung")}
    ${mTitel("Wie ist der Stand bei Ihnen?", 8)}
    ${mp("Ein Klick genügt, dann weiß ich, woran ich bin.", 16)}
    ${mKnopf(ja, RUECKMELDUNG_KNOEPFE.interesse, 0, 10)}
    ${mKnopfHell(spaeter, RUECKMELDUNG_KNOEPFE["aktuell-nicht"])}
    ${mKnopfHell(nein, RUECKMELDUNG_KNOEPFE["nicht-relevant"], 0)}`, { rand: "#D8CDBD" });
  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp("ich möchte Sie nicht mit weiteren E-Mails stören und frage deshalb einmal direkt nach.", 20)}
    ${frage}
    ${mKlein(ABSCHIED_SATZ, 22)}
    ${mKontakt()}
    ${k.marta}`;
  const text = `${k.anrede},

ich möchte Sie nicht mit weiteren E-Mails stören und frage deshalb einmal direkt nach: Wie ist der Stand bei Ihnen? Ein Klick genügt, dann weiß ich, woran ich bin.

${RUECKMELDUNG_KNOEPFE.interesse}:
${ja}

${RUECKMELDUNG_KNOEPFE["aktuell-nicht"]}:
${spaeter}

${RUECKMELDUNG_KNOEPFE["nicht-relevant"]}:
${nein}

${ABSCHIED_SATZ}

${KONTAKT_TEXT}

${MARTA_TEXT}`;
  return { betreff: "Eine letzte Frage: Wie ist der Stand bei Ihnen?", vorschau, html, text };
}

// ── 08 Stand nach 2 Tagen (suche_stand_2tage, neu) ────────────────────────

export function sucheStandMail(k: Kontext): KundenMail {
  const url = k.portal({ goto: "matches", m: "st2" });
  const vorschau = "Zwei Wege, mit denen Sie schneller eine Bewerbung bekommen.";
  const wege = [
    { titel: "Pflegekräfte selbst einladen", text: "Laden Sie im Portal ein, wer Ihnen gefällt. Die Pflegekraft meldet sich meist innerhalb von 1–2 Tagen." },
    { titel: "Mit mir sprechen", text: "Wir schauen gemeinsam auf Startdatum und Anforderungen. So finde ich oft schneller jemanden." },
  ];
  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp("Ihre Suche läuft seit zwei Tagen, eine Bewerbung ist noch nicht da. Zwei Dinge beschleunigen das:", 20)}
    ${mKarte(mSchritte(wege))}
    ${mKnopf(url, "Pflegekräfte einladen", 0, 14)}
    ${mKontakt()}
    ${k.marta}`;
  const text = `${k.anrede},

Ihre Suche läuft seit zwei Tagen, eine Bewerbung ist noch nicht da. Zwei Dinge beschleunigen das:

${wege.map((w, i) => `${i + 1}. ${w.titel}: ${w.text}`).join("\n")}

Pflegekräfte einladen: ${url}

${KONTAKT_TEXT}

${MARTA_TEXT}`;
  return { betreff: "Noch keine Bewerbung? So geht es schneller", vorschau, html, text };
}

// ── 09 Neue Pflegekräfte (neue_pflegekraefte_verfuegbar) ──────────────────

export function neuePflegekraefteMail(k: Kontext): KundenMail {
  const url = k.portal({ goto: "matches", m: "npk" });
  const vorschau = "Laden Sie ein, wer Ihnen gefällt. Jede Bewerbung kommt per E-Mail.";
  const satz = "ich habe weitere Pflegekräfte gefunden, die zu Ihrer Anfrage passen. Laden Sie ein, wer Ihnen gefällt. Jede Bewerbung bekommen Sie per E-Mail.";
  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp(satz, 22)}
    ${mKnopf(url, "Neue Pflegekräfte ansehen", 0, 14)}
    ${mKontakt()}
    ${k.marta}`;
  const text = `${k.anrede},

${satz}

Neue Pflegekräfte ansehen: ${url}

${KONTAKT_TEXT}

${MARTA_TEXT}`;
  return { betreff: "Neue passende Pflegekräfte für Sie", vorschau, html, text };
}

// ── 12–14 Erinnerungen an eine Bewerbung ──────────────────────────────────

export type ErinnerungEingabe = {
  stufe: ErinnerungStufe;
  pk: PflegekraftDaten;
  angebot: BewerbungsAngebot;
  /** Link „Angebot prüfen" (öffnet die Bewerbung). */
  url: string;
  /** Rest bis zum Ende der Reservierung; null = unbekannt (dann ohne Countdown). */
  restMs: number | null;
};

export function erinnerungMail(k: Kontext, e: ErinnerungEingabe): KundenMail {
  const vorname = e.pk.name.split(/\s+/)[0] || e.pk.name;
  const gen = genitiv(vorname);
  const rest = e.restMs != null ? reserviertRest(e.restMs) : null;
  const gross = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  let betreff: string, vorschau: string, chip: string | null, satz: string;
  if (!rest) {
    betreff = `${gen} Bewerbung wartet auf Ihre Antwort`;
    vorschau = "Ein Klick auf Zusagen oder Absagen genügt.";
    chip = null;
    satz = `${gen} Bewerbung wartet auf Ihre Antwort. Ein Klick auf Zusagen oder Absagen genügt.`;
  } else if (e.stufe === "1") {
    betreff = `${gen} Bewerbung: ${rest} für Sie reserviert`;
    vorschau = "Ein Klick auf Zusagen oder Absagen genügt.";
    chip = `${gross(rest)} für Sie reserviert`;
    satz = `${gen} Bewerbung wartet auf Ihre Antwort. Sie ist ${rest} für Sie reserviert.`;
  } else if (e.stufe === "2") {
    betreff = `${gross(rest)}: ${gen} Bewerbung`;
    vorschau = `${vorname} wartet auf Ihre Antwort. Ein Klick genügt.`;
    chip = `${gross(rest)} für Sie reserviert`;
    satz = `${gen} Bewerbung ist ${rest} für Sie reserviert. Ein Klick auf Zusagen oder Absagen genügt.`;
  } else {
    betreff = `Nur ${rest} reserviert: ${gen} Bewerbung`;
    vorschau = "Danach endet die Reservierung automatisch.";
    chip = `Nur ${rest} für Sie reserviert`;
    satz = `${gen} Bewerbung ist nur ${rest} für Sie reserviert. Danach endet die Reservierung automatisch.`;
  }
  const schluss = e.stufe === "letzte"
    ? `Brauchen Sie mehr Zeit oder passt etwas nicht? Antworten Sie kurz auf diese E-Mail, ich kläre das mit ${esc(vorname)}.`
    : `Passt etwas nicht? Antworten Sie kurz auf diese E-Mail. Ich kläre das mit ${esc(vorname)} oder schlage Ihnen jemand anderen vor.`;

  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${chip ? mChip(chip) : ""}
    ${mp(esc(satz), 20)}
    ${mBewerbungsKarte(e.pk, e.angebot, e.url, null)}
    ${mp(schluss, 8)}
    ${mKontakt()}
    ${k.marta}`;
  const angebotZeilen = [
    e.angebot.tagessatz ? `Tagessatz: ${e.angebot.tagessatz} € / Tag` : "",
    e.angebot.zeitraum ? `Zeitraum: ${e.angebot.zeitraum}` : "",
    e.angebot.reisekosten != null ? `Reisekosten: ${e.angebot.reisekosten} € je Fahrt` : "",
  ].filter(Boolean).join("\n");
  const text = `${k.anrede},

${chip ? `${chip}\n\n` : ""}${satz}

NEUE BEWERBUNG
${pkText(e.pk)}
${angebotZeilen ? `${angebotZeilen}\n` : ""}Angebot prüfen: ${e.url}

${klartext(schluss)}

${KONTAKT_TEXT}

${MARTA_TEXT}`;
  return { betreff, vorschau, html, text };
}

// ── 16 Reservierung beendet (neu) ─────────────────────────────────────────

/** Nach der automatischen Absage (72 h ohne Antwort). Mehrere Pflegekräfte → eine Mail. */
export function reservierungBeendetMail(k: Kontext, vornamen: string[]): KundenMail {
  const url = k.portal({ goto: "anfragen", m: "rb" });
  const namen = vornamen.filter(Boolean);
  const eine = namen.length <= 1;
  const v = namen[0] ?? "";
  const liste = namen.length <= 1 ? v : `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
  const vorschau = "Ihre Suche läuft weiter. Neue Bewerbungen bekommen Sie per E-Mail.";
  const s1 = eine
    ? `die Reservierung für ${v ? `${esc(genitiv(v))} Bewerbung` : "die Bewerbung"} ist abgelaufen. Ihre Suche läuft weiter: Neue Bewerbungen bekommen Sie wie gewohnt per E-Mail.`
    : `die Reservierungen für die Bewerbungen von ${esc(liste)} sind abgelaufen. Ihre Suche läuft weiter: Neue Bewerbungen bekommen Sie wie gewohnt per E-Mail.`;
  const s2 = eine
    ? `${v ? `Passte ${esc(v)} nicht?` : "Passte die Pflegekraft nicht?"} Sagen Sie mir kurz, woran es lag. Dann suche ich gezielter.`
    : "Passten die Pflegekräfte nicht? Sagen Sie mir kurz, woran es lag. Dann suche ich gezielter.";
  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp(s1)}
    ${mp(s2, 22)}
    ${mKnopf(url, "Stand Ihrer Suche ansehen", 0, 14)}
    ${mKontakt()}
    ${k.marta}`;
  const text = `${k.anrede},

${klartext(s1)}

${klartext(s2)}

Stand Ihrer Suche ansehen: ${url}

${KONTAKT_TEXT}

${MARTA_TEXT}`;
  const betreff = eine && v
    ? `${genitiv(v)} Reservierung ist abgelaufen – Ihre Suche läuft weiter`
    : "Reservierung abgelaufen – Ihre Suche läuft weiter";
  return { betreff, vorschau, html, text };
}

// ── Anreise (Registry #119) ───────────────────────────────────────────────
// Die Agentur hat die Anreise der Pflegekraft in mamamia eingetragen
// (detect-caregiver-events, Modus „anreise"). Wortlaut und Aufbau 1:1 nach der
// Vorlage mail-templates/20-anreise.html. Ändern sich Datum, Uhrzeit oder
// Verkehrsmittel, kommt dieselbe Mail als „Geänderte Anreisedaten".
// OHNE die Zeile „Hinweis" der Vorlage (Michał 09.10.): die Agenturen tragen dort
// Busunternehmen + polnische Disponenten-Nummer ein („Osobus +48 …") oder
// Arbeitsnotizen („Uhrzeitänderung / …") — nichts für den Kunden. Die Notiz
// liegt weiter in der Queue-Zeile (metadata.hinweis) für das Team.

/** Wörter für die drei Verkehrsmittel aus mamamia (ArrivalTypes, gemessen 2026-08-19).
 *  Unbekannte Werte erscheinen so, wie mamamia sie liefert — nichts geraten. */
export const VERKEHRSMITTEL: Record<string, string> = {
  "Minibus": "Minibus",
  "Sindbad": "Reisebus (Sindbad)",
  "Own transport": "Eigene Anreise",
};

/** „2026-10-12" → „Montag, 12.10.2026" (Wochentag aus dem Kalendertag, nicht aus einer Uhrzeit). */
export function anreiseDatum(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  const tag = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(j, m - 1, t)));
  return `${tag}, ${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** „14:00"/„18:00" → „14–18 Uhr", „14:30" bleibt, ohne Ende „ab 14 Uhr". */
export function anreiseZeit(von: string, bis: string | null): string {
  const u = (t: string) => (t.slice(3, 5) === "00" ? String(Number(t.slice(0, 2))) : `${Number(t.slice(0, 2))}:${t.slice(3, 5)}`);
  if (!bis) return `ab ${u(von)} Uhr`;
  if (bis === von) return `${u(von)} Uhr`;
  return `${u(von)}–${u(bis)} Uhr`;
}

export type AnreiseEingabe = {
  /** Vor- + Nachname aus mamamia. Die API maskiert den Nachnamen heute zum Initial („Ewa L.“). */
  name: string;
  fotoCid: string | null;
  /** YYYY-MM-DD */
  datum: string;
  /** HH:MM */
  von: string;
  bis: string | null;
  /** Rohwert aus mamamia */
  verkehrsmittel: string;
  strasse: string | null;
  plzOrt: string | null;
  geaendert: boolean;
};

export function anreiseMail(k: Kontext, a: AnreiseEingabe): KundenMail {
  const vorname = a.name.trim().split(/\s+/)[0] ?? "";
  const datum = anreiseDatum(a.datum);
  const zeit = anreiseZeit(a.von, a.bis);
  const mittel = VERKEHRSMITTEL[a.verkehrsmittel] ?? a.verkehrsmittel;
  const selbst = a.verkehrsmittel === "Own transport";
  const einleitung = a.geaendert
    ? "die Anreisedaten Ihrer Pflegekraft haben sich geändert. Nachfolgend finden Sie die aktuellen Anreisedaten:"
    : "wir haben die Anreise Ihrer Pflegekraft organisiert. Nachfolgend finden Sie die Anreisedaten:";
  const vorschau = `${a.geaendert ? "Geänderte Anreisedaten" : "Ihre Anreisedaten"}: ${datum}, ${zeit}.`;
  const adresse = [a.strasse, a.plzOrt].filter((x): x is string => !!x);
  const hierhin = a.strasse ? (selbst ? `Hierhin reist ${vorname} selbst an.` : `Hierhin wird ${vorname} gebracht.`) : "";

  const zeilen: [string, string][] = [];
  const foto = a.fotoCid
    ? `<td style="padding:0 10px 0 0;vertical-align:middle;"><!--[if mso]><img src="cid:${a.fotoCid}" alt="" width="36" style="display:block;border:0;" /><![endif]--><!--[if !mso]><!--><img src="cid:${a.fotoCid}" alt="" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:18px;object-fit:cover;border:0;outline:none;" /><!--<![endif]--></td>`
    : "";
  zeilen.push(["Pflegekraft", `<table cellpadding="0" cellspacing="0" role="presentation"><tr>${foto}<td style="vertical-align:middle;font-size:15.5px;line-height:1.3;font-weight:700;color:${F.ink};">${esc(a.name)}</td></tr></table>`]);
  if (adresse.length > 0) {
    zeilen.push(["Adresse", adresse.map(esc).join("<br>") + (hierhin ? `<br><span style="font-weight:400;font-size:14px;color:${F.muted};">${esc(hierhin)}</span>` : "")]);
  }
  zeilen.push(["Verkehrsmittel", esc(mittel)]);
  zeilen.push(["Ankunft", `<span style="white-space:nowrap;">${esc(datum)},</span> <span style="white-space:nowrap;">${esc(zeit)}</span>`]);
  const rand = (i: number) => (i === 0 ? "" : "border-top:1px solid #EFEBE5;");
  const tabelle = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 14px;border:1.5px solid ${F.line};border-radius:20px;background:#ffffff;border-collapse:separate;">
      <tr><td style="background:${F.shell};color:${F.taupeInk};border-radius:18px 18px 0 0;padding:12px 18px;font-size:15.5px;font-weight:800;line-height:1.3;">Ihre Anreisedaten</td></tr>
      <tr><td style="padding:4px 18px 4px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${zeilen.map(([l, w], i) => `
          <tr>
            <td width="112" style="width:112px;padding:12px 12px 12px 0;vertical-align:top;font-size:14.5px;line-height:1.45;color:${F.muted};${rand(i)}">${l}</td>
            <td style="padding:12px 0;vertical-align:top;font-size:15.5px;line-height:1.45;color:${F.ink};font-weight:700;overflow-wrap:anywhere;${rand(i)}">${w}</td>
          </tr>`).join("")}
        </table>
      </td></tr>
    </table>`;
  const melden = `Sollte etwas nicht stimmen, melden Sie sich bitte bei mir unter <a href="${TELEFON_HREF}" style="color:${F.taupeInk};font-weight:700;text-decoration:none;white-space:nowrap;">${TELEFON_TEXT}</a> (auch per WhatsApp) oder antworten Sie auf diese E-Mail. Ansonsten melde ich mich nach der Anreise bei Ihnen und frage nach, ob alles gut klappt.`;
  const start = `Ich wünsche Ihnen und ${esc(vorname)} einen guten Start.`;

  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp(einleitung, 22)}
    ${tabelle}
    <p style="font-size:16px;line-height:1.65;color:${F.text};margin:8px 0 14px;">${melden}</p>
    ${mp(start, 0)}
    ${k.marta}`;

  const textZeilen = [
    `Pflegekraft: ${a.name}`,
    ...(adresse.length > 0 ? [`Adresse: ${adresse.join(", ")}${hierhin ? ` (${hierhin})` : ""}`] : []),
    `Verkehrsmittel: ${mittel}`,
    `Ankunft: ${datum}, ${zeit}`,
  ];
  const text = `${k.anrede},

${einleitung}

Ihre Anreisedaten
${textZeilen.join("\n")}

${klartext(melden)}

Ich wünsche Ihnen und ${vorname} einen guten Start.

${MARTA_TEXT}`;

  return {
    betreff: `${a.geaendert ? "Geänderte Anreisedaten" : "Anreisedaten"} Ihrer Pflegekraft – ${datum}`,
    vorschau,
    html,
    text,
  };
}
