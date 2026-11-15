// Mail-Design im Look des Kundenportals (Registry #168, Martin 15.11.2026: „A: Angebot + Erinnerungen“ freigegeben).
// TypeScript-Fassung der Bausteine aus seo-reports/analysen/mails-optik-2026-11-15/bausteine/bausteine.mjs (Entwurf,
// Bild bausteine.png). Jede Funktion liefert ein Stück Mail-HTML: Tabellen, Inline-CSS, höchstens 600 px, ohne Skript.
//
// Vorbild wie im Entwurf: src/components/portal/EinstiegMinimal.tsx (KopfBereich, PunkteUndKennzahlen, PflegekraftZeile,
// ZeilenListe, AblaufGutePhase), MartaBox.tsx, Button.tsx (Textlink), tailwind.config.js (pm-Farben).
//
// Regeln, die die Funktionen selbst festhalten (nicht der Aufrufer):
// - Grün nur am Formular-Knopf „Pflegesituation vervollständigen“ (Martin 14.11.2026: „Grün ist nur zu Patientendaten
//   vervollständigen“); der Text ist deshalb kein Parameter. Alle anderen Knöpfe Koralle, Textlinks Taupe, nie Blau.
// - Die Zeile einer Pflegekraft kennt keinen Preis, keine Stufe, keine Einsätze und keine Verfügbarkeit.
// - Sterne nur mit Live-Stand (bewertungNurLive): ohne ihn fällt die Spalte weg wie im Portal, kein Ersatzwert.
//
// Bilder wie in den bisherigen Mails: Logo und Siegel vom Kostenrechner (`${site}/images/…`), Martas Foto von
// primundus.de (MARTA_FOTO_URL, siehe martaKarte.ts), Presse-Logos `${site}/images/media/…`, Pflegekraft-Fotos als
// angehängte Bilder (`cid:`), nie die rohe S3-Adresse.
//
// Benutzt von kundenMails.ts (Angebotsmail, Nudge 1, Nudge 2, Abschied). Die übrigen Kundenmails bleiben bis zu
// ihrer Runde bei mailBausteine.ts und der Hülle aus index.ts.
import { BESTPREIS_URL, TELEFON_HREF, TELEFON_TEXT, WHATSAPP_HREF } from "./mailBausteine.ts";
import { MARTA_FOTO_URL } from "./martaKarte.ts";
import { BEWERTUNGS_STAND_ERSATZ, type BewertungsStand } from "./bewertungenStand.ts";

// ── Farben (Werte aus tailwind.config.js, pm-*) ───────────────────────────────────────────────────────────────────────
export const DESIGN_FARBEN = {
  ink: "#1C1C1C",        // pm-ink: Titel, Namen, Werte
  body: "#2E2E2E",       // pm-body: Fließtext
  muted: "#6B6B6B",      // pm-muted: Gruß, Abschnittstitel, Beschriftungen, Pfeil
  taupe: "#8B7355",      // pm-taupe: „DIE WELT“ im Kopf
  taupeInk: "#6B5A44",   // pm-taupe-ink: Textlinks, Kreis des aktuellen Schritts nach dem Speichern
  taupeDeep: "#7D6E5D",  // pm-taupe-deep: Kreise der übrigen Schritte
  grund: "#F2F1EE",      // pm-grund: Seitengrund hinter den weißen Karten, Zahl-Pille
  shell: "#F2EDE6",      // pm-shell
  line: "#E5E3DF",       // pm-line: Linie unter dem Kopf, Rahmen „So geht es weiter“, Ring ums Foto
  lineSoft: "#F0EDE8",   // pm-line-soft: Trennlinien in Karten
  green: "#3D7A5C",      // pm-green: NUR Formular-Knopf, Haken, „Nach Zuschüssen“, Kreis Schritt 1
  greenDeep: "#2A5C3F",  // pm-green-deep: Titel Schritt 1 (vor dem Speichern)
  mint: "#E8F5EE",       // pm-mint: Fläche Schritt 1 (vor dem Speichern)
  coral: "#E76F63",      // pm-coral: alle anderen Knöpfe
  amber: "#D97706",      // pm-amber: Zeichen vor „Ihre Angaben sind noch unvollständig“
  amberInk: "#8B5A12",   // pm-amber-ink: Text dieses Hinweises
  gold: "#D4A843",       // pm-gold: Sterne
  sternLeer: "#E5E3DF",  // leere Sterne (wie FuenfSterne im Portal)
  initialen: "#B5A184",  // Fläche ohne Foto (wie bisher in der Angebotsmail)
  weiss: "#FFFFFF",
} as const;
const F = DESIGN_FARBEN;
const SCHRIFT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const S = `font-family:${SCHRIFT};`;
const T = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
const PRIMUNDUS = "https://primundus.de";

