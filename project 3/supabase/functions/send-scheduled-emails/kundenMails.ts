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
//
// Gruppe A im Look des Kundenportals (Registry #168, Martin 15.11.2026: „A: Angebot + Erinnerungen“): Angebotsmail,
// Nudge 1, Nudge 2 und Abschied bauen sich aus mailDesign.ts als GANZE Mail (Kopf, Inhalt, kurze Signatur, Fußzeile;
// `komplett: true`), index.ts setzt keine Hülle mehr darum. Wortlaute aus den Entwürfen
// seo-reports/analysen/mails-optik-2026-11-15/g1-angebot-vor-profil/bauen.mjs (nach dem OpenAI-Gegencheck 15.11.).
// „Vier Dinge“ (warum_primundus) und Nachfass 2 sind gestrichen (kette.ts), ihr Code bleibt für die Vorschau.
import {
  ALLE_KRAEFTE as LISTE_ALLE,
  anredeTitel,
  abstand as dAbstand,
  absatz,
  designMail,
  DESIGN_FARBEN as D,
  formularHinweis,
  formularKnopf,
  grussZeile,
  hauptknopf,
  karte,
  KOPF_TITEL_ZEILEN,
  LISTE_KNOPF,
  LISTE_TITEL,
  LISTE_UNVOLLSTAENDIG,
  LISTE_WARUM,
  LISTE_ZEILE,
  liste,
  martaSignatur,
  martaSignaturText,
  preiskarte,
  textlink,
  warumPrimundusText,
  type ZeilenKraft,
  zeilenFakten,
} from "./mailDesign.ts";
import {
  BESTPREIS_URL,
  MAIL_FARBEN as F,
  TELEFON_HREF,
  TELEFON_TEXT,
  WHATSAPP_HREF,
  mAbstand,
  mBewerbungsKarte,
  mChip,
  mKarte,
  mKlein,
  mKnopf,
  mKontakt,
  mp,
  mProfilText,
  mSchritte,
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
  /** Bewertungsstand dieses Laufs, NUR der Live-Stand (index.ts: bewertungNurLive, Registry #168); fehlt er, fallen die
   *  Sterne weg wie im Portal. Martas Karte der übrigen Mails liest den Stand weiter selbst (mit Ersatzwert). */
  bewertung?: { schnitt: string; anzahl: number } | null;
  /** Empfängeradresse für die Fußzeile der Mails aus mailDesign.ts („Diese E-Mail wurde versendet an …“). */
  email?: string | null;
  /** Abmelde-Link (nur mit Token, wie in buildEmailWrapper); fehlt er, fehlt die Zeile. */
  abmelden?: string | null;
};

/** `komplett`: `html` ist schon die ganze Mail (mailDesign.ts designMail), index.ts setzt keine Hülle darum. */
export type KundenMail = { betreff: string; vorschau: string; html: string; text: string; komplett?: boolean };

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

/* Angebotsmail im Look des Kundenportals (Registry #168, Martin 15.11.2026: „A: Angebot + Erinnerungen“; Entwurf
   g1-angebot-vor-profil/eingangsbestaetigung_neu.html). Aufbau wie der Minimal-Einstieg des Portals: Gruß klein, Titel
   KOPF_TITEL_ZEILEN, Martins Einleitung, Preiskarte (Preis, grün „Nach Zuschüssen“, Heim-Vergleich, „Warum Primundus?“
   mit Bestpreisgarantie + KOPF_PUNKTE, Kennzahlen; Sterne nur mit Live-Stand), eingekaufte Leads den Hinweis zu den
   Angaben, die Liste „Ihre Pflegekräfte-Auswahl“ mit LISTE_ZEILE (Zeilen wie im Portal: Foto, Vorname und Alter, Erfahrung,
   Deutsch, Pfeil; KEIN Preis und KEIN Knopf „Ansehen“ mehr, die ganze Zeile öffnet das Profil `cg=…&m=eb`), Textlink
   „Alle Pflegekräfte anzeigen“, Martins Erklärsatz („ca. 2 Minuten“ statt „etwa“), EIN Knopf in Koralle
   „Angebot & Pflegekräfte anzeigen →“ (oben ins Portal, Registry #163/#165), kurze Signatur, Fußzeile.
   Betreff und Vorschau unverändert (Vorgabe). Wortlaute aus dem Portal: Gleichlauf-Test
   src/__tests__/mails/angebotsmailWortlaut.test.ts.
   Bis #168: Kasten „Ihr persönliches Angebot“ mit Mintkasten und vier Punkten (GARANTIE_PUNKTE), Zeilen mit Preis und grün
   umrandetem „Ansehen“, Liste „Passende Pflegekräfte“, alte Hülle aus index.ts. */
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

