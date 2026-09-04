import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  portalAngabenHinweisHtml,
  portalHerkunft,
  portalIntroHtml,
  portalIntroText,
  portalVorschauHtml,
  portalVorschauText,
  portalKraeftePlaketteHtml,
  portalCtaButtonHtml,
  portalAngabenHinweisText,
  PORTAL_BETREFF,
} from "../herkunft.ts";

Deno.test("eigene Quellen liefern keine Portal-Herkunft", () => {
  assertEquals(portalHerkunft("rechner"), null);
  assertEquals(portalHerkunft("pria-chat"), null);
  assertEquals(portalHerkunft(null), null);
  assertEquals(portalHerkunft(undefined), null);
  assertEquals(portalHerkunft(""), null);
});

Deno.test("eingekaufter Lead: gepflegte Schreibweise statt Rohwert", () => {
  assertEquals(portalHerkunft("portal:pflegehilfe.org"), "Pflegehilfe");
  assertEquals(portalHerkunft("portal:pflegebund.eu"), "Pflegebund");
  // API-Portal (Registry #50) — ohne TLD, sonst verlinkt Apple Mail.
  assertEquals(portalHerkunft("portal:pflege-helfer24.de"), "Pflege-Helfer24");
});

Deno.test("Gross-/Kleinschreibung und Leerzeichen aus dem Parser stoeren nicht", () => {
  assertEquals(portalHerkunft("PORTAL:Pflegehilfe.ORG"), "Pflegehilfe");
  assertEquals(portalHerkunft("portal: pflegehilfe.org "), "Pflegehilfe");
});

/* Der Kern der Allowlist: ein Portal, das wir nicht kennen (Tippfehler im
 * Parser, neue Quelle ohne Eintrag), darf NICHT als Fremdtext in die Mail
 * laufen — der Kunde bekommt dann die normale Fassung. */
Deno.test("unbekanntes Portal faellt auf die normale Mail zurueck", () => {
  assertEquals(portalHerkunft("portal:unbekannt.de"), null);
  assertEquals(portalHerkunft("portal:<script>alert(1)</script>"), null);
  assertEquals(portalHerkunft("portal:"), null);
});







Deno.test("Betreff sagt dem Kaltkontakt, was ihn erwartet", () => {
  assertStringIncludes(PORTAL_BETREFF, "Angebot");
  assertStringIncludes(PORTAL_BETREFF, "Pflegekräfte");
});

Deno.test("Angaben-Hinweis sagt, dass wir Luecken angenommen haben", () => {
  const h = portalAngabenHinweisHtml("Pflegehilfe");
  assertStringIncludes(h, "angenommen");
  assertStringIncludes(h, "korrigieren");
});

const SITE = "https://primundus.de";
const CTA = "https://kundenportal.primundus.de/x?token=abc";

Deno.test("Intro dankt fuer die Anfrage und nennt das Portal", () => {
  const html = portalIntroHtml("Pflegehilfe");
  assertStringIncludes(html, "Pflegehilfe");
  assertStringIncludes(html, "vielen Dank für Ihre Anfrage");
  assertEquals(portalIntroText("Pflegebund").includes("<strong"), false);
});

/* Apple Mail verlinkt eine erkannte Domain von sich aus — der Kunde landet
   dann beim Portal statt bei uns. Deshalb tragen die Anzeigenamen kein TLD:
   ohne Endung gibt es nichts zu erkennen. Der Test haelt fest, dass in
   KEINER Fassung der Mail eine Domain steht. */