const esc = (s: string): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** „3.050&nbsp;€“ */
export const euroHtml = (n: number): string => `${Math.round(n).toLocaleString("de-DE")}&nbsp;€`;
const basis = (site: string) => site.replace(/\/$/, "");

// ── Wortlaute aus dem Portal (EinstiegMinimal.tsx, Gleichlauf-Test src/__tests__/mails/angebotsmailWortlaut.test.ts) ──
/** Wie im Portal mit geschütztem Leerzeichen in „zu\u00a0Hause“ (sonst stand auf schmalen Handys „Hause“ allein). */
export const KOPF_TITEL_ZEILEN = ["Ihr Preis für die", "Betreuung zu\u00a0Hause"] as const;
export const WARUM_TITEL = "Warum Primundus?";
export const GARANTIE_TITEL = "Bestpreisgarantie";
export const KOPF_PUNKTE = ["Keine Vermittlungsgebühren", "Tägliche Kündigung", "Taggenaue Abrechnung"] as const;
export const VERTRAUEN = [["20 Jahre", "Erfahrung"], ["6× in Folge", "Testsieger"]] as const;
export const LISTE_TITEL = "Ihre Pflegekräfte-Auswahl";
export const LISTE_ZEILE = "Diese Pflegekräfte sind verfügbar und passen zu Ihrer Anfrage.";
export const LISTE_UNVOLLSTAENDIG = "Ihre Angaben sind noch unvollständig";
export const LISTE_WARUM = "Beschreiben Sie kurz die Pflegesituation. So verstehen die Pflegekräfte, worauf es bei Ihnen ankommt, und können sich unverbindlich bewerben. Das dauert ca. 2 Minuten.";
export const LISTE_KNOPF = "Pflegesituation vervollständigen";
/** Textlink unter der Liste (bisher schon in der Angebotsmail, `ALLE_KRAEFTE`). */
export const ALLE_KRAEFTE = "Alle Pflegekräfte anzeigen";

// ── Grundstücke ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Fließtext 16 px (Portal: Text 16 px). `html` ist schon maskiert. */
export const absatz = (html: string, o: { oben?: number; unten?: number } = {}): string =>
  `<p style="${S}margin:${o.oben ?? 0}px 0 ${o.unten ?? 16}px;font-size:16px;line-height:24px;color:${F.body};">${html}</p>`;
/** Abstand, der auch in Outlook hält (Tabellenränder ignoriert Outlook). */
export const abstand = (h: number): string => `<div style="height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</div>`;
/** Weiße Karte auf dem Seitengrund, Ecken 20 px, ohne Rahmen (Portal: KARTE = rounded-card bg-white). */
export const karte = (inhalt: string, o: { innen?: string } = {}): string =>
  `<table ${T} width="100%" bgcolor="${F.weiss}" style="background-color:${F.weiss};border-radius:20px;border-collapse:separate;"><tr><td style="padding:${o.innen ?? "0"};">${inhalt}</td></tr></table>`;
/** Graue Abschnittsüberschrift (Portal: „Warum Primundus?“). */
const abschnitt = (t: string, oben = 0) => `<p style="${S}margin:${oben}px 0 0;font-size:15px;line-height:20px;color:${F.muted};">${t}</p>`;

// ── 01 Kopf ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Logo links, rechts „6× Testsieger / DIE WELT / Preis & Qualität“ (dreizeilig, Testsieger-Linie 15.09.) und das Siegel
 *  (Portal: TestsiegerKopf, Text links vom Siegel). Weiße Leiste mit Linie unten wie die Navigationsleiste im Portal.
 *  Bilder vom Kostenrechner wie bisher in buildEmailWrapper (index.ts). */
export function kopf(site: string): string {
  const s = basis(site);
  return `<table ${T} width="100%" bgcolor="${F.weiss}" style="background-color:${F.weiss};border-bottom:1px solid ${F.line};">
  <tr><td class="pm-kopf" style="padding:14px 24px;">
    <table ${T} width="100%"><tr>
      <td valign="middle"><a href="${PRIMUNDUS}" target="_blank"><img src="${s}/images/Primundus-Logo_V6.png" alt="Primundus" width="140" style="display:block;width:140px;max-width:140px;height:auto;border:0;"></a></td>
      <td valign="middle" align="right">
        <table ${T} align="right"><tr>
          <td valign="middle" align="right" style="padding:0 8px 0 0;text-align:right;">
            <p style="${S}margin:0;font-size:12.5px;font-weight:700;line-height:16px;color:${F.ink};white-space:nowrap;">6× Testsieger</p>
            <p style="${S}margin:0;font-size:11.5px;font-weight:700;line-height:15px;color:${F.taupe};white-space:nowrap;">DIE WELT</p>
            <p style="${S}margin:0;font-size:11px;line-height:15px;color:${F.muted};white-space:nowrap;">Preis &amp; Qualität</p>
          </td>
          <td valign="middle" width="30" style="width:30px;"><img src="${s}/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" width="30" style="display:block;width:30px;height:auto;border:0;"></td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>
</table>`;
}