/** Hauptknopf (Registry #163, 14.11.2026, Martin: „in der Mail würde ich den Buttontext machen: Angebot & Pflegekräfte anzeigen“);
 *  führt seitdem oben ins Portal (Angebot und Liste), bis dahin „Bewerbungen erhalten“ ins Formular. */
export const KNOPF_TITEL = "Angebot & Pflegekräfte anzeigen";
export const ALLE_KRAEFTE = LISTE_ALLE;
/** Über dem Knopf: was im Portal passiert (Martin 08.11.: „erklären, dass man im Portal nicht nur das Angebot sieht, sondern
 *  auch passende Pflegekräfte. Diese können sich auch direkt bei Ihnen bewerben. Sie müssen nur die Situation einmal kurz
 *  beschreiben …“; Fassung OpenAI 08.11., ohne „nicht nur … sondern auch“, Handlung direkt vor dem Knopf). Seit #168
 *  „ca. 2 Minuten“ statt „etwa 2 Minuten“ (Entwurf 15.11., wie überall „ca.“). */
export const PORTAL_ERKLAERUNG = "Im Kundenportal sehen Sie Ihr Angebot und passende Pflegekräfte. Beschreiben Sie einmal kurz die Pflegesituation, das dauert ca. 2 Minuten. Danach können sich Pflegekräfte direkt bei Ihnen bewerben. Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.";
/** Titel ohne Preis (Kalkulation fehlt, selten): „Ihr Preis für …“ stimmte dann nicht. Wortlaut wie die Vorschau dieses
 *  Falls („Ihr persönliches Angebot zur 24-Stunden-Betreuung.“). */
export const TITEL_OHNE_PREIS = ["Ihr persönliches Angebot", "zur 24-Stunden-Betreuung"] as const;
/** So viele Pflegekräfte zeigt die Mail höchstens; index.ts lädt nur für diese Fotos. */
export const ANGEBOT_KRAEFTE_MAX = 5;

/** „1 Jahr Erfahrung" / „12 Jahre Erfahrung", „Deutsch Gut" — wie `zeilenFakten` im Portal. */
export function kraftFakten(k: Pick<AngebotKraft, "erfahrungJahre" | "deutschWort">): string[] {
  return zeilenFakten({ jahre: k.erfahrungJahre, deutsch: k.deutschWort });
}

/** Kraft aus der Empfehlung → Zeile aus mailDesign.ts. Foto nur als angehängtes Bild (`cid:`), sonst Anfangsbuchstabe. */
export const zeilenKraft = (x: AngebotKraft): ZeilenKraft =>
  ({ vorname: x.vorname, alter: x.alter, jahre: x.erfahrungJahre, deutsch: x.deutschWort, foto: x.cid ? `cid:${x.cid}` : null });

