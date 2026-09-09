/* ─── Mails an einen Vermittler ──────────────────────────────────────────
 *
 * Der Empfaenger ist kein Endkunde, sondern ein Geschaeftspartner, der fuer
 * SEINEN Kunden anfragt und unsere Preise mit seiner Provision weitergibt.
 * Das aendert drei Dinge gegenueber jeder Kundenmail:
 *
 *  1. Es gibt KEIN Kundenportal fuer ihn — also keinen Button, keine
 *     Profil-Links, keinen Abmelde-Link. Der Token des Leads darf in diesen
 *     Mails nirgends auftauchen: er oeffnet das Portal des Kunden
 *     (buildPortalUrl nutzt denselben Wert wie /abmelden?token=).
 *  2. Der Preis bekommt einen Provisionsblock: unser Tagessatz, seine
 *     Provision, was sein Kunde am Ende zahlt.
 *  3. Die Kunden-Konditionen sind hier VERBOTEN. "Keine
 *     Vermittlungsgebuehren" und "Direktanbieter ohne Vermittler" stehen an
 *     rund zehn Stellen im Repo — neben einem Provisionsblock waeren sie ein
 *     Widerspruch. Die Konditionen unten sind die der Vorlage.
 *
 * Das Modul baut nur den INHALT. Rahmen (buildEmailWrapper), Signatur und
 * das Laden der Fotos bleiben in index.ts — dort liegen sie schon, und
 * index.ts ist wegen `Deno.serve` auf oberster Ebene nicht importierbar.
 */

import {
  type Empfehlung,
  deutschBalken,
  esc,
  fotoErsatz,
  fotoImg,
  textAusblenden,
  zahlwort,
} from "./empfehlung.ts";

const KORALLE = "#E76F63";
const BRAUN = "#8B7355";

/** Anreise pauschal, Wortlaut wie in der Kundenmail. */
export const ANREISE_HINWEIS = "zzgl. ca. 125 € Anreise- und Abreisekosten je Strecke.";

export interface VermittlerPreis {
  /** Unser Monatssatz (brutto), wie er in der Kalkulation steht. */
  monatssatz: number;
  /** Unser Tagessatz — dieselbe Rechnung wie in der Kundenmail. */
  tagessatz: number;
  /** Was der Kunde des Vermittlers pro Tag zahlt. */
  kundeTagessatz: number;
  provisionProTag: number;
}

/**
 * Preiszeilen der Mail. Der Kundenpreis rechnet auf dem ANGEZEIGTEN
 * Tagessatz weiter, nicht auf der ungerundeten Zahl — sonst stimmt die
 * Addition im Kopf des Lesers nicht (88 + 10 = 98).
 */
export function vermittlerPreis(bruttopreis: number, provisionProTag: number): VermittlerPreis {
  const monatssatz = Math.round(bruttopreis);
  const tagessatz = Math.round(bruttopreis / 30);
  return {
    monatssatz,
    tagessatz,
    provisionProTag,
    kundeTagessatz: tagessatz + provisionProTag,
  };
}

const eur = (n: number) => n.toLocaleString("de-DE");

export interface AngebotDaten {
  /** Grussformel, Beraterinnen-Karte, Vertrauensleiste und Presselogos —
   *  fertiges HTML aus buildMartaSig(). Wird HEREINGEREICHT, weil index.ts
   *  `Deno.serve` auf oberster Ebene hat und deshalb nicht importierbar ist.
   *  Ohne diesen Block sah die Vermittler-Mail neben jeder Kundenmail
   *  unfertig aus: kein "Mit freundlichen Gruessen", keine Ansprechpartnerin,
   *  keine Telefonnummer, keine Siegel. */
  signatur: string;
  /** "Hallo Herr Walde," — index.ts baut die Anrede aus dem Lead. */
  anrede: string;
  /** "Familie Schmidt" oder null, wenn die Anfrage keinen Namen nannte. */
  kundeLabel: string | null;
  bruttopreis: number;
  provisionProTag: number;
  /** Die eine vorgestellte Kraft — null, wenn mamamia nichts lieferte. */
  empfehlung: Empfehlung | null;
  /** Wie viele Kraefte insgesamt passen (fuer die Ankuendigung von Mail 2). */
  sichtbarGesamt: number;
  /** CID des Fotos, null → Initialen-Kachel. */
  fotoCid: string | null;
}

/* "Familie Schmidt" bzw. eine Umschreibung. Der Ersatz muss dem Fall des
 * Satzes folgen — ein Name ist in allen Faellen gleich, "Ihr Kunde" nicht,
 * und "von Ihren Kunden zahlt damit" liest sich wie ein Textbaustein-Unfall. */