// ── 02 Gruß und Titelzeile ───────────────────────────────────────────────────────────────────────────────────────────
/** „Guten Tag Frau Müller“ (Kontext.anrede) → „Guten Tag, Frau Müller“ wie KopfBereich im Portal (data-kopf-gruss).
 *  Ohne Namen bleibt „Guten Tag“. */
export function grussZeile(anrede: string): string {
  const a = anrede.trim().replace(/,$/, "");
  return a.replace(/^Guten Tag (?=\S)/, "Guten Tag, ");
}

/** Gruß klein und grau, darunter der Titel groß (Portal: KopfBereich). `zeilen` = feste Umbrüche wie KOPF_TITEL_ZEILEN,
 *  damit der Titel auf dem Handy nicht ein Wort allein in die zweite Zeile schiebt. `einleitung` ist schon maskiert. */
export function anredeTitel(o: { gruss: string; zeilen: readonly string[]; einleitung?: string }): string {
  return `<p style="${S}margin:0;font-size:15px;line-height:20px;color:${F.muted};">${esc(o.gruss)}</p>
<h1 class="pm-titel" style="${S}margin:8px 0 0;font-size:28px;font-weight:700;line-height:32px;letter-spacing:-0.02em;color:${F.ink};">${o.zeilen.map(esc).join(" <br>")}</h1>
${o.einleitung ? absatz(o.einleitung, { oben: 16, unten: 0 }) : ""}`;
}

// ── 03 Hauptknopf Koralle / 04 Formular-Knopf Grün ──────────────────────────────────────────────────────────────────
/** Knopf über die volle Breite, Ecken 12 px, 52 px hoch (Portal: rounded-[12px]). Innenabstand am <td> mit bgcolor,
 *  damit Outlook die Fläche zeigt. */
function knopf(url: string, text: string, farbe: string, schrift = 17): string {
  return `<table ${T} width="100%" style="border-collapse:separate;"><tr>
  <td align="center" bgcolor="${farbe}" style="background-color:${farbe};border-radius:12px;padding:15px 16px;">
    <a href="${url}" target="_blank" style="${S}display:block;color:#FFFFFF;font-size:${schrift}px;font-weight:700;line-height:22px;text-decoration:none;text-align:center;">${text}</a>
  </td></tr></table>`;
}
/** Hauptknopf Koralle: jeder Knopf außer dem Weg ins Formular. Höchstens einer je Mail außerhalb von Karten.
 *  `text` ist schon maskiert. */
export const hauptknopf = (url: string, text: string, schrift?: number): string =>
  knopf(url, `${text}&nbsp;&rarr;`, F.coral, schrift);
/** Formular-Knopf Grün mit festem Text (LISTE_KNOPF). Der Text ist absichtlich kein Parameter. */
export const formularKnopf = (url: string, schrift?: number): string =>
  knopf(url, `${LISTE_KNOPF}&nbsp;&rarr;`, F.green, schrift);
/** Kasten über dem Formular-Knopf wie unter der Portal-Liste ([data-liste-knopf]: LISTE_UNVOLLSTAENDIG, LISTE_WARUM). */
export function formularHinweis(url: string): string {
  return `<table ${T}><tr>
  <td valign="middle" width="20" style="width:20px;"><div style="${S}width:18px;height:18px;border-radius:9px;background-color:${F.amber};color:#FFFFFF;font-size:12px;font-weight:800;line-height:18px;text-align:center;">!</div></td>
  <td valign="middle" style="padding-left:8px;"><p style="${S}margin:0;font-size:16px;font-weight:600;line-height:22px;color:${F.amberInk};">${LISTE_UNVOLLSTAENDIG}</p></td>
</tr></table>
<p style="${S}margin:8px 0 16px;font-size:16px;line-height:22px;color:${F.ink};">${LISTE_WARUM.replace(/ /g, "&nbsp;")}</p>
${formularKnopf(url)}`;
}

// ── 05 Textlink Taupe ───────────────────────────────────────────────────────────────────────────────────────────────
/** Textlink wie Button variante="link" im Portal: Taupe, halbfett, Unterstrich in Taupe 40 %. Nie Grün, nie Blau. */
export const textlink = (url: string, text: string, groesse = 16): string =>
  `<a href="${url}" target="_blank" style="${S}color:${F.taupeInk};font-size:${groesse}px;font-weight:600;text-decoration:underline;text-decoration-color:rgba(139,115,85,0.4);text-underline-offset:4px;">${text}</a>`;

