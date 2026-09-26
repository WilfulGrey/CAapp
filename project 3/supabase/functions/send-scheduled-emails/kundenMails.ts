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
  MAIL_HERO_PUNKTE,
  TELEFON_HREF,
  TELEFON_TEXT,
  WHATSAPP_HREF,
  mAbschnitt,
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
  mLink,
  mp,
  mPflegekraft,
  mPunkte,
  mSchritte,
  mTitel,
  mTrenner,
  mVorschau,
  type BewerbungsAngebot,
  type PflegekraftDaten,
} from "./mailBausteine.ts";
import { type Empfehlung, esc, zahlwort } from "./empfehlung.ts";
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

function punkteText(): string {
  return [...MAIL_HERO_PUNKTE.map((p) => `✓ ${p}`), `✓ Bestpreisgarantie: ${BESTPREIS_URL}`].join("\n");
}

const pflegekraefte = (n: number) => (n === 1 ? "Pflegekraft" : "Pflegekräfte");

/** Pflegekraft-Box aus einer Empfehlung (Angebotsmail). */
export function pkAusEmpfehlung(e: Empfehlung, cid: string | null): PflegekraftDaten {
  return {
    name: e.anzeigeName, alter: e.alter, deutsch: e.deutschWort,
    jahre: e.erfahrungJahre, einsaetze: e.einsaetze, foto: cid ? `cid:${cid}` : null,
  };
}

function pkText(pk: PflegekraftDaten): string {
  const kopf = [pk.name + (pk.alter ? `, ${pk.alter}` : ""), pk.deutsch ? `Deutsch ${pk.deutsch}` : ""].filter(Boolean).join(" · ");
  const fakten: string[] = [];
  if (pk.jahre && pk.jahre > 0) fakten.push(`${pk.jahre} ${pk.jahre === 1 ? "Jahr" : "Jahre"} Erfahrung`);
  if (pk.einsaetze && pk.einsaetze > 0) fakten.push(`${pk.einsaetze} ${pk.einsaetze === 1 ? "Einsatz" : "Einsätze"}`);
  return fakten.length ? `${kopf}\n${fakten.join(" · ")}` : kopf;
}

// ── 01 Angebot (eingangsbestaetigung) ─────────────────────────────────────

/** Anzeige-Labels der Anfrage — „Sofort" ohne Werktage (Registry #95, wie lib/angaben-labels.ts). */
export const EINGANGS_LABELS: Record<string, Record<string, string>> = {
  betreuung_fuer: { "1-person": "1 Person", "ehepaar": "2 Personen" },
  mobilitaet: { "mobil": "Mobil", "rollator": "Eingeschränkt – Rollator", "rollstuhl": "Rollstuhl", "bettlaegerig": "Bettlägerig" },
  nachteinsaetze: { "nein": "Nein", "gelegentlich": "Gelegentlich", "taeglich": "Täglich (1×)", "mehrmals": "Mehrmals nachts" },
  deutschkenntnisse: { "grundlegend": "Grundlegend", "kommunikativ": "Kommunikativ", "sehr-gut": "Gut" },
  fuehrerschein: { "ja": "Ja", "nein": "Nein / nicht unbedingt" },
  geschlecht: { "egal": "Egal", "weiblich": "Weiblich", "maennlich": "Männlich" },
  erfahrung: { "keine": "Keine Anforderung", "wuenschenswert": "Wünschenswert", "zwingend": "Zwingend erforderlich" },
  weitere_personen: { "ja": "Ja", "nein": "Nein" },
  // "spaeter": Legacy-Wert des Rechners, heute von pflege-helfer24 (Startdatum
  // "Innerhalb von 6 Monaten" / "Später") — ohne Label stuende der Rohwert.
  care_start_timing: { "sofort": "Sofort", "2-4-wochen": "In 2–4 Wochen", "1-2-monate": "In 1–2 Monaten", "spaeter": "Zu einem späteren Zeitpunkt", "unklar": "Ich informiere mich nur" },
};

export function eingangsLabel(key: string, val: string | undefined | null): string {
  if (!val) return "Nicht angegeben";
  return EINGANGS_LABELS[key]?.[val] || val;
}

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

