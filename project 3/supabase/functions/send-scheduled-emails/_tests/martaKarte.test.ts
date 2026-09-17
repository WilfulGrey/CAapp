/* Deno-Test der Signaturkarte — Spiegel von src/__tests__/martaKarte.test.ts
 * (dort zusätzlich: diese Kopie liefert Zeichen für Zeichen dieselbe Karte
 * wie project 3/lib/marta-karte.ts). */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { MARTA_KARTE_MOBIL_CSS, bewertungsSterneHtml, martaKarteHtml } from "../martaKarte.ts";

const SITE = "https://kostenrechner.primundus.de";
const STAND = { schnitt: "4,9", anzahl: 126 };

Deno.test("Kundenkarte: Anrufen + WhatsApp nebeneinander, Sterne in der Karte, Bestpreisgarantie", () => {
  const html = martaKarteHtml({ fuer: "kunde", bewertung: STAND, siteUrl: SITE, presseLogos: true });
  assertEquals(html.match(/class="sig-pille"/g)?.length, 2);
  assertStringIncludes(html, 'alt="" width="16" height="16"');
  assertStringIncludes(html, ">Anrufen</span>");
  assertStringIncludes(html, ">WhatsApp</span>");
  assert(!html.includes("&#9990;"));
  assert(!html.includes("WhatsApp schreiben"));
  const knopf = html.indexOf("wa.me/4989200000830");
  const sterne = html.indexOf("&#9733;");
  const siegel = html.indexOf("sig-siegel-innen");
  assert(knopf < sterne && sterne < siegel, "Sterne unter den Knöpfen, vor dem Siegel");
  assertStringIncludes(html, "Bestpreisgarantie,<br>keine Vermittlungs&shy;gebühr");
  assert(!html.includes("Ansprechpartner"));
  assert(html.trim().endsWith("</table>"));
});

Deno.test("Vermittlerkarte: ohne Sterne, ohne Kunden-Konditionen", () => {
  const html = martaKarteHtml({ fuer: "vermittler", siteUrl: SITE, presseLogos: true });
  assert(!html.includes("&#9733;"));
  assert(!/Vermittlungsgeb|Bestpreis/.test(html));
  assertStringIncludes(html, "Persönlicher<br>Ansprechpartner,<br>7&nbsp;Tage/Woche");
});

Deno.test("bewertungsSterneHtml: Link auf die Erfahrungen-Seite", () => {
  const z = bewertungsSterneHtml(STAND);
  assertStringIncludes(z, '<strong style="color:#3D2B1F;">4,9</strong>');
  assertStringIncludes(z, ">126 Bewertungen&nbsp;&rarr;</a>");
  assertStringIncludes(z, 'href="https://primundus.de/erfahrungen"');
});

Deno.test("Handy: Symbol-Knöpfe und Sterne-Zeile über die volle Breite", () => {
  const html = martaKarteHtml({ fuer: "kunde", bewertung: STAND, siteUrl: SITE, presseLogos: true });
  assertEquals(html.match(/<img class="sig-pille-bild"/g)?.length, 2);
  assertStringIncludes(html, `src="${SITE}/images/mail-icon-whatsapp.png"`);
  assertStringIncludes(html, '<div class="sig-sterne-desktop">');
  assertStringIncludes(html, '<div class="sig-sterne-mobil" style="display:none;mso-hide:all;max-height:0;overflow:hidden;">');
  assertStringIncludes(MARTA_KARTE_MOBIL_CSS, ".sig-pille-text { display: none !important; }");
  assertStringIncludes(MARTA_KARTE_MOBIL_CSS, ".sig-sterne-desktop { display: none !important; }");
});
