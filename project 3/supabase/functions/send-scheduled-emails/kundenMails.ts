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
  deutschPunkte,
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
  mKopfKarte,
  mProfil,
  mProfilText,
  mProfilZeile,
  mPunkte,
  mSchritte,
  mTitel,
  mTrenner,
  mVorschau,
  type BewerbungsAngebot,
  type PflegekraftDaten,
  mSterneZeile,
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

const pkText = mProfilText;

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

/* Eigenanteil in der Angebotsmail (Vorschlag 08.10.2026, Martin: „maximal conversionsstark mit infos"; einziger belegter
   Einwand ist „zu teuer"). Posten aus der Kalkulation des Kunden (`zuschüsse.items`, nur `in_kalkulation`) — dieselbe Rechnung
   wie „Kosten im Überblick" im Portal. Martin 03.10.: „eigenanteil betrachtet immer 3 dinge: geldleistungen,
   entlastungsbudget und steuerersparnis"; 18.09.: der Preis bleibt Bruttopreis, die Posten senken nur den Eigenanteil.
   Unbekannter Posten → kein Kasten (lieber der alte Heimvergleich als eine falsche Aufzählung). */
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
  // Angezeigter Eigenanteil = Preis minus die GERUNDETEN Posten, damit die Rechnung in den Fragen aufgeht. Weicht das um
  // mehr als 2 € von der Kalkulation ab, stimmt etwas nicht → kein Kasten.
  const eigen = brutto - posten.reduce((s: number, p: ZuschussPosten) => s + p.monat, 0);
  if (eigen <= 0 || eigen >= brutto || Math.abs(eigen - kalk.eigenanteil) > 2) return null;
  const pg = Number(kalk?.formularDaten?.pflegegrad);
  return { brutto, eigen, posten, pflegegrad: Number.isFinite(pg) ? pg : null, ehepaar: kalk?.formularDaten?.betreuung_fuer === "ehepaar" };
}

const aufzaehlung = (w: string[]): string => w.length < 2 ? (w[0] ?? "") : `${w.slice(0, -1).join(", ")} und ${w[w.length - 1]}`;

function eigenanteilSatz(e: Eigenanteil): string {
  const w = e.posten.map((p) => p.wort);
  const satz = w.length === 1
    ? `Die ${w[0]} kann Ihren Eigenanteil auf diesen Betrag senken.`
    : `${aufzaehlung(w)} können Ihren Eigenanteil auf diesen Betrag senken.`;
  // Der Rechner kennt einen Pflegegrad und zieht Pflegegeld/Entlastungsbudget einmal ab (OpenAI angebot10: bei „zwei
  // Personen" sonst missverständlich) — derselbe Satz steht in der Rechnung der Fragen.
  return e.ehepaar && e.posten.some((p) => p.name === "pflegegeld") ? `${satz} Gerechnet ist mit den Zuschüssen für eine Person.` : satz;
}
const heimSatz = (e: Eigenanteil): string => e.eigen < HEIM_EIGENANTEIL
  ? ` Zum Vergleich: Im Pflegeheim liegt der Eigenanteil im ersten Jahr bei durchschnittlich ${euro(HEIM_EIGENANTEIL)}&nbsp;€ im Monat pro Person (vdek, Stand 1.&nbsp;Juli&nbsp;2026).`
  : "";