type Kasus = "nom" | "akk" | "dat";
const ERSATZ: Record<Kasus, string> = {
  nom: "Ihr Kunde",
  akk: "Ihren Kunden",
  dat: "Ihrem Kunden",
};
function kunde(label: string | null, kasus: Kasus = "akk"): string {
  return label ? esc(label) : ERSATZ[kasus];
}

const p = (t: string) =>
  `<p style="font-size:15px;line-height:1.75;color:#444;margin:0 0 16px;">${t}</p>`;

const LABEL = "font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;";

function preisBlock(pr: VermittlerPreis, label: string | null): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 26px;background:#FAF8F4;border-radius:10px;overflow:hidden;">
      <tr>
        <td class="price-stage-cell" style="width:50%;padding:22px 24px 18px;border-right:1px solid #ebe2d2;vertical-align:top;">
          <p style="margin:0 0 8px;${LABEL}color:#9a8a73;">Tagessatz</p>
          <p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#2D1F0F;line-height:1.15;">${eur(pr.tagessatz)}&nbsp;€<span style="font-size:14px;font-weight:500;color:#9a8a73;"> / Tag</span></p>
          <p style="margin:0;font-size:12px;color:#9a8a73;line-height:1.5;">inkl. Steuern &amp; Sozialabgaben</p>
        </td>
        <td class="price-stage-cell" style="width:50%;padding:22px 24px 18px;vertical-align:top;">
          <p style="margin:0 0 8px;${LABEL}color:#9a8a73;">Monatssatz</p>
          <p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#2D1F0F;line-height:1.15;">${eur(pr.monatssatz)}&nbsp;€<span style="font-size:14px;font-weight:500;color:#9a8a73;"> / Monat</span></p>
          <p style="margin:0;font-size:12px;color:#9a8a73;line-height:1.5;">zzgl. Kost &amp; Logis</p>
        </td>
      </tr>
      <tr><td colspan="2" style="padding:14px 24px 16px;border-top:1px solid #ebe2d2;">
        <p style="margin:0;font-size:13px;line-height:1.7;color:#666;">${ANREISE_HINWEIS}</p>
      </td></tr>
      <tr><td colspan="2" style="padding:14px 24px 16px;border-top:1px solid #ebe2d2;background:#F3EFE7;">
        <p style="margin:0 0 4px;${LABEL}color:${BRAUN};">Ihre Provision</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#2D1F0F;">Ihre Provision von <strong>${eur(pr.provisionProTag)}&nbsp;€/Tag</strong> kommt auf den Preis. ${kunde(label, "nom")} zahlt damit <strong>${eur(pr.kundeTagessatz)}&nbsp;€/Tag</strong>.</p>
      </td></tr>
      <tr><td colspan="2" style="padding:16px 24px 20px;border-top:1px solid #ebe2d2;">
        <p style="margin:0 0 10px;${LABEL}color:#2A9D5C;">Konditionen</p>
        <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#2D1F0F;"><span style="color:#2A9D5C;font-weight:700;">&#10003;</span>&nbsp;&nbsp;Täglich kündbar</p>
        <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#2D1F0F;"><span style="color:#2A9D5C;font-weight:700;">&#10003;</span>&nbsp;&nbsp;Tagesgenaue Abrechnung</p>
        <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#666;">Kosten entstehen erst, wenn die Betreuungskraft vor Ort ist.</p>
      </td></tr>
    </table>`;
}

/** Sprachbalken der Deutsch-Kachel (drei Striche, gefuellt nach Stufe). */
function balken(stufen: number): string {
  return [1, 2, 3].map((i) =>
    `<td width="14" style="width:14px;padding-right:3px;"><div style="width:12px;height:6px;border-radius:3px;background:${i <= stufen ? BRAUN : "#D4D4D8"};font-size:0;line-height:0;">&nbsp;</div></td>`
  ).join("");
}

/* Die Stufe ist das Vertrauenssignal der Karte und sieht in der GANZEN Mail
 * gleich aus — gefuellte Pille in Primundus-Braun (Martin, 08.09.2026).
 * Eigene Zeile ueber die volle Kartenbreite: in der Namensspalte teilte sie
 * sich den Platz mit dem 80-px-Foto und brach auf dem Handy mehrzeilig um.
 * Wo eine Einsatzzahl da ist, traegt sie die Zeile — sie IST der Beleg;
 * sonst steht die Kurzaussage der Stufe da. */