// ── 06 Pflegekraft-Zeile ─────────────────────────────────────────────────────────────────────────────────────────────
/** Was die Zeile zeigt. Mehr Felder gibt es absichtlich nicht (kein Preis, keine Stufe, keine Einsätze, keine
 *  Verfügbarkeit). `foto` = `cid:…` des angehängten Bildes oder null (Anfangsbuchstabe). */
export type ZeilenKraft = { vorname: string; alter: number | null; jahre: number; deutsch: string | null; foto: string | null };

/** Rundes Foto 72 px; ohne Foto der erste Buchstabe auf Taupe. Outlook (Windows) kennt keine runden Ecken: dort eckig. */
function foto(k: ZeilenKraft): string {
  if (k.foto) {
    const a = `src="${k.foto}" alt="" width="72" height="72"`;
    return `<!--[if mso]><img ${a} style="display:block;border:0;"><![endif]--><!--[if !mso]><!--><img ${a} style="display:block;width:72px;height:72px;border-radius:36px;border:0;object-fit:cover;background-color:${F.grund};box-shadow:0 0 0 1px ${F.line};"><!--<![endif]-->`;
  }
  const ini = esc((k.vorname.trim()[0] ?? "P").toUpperCase());
  return `<div style="${S}width:72px;height:72px;border-radius:36px;background-color:${F.initialen};color:#FFFFFF;font-size:22px;font-weight:700;line-height:72px;text-align:center;">${ini}</div>`;
}
/** „12 Jahre Erfahrung“, „Deutsch Gut“ wie zeilenFakten im Portal; fehlende Angaben entfallen. */
export function zeilenFakten(k: Pick<ZeilenKraft, "jahre" | "deutsch">): string[] {
  const t: string[] = [];
  if (k.jahre > 0) t.push(k.jahre === 1 ? "1 Jahr Erfahrung" : `${k.jahre} Jahre Erfahrung`);
  if (k.deutsch) t.push(`Deutsch ${k.deutsch}`);
  return t;
}
/** Eine Pflegekraft wie PflegekraftZeile: Foto, „Vorname, Alter“, je Angabe eine Zeile, Pfeil. Alles verlinkt aufs
 *  Profil (`cg=`), kein eigener Knopf. */
export function pflegekraftZeile(k: ZeilenKraft, url: string, o: { oben?: number; unten?: number } = {}): string {
  const oben = o.oben ?? 16, unten = o.unten ?? 16;
  const a = (inhalt: string, stil = "") => `<a href="${url}" target="_blank" style="${S}color:${F.ink};text-decoration:none;${stil}">${inhalt}</a>`;
  const alter = k.alter ? a(`, ${k.alter}`, `font-weight:400;color:${F.muted};`) : "";
  const fakten = zeilenFakten(k).map((t) => `<p style="${S}margin:2px 0 0;font-size:16px;line-height:22px;color:${F.ink};">${a(esc(t))}</p>`).join("");
  return `<table ${T} width="100%"><tr>
  <td width="72" valign="middle" style="width:72px;padding:${oben}px 0 ${unten}px;">${a(foto(k))}</td>
  <td valign="middle" style="padding:${oben}px 8px ${unten}px 16px;">
    <p style="${S}margin:0;font-size:18px;font-weight:600;line-height:24px;color:${F.ink};">${a(esc(k.vorname))}${alter}</p>${fakten}
  </td>
  <td width="16" valign="middle" align="right" style="width:16px;">${a("&#8250;", `font-size:30px;line-height:30px;color:${F.muted};`)}</td>
</tr></table>`;
}

// ── 07 Liste mit Titel ───────────────────────────────────────────────────────────────────────────────────────────────
/** Weiße Karte wie ZeilenListe: Titel mit Zahl, ein Satz, Zeilen mit feiner Linie, darunter der Textlink. `kasten`
 *  (Nudge 1) steht IN der Karte unter den Zeilen mit feiner Linie davor, wie [data-liste-knopf] in section#pflegekraefte. */
export function liste(o: {
  titel: string; zeile?: string; kraefte: ZeilenKraft[]; profilUrl: (k: ZeilenKraft, i: number) => string;
  alle?: { url: string; text: string } | null; kasten?: string | null;
}): string {
  const pille = `<span style="display:inline-block;margin-left:6px;padding:0 8px;border-radius:999px;background-color:${F.grund};font-size:13px;font-weight:600;line-height:20px;color:${F.muted};vertical-align:2px;">${o.kraefte.length}</span>`;
  const zeilen = o.kraefte.map((k, i) => `<tr><td style="border-top:1px solid ${F.lineSoft};padding:0 16px;">${pflegekraftZeile(k, o.profilUrl(k, i))}</td></tr>`).join("");
  const fuss = o.alle ? `<tr><td style="border-top:1px solid ${F.lineSoft};padding:16px 16px 18px;">${textlink(o.alle.url, `${esc(o.alle.text)}&nbsp;&rsaquo;`)}</td></tr>` : "";
  const kasten = o.kasten ? `<tr><td style="border-top:1px solid ${F.lineSoft};padding:20px 16px;">${o.kasten}</td></tr>` : "";
  return `<table ${T} width="100%" bgcolor="${F.weiss}" style="background-color:${F.weiss};border-radius:20px;border-collapse:separate;">
  <tr><td style="padding:14px 16px 14px;">
    <p style="${S}margin:0;font-size:18px;font-weight:600;line-height:24px;color:${F.ink};">${esc(o.titel)}${pille}</p>
    ${o.zeile ? `<p style="${S}margin:6px 0 0;font-size:15px;line-height:20px;color:${F.muted};">${esc(o.zeile)}</p>` : ""}
  </td></tr>
  ${zeilen}${fuss}${kasten}
</table>`;
}

