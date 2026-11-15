// Rauchtests der neuen Kundenmails (Vorschau v2, Martin 26.09.2026) — jede Mail: Anrede,
// richtiger Knopf und Link, keine Platzhalter, Textfassung vorhanden, klein genug für Gmail.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  anreiseDatum,
  anreiseMail,
  anreiseZeit,
  angebotMail,
  type AngebotEingabe,
  type AngebotKraft,
  eigenanteilAus,
  erinnerungMail,
  heimVergleich,
  type Kontext,
  kraftFakten,
  type KundenMail,
  nachfass2Mail,
  nachfass3Mail,
  neuePflegekraefteMail,
  PORTAL_ERKLAERUNG,
  NUDGE1_BETREFF,
  nudge1Mail,
  nudge1Vorschau,
  nudge2Mail,
  portalLink,
  reservierungBeendetMail,
  sucheStandMail,
  vierDingeMail,
} from "../kundenMails.ts";
import { ABSCHIED_SATZ, RUECKMELDUNG_KNOEPFE } from "../kette.ts";
import { BESTPREIS_URL, TELEFON_HREF, WHATSAPP_HREF } from "../mailBausteine.ts";
import { ALLE_KRAEFTE, bewertungNurLive, grussZeile, LISTE_UNVOLLSTAENDIG, LISTE_WARUM } from "../mailDesign.ts";
import { BEWERTUNGS_STAND_ERSATZ } from "../bewertungenStand.ts";
import { martaKarteHtml } from "../martaKarte.ts";