function stufenZeile(e: Empfehlung): string {
  if (!e.stufe) return "";
  const zahlUndAussage = e.einsaetze > 0
    ? `${e.einsaetze} ${e.einsaetze === 1 ? "Einsatz" : "Einsätze"}`
    : e.stufeZusatz;
  return `<tr><td colspan="3" style="padding:8px 0 0;font-size:15px;font-weight:600;line-height:1.6;color:#18181B;">
        <span style="display:inline-block;font-size:12px;font-weight:700;letter-spacing:.03em;color:#ffffff;background:${BRAUN};border-radius:999px;padding:4px 12px;white-space:nowrap;vertical-align:middle;">${esc(e.stufe)}</span><span style="vertical-align:middle;">&nbsp;&nbsp;${esc(zahlUndAussage)}</span>
      </td></tr>`;
}

function foto(e: Empfehlung, cid: string | null, px: number, radius: number, schrift: number): string {
  return cid ? fotoImg(cid, esc(e.anzeigeName), px, radius) : fotoErsatz(e.vorname, px, radius, schrift);
}

/** Die grosse Karte: eine Kraft, so wie das Profil im Portal sie zeigt —
 *  aber ohne jeden Link dorthin. */
function empfehlungsKarte(e: Empfehlung, cid: string | null): string {
  const ueber = textAusblenden(e.vorstellung);
  const haken = [
    "Entspricht dem angefragten Profil",
    ...e.gruende.filter((g) => g !== "Entspricht Ihrem Wunschprofil"),
  ].slice(0, 3);
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:26px 0;">
      <tr><td>
        <p style="margin:0 0 14px;font-size:17px;font-weight:700;line-height:1.35;color:#2D1F0F;">Eine passende Betreuungskraft</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:2px solid ${BRAUN};border-radius:16px;background:#ffffff;">
          <tr><td style="padding:13px 20px;background:#FAF8F4;border-bottom:1px solid #EBE2D2;border-radius:15px 15px 0 0;${LABEL}letter-spacing:.09em;color:${KORALLE};">Unsere Empfehlung</td></tr>
          <tr><td style="padding:20px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
              <td width="80" style="width:80px;vertical-align:middle;">${foto(e, cid, 80, 16, 28)}</td>
              <td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>
              <td style="vertical-align:middle;">
                <p style="margin:0;font-size:20px;font-weight:700;line-height:1.3;color:#18181B;">${esc(e.anzeigeName)}${e.alter ? `<span style="font-size:14px;font-weight:400;color:#A1A1AA;">&nbsp;&nbsp;${e.alter} J.</span>` : ""}</p>
              </td>
            </tr>${stufenZeile(e)}</table>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0 0;"><tr>
              <td width="50%" style="width:50%;vertical-align:top;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #D4D4D8;border-radius:12px;background:#ffffff;"><tr><td style="padding:10px 12px;"><p style="margin:0 0 4px;font-size:13px;line-height:1.4;color:#71717A;">Erfahrung</p><p style="margin:0;font-size:16px;font-weight:700;color:${BRAUN};">${esc(e.erfahrungKurz)}</p></td></tr></table></td>
              <td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
              <td width="50%" style="width:50%;vertical-align:top;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #D4D4D8;border-radius:12px;background:#ffffff;"><tr><td style="padding:10px 12px;"><p style="margin:0 0 4px;font-size:13px;line-height:1.4;color:#71717A;">Deutschkenntnisse</p><table cellpadding="0" cellspacing="0" role="presentation"><tr>${balken(e.deutschBalken)}<td style="padding-left:5px;font-size:16px;font-weight:700;color:#18181B;">${esc(e.deutschWort ?? "—")}</td></tr></table></td></tr></table></td>
            </tr></table>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:14px 0 0;">${
              haken.map((h) => `<tr><td style="padding:0 0 7px;font-size:15px;line-height:1.5;color:#3F3F46;"><span style="color:#22A06B;font-weight:700;">&#10003;</span>&nbsp;&nbsp;${esc(h)}</td></tr>`).join("")
            }</table>
            ${ueber.klar ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:18px 0 0;"><tr><td style="padding-top:16px;border-top:1px solid #EFEAE2;"><p style="margin:0 0 8px;font-size:17px;font-weight:700;line-height:1.4;color:#18181B;">Über ${esc(e.vorname)}</p><p style="margin:0;font-size:16px;line-height:1.65;color:#18181B;">${esc(ueber.klar)}<span style="color:#A9A9B0;">${esc(ueber.blass)}</span>${ueber.gekuerzt ? "…" : ""}</p></td></tr></table>` : ""}
          </td></tr>
        </table>
      </td></tr>
    </table>`;
}

/** Mail 1: Angebot mit Provision, dazu eine passende Kraft. */
export function vermittlerAngebotHtml(d: AngebotDaten): string {
  const pr = vermittlerPreis(d.bruttopreis, d.provisionProTag);
  const hatEmpfehlung = d.empfehlung !== null;
  const weitere = d.sichtbarGesamt > 1;
  return [
    p(esc(d.anrede)),
    p(`vielen Dank für Ihre Anfrage für die Betreuung von <strong style="color:#2D1F0F;">${kunde(d.kundeLabel, "dat")}</strong>. ${
      hatEmpfehlung
        ? "Anbei unser Angebot &ndash; und eine Betreuungskraft, die zu den Angaben passt und im gewünschten Zeitraum verfügbar ist."
        : "Anbei unser Angebot."
    }`),
    preisBlock(pr, d.kundeLabel),
    hatEmpfehlung ? empfehlungsKarte(d.empfehlung!, d.fotoCid) : "",
    /* Nur ankuendigen, was Mail 2 auch liefern kann: steht nur eine Kraft
       zur Verfuegung, waere "weitere folgen" ein Versprechen ins Blaue. */
    weitere ? p("Weitere passende Betreuungskräfte sende ich Ihnen in den nächsten Stunden.") : "",
    p("Melden Sie sich einfach bei mir, wenn wir die Vermittlung anstoßen sollen. Ein kurzes Wort genügt, den Rest übernehmen wir."),
    d.signatur,
  ].filter(Boolean).join("\n");
}

export function vermittlerAngebotText(d: AngebotDaten): string {
  const pr = vermittlerPreis(d.bruttopreis, d.provisionProTag);
  const zeilen = [
    d.anrede,
    "",
    `vielen Dank für Ihre Anfrage für die Betreuung von ${d.kundeLabel ?? "Ihrem Kunden"}.`,
    "",
    `Tagessatz:   ${eur(pr.tagessatz)} € / Tag (inkl. Steuern & Sozialabgaben)`,
    `Monatssatz:  ${eur(pr.monatssatz)} € / Monat (zzgl. Kost & Logis)`,
    ANREISE_HINWEIS,
    "",
    `Ihre Provision von ${eur(pr.provisionProTag)} €/Tag kommt auf den Preis. ${
      d.kundeLabel ?? "Ihr Kunde"} zahlt damit ${eur(pr.kundeTagessatz)} €/Tag.`,
    "",
    "Konditionen: täglich kündbar, tagesgenaue Abrechnung.",
    "Kosten entstehen erst, wenn die Betreuungskraft vor Ort ist.",
  ];
  if (d.empfehlung) {
    const e = d.empfehlung;
    zeilen.push("", "UNSERE EMPFEHLUNG",
      `${e.anzeigeName}${e.alter ? `, ${e.alter} J.` : ""} · ${e.stufe} · ${e.fakten}`,
      ...(e.deutschWort ? [`Deutsch ${e.deutschWort}`] : []),
      ...(e.vorstellung ? ["", e.vorstellung] : []));
  }
  if (d.sichtbarGesamt > 1) {
    zeilen.push("", "Weitere passende Betreuungskräfte sende ich Ihnen in den nächsten Stunden.");
  }
  zeilen.push("", "Melden Sie sich einfach bei mir, wenn wir die Vermittlung anstoßen sollen.");
  zeilen.push("", VERMITTLER_GRUSS_TEXT);
  return zeilen.join("\n");
}

/* ─── Mail 2: die Liste ──────────────────────────────────────────────── */

function kraftZeile(e: Empfehlung, cid: string | null, letzte: boolean): string {
  const fakten = [
    e.einsaetze > 0 ? `${e.einsaetze} ${e.einsaetze === 1 ? "Einsatz" : "Einsätze"}` : "",
    e.erfahrungKurz,
    e.deutschWort ? `Deutsch ${e.deutschWort}` : "",
  ].filter(Boolean);
  /* Dieselbe gefuellte Pille wie in der grossen Karte, nur kleiner — sie
     steht hier hinter dem Namen und fuenfmal untereinander (#667). */
  const chip = e.stufe
    ? `&nbsp;&nbsp;<span style="display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.03em;color:#ffffff;background:${BRAUN};border-radius:999px;padding:3px 10px;white-space:nowrap;vertical-align:middle;">${esc(e.stufe)}</span>`
    : "";
  return `
    <tr><td style="padding:14px 18px;${letzte ? "" : "border-bottom:1px solid #ECE7DF;"}">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td width="64" style="width:64px;vertical-align:middle;">${foto(e, cid, 64, 12, 22)}</td>
        <td width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="vertical-align:middle;">
          <p style="margin:0 0 3px;font-size:17px;font-weight:700;line-height:1.3;color:#18181B;">${esc(e.anzeigeName)}${e.alter ? `<span style="font-size:13.5px;font-weight:400;color:#A1A1AA;">&nbsp;&nbsp;${e.alter} J.</span>` : ""}${chip}</p>
          <p style="margin:0;font-size:14.5px;line-height:1.5;color:#52525B;">${
            fakten.map((f) => esc(f)).join(" &middot; ")}</p>
        </td>
      </tr></table>
    </td></tr>`;
}

export interface KraefteDaten {
  /** Wie oben: fertige Signatur aus buildMartaSig(). */
  signatur: string;
  anrede: string;
  kundeLabel: string | null;
  fuenf: Empfehlung[];
  cids: (string | null)[];
}

/* Grussformel der Textfassung. Die HTML-Fassung bekommt die vollstaendige
 * Karte ueber `signatur`; im reinen Text bleiben Name, Rolle und die zwei
 * Wege, auf denen der Partner uns erreicht. */
export const VERMITTLER_GRUSS_TEXT = [
  "Mit freundlichen Grüßen",
  "Marta Kapcio — Pflegeberaterin",
  "Tel: 089 200 000 830  ·  WhatsApp: https://wa.me/4989200000830",
  "",
  "Primundus Deutschland | www.primundus.de",
].join("\n");

/** Mail 2: die verfuegbaren Kraefte, ohne Links und ohne Preiswiederholung. */
export function vermittlerKraefteHtml(d: KraefteDaten): string {
  const n = d.fuenf.length;
  return [
    p(esc(d.anrede)),
    /* Kein "wie angekuendigt: fuenf" — die Liste wird zwei Stunden spaeter
       neu berechnet, es koennen weniger sein (oder andere). Die Zahl kommt
       aus der Liste selbst. */
    p(`wie angekündigt: <strong style="color:#2D1F0F;">${zahlwort(n)} ${n === 1 ? "Betreuungskraft" : "Betreuungskräfte"}</strong>, die für ${kunde(d.kundeLabel)} verfügbar ${n === 1 ? "ist" : "sind"} und zu den Angaben ${n === 1 ? "passt" : "passen"}.`),
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border:1px solid #ECE7DF;border-radius:14px;overflow:hidden;background:#ffffff;">
      <tr><td style="padding:13px 18px;background:#FAF8F4;border-bottom:1px solid #EBE2D2;${LABEL}letter-spacing:.09em;color:${KORALLE};">Verfügbare Betreuungskräfte</td></tr>
      ${d.fuenf.map((e, i) => kraftZeile(e, d.cids[i] ?? null, i === n - 1)).join("")}
    </table>`,
    p(`Sagen Sie mir kurz Bescheid, welche Betreuungskraft Sie ${kunde(d.kundeLabel, "dat")} vorstellen möchten &ndash; dann stoßen wir die Vermittlung an. Die Konditionen aus meiner ersten Mail gelten unverändert.`),
    d.signatur,
  ].filter(Boolean).join("\n");
}