export type AngebotEingabe = {
  kalkulation: Record<string, any> | null | undefined;
  careStartTiming: string | null | undefined;
  /** Anzeigename des Portals bei eingekauften Leads, sonst null. */
  herkunft: string | null;
  portalBetreff: string;
  /** Hinweis über der Angaben-Tabelle (eingekaufte Leads), HTML und Text. */
  angabenHinweis: { html: string; text: string } | null;
  resubmit: boolean;
  /** Empfehlung aus mamamia; null/undefined → Abschnitt fällt weg. */
  empfehlung?: { e: Empfehlung; cid: string | null; sichtbar: number } | null;
};

function angabenTabelle(fd: Record<string, any>, careStartTiming: string | null | undefined): { html: string; text: string } {
  const psLabel = "font-size:11px;font-weight:700;color:#9a8a73;letter-spacing:.08em;text-transform:uppercase;";
  const zeilen1: [string, string][] = [
    ["Betreuung für", eingangsLabel("betreuung_fuer", fd.betreuung_fuer)],
    ["Pflegegrad", fd.pflegegrad ? `Pflegegrad ${fd.pflegegrad}` : "Nicht angegeben"],
    ["Weitere Personen im Haushalt", eingangsLabel("weitere_personen", fd.weitere_personen)],
    ["Mobilität", eingangsLabel("mobilitaet", fd.mobilitaet)],
    ["Nachteinsätze erforderlich", eingangsLabel("nachteinsaetze", fd.nachteinsaetze)],
    ["Gewünschter Start", eingangsLabel("care_start_timing", careStartTiming)],
  ];
  const zeilen2: [string, string][] = [["Deutschkenntnisse", eingangsLabel("deutschkenntnisse", fd.deutschkenntnisse)]];
  if (fd.erfahrung) zeilen2.push(["Erfahrung", eingangsLabel("erfahrung", fd.erfahrung)]);
  if (fd.fuehrerschein) zeilen2.push(["Führerschein", eingangsLabel("fuehrerschein", fd.fuehrerschein)]);
  zeilen2.push(["Geschlecht der Pflegekraft", fd.geschlecht ? eingangsLabel("geschlecht", fd.geschlecht) : "Egal"]);
  const kv = (z: [string, string][]) => z.map(([l, v]) =>
    `<tr><td style="padding:4px 0;color:#888;width:55%;">${esc(l)}</td><td style="padding:4px 0;color:#2D1F0F;font-weight:600;">${esc(String(v))}</td></tr>`).join("");
  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 8px;border:1px solid #ebe2d2;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:12px 20px;background:#FAF8F4;border-bottom:1px solid #ebe2d2;"><p style="margin:0;${psLabel}">Pflegesituation &amp; Anforderungen</p></td></tr>
      <tr><td style="padding:14px 20px 16px;border-bottom:1px solid #ebe2d2;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;color:#555;line-height:1.7;">${kv(zeilen1)}</table></td></tr>
      <tr><td style="padding:12px 20px;background:#FAF8F4;border-bottom:1px solid #ebe2d2;"><p style="margin:0;${psLabel}">Anforderungen an die Pflegekraft</p></td></tr>
      <tr><td style="padding:14px 20px 16px;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;color:#555;line-height:1.7;">${kv(zeilen2)}</table></td></tr>
    </table>`;
  const text = `PFLEGESITUATION & ANFORDERUNGEN
${zeilen1.map(([l, v]) => `${l}: ${v}`).join("\n")}

ANFORDERUNGEN AN DIE PFLEGEKRAFT
${zeilen2.map(([l, v]) => `${l}: ${v}`).join("\n")}`;
  return { html, text };
}

const SCHRITTE_ANGEBOT = [
  { titel: "Pflegesituation beschreiben", text: "2 Minuten, vieles ist schon ausgefüllt." },
  { titel: "Bewerbungen erhalten", text: "Passende Pflegekräfte bewerben sich bei Ihnen, per E-Mail. Jede Bewerbung ist 72 Stunden für Sie reserviert." },
  { titel: "Auswählen und starten", text: "Wir übernehmen den Rest. Anreise schon ab 3 Tagen möglich." },
];

export function angebotMail(k: Kontext, a: AngebotEingabe): KundenMail {
  const kalk = a.kalkulation ?? {};
  const fd = (kalk.formularDaten ?? {}) as Record<string, any>;
  const brutto = typeof kalk.bruttopreis === "number" && kalk.bruttopreis > 0 ? kalk.bruttopreis : 0;
  const heim = heimVergleich(kalk);
  const emp = a.empfehlung ?? null;
  const n = emp ? Math.max(1, Math.min(5, emp.sichtbar || 1)) : 0;
  const anfragen = k.portal({ goto: "anfragen", m: "eb" });

  const kraefteSatz = n === 0 ? ""
    : n === 1 ? " Eine Pflegekraft passt schon zu Ihren Angaben, Sie finden sie weiter unten."
    : ` ${zahlwort(n, true)} Pflegekräfte passen schon zu Ihren Angaben, Sie finden sie weiter unten.`;
  const einstieg = a.herkunft
    ? `vielen Dank für Ihre Anfrage über ${mb(esc(a.herkunft))}. Hier ist Ihr persönliches Angebot.`
    : a.resubmit
    ? "vielen Dank für Ihre erneute Anfrage. Ich habe Ihre Angaben übernommen und Ihr Angebot angepasst."
    : "vielen Dank für Ihre Anfrage. Hier ist Ihr persönliches Angebot.";

  const siegel = `${k.site.replace(/\/$/, "")}/images/primundus_testsieger-2021.webp`;
  const siegelZeile = `
    <table cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td style="vertical-align:middle;padding-right:12px;"><img src="${siegel}" width="36" alt="Testsieger" style="display:block;width:36px;height:auto;"></td>
      <td style="vertical-align:middle;"><p style="margin:0;font-size:15.5px;font-weight:700;color:${F.ink};">6× Testsieger DIE WELT</p><p style="margin:2px 0 0;font-size:14px;color:${F.muted};">20 Jahre Erfahrung &middot; 60.000+ Einsätze</p></td>
    </tr></table>`;
  const kosten = mKarte(`
    ${mEyebrow(brutto ? "Ihre Betreuungskosten" : "Ihre Konditionen", 8)}
    ${brutto ? `<p style="margin:0 0 8px;font-size:44px;font-weight:800;line-height:1;letter-spacing:-.03em;color:${F.ink};">${euro(brutto)}&nbsp;€</p>
    ${mKlein("Monatlich inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125&nbsp;€ pro Fahrt).", 14)}` : ""}
    ${mPunkte(null)}
    ${mKlein("Kosten entstehen erst, wenn die Pflegekraft bei Ihnen ist.", 0)}
    ${heim ? `${mTrenner()}${heimHtml(heim, 0)}` : ""}
    ${mTrenner()}
    ${siegelZeile}`);
  const frage = mKarte(`
    ${mEyebrow("Ihre Entscheidung")}
    ${mTitel("Passt Ihnen das Angebot?", 10)}
    ${mp("Dann beschreiben Sie in 2 Minuten die Pflegesituation, vieles ist schon ausgefüllt. Danach bewerben sich passende Pflegekräfte bei Ihnen, mit Foto, Erfahrung, Anreisetermin und Preis. Ein Vertrag entsteht erst, wenn Sie zusagen.")}
    ${mKnopf(anfragen, "Ja, Bewerbungen erhalten", 4, 12)}
    ${mKlein("Passt etwas nicht? Antworten Sie kurz auf diese E-Mail, ich melde mich.", 0, true)}`, { rand: "#D8CDBD" });

  let empfHtml = "";
  let empfText = "";
  if (emp) {
    const profil = k.portal({ cg: String(emp.e.caregiverId), m: "eb" });
    const alle = k.portal({ goto: "matches", m: "eb" });
    const pk = pkAusEmpfehlung(emp.e, emp.cid);
    const grund = (t: string) => `<tr><td style="width:24px;padding:0 0 7px;color:${F.green};font-weight:800;font-size:15px;line-height:1.45;vertical-align:top;">&#10003;</td><td style="padding:0 0 7px;font-size:15px;line-height:1.45;color:${F.ink};">${esc(t)}</td></tr>`;
    const gruende = emp.e.gruende.length
      ? `${mTrenner(16, 14)}<table role="presentation" cellpadding="0" cellspacing="0">${emp.e.gruende.map(grund).join("")}</table>`
      : "";
    empfHtml = `${mAbschnitt("Für Sie ausgewählt", `${n} passende ${pflegekraefte(n)}`)}
    ${mKarte(`${mEyebrow("Unsere Empfehlung", 14)}${mPflegekraft(pk, profil, { ohneRahmen: true })}${gruende}`, { unten: 12 })}
    ${mKlein(mLink(alle, n === 1 ? "Profil im Portal ansehen" : `Alle ${n} Pflegekräfte ansehen`), 12, true)}`;
    empfText = `FÜR SIE AUSGEWÄHLT: ${n} passende ${pflegekraefte(n)}
Unsere Empfehlung: ${pkText(pk)}
${emp.e.gruende.map((g) => `✓ ${g}`).join("\n")}
Profil: ${profil}
${n === 1 ? "Im Portal" : `Alle ${n} Pflegekräfte`}: ${alle}

`;
  }

  const angaben = angabenTabelle(fd, a.careStartTiming);
  const hinweisHtml = a.angabenHinweis ? a.angabenHinweis.html : "";

  const vorschau = brutto
    ? `${euro(brutto)} € im Monat${n ? `, ${n === 1 ? "eine passende Pflegekraft" : `${zahlwort(n)} passende Pflegekräfte`}` : ""}. Passt Ihnen das Angebot?`
    : "Ihr persönliches Angebot zur 24-Stunden-Betreuung. Passt es Ihnen?";

  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp(einstieg + kraefteSatz, 22)}
    ${kosten}
    ${frage}
    ${empfHtml}
    ${mAbschnitt("In drei Schritten", "So geht es weiter")}
    ${mSchritte(SCHRITTE_ANGEBOT, true)}
    ${mAbstand(22)}
    ${hinweisHtml}
    ${angaben.html}
    ${mp("Wenn Sie Fragen zum Angebot haben, rufen Sie mich an, schreiben Sie mir per WhatsApp oder antworten Sie auf diese E-Mail.", 8)}
    ${k.marta}`;

  const text = `${k.anrede},