// ── 09 „Warum Primundus?“ und Kennzahlen ─────────────────────────────────────────────────────────────────────────────
/** Nur der Live-Stand zählt. `ladeBewertungsStand` (bewertungenStand.ts) gibt bei jedem Fehler genau das Objekt
 *  BEWERTUNGS_STAND_ERSATZ zurück; dann zeigt die Mail wie Portal und Rechner keine Sterne statt des Ersatzwerts
 *  (offene Design-Frage 5 im Entwurf, Empfehlung „wie das Portal“). Martas Karte der übrigen Mails bleibt beim Ersatzwert. */
export function bewertungNurLive(stand: BewertungsStand | null | undefined): BewertungsStand | null {
  return !stand || stand === BEWERTUNGS_STAND_ERSATZ ? null : stand;
}
/** Gerundete Zahl goldener Sterne (wie FuenfSterne im Portal und mSterneZeile). */
export const goldSterne = (schnitt: string): number =>
  Math.min(5, Math.max(0, Math.round(Number(schnitt.replace(",", ".")))));

/** Wie PunkteUndKennzahlen: graue Überschrift, vier Punkte mit grünem Haken (Bestpreisgarantie zuerst, verlinkt in
 *  Textfarbe mit Taupe-Unterstrich), Linie, Kennzahlen. Ohne Live-Bewertung fällt die Sterne-Spalte weg. */
export function warumPrimundus(o: { bewertung: BewertungsStand | null; oben?: number }): string {
  const haken = (pad: number) => `<td width="28" valign="top" style="width:28px;padding-top:${pad}px;${S}font-size:17px;font-weight:700;line-height:22px;color:${F.green};">&#10003;</td>`;
  const punkt = (inhalt: string, i: number) => `<tr>${haken(i ? 12 : 0)}<td valign="top" style="${S}padding-top:${i ? 12 : 0}px;font-size:16px;line-height:22px;color:${F.ink};">${inhalt}</td></tr>`;
  const bestpreis = `<a href="${BESTPREIS_URL}" target="_blank" style="${S}color:${F.ink};text-decoration:underline;text-decoration-color:rgba(139,115,85,0.4);text-underline-offset:4px;">${GARANTIE_TITEL}</a>`;
  const punkte = [bestpreis, ...KOPF_PUNKTE].map(punkt).join("");
  const spalte = (wert: string, wort: string, letzte: boolean) => `<td valign="top" style="padding:0 ${letzte ? 0 : 10}px 0 0;">
      <p style="${S}margin:0;font-size:16px;font-weight:700;line-height:22px;color:${F.ink};white-space:nowrap;">${wert}</p>
      <p style="${S}margin:2px 0 0;font-size:14px;line-height:20px;color:${F.muted};white-space:nowrap;">${wort}</p></td>`;
  let sterne = "";
  if (o.bewertung) {
    const gold = goldSterne(o.bewertung.schnitt);
    const st = `<span style="font-size:12px;line-height:16px;letter-spacing:1px;vertical-align:1px;color:${F.gold};">${"&#9733;".repeat(gold)}</span>${gold < 5 ? `<span style="font-size:12px;line-height:16px;letter-spacing:1px;vertical-align:1px;color:${F.sternLeer};">${"&#9733;".repeat(5 - gold)}</span>` : ""}`;
    sterne = spalte(`${esc(o.bewertung.schnitt)}&nbsp;${st}`, `${o.bewertung.anzahl} ${o.bewertung.anzahl === 1 ? "Bewertung" : "Bewertungen"}`, false);
  }
  const kennzahlen = VERTRAUEN.map(([wert, wort], i) => spalte(wert, wort, i === VERTRAUEN.length - 1)).join("");
  return `${abschnitt(WARUM_TITEL, o.oben ?? 0)}
${abstand(16)}<table ${T}>${punkte}</table>
${abstand(24)}<table ${T} width="100%"><tr><td style="border-top:1px solid ${F.lineSoft};padding:24px 0 0;">
  <table ${T} width="100%"><tr>${sterne}${kennzahlen}</tr></table>
</td></tr></table>`;
}
/** Textfassung von Baustein 09. */
export function warumPrimundusText(bewertung: BewertungsStand | null): string {
  const sterne = bewertung
    ? `${bewertung.schnitt} ${"★".repeat(goldSterne(bewertung.schnitt))}${"☆".repeat(5 - goldSterne(bewertung.schnitt))} · ${bewertung.anzahl} ${bewertung.anzahl === 1 ? "Bewertung" : "Bewertungen"} · `
    : "";
  return `${WARUM_TITEL.toUpperCase()}
✓ ${GARANTIE_TITEL}: ${BESTPREIS_URL}
${KOPF_PUNKTE.map((p) => `✓ ${p}`).join("\n")}
${sterne}${VERTRAUEN.map(([w, t]) => `${w} ${t}`).join(" · ")}`;
}

