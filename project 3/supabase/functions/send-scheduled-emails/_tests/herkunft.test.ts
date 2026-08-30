import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  portalAngabenHinweisHtml,
  portalHerkunft,
  portalIntroHtml,
  portalIntroText,
  portalVorschauHtml,
  portalVorschauText,
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

Deno.test("Intro erklaert die Herkunft, statt fuer etwas zu danken", () => {
  const html = portalIntroHtml("Pflegehilfe.org");
  assertStringIncludes(html, "Pflegehilfe.org");
  assertStringIncludes(html, "weitergeleitet");
  assertStringIncludes(html, "Primundus");
  // Der Kunde hat bei UNS nichts angefragt — kein Dank fuer eine Anfrage,
  // die es aus seiner Sicht nie gab.
  assertEquals(/vielen Dank für Ihre Anfrage/i.test(html), false);
});

/* Primundus beschaeftigt die Kraefte selbst — "wir vermitteln" darf in
 * Kundentexten nicht vorkommen. */
Deno.test("Texte behaupten keine Vermittlung", () => {
  const alle = [
    portalIntroHtml("Pflegehilfe.org"),
    portalIntroText("Pflegehilfe.org"),
    portalVorschauHtml("https://x.example/t"),
    portalVorschauText("https://x.example/t"),
  ];
  for (const t of alle) assertEquals(/wir vermitteln/i.test(t), false);
});

Deno.test("Textfassung traegt dieselbe Aussage ohne Markup", () => {
  const text = portalIntroText("Pflegebund.eu");
  assertStringIncludes(text, "Pflegebund.eu");
  assertStringIncludes(text, "weitergeleitet");
  assertEquals(text.includes("<strong"), false);
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

/* Kaltkontakt: der Einstiegs-CTA muss die drei Fragen beantworten, die
 * jemand hat, der uns nicht kennt — was ist das, was sehe ich, was kostet
 * es mich. Vor allem die letzte: er rechnet mit Anmeldung und Vertreter. */
Deno.test("Einstiegs-CTA zeigt sofort etwas Konkretes", () => {
  const html = portalVorschauHtml("https://kundenportal.primundus.de/x?token=abc");
  assertStringIncludes(html, "bereits berechnet");
  assertStringIncludes(html, "Pflegekräfte");
  assertStringIncludes(html, "https://kundenportal.primundus.de/x?token=abc");
});


Deno.test("Einstiegs-CTA auch in der Textfassung, mit Link", () => {
  const t = portalVorschauText("https://kundenportal.primundus.de/x?token=abc");
  assertStringIncludes(t, "https://kundenportal.primundus.de/x?token=abc");
  assertEquals(t.includes("<a "), false);
});