const PORTAL = "https://kundenportal.primundus.de";
const SITE = "https://kostenrechner.primundus.de";
const k = (token: string | null = "tok123"): Kontext => ({
  anrede: "Guten Tag Frau Müller",
  site: SITE,
  portal: (p) => portalLink(PORTAL, token, SITE, p),
  token,
  marta: "<p>Mit freundlichen Grüßen<br>Marta Kapcio</p>",
  // Fußzeile der Mails aus mailDesign.ts (Registry #168), wie kundenKontext in index.ts.
  email: "kundin@beispiel.de",
  abmelden: token ? `${SITE}/abmelden?token=${token}` : null,
});
const kalk = {
  bruttopreis: 3050, eigenanteil: 1621.75,
  formularDaten: { betreuung_fuer: "ehepaar", pflegegrad: 4, mobilitaet: "rollstuhl", nachteinsaetze: "taeglich", deutschkenntnisse: "sehr-gut", geschlecht: "weiblich" },
};
/** Sichtbarer Text: ohne Kopf des Dokuments (Titel, Stile), Vorschautext und Outlook-Weichen; Zeichen wie im Mailprogramm. */
const sichtbar = (html: string) => html.replace(/<head>[\s\S]*?<\/head>/, "").replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<div style="display:none[^>]*>[^<]*<\/div>/, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|\u00a0/g, " ")
  .replace(/&rarr;/g, "→").replace(/&rsaquo;|&#8250;/g, "›").replace(/&#8209;/g, "-").replace(/&middot;/g, "·").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");
/** Wie sichtbar, aber ohne die Lücke, die ein Tag vor Komma oder Punkt hinterlässt („830 ," → „830,"). */
const lesbar = (html: string) => sichtbar(html).replace(/ ([,.])/g, "$1").trim();

function pruefe(name: string, m: KundenMail, knopf: string, link: string, o: { gedankenstrich?: boolean } = {}) {
  assertStringIncludes(m.html, `>${knopf}</a>`, `${name}: Knopf`);
  grundregeln(name, m, link, o);
}

/** Was jede Kundenmail erfüllt, unabhängig von der Form des Knopfs. */
function grundregeln(name: string, m: KundenMail, link: string, o: { gedankenstrich?: boolean } = {}) {
  assertStringIncludes(m.html, "Guten Tag Frau Müller,", `${name}: Anrede`);
  assertStringIncludes(m.text, "Guten Tag Frau Müller,", `${name}: Anrede Text`);
  assertStringIncludes(m.html, link, `${name}: Link`);
  assertStringIncludes(m.text, link, `${name}: Link im Text`);
  for (const f of [m.html, m.text, m.betreff, m.vorschau]) {
    assert(!/undefined|NaN|\[object Object\]/.test(f), `${name}: Platzhalter`);
  }
  const s = sichtbar(m.html);
  // „vervollständigen" ist seit dem Portal-Rückbau (02.10.2026) wieder Portal-Wortlaut („Pflegesituation vervollständigen").
  // Gedankenstrich nur dort erlaubt, wo Portal-Texte wörtlich stehen (Angebotsmail: Portal-FAQ, Martin 08.10.2026).
  const verboten = ["Kostenrechner", "Betreuungskräfte", "4–7", "in Ruhe", "vorbereitet", "Hallo ", "Bewerbungen anfragen", ...(o.gedankenstrich ? [] : ["—"])];
  for (const wort of verboten) {
    assert(!s.includes(wort) && !m.text.includes(wort), `${name}: enthält „${wort}"`);
  }
  assert(m.html.length < 60_000, `${name}: ${m.html.length} Zeichen`);
  assert(m.vorschau.length > 20 && m.vorschau.length < 120, `${name}: Vorschautext`);
  assertStringIncludes(m.html, m.vorschau.replace(/'/g, "&#39;").slice(0, 20));
}

Deno.test("Portal-Link: Token + Parameter, leere fallen weg, ohne Token die Website", () => {
  assertEquals(portalLink(PORTAL + "/", "a b", SITE, { goto: "anfragen", m: "eb", job: null }), `${PORTAL}/?token=a%20b&goto=anfragen&m=eb`);
  assertEquals(portalLink(PORTAL, null, SITE, { goto: "anfragen" }), SITE);
});

/* Kalkulation mit Zuschuss-Posten wie aus lib/calculation.ts (Ehepaar, Pflegegrad 4): 3.050 − 800 − 295 − 333 = 1.622 €. */
const kalkPosten = {
  ...kalk,
  "zuschüsse": { items: [
    { name: "pflegegeld", label: "Pflegegeld", betrag_monatlich: 800, betrag_jaehrlich: 9600, in_kalkulation: true },
    { name: "entlastungsbudget_neu", label: "Entlastungsbudget", betrag_monatlich: 294.92, betrag_jaehrlich: 3539, in_kalkulation: true },
    { name: "steuervorteil", label: "Steuervorteil", betrag_monatlich: 333.33, betrag_jaehrlich: 4000, in_kalkulation: true },
  ] },
};

/* Angebotsmail im Look des Kundenportals (Registry #168, Martin 15.11.2026: „A: Angebot + Erinnerungen“, Entwurf
   g1-angebot-vor-profil/eingangsbestaetigung_neu.html). Standardfall eine Person mit Pflegegrad 3: 3.050 € − 599 − 295 −
   333 = 1.823 €, im Pflegeheim 3.364 € → rund 1.541 € weniger. */
const kalkEine = {
  bruttopreis: 3050, eigenanteil: 1822.75,
  formularDaten: { betreuung_fuer: "1-person", pflegegrad: 3, mobilitaet: "rollator", nachteinsaetze: "gelegentlich", deutschkenntnisse: "kommunikativ", geschlecht: "weiblich" },
  "zuschüsse": { items: [
    { name: "pflegegeld", label: "Pflegegeld", betrag_monatlich: 599, betrag_jaehrlich: 7188, in_kalkulation: true },
    { name: "entlastungsbudget_neu", label: "Entlastungsbudget", betrag_monatlich: 294.92, betrag_jaehrlich: 3539, in_kalkulation: true },
    { name: "steuervorteil", label: "Steuervorteil", betrag_monatlich: 333.33, betrag_jaehrlich: 4000, in_kalkulation: true },
  ] },
};
const KRAEFTE: AngebotKraft[] = [
  { caregiverId: 11, vorname: "Maria", alter: 58, erfahrungJahre: 12, deutschWort: "Gut", cid: "kraft-0" },
  { caregiverId: 22, vorname: "Ewa", alter: null, erfahrungJahre: 1, deutschWort: null, cid: null },
];
const eingabe = (o: Partial<AngebotEingabe> = {}): AngebotEingabe =>
  ({ kalkulation: kalkEine, herkunft: null, portalBetreff: "X", resubmit: false, empfehlung: { sichtbar: 2, kraefte: KRAEFTE }, ...o });
const STERNE = { schnitt: "4,9", anzahl: 126 };
/** „Angebot & Pflegekräfte anzeigen" führt oben ins Portal (Registry #163), „Alle Pflegekräfte anzeigen" zur Liste, die Zeile
 *  einer Pflegekraft ins Profil (alles wie bis #168). */
const KNOPF = `${PORTAL}/?token=tok123&m=eb`;
/** Der Knopftext, wie er im HTML steht (`&` maskiert) und in `lesbar` erscheint. */
const KNOPF_HTML = "Angebot &amp; Pflegekräfte anzeigen";
const ALLE = `${PORTAL}/?token=tok123&m=eb&goto=matches`;
const profil = (id: number) => `${PORTAL}/?token=tok123&cg=${id}&m=eb`;
const ERKLAERUNG = "Im Kundenportal sehen Sie Ihr Angebot und passende Pflegekräfte. Beschreiben Sie einmal kurz die Pflegesituation, das dauert ca. 2 Minuten. Danach können sich Pflegekräfte direkt bei Ihnen bewerben. Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.";
const zaehle = (html: string, teil: string) => html.split(teil).length - 1;
/** Geschützte Leerzeichen als normale, damit Wortlaute vergleichbar sind. */
const nb = (s: string) => s.replace(/ /g, " ").replace(/‑/g, "-");

function inFolge(name: string, text: string, teile: string[]) {
  let ab = 0;
  for (const t of teile) {
    const i = text.indexOf(t, ab);
    assert(i >= 0, `${name}: „${t}" fehlt oder steht an falscher Stelle`);
    ab = i + t.length;
  }
}

// ── Regeln jeder Mail aus mailDesign.ts (Registry #168) ──────────────────────
const KORALLE = 'bgcolor="#E76F63"';
const GRUEN = 'bgcolor="#3D7A5C"';
/** Alle Links: href und die Farbe, die zuletzt im Stil steht (sie gewinnt). */
function links(html: string): { href: string; farbe: string | null; stil: string; inhalt: string }[] {
  return [...html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => {
    const href = m[1].match(/href="([^"]*)"/)?.[1] ?? "";
    const stil = m[1].match(/style="([^"]*)"/)?.[1] ?? "";
    const farben = [...stil.matchAll(/(?:^|;)color:([^;]+)/g)].map((f) => f[1].trim());
    return { href, farbe: farben.length ? farben[farben.length - 1] : null, stil, inhalt: m[2] };
  });
}

/** Was jede Mail im neuen Look erfüllt (Regeln: gruen-nur-knoepfe-keine-verfuegbarkeit, kundenmail-grundsaetze,
 *  martin-nie-nach-aussen). `korallen` = Zahl der Koralle-Knöpfe, `gruene` = Zahl der Formular-Knöpfe. */
function designRegeln(name: string, m: KundenMail, o: { korallen: number; gruene: number }) {
  assertEquals(m.komplett, true, `${name}: ganze Mail`);
  assert(m.html.startsWith("<!DOCTYPE html>"), `${name}: Hülle aus mailDesign.ts`);
  assert(!m.html.includes('class="email-content"'), `${name}: nicht in der alten Hülle`);
  // Gruß klein wie im Portal, in HTML und Text gleich.
  assertStringIncludes(m.html, ">Guten Tag, Frau Müller</p>", `${name}: Gruß`);
  assert(m.text.startsWith("Guten Tag, Frau Müller\n\n"), `${name}: Gruß im Text`);
  for (const f of [m.html, m.text, m.betreff, m.vorschau]) {
    assert(!/undefined|NaN|\[object Object\]/.test(f), `${name}: Platzhalter`);
  }
  assert(new TextEncoder().encode(m.html).length < 90_000, `${name}: zu groß für Gmail (${m.html.length})`);
  assert(m.vorschau.length > 20 && m.vorschau.length < 160, `${name}: Vorschautext`);
  assertStringIncludes(m.html, `mso-hide:all;font-size:1px;line-height:1px;color:#F2F1EE;">${m.vorschau.replace(/&/g, "&amp;")}</div>`);

  const s = sichtbar(m.html);
  // Keine Stufen, keine Einsätze, keine Verfügbarkeit einer einzelnen Kraft, kein Preis je Zeile (Martin 14.11.2026).
  // Die allgemeine Zeile „Diese Pflegekräfte sind verfügbar …“ bleibt (Martin 14.11. abends: „Text lassen“).
  for (const wort of ["Elite", "Stammkraft", "Bewährt", "Neu bei uns", "Neu bei Primundus", "Berufserfahren", "Einsatz", "Einsätze",
    "verfügbar ab", "sofort verfügbar", "Ab sofort", "zum gewünschten Start frei", "Ansehen", "Kostenrechner", "Betreuungskräfte",
    "Ein Klick genügt", "Martin", "Wysocki", "Mit freundlichen Grüßen", "—"]) {
    assert(!s.includes(wort) && !m.text.includes(wort), `${name}: enthält „${wort}"`);
  }
  // Marta in Ich-Form: kein Satz beginnt mit „Wir “.
  assert(!/(^|[.!?] )Wir /.test(s) && !/(^|[.!?]\s)Wir /.test(m.text), `${name}: Wir-Form`);
  // Kurze Signatur statt Martas großer Karte.
  inFolge(`${name} Signatur`, s, ["Viele Grüße", "Marta Kapcio", "Pflegeberaterin bei Primundus"]);
  assert(!m.html.includes("#25D366") && !m.html.includes("sig-pille"), `${name}: große Marta-Karte`);
  assertStringIncludes(m.html, 'src="https://primundus.de/images/marta-kapcio.jpg"');
  // Bilder wie bisher: Logo und Siegel vom Kostenrechner, Presse-Logos in der Fußzeile.
  assertStringIncludes(m.html, `src="${SITE}/images/Primundus-Logo_V6.png"`);
  assertStringIncludes(m.html, `src="${SITE}/images/primundus_testsieger-2021.webp"`);
  assertStringIncludes(m.html, `src="${SITE}/images/media/die-welt.webp"`);
  inFolge(`${name} Kopf`, s, ["6× Testsieger", "DIE WELT", "Preis & Qualität"]);
  // Fußzeile: Adresse und Abmelde-Link wie bisher (nur mit Token).
  inFolge(`${name} Fußzeile`, s, ["Primundus Deutschland", "24h-Pflege und Betreuung zu Hause", "Diese E-Mail wurde versendet an: kundin@beispiel.de",
    "Sie erhalten diese E-Mail, weil Sie eine Kalkulation auf primundus.de angefordert haben.", "Keine E-Mails mehr erhalten"]);
  assertStringIncludes(m.html, `href="${SITE}/abmelden?token=tok123"`);

  // Farben: nie Blau, keine alten Farben der Hülle und Karten.
  for (const alt of ["#0066CC", "#0066cc", "blue", "#2D1F0F", "#4A4540", "#f4f4f4", "#F6EFE4", "#D39B2A"]) {
    assert(!m.html.includes(alt), `${name}: alte Farbe ${alt}`);
  }
  // Knöpfe: Koralle für den Hauptknopf, Grün NUR für „Pflegesituation vervollständigen“.
  assertEquals(zaehle(m.html, KORALLE), o.korallen, `${name}: Koralle-Knöpfe`);
  assertEquals(zaehle(m.html, GRUEN), o.gruene, `${name}: grüne Knöpfe`);
  assertEquals(zaehle(m.html, ">Pflegesituation vervollständigen&nbsp;&rarr;</a>"), o.gruene, `${name}: Grün nur am Formular-Knopf`);
  for (const [i, teil] of m.html.split(GRUEN).slice(1).entries()) {
    assert(teil.slice(0, 600).includes(">Pflegesituation vervollständigen&nbsp;&rarr;</a>"), `${name}: grüner Knopf ${i} hat anderen Text`);
  }
  // Links: jede Farbe aus der Liste; Textlinks in Taupe; nie Grün; Portal-Links mit Kennung m=.
  const erlaubt = new Set(["#FFFFFF", "#6B5A44", "#1C1C1C", "#6B6B6B"]);
  for (const l of links(m.html)) {
    if (l.farbe === null) {
      assertEquals(l.href, "https://primundus.de", `${name}: Link ohne Stil nur am Logo`);
      continue;
    }
    assert(erlaubt.has(l.farbe), `${name}: Linkfarbe ${l.farbe} (${l.href})`);
    assert(!/#3D7A5C|#2A5C3F/i.test(l.stil), `${name}: grüner Link ${l.href}`);
    if (l.stil.includes("font-weight:600;text-decoration:underline")) assertEquals(l.farbe, "#6B5A44", `${name}: Textlink ${l.href}`);
    if (l.href.startsWith(PORTAL)) assert(/[?&]m=[a-z0-9]+/.test(l.href), `${name}: Portal-Link ohne m= (${l.href})`);
  }
  for (const url of m.text.match(/https:\/\/kundenportal\.primundus\.de\/\S+/g) ?? []) {
    assert(/[?&]m=[a-z0-9]+/.test(url), `${name}: Portal-Link im Text ohne m= (${url})`);
  }
  // Kopf und Fußzeile tragen Telefon und WhatsApp mit denselben Links wie Martas Karte.
  assertStringIncludes(m.html, `href="${TELEFON_HREF}"`);
}

/** Zeilen einer Pflegekraft: kein Preis, kein Knopf, ganze Zeile verlinkt. */
function zeilenOhnePreis(name: string, m: KundenMail) {
  // Ab <body>: Titel und Vorschau im Kopf können den Listentitel auch enthalten (Betreff von Nudge 1).
  const body = m.html.slice(m.html.indexOf("<body"));
  const liste = body.slice(body.indexOf(">Ihre Pflegekräfte-Auswahl<"), body.indexOf(ALLE_KRAEFTE));
  assert(liste.length > 0, `${name}: Liste fehlt`);
  assert(!liste.includes("€"), `${name}: Preis in der Liste`);
  assert(!liste.includes("bgcolor="), `${name}: Knopf in der Liste`);
  assert(!m.text.slice(m.text.indexOf("IHRE PFLEGEKRÄFTE-AUSWAHL"), m.text.indexOf(`${ALLE_KRAEFTE}:`)).includes("€"), `${name}: Preis in der Text-Liste`);
}

Deno.test("01 Angebot (#168): Inhalt und Reihenfolge wie der Entwurf, Martins Wortlaute unverändert", () => {
  const m = angebotMail({ ...k(), bewertung: STERNE }, eingabe());
  designRegeln("01", m, { korallen: 1, gruene: 0 });
  zeilenOhnePreis("01", m);
  assertEquals(nb(PORTAL_ERKLAERUNG), ERKLAERUNG, "Erklärsatz mit „ca. 2 Minuten“");
  inFolge("HTML", nb(lesbar(m.html)), [
    "Guten Tag, Frau Müller",
    "Ihr Preis für die Betreuung zu Hause",
    "Vielen Dank für Ihre Anfrage. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.",
    "3.050 € / Monat", "Nach Zuschüssen ca. 1.823 € im Monat", "rund 1.541 € weniger als im Pflegeheim",
    "Warum Primundus?", "Bestpreisgarantie", "Keine Vermittlungsgebühren", "Tägliche Kündigung", "Taggenaue Abrechnung",
    "4,9", "126 Bewertungen", "20 Jahre Erfahrung", "6× in Folge Testsieger",
    "Ihre Pflegekräfte-Auswahl 2", "Diese Pflegekräfte sind verfügbar und passen zu Ihrer Anfrage.",
    "Maria, 58", "12 Jahre Erfahrung", "Deutsch Gut",
    "Ewa", "1 Jahr Erfahrung",
    "Alle Pflegekräfte anzeigen",
    ERKLAERUNG,
    KNOPF_HTML.replace("&amp;", "&"),
    "Viele Grüße Marta Kapcio Pflegeberaterin bei Primundus",
    "Fragen? 089 200 000 830, täglich 8–20 Uhr, auch per WhatsApp.",
  ]);
  assertStringIncludes(m.html, "&#9733;".repeat(5));
  inFolge("Text", m.text, [
    "Guten Tag, Frau Müller\n\nIhr Preis für die Betreuung zu Hause\n\nVielen Dank für Ihre Anfrage. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.\n\n",
    "3.050 € / Monat\nNach Zuschüssen ca. 1.823 € im Monat\nrund 1.541 € weniger als im Pflegeheim\n\n"
      + `WARUM PRIMUNDUS?\n✓ Bestpreisgarantie: ${BESTPREIS_URL}\n✓ Keine Vermittlungsgebühren\n✓ Tägliche Kündigung\n✓ Taggenaue Abrechnung\n`
      + "4,9 ★★★★★ · 126 Bewertungen · 20 Jahre Erfahrung · 6× in Folge Testsieger\n\n",
    `IHRE PFLEGEKRÄFTE-AUSWAHL (2)\nDiese Pflegekräfte sind verfügbar und passen zu Ihrer Anfrage.\n- Maria, 58 · 12 Jahre Erfahrung · Deutsch Gut: ${profil(11)}\n`
      + `- Ewa · 1 Jahr Erfahrung: ${profil(22)}\nAlle Pflegekräfte anzeigen: ${ALLE}\n\n`,
    `${PORTAL_ERKLAERUNG}\n\nAngebot & Pflegekräfte anzeigen: ${KNOPF}\n\n`,
    "Viele Grüße\nMarta Kapcio\nPflegeberaterin bei Primundus\n\nFragen? 089 200 000 830, täglich 8–20 Uhr, auch per WhatsApp (https://wa.me/4989200000830).\n\nPrimundus Deutschland | www.primundus.de",
  ]);
  // Ein Knopf in Koralle oben ins Portal, sonst keine Knöpfe.
  assertEquals(zaehle(m.html, `href="${KNOPF}"`), 1, "genau ein Knopf ins Portal");
  inFolge("Knopf", m.html, [KORALLE, `href="${KNOPF}"`, `${KNOPF_HTML}&nbsp;&rarr;</a>`]);
  // Links: Logo, Bestpreisgarantie, je Pflegekraft die ganze Zeile (Foto, Name, Alter, je Angabe, Pfeil), die Liste, der Knopf,
  // Telefon und WhatsApp in der Signatur, Telefon, Mail, Website und Abmelden in der Fußzeile.
  assertEquals(zaehle(m.html, `href="${BESTPREIS_URL}"`), 1);
  assertEquals(zaehle(m.html, `href="${profil(11)}"`), 6, "Maria: Foto, Name, Alter, 2 Angaben, Pfeil");
  assertEquals(zaehle(m.html, `href="${profil(22)}"`), 4, "Ewa: Foto, Name, 1 Angabe, Pfeil");
  assertEquals(zaehle(m.html, `href="${ALLE}"`), 1);
  assertEquals(zaehle(m.html, "<a "), 1 + 1 + 6 + 4 + 1 + 1 + 2 + 3 + 1, "sonst keine Links");
  // Fotos als angehängte Bilder (cid), ohne Foto die Initiale.
  assertEquals(zaehle(m.html, 'src="cid:kraft-0"'), 2, "Outlook- und übrige Fassung");
  assertStringIncludes(m.html, ">E</div>");
  // Fällt weg (bis #168): Kasten „Ihr persönliches Angebot“ mit Mintkasten und alten Punkten, „Passende Pflegekräfte“,
  // Zeilen mit Preis und „Ansehen“, „etwa 2 Minuten“, der frühere Knopf ins Formular.
  for (const weg of ["Ihr persönliches Angebot", "IHR PERSÖNLICHES ANGEBOT", "Keine Vorauszahlung", "Keine Mindestlaufzeit", "Keine Vermittlungsgebühr ",
    "Passende Pflegekräfte", "PASSENDE PFLEGEKRÄFTE", "etwa 2", "Bewerbungen erhalten", "goto=anfragen", "kostenfrei & unverbindlich",
    "Einladen", "einladen", "Eingeladen", "#E8F5EE"]) {
    assert(!m.html.includes(weg) && !m.text.includes(weg), `enthält noch „${weg}"`);
  }
  assert(!m.html.includes(k().marta), "ohne Martas große Karte");
  // Betreff und Vorschau unverändert (Vorgabe).
  assertEquals(m.betreff, "Ihr Angebot und 2 passende Pflegekräfte");
  assertEquals(m.vorschau, "3.050 € im Monat, täglich kündbar. Zwei passende Pflegekräfte sind für Sie ausgewählt.");
});

Deno.test("01 Angebot: Telefon und WhatsApp mit denselben Links wie Martas Karte", () => {
  const m = angebotMail({ ...k(), bewertung: STERNE }, eingabe());
  const karte = martaKarteHtml({ fuer: "kunde", bewertung: STERNE, siteUrl: SITE, presseLogos: false });
  for (const href of [TELEFON_HREF, WHATSAPP_HREF]) {
    assertStringIncludes(m.html, `href="${href}"`);
    assertStringIncludes(karte, `href="${href}"`);
  }
});

Deno.test("01 Angebot: Ehepaar mit Zuschüssen wie im Portal, ohne Zuschüsse keine grüne Zeile und kein Heimvergleich", () => {
  const paar = angebotMail(k(), eingabe({ kalkulation: kalkPosten }));
  inFolge("Ehepaar", lesbar(paar.html), ["3.050 € / Monat", "Nach Zuschüssen ca. 1.622 € im Monat", "rund 1.742 € weniger als im Pflegeheim", "Bestpreisgarantie"]);
  assertStringIncludes(paar.text, "3.050 € / Monat\nNach Zuschüssen ca. 1.622 € im Monat\nrund 1.742 € weniger als im Pflegeheim\n\nWARUM PRIMUNDUS?\n✓ Bestpreisgarantie");
  assert(!paar.html.includes("Gerechnet ist") && !paar.text.includes("Gerechnet ist"));

  const ohne = angebotMail(k(), eingabe({ kalkulation: kalk }));
  const s = lesbar(ohne.html);
  inFolge("ohne Zuschüsse", s, ["Ihr Preis für die Betreuung zu Hause", "3.050 € / Monat", "Warum Primundus?", "Bestpreisgarantie", "Taggenaue Abrechnung"]);
  for (const weg of ["Nach Zuschüssen", "weniger", "Pflegeheim"]) {
    assert(!s.includes(weg) && !ohne.text.includes(weg), `enthält „${weg}"`);
  }
  assertStringIncludes(ohne.text, "3.050 € / Monat\n\nWARUM PRIMUNDUS?\n✓ Bestpreisgarantie");
});

Deno.test("01 Angebot: Pflegekräfte höchstens fünf, Angaben nur wenn vorhanden, Name maskiert", () => {
  const sieben = Array.from({ length: 7 }, (_, i) => ({ ...KRAEFTE[0], caregiverId: 100 + i, vorname: `K${i}`, cid: null }));
  const m = angebotMail(k(), eingabe({ empfehlung: { sichtbar: 5, kraefte: sieben } }));
  assertEquals(zaehle(m.html, ">&#8250;</a>"), 5, "fünf Zeilen mit Pfeil");
  assertStringIncludes(lesbar(m.html), "Ihre Pflegekräfte-Auswahl 5");
  assert(!m.html.includes(profil(105)) && !m.text.includes(profil(105)), "die sechste fehlt");
  assertEquals(m.betreff, "Ihr Angebot und 5 passende Pflegekräfte");

  const knapp = angebotMail(k(), eingabe({ empfehlung: { sichtbar: 1, kraefte: [{ caregiverId: 7, vorname: "A<b>", alter: null, erfahrungJahre: 0, deutschWort: null, cid: null }] } }));
  assertStringIncludes(knapp.html, "A&lt;b&gt;");
  assert(!knapp.html.includes("A<b>"));
  assertStringIncludes(knapp.text, `- A<b>: ${profil(7)}`);
  assertEquals(knapp.betreff, "Ihr Angebot und eine passende Pflegekraft");
  assertEquals(knapp.vorschau, "3.050 € im Monat, täglich kündbar. Eine passende Pflegekraft ist für Sie ausgewählt.");

  assertEquals(kraftFakten({ erfahrungJahre: 0, deutschWort: null }), []);
  assertEquals(kraftFakten({ erfahrungJahre: 1, deutschWort: "Gut" }), ["1 Jahr Erfahrung", "Deutsch Gut"]);
  assertEquals(kraftFakten({ erfahrungJahre: 12, deutschWort: null }), ["12 Jahre Erfahrung"]);
});

Deno.test("01 Angebot: ohne Pflegekräfte keine Liste, Erklärung und Knopf bleiben", () => {
  for (const empfehlung of [null, { sichtbar: 3 }, { sichtbar: 3, kraefte: [] }]) {
    const m = angebotMail(k(), eingabe({ empfehlung }));
    designRegeln(`01 ohne Liste ${JSON.stringify(empfehlung)}`, m, { korallen: 1, gruene: 0 });
    for (const weg of ["Ihre Pflegekräfte-Auswahl", "IHRE PFLEGEKRÄFTE-AUSWAHL", "Alle Pflegekräfte anzeigen", "goto=matches", "cg="]) {
      assert(!m.html.includes(weg) && !m.text.includes(weg), `enthält „${weg}"`);
    }
    inFolge("ohne Liste", nb(lesbar(m.html)), ["Taggenaue Abrechnung", ERKLAERUNG, "Angebot & Pflegekräfte anzeigen"]);
    // Logo, Bestpreisgarantie, Knopf, Telefon + WhatsApp, Fußzeile 3 + Abmelden.
    assertEquals(zaehle(m.html, "<a "), 9);
  }
  const ohne = angebotMail(k(), eingabe({ empfehlung: null }));
  assertEquals(ohne.betreff, "Ihr Angebot zur 24-Stunden-Betreuung – Primundus");
  assertEquals(ohne.vorschau, "3.050 € im Monat, täglich kündbar, ohne Vermittlungsgebühr.");
});

Deno.test("01 Angebot: erneute Anfrage und eingekaufter Lead", () => {
  const neu = angebotMail(k(), eingabe({ resubmit: true }));
  assertStringIncludes(lesbar(neu.html), "Ihr Preis für die Betreuung zu Hause Vielen Dank für Ihre erneute Anfrage. Ich habe Ihre Angaben übernommen und Ihr Angebot angepasst. 3.050 €");
  assertStringIncludes(neu.text, "\n\nVielen Dank für Ihre erneute Anfrage. Ich habe Ihre Angaben übernommen und Ihr Angebot angepasst.\n\n");
  assertEquals(neu.betreff, "Ihr aktualisiertes Angebot und 2 passende Pflegekräfte");
  assertEquals(angebotMail(k(), eingabe({ resubmit: true, empfehlung: null })).betreff, "Ihr aktualisiertes Angebot zur 24-Stunden-Betreuung – Primundus");
  // Herkunft schlägt Resubmit: Portalname im Einstieg, eigener Betreff.
  const portal = angebotMail(k(), eingabe({ herkunft: "Pflegehilfe", portalBetreff: "Portal-Betreff", resubmit: true }));
  assertStringIncludes(lesbar(portal.html), "Vielen Dank für Ihre Anfrage über Pflegehilfe. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.");
  assertStringIncludes(portal.text, "\n\nVielen Dank für Ihre Anfrage über Pflegehilfe. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.\n\n");
  assertEquals(portal.betreff, "Portal-Betreff");
  assertStringIncludes(angebotMail(k(), eingabe({ herkunft: "A<b>" })).html, "A&lt;b&gt;");
});

/* Hinweis zu den Angaben bei eingekauften Leads: Wortlaut aus herkunft.ts wie bisher. Bedingungen wie bis #148: jede
   Herkunft; „vorsichtig angenommen", wenn `angenommene_felder` nicht leer ist oder fehlt, sonst „übernommen". */
const HINWEIS_ANGENOMMEN = "Diese Angaben haben wir aus Ihrer Anfrage bei Pflegehilfe übernommen und dort, wo uns etwas fehlte, vorsichtig angenommen. Im Kundenportal können Sie alles in einer Minute korrigieren. Der Preis passt sich sofort an.";
const HINWEIS_UEBERNOMMEN = "Diese Angaben haben wir aus Ihrer Anfrage bei Pflegehilfe übernommen. Stimmt etwas nicht, können Sie es im Kundenportal in einer Minute korrigieren. Der Preis passt sich sofort an.";

Deno.test("01 Angebot: eingekaufter Lead mit Annahmen, Hinweis klein direkt unter der Preiskarte", () => {
  const ehepaar = { ...kalkPosten, angenommene_felder: ["betreuung_fuer", "nachteinsaetze"] };
  const m = angebotMail({ ...k(), bewertung: STERNE },
    eingabe({ kalkulation: ehepaar, herkunft: "Pflegehilfe", angenommeneFelder: ehepaar.angenommene_felder, portalBetreff: "Portal-Betreff" }));
  designRegeln("01 Pflegehilfe", m, { korallen: 1, gruene: 0 });
  assertEquals(zaehle(m.html, "<a "), 20, "der Hinweis bringt keinen Link mit");
  inFolge("HTML", lesbar(m.html), [
    "Vielen Dank für Ihre Anfrage über Pflegehilfe.", "3.050 €", "Taggenaue Abrechnung", "6× in Folge Testsieger",
    HINWEIS_ANGENOMMEN, "Ihre Pflegekräfte-Auswahl", "Angebot & Pflegekräfte anzeigen",
  ]);
  inFolge("Text", m.text, ["3.050 € / Monat\n", "6× in Folge Testsieger\n\n", `${HINWEIS_ANGENOMMEN}\n\nIHRE PFLEGEKRÄFTE-AUSWAHL (2)\n`]);
  // Direkt nach der Preiskarte (Ende der Karte, Abstand, Hinweis), klein und grau.
  assert(/<\/table><\/td><\/tr>\n<tr><td class="pm-rand" style="padding:0 24px;"><div style="height:12px;[^"]*">&nbsp;<\/div><p style="margin:0;font-size:14px;line-height:21px;color:#6B6B6B;">Diese Angaben haben wir/.test(m.html), "Hinweis direkt unter der Preiskarte");
  assertEquals(zaehle(m.html, "Diese Angaben haben wir"), 1, "einmal");
});

Deno.test("01 Angebot: Färbung des Hinweises nach angenommene_felder, Rechner-Leads ohne Hinweis", () => {
  const mit = (felder?: unknown) => angebotMail(k(), eingabe({ herkunft: "Pflegehilfe", angenommeneFelder: felder }));
  // Fehlt die Liste (Altbestand), gilt der vorsichtigere Text.
  for (const felder of [undefined, null, ["betreuung_fuer"]]) {
    const m = mit(felder);
    assertStringIncludes(lesbar(m.html), HINWEIS_ANGENOMMEN, `angenommen bei ${JSON.stringify(felder)}`);
    assertStringIncludes(m.text, HINWEIS_ANGENOMMEN);
  }
  const alles = mit([]);
  designRegeln("01 Pflegehilfe ohne Annahmen", alles, { korallen: 1, gruene: 0 });
  assertStringIncludes(lesbar(alles.html), HINWEIS_UEBERNOMMEN);
  assertStringIncludes(alles.text, HINWEIS_UEBERNOMMEN);
  assert(!alles.html.includes("vorsichtig angenommen") && !alles.text.includes("vorsichtig angenommen"));
  // Ohne Preis keine Preiskarte; der Hinweis steht dann unter dem Einstieg (bis #148: bei jeder Herkunft).
  const ohnePreis = angebotMail(k(), eingabe({ kalkulation: null, herkunft: "Pflegehilfe", angenommeneFelder: [] }));
  inFolge("ohne Preis", lesbar(ohnePreis.html), ["über Pflegehilfe.", HINWEIS_UEBERNOMMEN, "Ihre Pflegekräfte-Auswahl", "Angebot & Pflegekräfte anzeigen"]);
  // Rechner-Leads (ohne Herkunft) sehen nichts davon, auch wenn eine Liste in der Kalkulation stünde.
  for (const felder of [undefined, [], ["betreuung_fuer"]]) {
    const r = angebotMail(k(), eingabe({ angenommeneFelder: felder }));
    assert(!r.html.includes("Diese Angaben") && !r.text.includes("Diese Angaben"), `Rechner-Lead ${JSON.stringify(felder)}`);
  }
});

Deno.test("01 Angebot: Sterne nur mit Live-Stand; ohne Preis kein Preis-Titel, keine Preiskarte, keine Preise an den Pflegekräften", () => {
  const ohneSterne = angebotMail(k(), eingabe());
  assert(!ohneSterne.html.includes("Bewertungen") && !ohneSterne.html.includes("&#9733;"));
  assert(!ohneSterne.text.includes("★") && !ohneSterne.text.includes("Bewertungen"));
  inFolge("ohne Sterne", lesbar(ohneSterne.html), ["Taggenaue Abrechnung", "20 Jahre Erfahrung", "6× in Folge Testsieger"]);
  assertStringIncludes(ohneSterne.text, "✓ Taggenaue Abrechnung\n20 Jahre Erfahrung · 6× in Folge Testsieger\n");
  // 4,4 → vier goldene, ein leerer Stern (wie FuenfSterne im Portal).
  const vier = angebotMail({ ...k(), bewertung: { schnitt: "4,4", anzahl: 1 } }, eingabe());
  assertStringIncludes(vier.html, `color:#D4A843;">${"&#9733;".repeat(4)}</span>`);
  assertStringIncludes(lesbar(vier.html), "1 Bewertung ");
  assertStringIncludes(vier.text, "4,4 ★★★★☆ · 1 Bewertung · ");

  const leer = angebotMail(k(), eingabe({ kalkulation: null }));
  designRegeln("01 ohne Kalkulation", leer, { korallen: 1, gruene: 0 });
  const s = lesbar(leer.html);
  assert(!/Ihr Preis für|€|Zuschüssen|Bestpreisgarantie|Warum Primundus/.test(s), s);
  assert(!/Ihr Preis für|€|Bestpreisgarantie|WARUM PRIMUNDUS/.test(leer.text));
  inFolge("ohne Kalkulation", nb(s), ["Ihr persönliches Angebot zur 24-Stunden-Betreuung", "Vielen Dank", "Ihre Pflegekräfte-Auswahl 2", "Maria, 58", "Ewa", ERKLAERUNG]);
  assertEquals(leer.vorschau, "Ihr persönliches Angebot zur 24-Stunden-Betreuung.");
});

Deno.test("01 Angebot: ohne Token keine Portal-Links und kein Abmelde-Link", () => {
  const m = angebotMail({ ...k(null), abmelden: null }, eingabe());
  assert(!m.html.includes(PORTAL) && !m.text.includes(PORTAL), "kein Portal-Link ohne Token");
  assert(!m.html.includes("Keine E-Mails mehr erhalten"));
  assertStringIncludes(m.html, `href="${SITE}"`);
});

Deno.test("Kontext: Bewertungsstand nur live, Ersatzwert zählt nicht", () => {
  assertEquals(bewertungNurLive(BEWERTUNGS_STAND_ERSATZ), null);
  assertEquals(bewertungNurLive(null), null);
  assertEquals(bewertungNurLive({ schnitt: "4,9", anzahl: 126 }), { schnitt: "4,9", anzahl: 126 }, "gleiche Werte, aber vom Abruf");
  assertEquals(grussZeile("Guten Tag Frau Müller"), "Guten Tag, Frau Müller");
  assertEquals(grussZeile("Guten Tag Familie Schmidt-Lange"), "Guten Tag, Familie Schmidt-Lange");
  assertEquals(grussZeile("Guten Tag"), "Guten Tag");
});

Deno.test("Eigenanteil: nur mit lesbaren Posten und aufgehender Rechnung", () => {
  const e = eigenanteilAus(kalkPosten);
  assertEquals(e?.eigen, 1622);
  assertEquals(e?.posten.map((p) => p.wort), ["Pflegegeld", "Entlastungsbudget", "Steuerersparnis"]);
  assertEquals(e?.ehepaar, true);
  assertEquals(eigenanteilAus(kalk), null, "ohne Posten");
  assertEquals(eigenanteilAus({ ...kalkPosten, eigenanteil: 1700 }), null, "Abweichung über 2 €");
  const fremd = { ...kalkPosten, "zuschüsse": { items: [...kalkPosten["zuschüsse"].items, { name: "unbekannt", betrag_monatlich: 50, betrag_jaehrlich: 600, in_kalkulation: true }] } };
  assertEquals(eigenanteilAus(fremd), null, "unbekannter Posten");
  const ohnePg = { bruttopreis: 3050, eigenanteil: 2716.67, formularDaten: { betreuung_fuer: "1-person", pflegegrad: 0 }, "zuschüsse": { items: [
    { name: "steuervorteil", betrag_monatlich: 333.33, betrag_jaehrlich: 4000, in_kalkulation: true },
    { name: "pflegegeld", betrag_monatlich: 0, betrag_jaehrlich: 0, in_kalkulation: false },
  ] } };
  assertEquals(eigenanteilAus(ohnePg)?.posten.map((p) => p.name), ["steuervorteil"]);
  assertEquals(eigenanteilAus(kalkEine)?.eigen, 1823);
});

Deno.test("Heim-Vergleich nur mit echter Kalkulation unter dem Heim-Schnitt", () => {
  assertEquals(heimVergleich({ eigenanteil: 1621.75 }), { eigen: 1622, diff: 1742 });
  assertEquals(heimVergleich({ eigenanteil: 3500 }), null);
  assertEquals(heimVergleich(null), null);
});

// ── 02 Nudge 1 (#168) ──────────────────────────────────────────────────────
const PN1_FORMULAR = `${PORTAL}/?token=tok123&goto=anfragen&m=pn1`;
const PN1_ALLE = `${PORTAL}/?token=tok123&goto=matches&m=pn1`;
const pn1Profil = (id: number) => `${PORTAL}/?token=tok123&cg=${id}&m=pn1`;
const FUENF: AngebotKraft[] = ["Maria", "Ewa", "Jolanta", "Beata", "Irena"].map((vorname, i) =>
  ({ caregiverId: 31 + i, vorname, alter: 50 + i, erfahrungJahre: 9 - i, deutschWort: i < 2 ? "Gut" : "Mittel", cid: i < 4 ? `pn1-${i}` : null }));

Deno.test("02 Nudge 1: Betreff, Vorschau und Text wie der Entwurf", () => {
  assertEquals(NUDGE1_BETREFF, "Ihre Pflegekräfte-Auswahl: Es fehlt die Pflegesituation");
  assertEquals(nudge1Vorschau(["Maria", "Ewa", "Jolanta", "Beata", "Irena"]), "Beschreiben Sie kurz die Pflegesituation, ca. 2 Minuten. Dann können sich Maria, Ewa und drei weitere bei Ihnen bewerben.");
  assertEquals(nudge1Vorschau(["Maria", "Ewa", "Jolanta"]), "Beschreiben Sie kurz die Pflegesituation, ca. 2 Minuten. Dann können sich Maria, Ewa und eine weitere bei Ihnen bewerben.");
  assertEquals(nudge1Vorschau(["Maria", "Ewa"]), "Beschreiben Sie kurz die Pflegesituation, ca. 2 Minuten. Dann können sich Maria und Ewa bei Ihnen bewerben.");
  assertEquals(nudge1Vorschau(["Maria"]), "Beschreiben Sie kurz die Pflegesituation, ca. 2 Minuten. Dann kann sich Maria bei Ihnen bewerben.");
  assertEquals(nudge1Vorschau([]), "Beschreiben Sie kurz die Pflegesituation, ca. 2 Minuten. Dann können sich passende Pflegekräfte bei Ihnen bewerben.");

  const m = nudge1Mail(k(), { kraefte: FUENF });
  designRegeln("02", m, { korallen: 0, gruene: 1 });
  zeilenOhnePreis("02", m);
  assertEquals(m.betreff, NUDGE1_BETREFF);
  inFolge("HTML", nb(lesbar(m.html)), [
    "Guten Tag, Frau Müller", "Noch ein Schritt bis zu Ihren Bewerbungen",
    "Ihre Pflegekräfte-Auswahl 5", "Diese Pflegekräfte sind verfügbar und passen zu Ihrer Anfrage.",
    "Maria, 50", "9 Jahre Erfahrung", "Deutsch Gut", "Ewa, 51", "Jolanta, 52", "Beata, 53", "Irena, 54", "5 Jahre Erfahrung", "Deutsch Mittel",
    "Alle Pflegekräfte anzeigen",
    "! Ihre Angaben sind noch unvollständig",
    "Beschreiben Sie kurz die Pflegesituation. So verstehen die Pflegekräfte, worauf es bei Ihnen ankommt, und können sich unverbindlich bewerben. Das dauert ca. 2 Minuten.",
    "Pflegesituation vervollständigen →",
    "Jede Bewerbung bekommen Sie per E-Mail, mit Anreisedatum und Preis. Ein Vertrag entsteht erst, wenn Sie eine Bewerbung annehmen und im Portal unterschreiben.",
    "Viele Grüße", "Marta Kapcio", "Fragen? 089 200 000 830",
  ]);
  // Der Kasten steht IN der Listenkarte unter dem Textlink, mit feiner Linie davor (wie [data-liste-knopf]).
  inFolge("Kasten in der Karte", m.html, [`href="${PN1_ALLE}"`, '<tr><td style="border-top:1px solid #F0EDE8;padding:20px 16px;">', LISTE_UNVOLLSTAENDIG, GRUEN, `href="${PN1_FORMULAR}"`, "</td></tr>\n</table>"]);
  // Links mit m=pn1 wie bisher: Profil je Kraft, Liste, Formular.
  for (const x of FUENF) assert(zaehle(m.html, `href="${pn1Profil(x.caregiverId)}"`) >= 4, `Profil ${x.vorname}`);
  assertEquals(zaehle(m.html, `href="${PN1_ALLE}"`), 1);
  assertEquals(zaehle(m.html, `href="${PN1_FORMULAR}"`), 1);
  // Fotos per cid, ohne Foto der Anfangsbuchstabe.
  for (let i = 0; i < 4; i++) assertEquals(zaehle(m.html, `src="cid:pn1-${i}"`), 2);
  assertStringIncludes(m.html, ">I</div>");
  inFolge("Text", m.text, [
    "Guten Tag, Frau Müller\n\nNoch ein Schritt bis zu Ihren Bewerbungen\n\n",
    `IHRE PFLEGEKRÄFTE-AUSWAHL (5)\nDiese Pflegekräfte sind verfügbar und passen zu Ihrer Anfrage.\n- Maria, 50 · 9 Jahre Erfahrung · Deutsch Gut: ${pn1Profil(31)}\n`,
    `- Irena, 54 · 5 Jahre Erfahrung · Deutsch Mittel: ${pn1Profil(35)}\nAlle Pflegekräfte anzeigen: ${PN1_ALLE}\n\n`,
    `Ihre Angaben sind noch unvollständig\n${LISTE_WARUM}\nPflegesituation vervollständigen: ${PN1_FORMULAR}\n\n`,
    "Jede Bewerbung bekommen Sie per E-Mail, mit Anreisedatum und Preis. Ein Vertrag entsteht erst, wenn Sie eine Bewerbung annehmen und im Portal unterschreiben.\n\n",
    "Viele Grüße\nMarta Kapcio",
  ]);
  // Fällt weg (bis #168): große Profilkarten mit Stufe und Einsätzen, Nachnamen-Kürzel, „zum gewünschten Start frei“,
  // Koralle-Knopf „Bewerbungen erhalten“, „Ein Vertrag entsteht erst, wenn Sie zusagen“.
  for (const weg of ["Bewerbungen erhalten", "wenn Sie zusagen", "Profil ansehen", "Passend zu Ihrer Anfrage", "Lieber am Telefon", "Anreisetermin"]) {
    assert(!m.html.includes(weg) && !m.text.includes(weg), `enthält noch „${weg}"`);
  }
});

Deno.test("02 Nudge 1: höchstens fünf, ohne Liste der Kasten allein", () => {
  const sieben = [...FUENF, { ...FUENF[0], caregiverId: 99, vorname: "Zofia" }, { ...FUENF[0], caregiverId: 98, vorname: "Anna" }];
  const m = nudge1Mail(k(), { kraefte: sieben });
  assertEquals(zaehle(m.html, ">&#8250;</a>"), 5);
  assert(!m.html.includes(pn1Profil(99)) && !m.vorschau.includes("Zofia"));
  for (const liste of [null, { kraefte: [] }]) {
    const ohne = nudge1Mail(k(), liste);
    designRegeln(`02 ohne Liste ${JSON.stringify(liste)}`, ohne, { korallen: 0, gruene: 1 });
    assertEquals(ohne.vorschau, "Beschreiben Sie kurz die Pflegesituation, ca. 2 Minuten. Dann können sich passende Pflegekräfte bei Ihnen bewerben.");
    // Der Betreff nennt die Auswahl weiter (im Portal steht sie), die Mail zeigt ohne Liste keine.
    for (const weg of ["IHRE PFLEGEKRÄFTE-AUSWAHL", "cg=", "goto=matches", "Alle Pflegekräfte anzeigen"]) {
      assert(!ohne.html.includes(weg) && !ohne.text.includes(weg), `enthält „${weg}"`);
    }
    assert(!lesbar(ohne.html).includes("Ihre Pflegekräfte-Auswahl"), "keine Liste");
    inFolge("ohne Liste", lesbar(ohne.html), ["Noch ein Schritt bis zu Ihren Bewerbungen", "Ihre Angaben sind noch unvollständig", "Pflegesituation vervollständigen", "Jede Bewerbung"]);
    assertStringIncludes(ohne.text, `Pflegesituation vervollständigen: ${PN1_FORMULAR}`);
  }
});

// ── 03 Nudge 2 (#168) ──────────────────────────────────────────────────────
Deno.test("03 Nudge 2: Telefon zuerst, WhatsApp nur zur Terminabsprache, dann grüner Formular-Knopf", () => {
  const m = nudge2Mail(k());
  designRegeln("03", m, { korallen: 0, gruene: 1 });
  const url = `${PORTAL}/?token=tok123&goto=anfragen&m=pn2`;
  assertEquals(m.betreff, "Soll ich die Angaben am Telefon mit Ihnen ausfüllen?");
  assertEquals(m.vorschau, "Rufen Sie mich an, am Telefon trage ich alles für Sie ein.");
  inFolge("HTML", nb(lesbar(m.html)), [
    "Guten Tag, Frau Müller", "Soll ich die Angaben mit Ihnen ausfüllen?",
    "Bei Ihnen kann sich noch keine Pflegekraft bewerben, weil Angaben zur Pflegesituation fehlen, zum Beispiel Ort und gewünschter Start.",
    "Rufen Sie mich an unter 089 200 000 830 oder schreiben Sie mir per WhatsApp, wann ich Sie anrufen darf. Ich stelle Ihnen die Fragen am Telefon und trage alles für Sie ein.",
    "Selbst ausfüllen geht auch: Das dauert ca. 2 Minuten, einiges ist aus Ihren bisherigen Angaben schon übernommen.",
    "Pflegesituation vervollständigen →",
    "Viele Grüße", "Marta Kapcio", "Pflegeberaterin bei Primundus", "Primundus Deutschland",
  ]);
  // Telefon vor dem Formular-Knopf; Signatur ohne Kontaktzeile (die Nummer steht schon im Text).
  inFolge("Reihenfolge", m.html, [`href="${TELEFON_HREF}"`, `href="${WHATSAPP_HREF}"`, GRUEN, `href="${url}"`]);
  assert(!lesbar(m.html).includes("Fragen?") && !m.text.includes("Fragen?"), "Signatur ohne Kontaktzeile");
  assertEquals(zaehle(m.html, `href="${WHATSAPP_HREF}"`), 1, "WhatsApp einmal, im Text");
  inFolge("Text", m.text, [
    "Guten Tag, Frau Müller\n\nSoll ich die Angaben mit Ihnen ausfüllen?\n\n",
    "Bei Ihnen kann sich noch keine Pflegekraft bewerben",
    `Rufen Sie mich an unter 089 200 000 830 oder schreiben Sie mir per WhatsApp (${WHATSAPP_HREF}), wann ich Sie anrufen darf.`,
    `Pflegesituation vervollständigen: ${url}\n\n`,
    "Viele Grüße\nMarta Kapcio\nPflegeberaterin bei Primundus\n\nPrimundus Deutschland | www.primundus.de",
  ]);
  // Fällt weg (bis #168): „Mobilität und Einsatzort“, „wann es Ihnen passt“ (WhatsApp für Angaben), Koralle-Knopf.
  for (const weg of ["Mobilität", "wann es Ihnen passt", "Bewerbungen erhalten", "vieles haben Sie"]) {
    assert(!m.html.includes(weg) && !m.text.includes(weg), `enthält noch „${weg}"`);
  }
});

// ── 06 Abschied (#168) ─────────────────────────────────────────────────────
Deno.test("06 Abschied: ein Koralle-Knopf, zwei Taupe-Links, Schlusssatz in Ich-Form", () => {
  const m = nachfass3Mail(k(), "Müller, Anna");
  designRegeln("06", m, { korallen: 1, gruene: 0 });
  const r = (knopf: string) => `${SITE}/rueckmeldung?token=tok123&knopf=${knopf}`;
  assertEquals(m.betreff, "Eine letzte Frage: Wie ist der Stand bei Ihnen?");
  assertEquals(m.vorschau, "Noch Interesse, später oder nicht mehr? Tippen Sie auf die passende Antwort.");
  assertEquals(ABSCHIED_SATZ, "Ohne Ihre Rückmeldung schreibe ich Ihnen danach nicht mehr zu dieser Anfrage.");
  inFolge("HTML", lesbar(m.html), [
    "Guten Tag, Frau Müller", "Wie ist der Stand bei Ihnen?",
    "Ich möchte Sie nicht mit weiteren E-Mails stören. Sagen Sie mir kurz, wie es bei Ihnen weitergeht.",
    "Ja, ich habe noch Interesse →", "Aktuell nicht, vielleicht später ›", "Nicht mehr relevant ›",
    ABSCHIED_SATZ, "Viele Grüße", "Marta Kapcio", "Fragen? 089 200 000 830",
  ]);
  // Knopf in Koralle mit „Ja“, die anderen zwei als Textlinks; Ziele unverändert (rueckmeldungLink, ohne m=).
  inFolge("Knopf", m.html, [KORALLE, `href="${r("interesse")}"`, `${RUECKMELDUNG_KNOEPFE.interesse}&nbsp;&rarr;</a>`]);
  for (const knopf of ["aktuell-nicht", "nicht-relevant"] as const) {
    const l = links(m.html).find((x) => x.href === r(knopf));
    assert(l, knopf);
    assertEquals(l!.farbe, "#6B5A44", `${knopf} in Taupe`);
    assertStringIncludes(l!.inhalt, `${RUECKMELDUNG_KNOEPFE[knopf]}&nbsp;&rsaquo;`);
  }
  inFolge("Text", m.text, [
    "Guten Tag, Frau Müller\n\nWie ist der Stand bei Ihnen?\n\nIch möchte Sie nicht mit weiteren E-Mails stören. Sagen Sie mir kurz, wie es bei Ihnen weitergeht.\n\n",
    `${RUECKMELDUNG_KNOEPFE.interesse}:\n${r("interesse")}\n\n`,
    `${RUECKMELDUNG_KNOEPFE["aktuell-nicht"]}:\n${r("aktuell-nicht")}\n\n`,
    `${RUECKMELDUNG_KNOEPFE["nicht-relevant"]}:\n${r("nicht-relevant")}\n\n`,
    `${ABSCHIED_SATZ}\n\nViele Grüße\nMarta Kapcio`,
  ]);
  // Fällt weg (bis #168): Versalzeile, Rahmenknöpfe, „melde ich mich in einigen Wochen“, „Ein Klick genügt“.
  for (const weg of ["IHRE RÜCKMELDUNG", ">Ihre Rückmeldung<", "letter-spacing:.14em", "in einigen Wochen", "Klick", "#C9BCA8", "border-radius:999px;padding:13px"]) {
    assert(!m.html.includes(weg) && !m.text.includes(weg), `enthält noch „${weg}"`);
  }
  // ohne Token: Antwort per Mail an info@, nie ein toter Link
  const ohne = nachfass3Mail({ ...k(null), abmelden: null }, "Müller, Anna");
  assertEquals(zaehle(ohne.html, 'href="mailto:info@primundus.de?subject='), 3);
  assert(!ohne.html.includes("/rueckmeldung"));
});

Deno.test("04, 05, 08, 09: Knopf und Ziel (alte Bausteine)", () => {
  // „Vier Dinge“ und Nachfass 2 sind seit #168 gestrichen (kette.ts), ihr Code rendert nur noch im Testversand.
  const vier = vierDingeMail(k(), kalk);
  pruefe("04", vier, "Bewerbungen erhalten", "goto=anfragen&m=wp");
  for (const t of ["Bei uns ist alles transparent.", "Sie binden sich nicht.", "Sie zahlen nie zu viel.", "Sie sind nie allein.", "60.000", "20 Jahre"]) {
    assertStringIncludes(sichtbar(vier.html), t);
  }
  pruefe("05", nachfass2Mail(k()), "Bewerbungen erhalten", "goto=anfragen&m=nf2");
  pruefe("08", sucheStandMail(k()), "Pflegekräfte einladen", "goto=matches&m=st2");
  pruefe("09", neuePflegekraefteMail(k()), "Neue Pflegekräfte ansehen", "goto=matches&m=npk");
  for (const m of [vier, sucheStandMail(k())]) assert(!m.komplett, "alte Mails gehen weiter in die Hülle aus index.ts");
});

Deno.test("12–14 Erinnerungen: Countdown, Karte, Knopf öffnet die Bewerbung", () => {
  const pk = { name: "Maria K.", alter: 62, deutsch: "Gut", jahre: 6, einsaetze: 14, foto: null };
  const angebot = { tagessatz: 102, zeitraum: "15.10.2026 – 10.12.2026", reisekosten: 125 };
  const url = `${PORTAL}/?token=tok123&job=u1&view=application&m=er1`;
  const H = 60 * 60 * 1000;
  const e1 = erinnerungMail(k(), { stufe: "1", pk, angebot, url, restMs: 52 * H });
  pruefe("12", e1, "Angebot prüfen", url);
  assertEquals(e1.betreff, "Marias Bewerbung: noch 2 Tage für Sie reserviert");
  assertStringIncludes(sichtbar(e1.html), "Noch 2 Tage für Sie reserviert");
  assertStringIncludes(sichtbar(e1.html), "102 € / Tag");
  const e2 = erinnerungMail(k(), { stufe: "2", pk, angebot, url, restMs: 24 * H });
  assertEquals(e2.betreff, "Noch 24 Stunden: Marias Bewerbung");
  const e3 = erinnerungMail(k(), { stufe: "letzte", pk, angebot, url, restMs: 8 * H });
  assertEquals(e3.betreff, "Nur noch 8 Stunden reserviert: Marias Bewerbung");
  assertStringIncludes(sichtbar(e3.html), "Danach endet die Reservierung automatisch.");
  // Ende unbekannt: kein erfundener Countdown
  const ohne = erinnerungMail(k(), { stufe: "2", pk, angebot: { tagessatz: null, zeitraum: null, reisekosten: null }, url, restMs: null });
  assertEquals(ohne.betreff, "Marias Bewerbung wartet auf Ihre Antwort");
  assert(!/reserviert|Stunden|Tage/.test(sichtbar(ohne.html).replace("Reservierung", "")));
});

Deno.test("16 Reservierung beendet: eine oder mehrere Pflegekräfte", () => {
  const eine = reservierungBeendetMail(k(), ["Maria"]);
  pruefe("16", eine, "Stand Ihrer Suche ansehen", "goto=anfragen&m=rb");
  assertEquals(eine.betreff, "Marias Reservierung ist abgelaufen – Ihre Suche läuft weiter");
  assertStringIncludes(sichtbar(eine.html), "Passte Maria nicht?");
  const zwei = reservierungBeendetMail(k(), ["Maria", "Ewa"]);
  assertStringIncludes(sichtbar(zwei.html), "Bewerbungen von Maria und Ewa sind abgelaufen");
  const niemand = reservierungBeendetMail(k(), []);
  assertEquals(niemand.betreff, "Reservierung abgelaufen – Ihre Suche läuft weiter");
});

// ── Anreise (Registry #119) ─────────────────────────────────────────────────
const anreise = {
  name: "Ewa Lis", fotoCid: "foto-1", datum: "2026-10-12", von: "14:00", bis: "18:00", verkehrsmittel: "Minibus",
  strasse: "Musterstraße 12", plzOrt: "80687 München", geaendert: false,
};

function ohnePlatzhalter(name: string, m: KundenMail) {
  for (const f of [m.html, m.text, m.betreff, m.vorschau]) assert(!/undefined|NaN|\[object Object\]|null/.test(f), `${name}: Platzhalter`);
  assert(new TextEncoder().encode(m.html).length < 90_000, `${name}: zu groß`);
}

Deno.test("Anreise: Datum mit Wochentag, Zeitfenster", () => {
  assertEquals(anreiseDatum("2026-10-12"), "Montag, 12.10.2026");
  assertEquals(anreiseDatum("2026-10-18"), "Sonntag, 18.10.2026");
  assertEquals(anreiseZeit("14:00", "18:00"), "14–18 Uhr");
  assertEquals(anreiseZeit("09:30", "12:00"), "9:30–12 Uhr");
  assertEquals(anreiseZeit("14:00", null), "ab 14 Uhr");
  assertEquals(anreiseZeit("14:00", "14:00"), "14 Uhr");
});

Deno.test("Anreise: Mail wie die Vorlage", () => {
  const m = anreiseMail(k(), anreise);
  ohnePlatzhalter("anreise", m);
  assertEquals(m.betreff, "Anreisedaten Ihrer Pflegekraft – Montag, 12.10.2026");
  assertEquals(m.vorschau, "Ihre Anreisedaten: Montag, 12.10.2026, 14–18 Uhr.");
  const s = sichtbar(m.html);
  for (const t of [
    "Guten Tag Frau Müller,", "wir haben die Anreise Ihrer Pflegekraft organisiert.", "Ihre Anreisedaten", "Ewa Lis",
    "Musterstraße 12", "80687 München", "Hierhin wird Ewa gebracht.", "Minibus", "Montag, 12.10.2026,", "14–18 Uhr",
    "089 200 000 830", "Ansonsten melde ich mich nach der Anreise",
    "Ich wünsche Ihnen und Ewa einen guten Start.", "Marta Kapcio",
  ]) assertStringIncludes(s, t);
  assertStringIncludes(m.html, 'src="cid:foto-1"');
  assert(!s.includes("Hinweis") && !m.text.includes("Hinweis"), "Hinweis bleibt draußen (Michał 09.10.)");
  for (const t of ["Guten Tag Frau Müller,", "Verkehrsmittel: Minibus", "Ankunft: Montag, 12.10.2026, 14–18 Uhr", "Mit freundlichen Grüßen"]) {
    assertStringIncludes(m.text, t);
  }
});

Deno.test("Anreise: geänderte Daten → anderer Betreff und Einstieg", () => {
  const m = anreiseMail(k(), { ...anreise, geaendert: true });
  assertEquals(m.betreff, "Geänderte Anreisedaten Ihrer Pflegekraft – Montag, 12.10.2026");
  assertStringIncludes(m.vorschau, "Geänderte Anreisedaten:");
  assertStringIncludes(sichtbar(m.html), "die Anreisedaten Ihrer Pflegekraft haben sich geändert.");
});

Deno.test("Anreise: Verkehrsmittel auf Deutsch, Unbekanntes wie geliefert", () => {
  assertStringIncludes(sichtbar(anreiseMail(k(), { ...anreise, verkehrsmittel: "Sindbad" }).html), "Reisebus (Sindbad)");
  const selbst = sichtbar(anreiseMail(k(), { ...anreise, verkehrsmittel: "Own transport" }).html);
  assertStringIncludes(selbst, "Eigene Anreise");
  assertStringIncludes(selbst, "Hierhin reist Ewa selbst an.");
  assert(!selbst.includes("gebracht"));
  assertStringIncludes(sichtbar(anreiseMail(k(), { ...anreise, verkehrsmittel: "Zug" }).html), "Zug");
});

Deno.test("Anreise: ohne Adresse und Foto fallen die Zeilen weg", () => {
  const m = anreiseMail(k(), { ...anreise, strasse: null, plzOrt: null, fotoCid: null });
  ohnePlatzhalter("anreise-leer", m);
  const s = sichtbar(m.html);
  for (const t of ["Adresse", "Hierhin"]) assert(!s.includes(t), t);
  assert(!m.html.includes("cid:"));
  assert(!m.text.includes("Adresse:"));
});

Deno.test("Anreise: Text aus mamamia wird maskiert", () => {
  const m = anreiseMail(k(), { ...anreise, strasse: "Weg <b>1</b>" });
  assertStringIncludes(m.html, "Weg &lt;b&gt;1&lt;/b&gt;");
  assert(!m.html.includes("<b>1</b>"));
});