/** Liste „Ihre Pflegekräfte-Auswahl“ (Angebotsmail und Nudge 1) als HTML, `kasten` optional unter den Zeilen. */
function kraefteListe(kraefte: AngebotKraft[], profil: (k: AngebotKraft) => string, alle: string, kasten?: string): string {
  return liste({
    titel: LISTE_TITEL, zeile: LISTE_ZEILE, kraefte: kraefte.map(zeilenKraft),
    profilUrl: (_z, i) => profil(kraefte[i]), alle: { url: alle, text: ALLE_KRAEFTE }, kasten,
  });
}
/** Dieselbe Liste als Text: je Kraft eine Zeile mit Profil-Link, darunter „Alle Pflegekräfte anzeigen“. */
function kraefteListeText(kraefte: AngebotKraft[], profil: (k: AngebotKraft) => string, alle: string): string {
  const zeile = (x: AngebotKraft) => [`${x.vorname}${x.alter ? `, ${x.alter}` : ""}`, ...kraftFakten(x)].join(" · ");
  return `${LISTE_TITEL.toUpperCase()} (${kraefte.length})
${LISTE_ZEILE}
${kraefte.map((x) => `- ${zeile(x)}: ${profil(x)}`).join("\n")}
${ALLE_KRAEFTE}: ${alle}`;
}

/** Fertige Mail aus mailDesign.ts mit Fußzeile und Abmelde-Link aus dem Kontext. */
function ganzeMail(k: Kontext, betreff: string, vorschau: string, teile: string[], signatur?: string): string {
  return designMail({ site: k.site, titel: betreff, vorschau, teile, signatur, email: k.email, abmeldenUrl: k.abmelden });
}

