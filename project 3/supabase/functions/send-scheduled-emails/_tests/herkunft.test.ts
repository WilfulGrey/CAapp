import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  portalAngabenHinweisHtml,
  portalHerkunft,
  portalIntroHtml,
  portalIntroText,
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

Deno.test("Intro nennt Portal, Sofort-Versprechen und den Beleg", () => {
  const html = portalIntroHtml("Pflegehilfe.org");
  assertStringIncludes(html, "Pflegehilfe.org");
  assertStringIncludes(html, "sofort");
  assertStringIncludes(html, "6× in Folge");
  assertStringIncludes(html, "ohne Vermittlungsgebühr");
});

/* Primundus beschaeftigt die Kraefte selbst — "wir vermitteln" darf in
 * Kundentexten nicht vorkommen. "ohne Vermittlungsgebuehr" ist der
 * abgesegnete USP-Wortlaut und deshalb erlaubt. */
Deno.test("Intro behauptet keine Vermittlung", () => {
  for (const t of [portalIntroHtml("Pflegehilfe.org"), portalIntroText("Pflegehilfe.org")]) {
    assertEquals(/wir vermitteln/i.test(t), false);
  }
});

Deno.test("Textfassung traegt dieselbe Aussage ohne Markup", () => {
  const text = portalIntroText("Pflegebund.eu");
  assertStringIncludes(text, "Pflegebund.eu");
  assertStringIncludes(text, "6× in Folge");
  assertEquals(text.includes("<strong"), false);
});

Deno.test("Angaben-Hinweis sagt, dass wir Luecken angenommen haben", () => {
  const h = portalAngabenHinweisHtml("Pflegehilfe.org");
  assertStringIncludes(h, "angenommen");
  assertStringIncludes(h, "korrigieren");
});