/** Grüner Kasten unter dem Preis: „Nach Zuschüssen ca. 1.622 € im Monat" (Martins Wortlaut der Preisseite, 17.09.). */
function eigenanteilHtml(e: Eigenanteil, unten = 18): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${unten}px;border-radius:14px;background:${F.mint};border-collapse:separate;">
      <tr><td style="padding:14px 16px 15px;">
        <p style="margin:0;font-size:16.5px;font-weight:800;line-height:1.3;color:${F.greenDeep};">Nach Zuschüssen <span style="white-space:nowrap;">ca. ${euro(e.eigen)}&nbsp;€ im Monat</span></p>
        <p style="margin:6px 0 0;font-size:14px;line-height:1.55;color:${F.text};">${eigenanteilSatz(e)}${heimSatz(e)}</p>
      </td></tr>
    </table>`;
}
function eigenanteilText(e: Eigenanteil): string {
  return `Nach Zuschüssen ca. ${euro(e.eigen)} € im Monat. ${eigenanteilSatz(e)}${heimSatz(e)}`.replace(/&nbsp;/g, " ");
}

/** „So rechnen wir: 3.050 € im Monat, abzüglich 800 € Pflegegeld bei Pflegegrad 4, …" — Beträge aus der Kalkulation. */
function eigenanteilRechnung(e: Eigenanteil): string {
  const teil = (p: ZuschussPosten): string =>
    p.name === "pflegegeld" ? `${euro(p.monat)}&nbsp;€ Pflegegeld${e.pflegegrad ? ` bei Pflegegrad ${e.pflegegrad}` : ""}`
    : `bis zu ${euro(p.monat)}&nbsp;€ ${p.wort} (${euro(p.jahr)}&nbsp;€ im Jahr)`;
  const hatPflegegeld = e.posten.some((p) => p.name === "pflegegeld");
  return `So rechnen wir: ${euro(e.brutto)}&nbsp;€ im Monat, abzüglich ${aufzaehlung(e.posten.map(teil))}.`
    + (hatPflegegeld && e.ehepaar ? " Gerechnet ist mit den Zuschüssen für eine Person." : "")
    + (hatPflegegeld ? " Das Pflegegeld können Sie frei für die Betreuung einsetzen." : " Pflegegeld und Entlastungsbudget gibt es ab Pflegegrad&nbsp;2.")
    + " Die vollständige Rechnung sehen Sie im Portal unter „Kosten im Überblick“.";
}

/* Häufige Fragen der Angebotsmail (Vorschlag 08.10.2026). Martin 08.10.: was es im Portal schon gibt, wörtlich übernehmen
   („Warum hast du das nicht übernommen? Darum geht's doch."). Wörtlich aus der Portal-FAQ (FaqListe.tsx FAQ /
   FAQ_GRUNDFRAGEN, live): Deutsch-Niveaus, „Ist das legal?", „Wie läuft die Betreuung ab?", „Was brauche ich zu Hause?".
   Bestpreis-Frage = Wortlaut der Bestpreisgarantie (GARANTIE, „Marta antwortet" in Ich-Form der Absenderin); Eigenanteil-Frage
   = die Rechnung aus der Kalkulation des Kunden („Kosten im Überblick" im Portal). Martin 08.10. zu Fassung 3: „Das mit dem
   Einladen ist hier zu früh, das versteht kein Kunde … die erste Frage ist nicht gut … vielleicht Sprache" → „Gehe ich mit
   dem Einladen einen Vertrag ein?" raus, die Deutsch-Niveaus zuerst wie im Portal. Den Ablauf („Das muss auch nicht in den
   Fragen sein") tragen die Schritte unter der Angebotskarte. Bei Änderung der Portal-FAQ hier mitziehen. */
export type Frage = { frage: string; antwort: string; html?: string };

/* Deutsch-Niveaus wörtlich aus dem Portal (FaqListe.tsx FAQ[0]); statt der Balken des Portals die Punkte der Profile in der
   Mail (deutschPunkte), damit Frage und Profile gleich aussehen. */
const DEUTSCH_EINSTIEG = "Eine grobe Orientierung — kein Sprach-Zertifikat. Die genaue Kommunikation hängt immer auch vom Tempo, der Mundart und der Geduld beider Seiten ab.";
const DEUTSCH_STUFEN: { wort: string; text: string }[] = [
  { wort: "Grund", text: "einzelne Wörter und einfache Sätze. Für eine Verständigung im Alltag braucht es Geduld, Gesten und etwas Vorbereitung; differenzierte Gespräche sind in der Regel nicht möglich." },
  { wort: "Mittel", text: "einfache Alltagsthemen lassen sich besprechen, gängige Anweisungen werden meist verstanden. Bei komplexeren Themen (Diagnosen, Behörden, Telefonate) kann es zu Rückfragen oder Missverständnissen kommen." },
  { wort: "Gut", text: "die Verständigung im Alltag und in der Pflege funktioniert in der Regel zuverlässig. Auch ausführlichere Gespräche sind möglich; sehr seltene Fachbegriffe, schnelles Sprechen oder Dialekt können dennoch Nachfragen erfordern." },
];
const DEUTSCH_SCHLUSS = "Wenn Sprachsicherheit besonders wichtig ist (z. B. Demenz, schwerhörige oder spracheingeschränkte Patienten), sprechen Sie uns gerne an — wir helfen bei der Einordnung.";
const DEUTSCH_FRAGE: Frage = {
  frage: "Was bedeuten die Deutsch-Niveaus (Grund, Mittel, Gut)?",
  antwort: [DEUTSCH_EINSTIEG, ...DEUTSCH_STUFEN.map((st) => `${st.wort} — ${st.text}`), DEUTSCH_SCHLUSS].join("\n"),
  html: `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:${F.text};">${DEUTSCH_EINSTIEG}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 2px;">${DEUTSCH_STUFEN.map((st) =>
        `<tr><td style="width:44px;padding:0 0 8px;vertical-align:top;white-space:nowrap;font-size:15px;line-height:24px;">${deutschPunkte(st.wort)}</td><td style="padding:0 0 8px;font-size:15px;line-height:1.6;color:${F.text};"><strong style="color:${F.ink};">${st.wort}</strong> — ${st.text}</td></tr>`).join("")}</table>
      <p style="margin:0;font-size:15px;line-height:1.6;color:${F.text};">${DEUTSCH_SCHLUSS}</p>`,
};

export function angebotFragen(e: Eigenanteil | null): Frage[] {
  const liste: Frage[] = [
    DEUTSCH_FRAGE,
    { frage: "Ich habe ein günstigeres Angebot. Was kann ich tun?", antwort: "Bei uns zahlen Sie nie mehr als für ein vergleichbares Angebot. Legen Sie uns das Angebot vor, wir passen unseren Preis an. Ich antworte innerhalb eines Werktags." },
    { frage: "Ist das legal?", antwort: "Ja, vollständig. Die Pflegekräfte sind sozialversicherungspflichtig bei uns angestellt und werden von uns nach Deutschland entsandt. Für jeden Einsatz liegt eine offizielle A1-Bescheinigung vor — der Nachweis der Sozialversicherungspflicht im Herkunftsland." },
    { frage: "Wie läuft die Betreuung ab?", antwort: "Die Pflegekraft wird in der Regel direkt zu Ihnen nach Hause gebracht und bleibt meist 6 bis 8 Wochen. Den Wechsel zur nächsten Pflegekraft organisieren wir. Fällt eine Pflegekraft aus oder passt die Zusammenarbeit nicht, sorgen wir schnellstmöglich für Ersatz, in der Regel innerhalb von 3 Tagen." },
  ];
  if (e) liste.push({ frage: `Wie kommen die ca. ${euro(e.eigen)}&nbsp;€ Eigenanteil zustande?`, antwort: eigenanteilRechnung(e) });
  liste.push({ frage: "Was brauche ich zu Hause?", antwort: "Ein eigenes, abschließbares Zimmer mit Bett für die Pflegekraft. Küche, Bad und ein Internetanschluss sollten vorhanden sein. Zimmer und Verpflegung stellen Sie, das ist mit „Kost und Logis“ im Angebot gemeint." });
  return liste;
}

function fragenHtml(liste: Frage[]): string {
  const zeile = (f: Frage, i: number) => `
      ${i > 0 ? mTrenner(14, 14) : ""}
      <p style="margin:0 0 5px;font-size:15.5px;font-weight:700;line-height:1.4;color:${F.ink};">${f.frage}</p>
      ${f.html ?? `<p style="margin:0;font-size:15px;line-height:1.6;color:${F.text};">${f.antwort}</p>`}`;
  return mKarte(liste.map(zeile).join(""), { unten: 26 });
}
const fragenText = (liste: Frage[]): string =>
  liste.map((f) => `${f.frage}\n${f.antwort}`.replace(/&nbsp;/g, " ")).join("\n\n");

export type AngebotEingabe = {
  kalkulation: Record<string, any> | null | undefined;
  careStartTiming: string | null | undefined;
  /** Anzeigename des Portals bei eingekauften Leads, sonst null. */
  herkunft: string | null;
  portalBetreff: string;
  /** Hinweis über der Angaben-Tabelle (eingekaufte Leads), HTML und Text. */
  angabenHinweis: { html: string; text: string } | null;
  resubmit: boolean;
  /** Empfehlung aus mamamia; null/undefined → Abschnitt fällt weg. `weitere` = die übrigen sichtbaren Kräfte in
   *  Portal-Reihenfolge (Martin 07.10.2026: „die oberste als Empfehlung, die anderen trotzdem zeigen"). */
  empfehlung?: { e: Empfehlung; cid: string | null; sichtbar: number; weitere?: { e: Empfehlung; cid: string | null }[] } | null;
  /** „06.10.2026" — Datum des Angebots wie die Kopfleiste im Portal (AngebotKopfleiste, `lead.created_at`). */
  datum?: string | null;
  /** Variante B (Vorschlag 07.10.2026, Entscheidung Martin offen): die weiteren Kräfte als kompakte Zeilen statt als volles Profil. */
  weitereKompakt?: boolean;
};

function angabenTabelle(fd: Record<string, any>, careStartTiming: string | null | undefined): { html: string; text: string } {
  const psLabel = "font-size:11px;font-weight:700;color:#9a8a73;letter-spacing:.08em;text-transform:uppercase;";
  const zeilen1: [string, string][] = [
    ["Betreuung für", eingangsLabel("betreuung_fuer", fd.betreuung_fuer)],
    ["Pflegegrad", fd.pflegegrad ? `Pflegegrad ${fd.pflegegrad}` : "Nicht angegeben"],
    ["Weitere Personen im Haushalt", eingangsLabel("weitere_personen", fd.weitere_personen)],
    ["Mobilität", eingangsLabel("mobilitaet", fd.mobilitaet)],
    ["Nachteinsätze erforderlich", eingangsLabel("nachteinsaetze", fd.nachteinsaetze)],
  ];
  /* Der Rechner fragt seit dem Umbau keinen Start mehr ab (care_start_timing = null): ohne Wert keine Zeile, sonst stand bei
     jedem Kunden „Gewünschter Start: Nicht angegeben". Eingekaufte Anfragen bringen den Wert teils mit. */
  if (careStartTiming) zeilen1.push(["Gewünschter Start", eingangsLabel("care_start_timing", careStartTiming)]);
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

/* „So geht es weiter" direkt unter der Angebotskarte, wie im Portal (Fassung 30: Karte, dann die Schritte, dann die
   Pflegekräfte), in einer weißen Karte ohne Trennlinien; Schritt 1 hervorgehoben, darunter der Link des Portals. Martin 08.10. zu Fassung 3
   („ich habe gar nicht gesehen, ob er in der Mail ist … wenn ich das jetzt gelesen habe, wie geht's weiter? … schauen sich
   die Pflegekräfte an, vervollständigen das Profil, damit sich Pflegekräfte bei Ihnen bewerben können und Sie welche
   einladen können … Dann erhalten Sie Bewerbung, Sie entscheiden und erst dann wird der Vertrag geschlossen und dann
   organisieren wir alles"; davor: „sie rufen an oder gehen ins Portal … Bis dahin zahlen sie nicht, kündbar"). Schritt 1
   und 2 wörtlich wie im Portal (KompaktEinstieg.tsx ABLAUF; Martin 08.10. zu Fassung 4: „der erste Schritt passt nicht mehr
   so ganz … vereinheitlichen, wie im Kundenportal"), einzige Anpassung „hier im Portal" → „im Portal"; bei Änderung beide
   Stellen. Schritt 3 und 4 gibt es nur in der Mail. Fakten: Anreise ab 3 Tagen nach der Zusage, Wechsel und Ersatz bei Ausfall
   (Portal-FAQ), Kosten erst, wenn die Pflegekraft da ist, täglich kündbar (vier Punkte), Erreichbarkeit täglich 8–20 Uhr per
   Telefon und WhatsApp; „Wir sind immer da" ist so nicht belegt. OpenAI angebot11: „Vertretung" → Ersatz bei Ausfall,
   „ab 3 Tagen nach Ihrer Zusage". */
const SCHRITTE_ANGEBOT = [
  { titel: "Pflegesituation ergänzen und Pflegekräfte einladen", text: "Ergänzen Sie kurz die Pflegesituation. Pflegekräfte, die Ihnen zusagen, laden Sie gleich mit ein, kostenlos und unverbindlich." },
  { titel: "Bewerbungen erhalten", text: "Danach bewerben sich passende Pflegekräfte bei Ihnen, mit Foto und Erfahrung. Jede Bewerbung sehen Sie im Portal und erhalten sie per E\u2011Mail." },
  { titel: "Sie entscheiden", text: "Sie wählen Ihre Pflegekraft aus. Erst dann unterschreiben Sie den Vertrag online. Er ist täglich kündbar, und bis die Pflegekraft bei Ihnen ist, zahlen Sie nichts." },
  { titel: "Wir kümmern uns um alles", text: "Wir organisieren die Anreise, den Wechsel der Pflegekraft und bei einem Ausfall den Ersatz. Anreisen kann die Pflegekraft schon ab 3 Tagen nach Ihrer Zusage. Ich bin täglich von 8 bis 20 Uhr für Sie da, am Telefon und per\u00a0WhatsApp." },
];
const SCHRITT1_LINK = "Jetzt vervollständigen&nbsp;›";

/* Einleitung und Testsieger-Satz wörtlich aus dem Portal (src/components/portal/KompaktEinstieg.tsx EINLEITUNG = Martins
   Diktat 06.10.2026, EINLEITUNG_TESTSIEGER; live seit Fassung 30). Martin 08.10. zur Mail: „du solltest doch auch die
   Einleitung machen … gerne übernehmen wir die Betreuung … Warum hast du das nicht übernommen? Darum geht's doch."
   Das Siegel steht in der Mail schon im Kopf, deshalb hier nur der Satz. Bei Änderung beide Stellen. */
const EINLEITUNG = "Gerne übernehmen wir die Rund-um-Betreuung und entlasten Ihre Familie. Unsere Pflegekräfte sind bei uns angestellt. Wir kümmern uns seit über 20 Jahren um die komplette Abwicklung von Anfang bis Ende.";
const EINLEITUNG_TESTSIEGER = "Für unseren Service hat uns DIE WELT nun zum sechsten Mal in Folge als Testsieger ausgezeichnet.";

/* Unter „Pflegekräfte einladen": der Achtung-Hinweis des Portals (KompaktEinstieg.tsx, „Achtung: Es fehlen noch Angaben zur
   Pflegesituation" + Satz, OpenAI mutig18/20), ohne „Achtung:". Die Zeile über den Pflegekräften ist die des Portals
   („Echte Profile, ausgewählt nach Ihren Angaben."). */
const EINLADEN_HINWEIS = "Es fehlen noch Angaben zur Pflegesituation. Erst damit kennen die Pflegekräfte den Einsatz und können sich bewerben. Dauert etwa 2 Minuten, vieles ist schon ausgefüllt.";
const KRAEFTE_ZEILE = "Echte Profile, ausgewählt nach Ihren Angaben.";

/** „für eine Person mit Pflegegrad 4" — Spiegel von angebotFuer (KompaktEinstieg.tsx); fehlende Angaben entfallen. */
export function angebotFuer(fd: Record<string, unknown> | null | undefined): string | null {
  const wer = fd?.betreuung_fuer === "1-person" ? "eine Person" : fd?.betreuung_fuer === "ehepaar" ? "zwei Personen" : null;
  const pg = fd?.pflegegrad;
  const grad = typeof pg === "number" || (typeof pg === "string" && /^\d$/.test(pg))
    ? (Number(pg) === 0 ? "ohne Pflegegrad" : `mit Pflegegrad ${pg}`)
    : null;
  if (!wer) return null;
  return grad ? `für ${wer} ${grad}` : `für ${wer}`;
}

export function angebotMail(k: Kontext, a: AngebotEingabe): KundenMail {
  const kalk = a.kalkulation ?? {};
  const fd = (kalk.formularDaten ?? {}) as Record<string, any>;
  const brutto = typeof kalk.bruttopreis === "number" && kalk.bruttopreis > 0 ? kalk.bruttopreis : 0;
  const heim = heimVergleich(kalk);
  // Eigenanteil-Kasten statt Heimvergleich-Zeile; ohne lesbare Posten bleibt der Heimvergleich wie bisher.
  const eigen = brutto ? eigenanteilAus(kalk) : null;
  const emp = a.empfehlung ?? null;
  const n = emp ? Math.max(1, Math.min(5, emp.sichtbar || 1)) : 0;
  // Martin 03.10.2026: wie vor dem 26.09. auf Angebot und Pflegekräfte (Portal oben), nicht direkt ins Formular.
  const start = k.portal({ m: "eb" });

  /* Einstieg wie der Kopf des Portals (Martin 08.10.): „Hier ist Ihr Angebot" mit dem Titel des Portals („Ihr Angebot zur
     24-Stunden-Betreuung"), danach seine Einleitung und der Testsieger-Satz. Die Pflegekräfte nennen Betreff, Vorschau und
     ihr eigener Abschnitt. */
  const einstieg = a.herkunft
    ? `vielen Dank für Ihre Anfrage über ${mb(esc(a.herkunft))}. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.`
    : a.resubmit
    ? "vielen Dank für Ihre erneute Anfrage. Ich habe Ihre Angaben übernommen und Ihr Angebot angepasst."
    : "vielen Dank für Ihre Anfrage. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.";
  const einleitungHtml = `${EINLEITUNG.replace("Rund-um-Betreuung", '<span style="white-space:nowrap;">Rund-um-Betreuung</span>')} ${EINLEITUNG_TESTSIEGER}`;
  /* Angebotskarte wie im Portal (Fassung 30, live seit 06.10.2026): Kopfleiste „Ihr Angebot vom …", Leistung mit Grundlage,
     Preis „im Monat" mit dem Satz des Portals, darunter Knopf, Sterne, die vier Punkte und zuletzt der Eigenanteil (grüner
     Kasten gegen „zu teuer"; Martin 08.10. zu Fassung 3: „trotzdem die vier Vorteile machen und dann nach den Zuschüssen, so
     wie im Portal"). Ohne Siegel-Zeile: Der Testsieger steht wie im Portal (Runde 32) bei der Einleitung. */
  const leistung = angebotFuer(fd);
  const kostenInhalt = `
    <p style="margin:0;font-size:17px;font-weight:700;line-height:1.3;color:${F.ink};">Rund-um-Betreuung zu Hause</p>
    ${leistung ? `<p style="margin:2px 0 0;font-size:15px;line-height:1.4;color:${F.muted};">${esc(leistung.charAt(0).toUpperCase() + leistung.slice(1))}</p>` : ""}
    ${brutto ? `<p style="margin:16px 0 0;line-height:1;"><span style="font-size:44px;font-weight:800;letter-spacing:-.03em;color:${F.ink};">${euro(brutto)}&nbsp;€</span><span style="font-size:16px;color:${F.muted};">&nbsp; im Monat</span></p>
    <p style="margin:10px 0 18px;font-size:14.5px;line-height:1.55;color:${F.muted};">Lohn, Steuern, Gebühren: alles drin. Dazu kommen Kost und Logis, <span style="white-space:nowrap;">125&nbsp;€ Reisekosten</span> pro Fahrt und <span style="white-space:nowrap;">Feiertagszuschläge.</span></p>` : mAbstand(16)}
    ${mKnopf(start, "Angebot &amp; Pflegekräfte ansehen", 2, k.bewertung ? 10 : 18, { schrift: 16, innen: 12 })}
    ${k.bewertung ? mSterneZeile(k.bewertung, 18) : ""}
    ${mPunkte(null)}
    ${mKlein("Kosten entstehen erst, wenn die Pflegekraft bei Ihnen ist.", eigen ? 16 : 0)}
    ${eigen ? eigenanteilHtml(eigen, 0) : ""}
    ${!eigen && heim ? `${mTrenner()}${heimHtml(heim, 0)}` : ""}`;
  const kosten = mKopfKarte(a.datum ? `Ihr Angebot vom ${a.datum}` : "Ihr Angebot", "neutral", kostenInhalt, 26);

  /* Pflegekräfte wie im Portal (Martin 07.10.2026: „die oberste als Empfehlung, die anderen trotzdem zeigen, damit die das
     sehen, dass wir hier fünf Pflegekräfte ausgesucht haben … damit sie bloß in das Portal gehen"): Empfehlung mit Gründen,
     darunter die übrigen sichtbaren Kräfte im selben Profil „V", dann EIN Knopf zum Abschnitt „Pflegesituation ergänzen und
     Pflegekräfte einladen" (`goto=matches`). Jedes Profil öffnet im Portal genau diese Pflegekraft (`cg=`). */
  let empfHtml = "";
  let empfText = "";
  if (emp) {
    const profilUrl = (e: Empfehlung) => k.portal({ cg: String(e.caregiverId), m: "eb" });
    const einladen = k.portal({ goto: "matches", m: "eb" });
    const pk = pkAusEmpfehlung(emp.e, emp.cid);
    const weitere = emp.weitere ?? [];
    const grund = (t: string) => `<tr><td style="width:24px;padding:0 0 7px;color:${F.green};font-weight:800;font-size:15px;line-height:1.45;vertical-align:top;">&#10003;</td><td style="padding:0 0 7px;font-size:15px;line-height:1.45;color:${F.ink};">${esc(t)}</td></tr>`;
    const gruende = emp.e.gruende.length
      ? `<p style="margin:16px 0 8px;font-size:15px;font-weight:700;color:${F.ink};">Passt zu Ihrer Anfrage</p><table role="presentation" cellpadding="0" cellspacing="0">${emp.e.gruende.map(grund).join("")}</table>`
      : "";
    const knopf = n === 1 ? "Pflegekraft einladen" : "Pflegekräfte einladen";
    const weitereKopf = weitere.length === 1 ? "Eine weitere passende Pflegekraft" : `${zahlwort(weitere.length, true)} weitere passende Pflegekräfte`;
    const titel = n === 1 ? "Ihre passende Pflegekraft" : `Ihre ${n} passenden Pflegekräfte`;
    empfHtml = `${mAbschnitt("Für Sie ausgewählt", titel)}
    ${mKlein(KRAEFTE_ZEILE, 14)}
    ${mKopfKarte("Unsere Empfehlung für Sie", "neutral", `${mProfil(pk, profilUrl(emp.e))}${gruende}`, 14)}
    ${weitere.length ? mKopfKarte(weitereKopf, "neutral", weitere.map((w, i) => a.weitereKompakt
      ? mProfilZeile(pkAusEmpfehlung(w.e, w.cid), profilUrl(w.e), i < weitere.length - 1 ? 8 : 0)
      : mProfil(pkAusEmpfehlung(w.e, w.cid), profilUrl(w.e), i < weitere.length - 1 ? 12 : 0)).join(""), 14) : ""}
    ${mKnopf(einladen, knopf, 4, 10, { schrift: 16, innen: 12 })}
    ${mKlein(EINLADEN_HINWEIS, 30, true)}`;
    empfText = `FÜR SIE AUSGEWÄHLT: ${titel}
${KRAEFTE_ZEILE}
Unsere Empfehlung für Sie: ${pkText(pk)}
${emp.e.gruende.map((g) => `✓ ${g}`).join("\n")}
Profil: ${profilUrl(emp.e)}
${weitere.length ? `\n${weitereKopf.toUpperCase()}\n${weitere.map((w, i) => `${i + 1}. ${pkText(pkAusEmpfehlung(w.e, null)).replace("\n", " · ")}\n   Profil: ${profilUrl(w.e)}`).join("\n")}\n` : ""}
${knopf}: ${einladen}
${EINLADEN_HINWEIS}

`;
  }

  const schrittLink = k.portal({ goto: "matches", m: "eb" });
  const schritte = SCHRITTE_ANGEBOT.map((st, i) => i === 0
    ? { ...st, zustand: "jetzt" as const, text: `${st.text}<br><span style="display:inline-block;margin-top:6px;">${mLink(schrittLink, SCHRITT1_LINK)}</span>` }
    : st);
  const angaben = angabenTabelle(fd, a.careStartTiming);
  const hinweisHtml = a.angabenHinweis ? a.angabenHinweis.html : "";
  const fragen = angebotFragen(eigen);

  /* Vorschau (Vorschlag 08.10.2026): Preis, Kündbarkeit und der nächste Schritt; der Betreff nennt schon die Pflegekräfte. */
  const vorschau = brutto
    ? `${euro(brutto)} € im Monat, täglich kündbar${n === 0 ? ", ohne Vermittlungsgebühr."
      : `. ${n === 1 ? "Eine passende Pflegekraft ist" : `${zahlwort(n, true)} passende Pflegekräfte sind`} für Sie ausgewählt.`}`
    : "Ihr persönliches Angebot zur 24-Stunden-Betreuung.";

  /* Schlusssatz wie in der Mail seit 03.10.2026 (freigegeben); die Erreichbarkeit steht direkt darunter auf Martas Karte. */
  const kontaktSatz = "Wenn Sie Fragen zum Angebot haben, rufen Sie mich an, schreiben Sie mir per WhatsApp oder antworten Sie auf diese E-Mail.";
  const angabenZeile = "Stimmt etwas nicht? Antworten Sie auf diese E-Mail, dann passen wir Ihr Angebot an.";

  const html = `${mVorschau(vorschau)}
    ${gruss(k)}
    ${mp(einstieg, 14)}
    ${mp(einleitungHtml, 24)}
    ${kosten}
    ${mAbschnitt("In vier Schritten", "So geht es weiter")}
    ${mKarte(mSchritte(schritte), { unten: 26 })}
    ${empfHtml}
    ${mAbschnitt("Ihre Angaben", "Grundlage Ihres Angebots")}
    ${mKlein(angabenZeile, 14)}
    ${hinweisHtml}
    ${angaben.html}
    ${mAbstand(18)}
    ${mAbschnitt("Gut zu wissen", "Häufige Fragen")}
    ${fragenHtml(fragen)}
    ${mKnopf(start, "Angebot &amp; Pflegekräfte ansehen", 0, 22, { schrift: 16, innen: 12 })}
    ${mp(kontaktSatz, 8)}
    ${k.marta}`;

  const text = `${k.anrede},

${klartext(einstieg)}

${EINLEITUNG} ${EINLEITUNG_TESTSIEGER}

${a.datum ? `IHR ANGEBOT VOM ${a.datum}` : "IHR ANGEBOT"}
Rund-um-Betreuung zu Hause${leistung ? ` ${leistung}` : ""}
${brutto ? `${euro(brutto)} € im Monat. Lohn, Steuern, Gebühren: alles drin. Dazu kommen Kost und Logis, 125 € Reisekosten pro Fahrt und Feiertagszuschläge.
` : ""}
Angebot & Pflegekräfte ansehen: ${start}
${k.bewertung ? `★★★★★ ${k.bewertung.schnitt} von 5 aus ${k.bewertung.anzahl} Bewertungen: https://primundus.de/erfahrungen\n` : ""}
${punkteText()}
Kosten entstehen erst, wenn die Pflegekraft bei Ihnen ist.
${eigen ? `\n${eigenanteilText(eigen)}\n` : ""}${!eigen && heim ? `\n${heimText(heim)}\n` : ""}
SO GEHT ES WEITER
${SCHRITTE_ANGEBOT.map((st, i) => `${i + 1}. ${st.titel}: ${st.text.replace("\u2011", "-")}`).join("\n")}
Jetzt vervollständigen: ${schrittLink}

${empfText}
GRUNDLAGE IHRES ANGEBOTS
${angabenZeile}

${a.angabenHinweis ? `${a.angabenHinweis.text}\n\n` : ""}${angaben.text}

HÄUFIGE FRAGEN
${fragenText(fragen)}

Angebot & Pflegekräfte ansehen: ${start}

${kontaktSatz}

${MARTA_TEXT}`;

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