// ── Preiskarte (Angebotsmail) ─────────────────────────────────────────────────────────────────────────────────────────
/** Wie die Preiskarte in KopfBereich ohne „Details“: Preis groß, grüne Zeile „Nach Zuschüssen“, Heim-Vergleich, darunter
 *  Baustein 09. Ohne belegten Eigenanteil fehlen beide Zeilen (wie Portal und bisherige Angebotsmail). */
export function preiskarte(o: { brutto: number; eigen: number | null; heimDiff: number; bewertung: BewertungsStand | null }): string {
  const zuschuss = o.eigen
    ? `<p style="${S}margin:10px 0 0;font-size:16px;font-weight:600;line-height:22px;color:${F.green};">Nach Zuschüssen <span style="white-space:nowrap;">ca. ${euroHtml(o.eigen)} im Monat</span></p>${o.heimDiff > 0
      ? `<p style="${S}margin:2px 0 0;font-size:16px;line-height:22px;color:${F.ink};">rund ${euroHtml(o.heimDiff)} weniger als im Pflegeheim</p>` : ""}`
    : "";
  return karte(`<p style="${S}margin:0;line-height:40px;white-space:nowrap;"><span style="font-size:38px;font-weight:700;letter-spacing:-0.025em;color:${F.ink};">${euroHtml(o.brutto)}</span><span style="font-size:15px;color:${F.muted};">&nbsp;/ Monat</span></p>
${zuschuss}
${warumPrimundus({ bewertung: o.bewertung, oben: 32 })}`, { innen: "24px 16px" });
}

// ── 10 „So geht es weiter“ vor dem Speichern ────────────────────────────────────────────────────────────────────────
/** Schritte 1 und 2 wörtlich aus ABLAUF_GUTE_PHASE (EinstiegMinimal.tsx). Schritt 3 in der Mail angepasst
 *  (OpenAI-Gegencheck 15.11.): Vertragssatz wie überall in den Mails (KompaktEinstieg.tsx:519) und Martas Ich-Form statt
 *  „Wir übernehmen den Rest“; „Anreise schon ab 3 Tagen möglich“ bleibt wörtlich. In Gruppe A von keiner Mail benutzt
 *  (Mail D gehört zur nächsten Runde), steht hier, damit es EINE Fassung gibt. */
export const ABLAUF = [
  { titel: "Pflegesituation vervollständigen", text: "Beschreiben Sie kurz die Situation, damit die Pflegekräfte wissen, worauf es bei Ihnen ankommt. Das dauert ca.&nbsp;2&nbsp;Minuten, einiges ist aus Ihren bisherigen Angaben schon übernommen." },
  { titel: "Bewerbungen innerhalb von 60&nbsp;Minuten erhalten", text: "Passende Pflegekräfte bewerben sich bei Ihnen, mit Profil, Erfahrung und Anreisedatum. Für Sie kostenfrei und unverbindlich." },
  { titel: "Auswählen und starten", text: "Sie wählen in Ruhe aus. Anreise schon ab 3&nbsp;Tagen möglich. Ein Vertrag entsteht erst, wenn Sie eine Bewerbung annehmen und im Portal unterschreiben. Ich begleite Sie bis zur Anreise." },
] as const;
const kreis = (n: number, farbe: string) => `<table ${T}><tr><td width="27" height="27" align="center" valign="middle" bgcolor="${farbe}" style="width:27px;height:27px;border-radius:14px;background-color:${farbe};${S}font-size:13px;font-weight:700;line-height:27px;color:#FFFFFF;text-align:center;">${n}</td></tr></table>`;
/** Vor dem Speichern: Schritt 1 mint mit grünem Formular-Knopf, Schritte 2 und 3 weiß (kein erledigter Schritt mit
 *  grünem Haken, Martin 14.11.: „zu bunt“). */