export function vermittlerKraefteText(d: KraefteDaten): string {
  const n = d.fuenf.length;
  return [
    d.anrede,
    "",
    `wie angekündigt: ${zahlwort(n)} ${n === 1 ? "Betreuungskraft" : "Betreuungskräfte"} für ${d.kundeLabel ?? "Ihren Kunden"}.`,
    "",
    "VERFÜGBARE BETREUUNGSKRÄFTE",
    ...d.fuenf.map((e, i) => `  ${i + 1}. ${[
      e.anzeigeName + (e.alter ? `, ${e.alter} J.` : ""), e.stufe, `${e.einsaetze} Einsätze`,
      e.erfahrungKurz, e.deutschWort ? `Deutsch ${e.deutschWort}` : "",
    ].filter(Boolean).join(" · ")}`),
    "",
    "Sagen Sie mir kurz Bescheid, welche Betreuungskraft Sie vorstellen möchten – dann",
    "stoßen wir die Vermittlung an. Die Konditionen aus meiner ersten Mail gelten unverändert.",
    "",
    VERMITTLER_GRUSS_TEXT,
  ].join("\n");
}

/** Fusszeile dieser Mails — OHNE Abmelde-Link (der trüge den Portal-Token). */
export const VERMITTLER_FUSSNOTE = "Sie erhalten diese E-Mail als Antwort auf Ihre Anfrage.";