export function angebotMail(k: Kontext, a: AngebotEingabe): KundenMail {
  const kalk = a.kalkulation ?? {};
  const brutto = typeof kalk.bruttopreis === "number" && kalk.bruttopreis > 0 ? kalk.bruttopreis : 0;
  const eigen = brutto ? eigenanteilAus(kalk) : null;
  const heimDiff = eigen && HEIM_EIGENANTEIL > eigen.eigen ? HEIM_EIGENANTEIL - eigen.eigen : 0;
  const n = a.empfehlung ? Math.max(1, Math.min(5, a.empfehlung.sichtbar || 1)) : 0;
  const kraefte = (a.empfehlung?.kraefte ?? []).slice(0, ANGEBOT_KRAEFTE_MAX);
  // Der Hauptknopf führt oben ins Portal (Angebot und Pflegekräfte), die Zeilen zu den Pflegekräften.
  const start = k.portal({ m: "eb" });
  const zuKraeften = k.portal({ m: "eb", goto: "matches" });
  const zumProfil = (x: AngebotKraft) => k.portal({ cg: String(x.caregiverId), m: "eb" });

  /* Einleitung (Vorgabe): Eingekaufte Leads nennen das Portal (herkunft.ts), erneute Anfragen den angepassten Stand. Seit
     #168 steht der Gruß klein ohne Komma darüber („Guten Tag, Frau Müller“ wie im Portal), deshalb „Vielen“ groß. */
  const einstieg = a.herkunft
    ? `Vielen Dank für Ihre Anfrage über <strong style="font-weight:600;color:${D.ink};">${esc(a.herkunft)}</strong>. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.`
    : a.resubmit
    ? "Vielen Dank für Ihre erneute Anfrage. Ich habe Ihre Angaben übernommen und Ihr Angebot angepasst."
    : "Vielen Dank für Ihre Anfrage. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.";
  /* Eingekaufte Leads: woher die Angaben stammen und ob wir Lücken mit dem teureren Wert gefüllt haben (Bedingungen wie
     bis #148 in index.ts: jede `herkunft`, Färbung nach `angenommene_felder`). Rechner-Leads haben keine Herkunft. */
  const hinweis = a.herkunft ? portalAngabenHinweisText(a.herkunft, portalAngabenAngenommen(a.angenommeneFelder)) : null;
  const titel = brutto ? KOPF_TITEL_ZEILEN : TITEL_OHNE_PREIS;

  /* Vorschau (Vorschlag 08.10.2026, Vorgabe): Preis, Kündbarkeit und der nächste Schritt; der Betreff nennt schon die
     Pflegekräfte. */
  const vorschau = brutto
    ? `${euro(brutto)} € im Monat, täglich kündbar${n === 0 ? ", ohne Vermittlungsgebühr."
      : `. ${n === 1 ? "Eine passende Pflegekraft ist" : `${zahlwort(n, true)} passende Pflegekräfte sind`} für Sie ausgewählt.`}`
    : "Ihr persönliches Angebot zur 24-Stunden-Betreuung.";

  /* Betreff (Vorschlag 08.10.2026, Vorgabe): nennt, was in der Mail steckt — Angebot UND Pflegekräfte. Ohne „– Primundus",
     der Absender heißt schon „Primundus 24h-Pflege". Eingekaufte Anfragen behalten ihren Betreff. */
  const betreff = a.herkunft
    ? a.portalBetreff
    : n === 0
    ? (a.resubmit ? "Ihr aktualisiertes Angebot zur 24-Stunden-Betreuung – Primundus" : "Ihr Angebot zur 24-Stunden-Betreuung – Primundus")
    : `${a.resubmit ? "Ihr aktualisiertes Angebot" : "Ihr Angebot"} und ${n === 1 ? "eine passende Pflegekraft" : `${n} passende Pflegekräfte`}`;

  const hinweisHtml = hinweis
    ? `${dAbstand(12)}<p style="margin:0;font-size:14px;line-height:21px;color:${D.muted};">${esc(hinweis)}</p>`
    : "";
  const teile = [
    anredeTitel({ gruss: grussZeile(k.anrede), zeilen: titel, einleitung: einstieg }),
    ...(brutto ? [`${dAbstand(20)}${preiskarte({ brutto, eigen: eigen?.eigen ?? null, heimDiff, bewertung: k.bewertung ?? null })}`] : []),
    ...(hinweisHtml ? [hinweisHtml] : []),
    ...(kraefte.length ? [`${dAbstand(16)}${kraefteListe(kraefte, zumProfil, zuKraeften)}`] : []),
    `${dAbstand(24)}${absatz(PORTAL_ERKLAERUNG, { unten: 20 })}`,
    hauptknopf(start, esc(KNOPF_TITEL)),
  ];
  const html = ganzeMail(k, betreff, vorschau, teile);

  const preisText = brutto
    ? `${euro(brutto)} € / Monat
${eigen ? `Nach Zuschüssen ca. ${euro(eigen.eigen)} € im Monat\n${heimDiff ? `rund ${euro(heimDiff)} € weniger als im Pflegeheim\n` : ""}` : ""}
${warumPrimundusText(k.bewertung ?? null)}

`
    : "";
  const text = `${grussZeile(k.anrede)}

${titel.join(" ").replace(/\u00a0/g, " ")}

${klartext(einstieg)}

${preisText}${hinweis ? `${hinweis}\n\n` : ""}${kraefte.length ? `${kraefteListeText(kraefte, zumProfil, zuKraeften)}\n\n` : ""}${PORTAL_ERKLAERUNG}

${KNOPF_TITEL}: ${start}

${martaSignaturText()}`;

  return { betreff, vorschau, html, text, komplett: true };
}

// ── 02 Nudge 1 (profil_nudge_1, +4 h) ─────────────────────────────────────

/* Nudge 1 im Look des Portals (Registry #168, Entwurf g1/profil_nudge_1_neu.html): dieselbe Liste wie die Angebotsmail
   (statt der großen Profilkarten mit „★ Elite“ und Einsätzen), darunter IN der Karte der Kasten wie unter der Portal-Liste
   („Ihre Angaben sind noch unvollständig“, grüner Knopf „Pflegesituation vervollständigen“, goto=anfragen). Der Satz „… sind
   zum gewünschten Start frei“ ist weg (Verfügbarkeit je Kraft, T22; den Start fragt der Rechner nicht ab). Neu geschrieben
   nur Betreff, Vorschau und Titel; Vertragssatz wortgleich mit Mail B und dem Portal (KompaktEinstieg.tsx:519). */