export function soGehtEsWeiter(formularUrl: string): string {
  const reihen = ABLAUF.map((s, i) => {
    const jetzt = i === 0, letzte = i === ABLAUF.length - 1;
    const ecken = `border-radius:${jetzt ? "19px 19px" : "0 0"} ${letzte ? "19px 19px" : "0 0"};`;
    return `<tr><td${jetzt ? ` bgcolor="${F.mint}"` : ""} style="${jetzt ? `background-color:${F.mint};` : `border-top:1px solid ${F.line};`}${ecken}padding:16px;">
    <table ${T} width="100%"><tr>
      <td width="27" valign="top" style="width:27px;padding-top:2px;">${kreis(i + 1, jetzt ? F.green : F.taupeDeep)}</td>
      <td valign="top" style="padding-left:12px;">
        <p style="${S}margin:0;font-size:16.5px;font-weight:700;line-height:22px;color:${jetzt ? F.greenDeep : F.ink};">${s.titel}</p>
        <p style="${S}margin:4px 0 0;font-size:15px;line-height:22px;color:${jetzt ? F.body : F.muted};">${s.text}</p>
      </td>
    </tr></table>${jetzt ? `${abstand(14)}${formularKnopf(formularUrl, 16)}` : ""}
  </td></tr>`;
  }).join("");
  return `<p style="${S}margin:0 0 12px;padding:0 4px;font-size:20px;font-weight:700;line-height:26px;color:${F.ink};">So geht es weiter</p>
<table ${T} width="100%" bgcolor="${F.weiss}" style="background-color:${F.weiss};border:1px solid ${F.line};border-radius:20px;border-collapse:separate;">${reihen}</table>`;
}

// ── 11 Marta-Signatur ────────────────────────────────────────────────────────────────────────────────────────────────
/** EINE Fassung für alle Kundenmails dieser Runde: Gruß, rundes Foto, Name, Rolle, eine Kontaktzeile (Wortlaut der
 *  bisherigen Angebotsmail). Ersetzt die große Marta-Karte. `kontakt: false` nur dort, wo der Text die Nummer schon
 *  anbietet (Nudge 2), sonst stünde sie dreimal in der Mail. */
export function martaSignatur(o: { kontakt?: boolean } = {}): string {
  const bild = `src="${MARTA_FOTO_URL}" alt="Marta Kapcio" width="52"`;
  const bildHtml = `<!--[if mso]><img ${bild} style="display:block;border:0;"><![endif]--><!--[if !mso]><!--><img ${bild} height="52" style="display:block;width:52px;height:52px;border-radius:26px;border:0;object-fit:cover;object-position:top;"><!--<![endif]-->`;
  const kontakt = o.kontakt === false ? ""
    : `\n<p style="${S}margin:14px 0 0;font-size:15px;line-height:23px;color:${F.muted};">Fragen? ${textlink(TELEFON_HREF, TELEFON_TEXT, 15)}, täglich <span style="white-space:nowrap;">8–20&nbsp;Uhr</span>, auch per ${textlink(WHATSAPP_HREF, "WhatsApp", 15)}.</p>`;
  return `${absatz("Viele Grüße", { unten: 12 })}
<table ${T}><tr>
  <td width="52" valign="middle" style="width:52px;">${bildHtml}</td>
  <td valign="middle" style="padding-left:12px;">
    <p style="${S}margin:0;font-size:16.5px;font-weight:700;line-height:22px;color:${F.ink};">Marta Kapcio</p>
    <p style="${S}margin:0;font-size:14px;line-height:20px;color:${F.muted};">Pflegeberaterin bei Primundus</p>
  </td>
</tr></table>${kontakt}`;
}
/** Textfassung der Signatur, gleiche Wahl wie martaSignatur. */
export function martaSignaturText(o: { kontakt?: boolean } = {}): string {
  return `Viele Grüße
Marta Kapcio
Pflegeberaterin bei Primundus
${o.kontakt === false ? "" : `\nFragen? 089 200 000 830, täglich 8–20 Uhr, auch per WhatsApp (${WHATSAPP_HREF}).\n`}
Primundus Deutschland | www.primundus.de`;
}

// ── 12 Fußzeile ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Presse-Logos wie in Martas Karte (martaKarte.ts LOGOS; dort nicht exportiert, die Datei ist eine Kopie von
 *  lib/marta-karte.ts mit Gleichlauf-Test). */
const PRESSE_LOGOS: readonly [datei: string, alt: string, breite: number][] = [
  ["die-welt.webp", "DIE WELT", 68], ["frankfurter-allgemeine.webp", "Frankfurter Allgemeine", 103], ["ard.webp", "ARD", 38],
  ["ndr.webp", "NDR", 21], ["sat1.webp", "SAT.1", 45], ["bild-der-frau.webp", "Bild der Frau", 12],
];
/** Weißes Band wie der Kopf: Presseleiste grau, Absender, Kontakt als Taupe-Links, Versandhinweis und Abmelden wie
 *  bisher in buildEmailWrapper (Abmelden nur mit Token). */