Deno.test("Portalname traegt kein TLD und wird nicht verlinkt", () => {
  for (const name of ["Pflegehilfe", "Pflegebund"]) {
    for (const html of [
      portalIntroHtml(name),
      portalAngabenHinweisHtml(name, true),
      portalAngabenHinweisHtml(name, false),
    ]) {
      assertStringIncludes(html, name);
      // Ausser den echten Portal-Links (href) darf keine Domain im Text stehen.
      assertEquals(/\.(org|de|eu|com)\b/.test(html.replace(/https?:[^"\s]*/g, "")), false);
      assertEquals(html.includes("<a "), false);
    }
  }
  assertStringIncludes(portalIntroText("Pflegehilfe"), "Pflegehilfe");
  assertStringIncludes(portalAngabenHinweisText("Pflegehilfe"), "Pflegehilfe");
});

Deno.test("Texte behaupten keine Vermittlung", () => {
  const alle = [
    portalIntroHtml("Pflegehilfe"),
    portalIntroText("Pflegehilfe"),
    portalVorschauHtml(SITE, CTA),
    portalVorschauText(CTA),
  ];
  for (const t of alle) assertEquals(/wir vermitteln/i.test(t), false);
});

/* Die Fuenf-Gesichter-Plakette behauptet "5 passende Pflegekraefte" mit
   anonymen Avataren. Steht in derselben Mail eine ECHTE gematchte Kraft mit
   Namen und Gruenden, saehe der Kunde dieselbe Aussage zweimal — einmal als
   Versprechen, einmal als Beleg. Dann gewinnt der Beleg. */
Deno.test("Plakette weicht der echten Empfehlung", () => {
  const mitPlakette = portalVorschauHtml(SITE, CTA, true);
  const ohnePlakette = portalVorschauHtml(SITE, CTA, false);

  assertStringIncludes(mitPlakette, "5 passende Pflegekräfte");
  assertEquals(ohnePlakette.includes("5 passende Pflegekräfte"), false);
  assertEquals(ohnePlakette.includes("caregivers/pk-1.jpg"), false);

  // Der Rest des Kopfes bleibt in BEIDEN Faellen: Preis-Zusage, Auswahl-
  // freiheit und der CTA tragen die Mail, nicht die Plakette.
  for (const html of [mitPlakette, ohnePlakette]) {
    assertStringIncludes(html, "bereits berechnet");
    assertStringIncludes(html, "selbst auswählen");
    assertStringIncludes(html, CTA);
  }

  // Default ist MIT — ohne Empfehlung ist die Plakette das einzige Signal,
  // dass hier Menschen warten und nicht nur ein Preis.
  assertEquals(portalVorschauHtml(SITE, CTA), mitPlakette);
});

Deno.test("Kopf traegt Preis, Auswahl und Unverbindlichkeit", () => {
  const html = portalVorschauHtml(SITE, CTA);
  assertStringIncludes(html, "bereits berechnet");
  assertStringIncludes(html, "selbst auswählen");
  assertStringIncludes(html, "vertraglich zu binden");
  assertStringIncludes(html, CTA);
});

/* Der Button traegt die Website-Farbe, nicht das Mail-Gruen: der
 * Empfaenger kennt uns nicht und soll wiedererkennen, wo er landet. */
Deno.test("CTA in Website-Rot, nicht gruen", () => {
  const html = portalVorschauHtml(SITE, CTA);
  assertStringIncludes(html, "#E76F63");
  assertEquals(html.includes("#2A9D5C"), false);
});

/* Fuenf Gesichter, fuenf Kraefte — die Zahl behauptet nur, was im Bild
 * steht. Kein Zaehler aus der Tagesformel in einer archivierbaren Mail. */
Deno.test("Plakette zeigt fuenf Gesichter zur genannten Zahl", () => {
  const html = portalKraeftePlaketteHtml(SITE, CTA);
  for (const i of [1, 2, 3, 4, 5]) {
    assertStringIncludes(html, `${SITE}/images/caregivers/pk-${i}.jpg`);
  }
  assertEquals(html.includes("pk-6.jpg"), false);
  assertStringIncludes(html, "5 passende Pflegekräfte");
  assertStringIncludes(html, CTA);
});

Deno.test("Textfassung traegt dieselben Aussagen ohne Markup", () => {
  const t = portalVorschauText(CTA);
  assertStringIncludes(t, "bereits berechnet");
  assertStringIncludes(t, "selbst auswählen");
  assertStringIncludes(t, CTA);
  assertEquals(t.includes("<a "), false);
});

Deno.test("Betreff sagt dem Kaltkontakt, was ihn erwartet", () => {
  assertStringIncludes(PORTAL_BETREFF, "Angebot");
  assertStringIncludes(PORTAL_BETREFF, "Pflegekräfte");
});

/* Beide Buttons der Mail kommen aus derselben Funktion — zwei Farben in
 * einer Mail lesen sich als zwei verschiedene Angebote. */
Deno.test("Button-Bauer traegt immer die Website-Farbe", () => {
  const oben = portalCtaButtonHtml(CTA, "Angebot ansehen", "22px auto 14px");
  const unten = portalCtaButtonHtml(CTA, "Angebot ansehen", "8px auto 30px");
  for (const b of [oben, unten]) {
    assertStringIncludes(b, "#E76F63");
    assertEquals(b.includes("#2A9D5C"), false);
  }
});

/* Dezent wie auf der Startseite: 24px-Gesichter, 12px-Text. */
Deno.test("Plakette bleibt klein", () => {
  const html = portalKraeftePlaketteHtml(SITE, CTA);
  assertStringIncludes(html, "width:24px");
  assertStringIncludes(html, "font-size:12px");
});

/* Hat das Portal alles geliefert, waere der Annahme-Hinweis falsch — er
 * saet Zweifel an Angaben, die stimmen. */
Deno.test("Hinweis nennt Annahmen nur, wenn welche noetig waren", () => {
  const mitAnnahme = portalAngabenHinweisText("Pflegehilfe", true);
  const ohne = portalAngabenHinweisText("Pflegehilfe", false);
  assertStringIncludes(mitAnnahme, "vorsichtig angenommen");
  assertEquals(ohne.includes("angenommen"), false);
  for (const t of [mitAnnahme, ohne]) {
    assertStringIncludes(t, "Pflegehilfe");
    assertStringIncludes(t, "korrigieren");
  }
});