export type NudgeListe = { kraefte: AngebotKraft[] };

export const NUDGE1_BETREFF = "Ihre Pflegekräfte-Auswahl: Es fehlt die Pflegesituation";
export const NUDGE1_TITEL = ["Noch ein Schritt bis", "zu Ihren Bewerbungen"] as const;
export const NUDGE1_SCHLUSS = "Jede Bewerbung bekommen Sie per E‑Mail, mit Anreisedatum und Preis. Ein Vertrag entsteht erst, wenn Sie eine Bewerbung annehmen und im Portal unterschreiben.";

export function nudge1Vorschau(vornamen: string[]): string {
  const satz = "Beschreiben Sie kurz die Pflegesituation, ca. 2 Minuten.";
  const [a, b] = vornamen;
  const n = vornamen.length;
  if (n === 0) return `${satz} Dann können sich passende Pflegekräfte bei Ihnen bewerben.`;
  if (n === 1) return `${satz} Dann kann sich ${a} bei Ihnen bewerben.`;
  if (n === 2) return `${satz} Dann können sich ${a} und ${b} bei Ihnen bewerben.`;
  const rest = n - 2;
  return `${satz} Dann können sich ${a}, ${b} und ${rest === 1 ? "eine weitere" : `${zahlwort(rest)} weitere`} bei Ihnen bewerben.`;
}

export function nudge1Mail(k: Kontext, liste: NudgeListe | null): KundenMail {
  const kraefte = (liste?.kraefte ?? []).slice(0, ANGEBOT_KRAEFTE_MAX);
  const formular = k.portal({ goto: "anfragen", m: "pn1" });
  const alle = k.portal({ goto: "matches", m: "pn1" });
  const profil = (x: AngebotKraft) => k.portal({ cg: String(x.caregiverId), m: "pn1" });
  const vorschau = nudge1Vorschau(kraefte.map((x) => x.vorname));
  // Ohne Einleitung: Der Satz „… können sich … bewerben“ stünde sonst dreimal (Einleitung, Kasten, Schlusssatz).
  // Ohne Liste (mamamia antwortet nicht) steht der Kasten allein in einer Karte.
  const teile = [
    anredeTitel({ gruss: grussZeile(k.anrede), zeilen: NUDGE1_TITEL }),
    `${dAbstand(20)}${kraefte.length ? kraefteListe(kraefte, profil, alle, formularHinweis(formular)) : karte(formularHinweis(formular), { innen: "20px 16px" })}`,
    `${dAbstand(20)}${absatz(NUDGE1_SCHLUSS.replace(/‑/g, "&#8209;"), { unten: 0 })}`,
  ];
  const text = `${grussZeile(k.anrede)}

${NUDGE1_TITEL.join(" ")}

${kraefte.length ? `${kraefteListeText(kraefte, profil, alle)}\n\n` : ""}${LISTE_UNVOLLSTAENDIG}
${LISTE_WARUM}
${LISTE_KNOPF}: ${formular}

${NUDGE1_SCHLUSS.replace(/‑/g, "-")}

${martaSignaturText()}`;
  return { betreff: NUDGE1_BETREFF, vorschau, html: ganzeMail(k, NUDGE1_BETREFF, vorschau, teile), text, komplett: true };
}

// ── 03 Nudge 2 (profil_nudge_2, +28 h) ────────────────────────────────────

/* Nudge 2 im Look des Portals (Registry #168, Entwurf g1/profil_nudge_2_neu.html): Telefon zuerst, darunter eine Karte
   „Selbst ausfüllen geht auch“ mit dem grünen Formular-Knopf. WhatsApp nur für die Terminabsprache, nie für Angaben zur
   Pflege (OpenAI-Gegencheck 15.11.); die Angaben trägt Marta am Telefon ein. Signatur ohne Kontaktzeile, weil der Text die
   Nummer schon anbietet. Beispiel „Ort und gewünschter Start“ statt „Mobilität und Einsatzort“ (die Mobilität fragt schon
   der Rechner; beides sind Pflichtfelder im Formular: plz, startDate). */