export function fusszeile(o: { site: string; email?: string | null; abmeldenUrl?: string | null }): string {
  const s = basis(o.site);
  const logos = PRESSE_LOGOS.map(([d, alt, b]) => `<td align="center" valign="middle" style="padding:0 4px;"><img src="${s}/images/media/${d}" alt="${alt}" width="${b}" height="14" style="display:inline-block;width:${b}px;max-width:100%;height:auto;border:0;opacity:0.4;filter:grayscale(100%);"></td>`).join("");
  // Punkt vor dem Link in derselben Klammer: bricht die Zeile um, steht der Punkt vorn, nie allein am Zeilenende.
  const link = (url: string, t: string, punkt = false) => `<span style="white-space:nowrap;">${punkt ? "&middot;&nbsp;" : ""}${textlink(url, t, 13)}</span>`;
  const an = o.email ? `Diese E-Mail wurde versendet an: ${esc(o.email)}<br>` : "";
  const ab = o.abmeldenUrl ? `<br><a href="${o.abmeldenUrl}" target="_blank" style="${S}color:${F.muted};text-decoration:underline;">Keine E-Mails mehr erhalten</a>` : "";
  return `<table ${T} width="100%" bgcolor="${F.weiss}" style="background-color:${F.weiss};"><tr><td class="pm-rand" align="center" style="border-top:1px solid ${F.line};padding:24px 24px 32px;text-align:center;">
  <table ${T} align="center"><tr>${logos}</tr></table>
  ${abstand(20)}
  <p style="${S}margin:0;font-size:14px;font-weight:600;line-height:20px;color:${F.ink};">Primundus Deutschland</p>
  <p style="${S}margin:2px 0 0;font-size:13px;line-height:20px;color:${F.muted};">24h-Pflege und Betreuung zu Hause</p>
  <p style="${S}margin:8px 0 0;font-size:13px;line-height:22px;color:${F.muted};">${link(TELEFON_HREF, "+49&nbsp;89&nbsp;200&nbsp;000&nbsp;830")} ${link("mailto:info@primundus.de", "info@primundus.de", true)}<br>${link(PRIMUNDUS, "www.primundus.de")}</p>
  <p style="${S}margin:16px 0 0;font-size:12px;line-height:18px;color:${F.muted};">${an}Sie erhalten diese E-Mail, weil Sie eine Kalkulation auf primundus.de angefordert haben.${ab}</p>
</td></tr></table>`;
}

// ── Hülle (Kopf, Inhalt auf dem Seitengrund, Fußzeile) ──────────────────────────────────────────────────────────────
/** Merkt die Stelle direkt unter dem Kopf. Der Testversand (Demo-Modus in index.ts) setzt dort seinen Hinweis ein,
 *  wie bisher vor `<div class="email-content">` der alten Hülle. */
export const INHALT_MARKE = "<!--pm-inhalt-->";

/** Vorschautext unsichtbar oben, Seitengrund, 600 px Spalte; für Outlook (Windows) eine feste 600-px-Tabelle. */
export function huelle(o: { titel: string; vorschau: string; inhalt: string }): string {
  return `<!DOCTYPE html>
<html lang="de" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(o.titel)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body { margin:0; padding:0; background-color:${F.grund}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:480px) {
    .pm-rand { padding-left:16px !important; padding-right:16px !important; }
    .pm-kopf { padding:12px 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${F.grund};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${F.grund};">${esc(o.vorschau)}</div>
<table ${T} width="100%" bgcolor="${F.grund}" style="background-color:${F.grund};"><tr><td align="center">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table ${T} width="100%" style="max-width:600px;margin:0 auto;">
${o.inhalt}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

/** Eine Zeile Inhalt mit Seitenrand 24 px (Handy 16 px). */
const reihe = (html: string) => `<tr><td class="pm-rand" style="padding:0 24px;">${html}</td></tr>`;

/** Ganze Mail wie in den Entwürfen (g1-angebot-vor-profil/bauen.mjs `mail()`): Kopf, Inhalt, Signatur, Fußzeile. */
export function designMail(o: {
  site: string; titel: string; vorschau: string; teile: string[]; signatur?: string;
  email?: string | null; abmeldenUrl?: string | null;
}): string {
  const inhalt = [
    `<tr><td>${kopf(o.site)}</td></tr>`,
    INHALT_MARKE,
    reihe(abstand(28)),
    ...o.teile.map(reihe),
    reihe(`${abstand(32)}${o.signatur ?? martaSignatur()}${abstand(36)}`),
    `<tr><td>${fusszeile({ site: o.site, email: o.email, abmeldenUrl: o.abmeldenUrl })}</td></tr>`,
  ].join("\n");
  return huelle({ titel: o.titel, vorschau: o.vorschau, inhalt });
}
