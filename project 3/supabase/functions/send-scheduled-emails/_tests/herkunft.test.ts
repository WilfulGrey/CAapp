import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  portalAngabenHinweisHtml,
  portalHerkunft,
  portalIntroHtml,
  portalIntroText,
  portalVorschauHtml,
  portalVorschauText,
  portalKraeftePlaketteHtml,
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
  assertEquals(portalHerkunft("portal:pflegehilfe.org"), "Pflegehilfe.org");
  assertEquals(portalHerkunft("portal:pflegebund.eu"), "Pflegebund.eu");
});

Deno.test("Gross-/Kleinschreibung und Leerzeichen aus dem Parser stoeren nicht", () => {
  assertEquals(portalHerkunft("PORTAL:Pflegehilfe.ORG"), "Pflegehilfe.org");
  assertEquals(portalHerkunft("portal: pflegehilfe.org "), "Pflegehilfe.org");
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
  const h = portalAngabenHinweisHtml("Pflegehilfe.org");
  assertStringIncludes(h, "angenommen");
  assertStringIncludes(h, "korrigieren");
});

const SITE = "https://primundus.de";
const CTA = "https://kundenportal.primundus.de/x?token=abc";

Deno.test("Intro dankt fuer die Anfrage und nennt das Portal", () => {
  const html = portalIntroHtml("Pflegehilfe.org");
  assertStringIncludes(html, "Pflegehilfe.org");
  assertStringIncludes(html, "vielen Dank für Ihre Anfrage");
  assertEquals(portalIntroText("Pflegebund.eu").includes("<strong"), false);
});

/* Primundus beschaeftigt die Kraefte selbst — "wir vermitteln" darf in
 * Kundentexten nicht vorkommen. */
Deno.test("Texte behaupten keine Vermittlung", () => {
  const alle = [
    portalIntroHtml("Pflegehilfe.org"),
    portalIntroText("Pflegehilfe.org"),
    portalVorschauHtml(SITE, CTA),
    portalVorschauText(CTA),
  ];
  for (const t of alle) assertEquals(/wir vermitteln/i.test(t), false);
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
