import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { anredeZeile, renderMail } from "../mails.ts";

const LINK = "https://kostenrechner.primundus.de/abmelden?p=abc-123";

Deno.test("Anrede: Herr/Frau + Nachname, sonst Guten Tag", () => {
  assertEquals(anredeZeile("Frau", "Antczak"), "Guten Tag Frau Antczak,");
  assertEquals(anredeZeile("Herr", "Dr. Bellm"), "Guten Tag Herr Dr. Bellm,");
  assertEquals(anredeZeile("Frau", "von  Hehn"), "Guten Tag Frau von Hehn,");
  assertEquals(anredeZeile("", "Kriele"), "Guten Tag,");
  assertEquals(anredeZeile("Herr", ""), "Guten Tag,");
  assertEquals(anredeZeile(null, null), "Guten Tag,");
});

Deno.test("Hauptmail: Betreff und Vorschautext je Variante, keine offenen Platzhalter", () => {
  const a = renderMail("haupt", { anrede: "Frau", nachname: "Antczak", variante: "A" }, LINK);
  const b = renderMail("haupt", { anrede: "Frau", nachname: "Antczak", variante: "B" }, LINK);
  assertEquals(a.betreff, "Pflegekräfte für Ihre offenen Kunden");
  assertEquals(b.betreff, "Ihr Interessent sieht sofort passende Pflegekräfte");
  assertStringIncludes(a.html, "Bewerbungen direkt in Ihrem Partnerbereich.");
  assertStringIncludes(b.html, "Neue Anfragen laufen direkt in Ihr Kundenportal");
  assertStringIncludes(a.html, "utm_content=haupt-a");
  assertStringIncludes(b.text, "utm_content=haupt-b");
  for (const m of [a, b]) {
    assertStringIncludes(m.html, "Guten Tag Frau Antczak,");
    assertStringIncludes(m.text, "Guten Tag Frau Antczak,");
    assertStringIncludes(m.html, LINK);
    assertStringIncludes(m.text, LINK);
    assert(!m.html.includes("{{") && !m.text.includes("{{"));
  }
});

Deno.test("keine Beispieldaten, internen Notizen oder relativen Bilder in den Vorlagen", () => {
  for (const mail of ["haupt", "nf1", "nf2", "nf3"] as const) {
    const m = renderMail(mail, { variante: "A" }, LINK);
    assert(!m.html.includes("Herr Becker"), `${mail}: Beispielanrede`);
    assert(!m.html.includes("<!--"), `${mail}: HTML-Kommentar`);
    assert(!m.html.includes('src="img/'), `${mail}: relatives Bild`);
    assertStringIncludes(m.html, "https://kostenrechner.primundus.de/images/partner-mail/magdalena.jpg");
    assertStringIncludes(m.html, "Guten Tag,");
    assert(!m.text.startsWith("Betreff") && !m.text.includes("Preheader:"), `${mail}: Kopfzeilen im Text`);
  }
});

Deno.test("Nachfass 3: Fragebogen-Knopf geht an partner@primundus.de", () => {
  const m = renderMail("nf3", { variante: "A" }, LINK);
  assertStringIncludes(m.html, "mailto:partner@primundus.de?subject=Anonymisierter%20Fragebogen");
});

Deno.test("Namen werden im HTML escaped", () => {
  const m = renderMail("nf1", { anrede: "Herr", nachname: "<b>Müller</b>", variante: "A" }, LINK);
  assertStringIncludes(m.html, "Guten Tag Herr &lt;b&gt;Müller&lt;/b&gt;,");
});