export const NUDGE2_BETREFF = "Soll ich die Angaben am Telefon mit Ihnen ausfüllen?";
export const NUDGE2_VORSCHAU = "Rufen Sie mich an, am Telefon trage ich alles für Sie ein.";
export const NUDGE2_TITEL = ["Soll ich die Angaben", "mit Ihnen ausfüllen?"] as const;
export const NUDGE2_EINLEITUNG = "Bei Ihnen kann sich noch keine Pflegekraft bewerben, weil Angaben zur Pflegesituation fehlen, zum Beispiel Ort und gewünschter Start.";
const nudge2Telefon = (tel: string, wa: string) =>
  `Rufen Sie mich an unter ${tel} oder schreiben Sie mir per ${wa}, wann ich Sie anrufen darf. Ich stelle Ihnen die Fragen am Telefon und trage alles für Sie ein.`;
/** Wörtlich aus ABLAUF_GUTE_PHASE Schritt 1 (EinstiegMinimal.tsx), davor „Selbst ausfüllen geht auch:“. */
export const NUDGE2_SELBST = "Selbst ausfüllen geht auch: Das dauert ca. 2 Minuten, einiges ist aus Ihren bisherigen Angaben schon übernommen.";

export function nudge2Mail(k: Kontext): KundenMail {
  const url = k.portal({ goto: "anfragen", m: "pn2" });
  const teile = [
    anredeTitel({ gruss: grussZeile(k.anrede), zeilen: NUDGE2_TITEL, einleitung: NUDGE2_EINLEITUNG }),
    `${dAbstand(16)}${absatz(nudge2Telefon(textlink(TELEFON_HREF, TELEFON_TEXT), textlink(WHATSAPP_HREF, "WhatsApp")), { unten: 0 })}`,
    `${dAbstand(24)}${karte(`<p style="margin:0 0 16px;font-size:16px;line-height:22px;color:${D.ink};">${NUDGE2_SELBST}</p>${formularKnopf(url)}`, { innen: "20px 16px" })}`,
  ];
  const text = `${grussZeile(k.anrede)}

${NUDGE2_TITEL.join(" ")}

${NUDGE2_EINLEITUNG}

${nudge2Telefon("089 200 000 830", `WhatsApp (${WHATSAPP_HREF})`)}

${NUDGE2_SELBST}
${LISTE_KNOPF}: ${url}

${martaSignaturText({ kontakt: false })}`;
  return {
    betreff: NUDGE2_BETREFF, vorschau: NUDGE2_VORSCHAU, text, komplett: true,
    html: ganzeMail(k, NUDGE2_BETREFF, NUDGE2_VORSCHAU, teile, martaSignatur({ kontakt: false })),
  };
}

// ── 04 Vier Dinge (warum_primundus, +48 h) ────────────────────────────────
// GESTRICHEN seit Registry #168 (kette.ts GESTRICHENE_MAILS): wird nicht mehr eingeplant, schon geplante Zeilen verfallen im
// Gestrichen-Zweig von index.ts, bevor sie hier ankämen. Der Code bleibt nur für den Testversand (Demo-Modus).

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
// GESTRICHEN seit Registry #168 wie „Vier Dinge“: sie wiederholte die Telefon-Hilfe von Nudge 2 (43 gesendet, 0 Klicks).
// Der Abschied kommt jetzt direkt aus der Kette (+72 h); eine schon geplante Nachfass-2-Zeile holt ihn im Gestrichen-Zweig
// nach (index.ts abschiedNachholen). Code bleibt nur für den Testversand.

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

// ── 06 Nachfass 3 (Abschied, +72 h) ───────────────────────────────────────