${klartext(einstieg + kraefteSatz)}

${brutto ? `IHRE BETREUUNGSKOSTEN
${euro(brutto)} € im Monat, inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).
` : "IHRE KONDITIONEN\n"}${punkteText()}
Kosten entstehen erst, wenn die Pflegekraft bei Ihnen ist.
${heim ? `\n${heimText(heim)}\n` : ""}
6× Testsieger DIE WELT · 20 Jahre Erfahrung · 60.000+ Einsätze

PASST IHNEN DAS ANGEBOT?
Dann beschreiben Sie in 2 Minuten die Pflegesituation, vieles ist schon ausgefüllt. Danach bewerben sich passende Pflegekräfte bei Ihnen, mit Foto, Erfahrung, Anreisetermin und Preis. Ein Vertrag entsteht erst, wenn Sie zusagen.
Ja, Bewerbungen erhalten: ${anfragen}
Passt etwas nicht? Antworten Sie kurz auf diese E-Mail, ich melde mich.

${empfText}SO GEHT ES WEITER
${SCHRITTE_ANGEBOT.map((s, i) => `${i + 1}. ${s.titel}: ${s.text}`).join("\n")}

${a.angabenHinweis ? `${a.angabenHinweis.text}\n\n` : ""}${angaben.text}

Wenn Sie Fragen zum Angebot haben, rufen Sie mich an, schreiben Sie mir per WhatsApp oder antworten Sie auf diese E-Mail.

${MARTA_TEXT}`;

  const betreff = a.herkunft
    ? a.portalBetreff
    : a.resubmit
    ? "Ihr aktualisiertes Angebot zur 24-Stunden-Betreuung – Primundus"
    : "Ihr Angebot zur 24-Stunden-Betreuung – Primundus";
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