/* Abschied im Look des Portals (Registry #168, Entwurf g1/nachfass_3_neu.html): seit #168 +72 h direkt aus der Kette (bis
   dahin +48 h nach Nachfass 2, also +120 h). Eine Frage, EIN Knopf in Koralle „Ja, ich habe noch Interesse“, die zwei
   anderen Antworten als Textlinks in Taupe (Wortlaute RUECKMELDUNG_KNOEPFE, Ziele rueckmeldungLink unverändert). „Ein Klick
   genügt“ ist weg (jede Antwort öffnet noch eine Seite), der Schlusssatz ist ABSCHIED_SATZ (kette.ts). */
export const ABSCHIED_BETREFF = "Eine letzte Frage: Wie ist der Stand bei Ihnen?";
export const ABSCHIED_VORSCHAU = "Noch Interesse, später oder nicht mehr? Tippen Sie auf die passende Antwort.";
export const ABSCHIED_TITEL = ["Wie ist der Stand", "bei Ihnen?"] as const;
export const ABSCHIED_EINLEITUNG = "Ich möchte Sie nicht mit weiteren E-Mails stören. Sagen Sie mir kurz, wie es bei Ihnen weitergeht.";

/** Knöpfe der Abschiedsmail. Mit Token → /rueckmeldung, ohne → Mail an info@ (Lead-Ref im Betreff). */
export function nachfass3Mail(k: Kontext, leadRef: string): KundenMail {
  const mailto = (betreff: string, satz: string) =>
    `mailto:info@primundus.de?subject=${encodeURIComponent(`${betreff} — ${leadRef}`)}&body=${encodeURIComponent(`Guten Tag Frau Kapcio,\n\n${satz}\n`)}`;
  const ja = k.token ? rueckmeldungLink(k.site, k.token, "interesse") : mailto("Habe noch Interesse", "ich habe noch Interesse, bitte melden Sie sich bei mir.");
  const spaeter = k.token ? rueckmeldungLink(k.site, k.token, "aktuell-nicht") : mailto("Aktuell nicht — vielleicht später", "aktuell brauche ich noch keine Pflegekraft, vielleicht später.");
  const nein = k.token ? rueckmeldungLink(k.site, k.token, "nicht-relevant") : mailto("Nicht mehr relevant", "das Thema ist für mich nicht mehr relevant.");
  const zeile = (url: string, t: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid ${D.lineSoft};padding:14px 0;">${textlink(url, `${esc(t)}&nbsp;&rsaquo;`)}</td></tr></table>`;
  const teile = [
    anredeTitel({ gruss: grussZeile(k.anrede), zeilen: ABSCHIED_TITEL, einleitung: ABSCHIED_EINLEITUNG }),
    `${dAbstand(20)}${karte(`${hauptknopf(ja, esc(RUECKMELDUNG_KNOEPFE.interesse))}${dAbstand(10)}${zeile(spaeter, RUECKMELDUNG_KNOEPFE["aktuell-nicht"])}${zeile(nein, RUECKMELDUNG_KNOEPFE["nicht-relevant"])}`, { innen: "20px 16px 6px" })}`,
    `${dAbstand(20)}${absatz(ABSCHIED_SATZ, { unten: 0 })}`,
  ];
  const text = `${grussZeile(k.anrede)}

${ABSCHIED_TITEL.join(" ")}

${ABSCHIED_EINLEITUNG}

${RUECKMELDUNG_KNOEPFE.interesse}:
${ja}

${RUECKMELDUNG_KNOEPFE["aktuell-nicht"]}:
${spaeter}

${RUECKMELDUNG_KNOEPFE["nicht-relevant"]}:
${nein}

${ABSCHIED_SATZ}

${martaSignaturText()}`;
  return { betreff: ABSCHIED_BETREFF, vorschau: ABSCHIED_VORSCHAU, html: ganzeMail(k, ABSCHIED_BETREFF, ABSCHIED_VORSCHAU, teile), text, komplett: true };
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
