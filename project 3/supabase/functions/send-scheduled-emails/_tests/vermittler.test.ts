/* Mails an einen Vermittler. Zwei Dinge sind hier keine Kosmetik:
 *
 *  - der Preis, den der Partner seinem Kunden nennt (unser Tagessatz plus
 *    seine Provision) — eine falsche Zahl geht direkt an einen Dritten;
 *  - dass NICHTS aus der Kundenwelt in die Mail rutscht: kein Portal-Link,
 *    kein Token, keine "Keine Vermittlungsgebühren"-Kondition.
 */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  vermittlerPreis,
  vermittlerAngebotHtml, vermittlerAngebotText,
  vermittlerKraefteHtml, vermittlerKraefteText,
  VERMITTLER_FUSSNOTE, ANREISE_HINWEIS,
} from "../vermittler.ts";
import type { Empfehlung } from "../empfehlung.ts";

function kraft(over: Partial<Empfehlung> = {}): Empfehlung {
  return {
    caregiverId: 1, vorname: "Maria", anzeigeName: "Maria K.",
    fakten: "13 Jahre Erfahrung · 13 Primundus-Einsätze",
    alter: 54, deutschWort: "Gut", erfahrungJahre: 13, einsaetze: 13,
    stufe: "Elite", stufeZusatz: "Seit Jahren für uns im Einsatz", fotoUrl: null,
    gruende: ["Entspricht Ihrem Wunschprofil", "Erfahrung mit Rollstuhlpatienten"],
    deutschBalken: 3, erfahrungKurz: "13 J. Erfahrung",
    vorstellung: "Maria betreut seit dreizehn Jahren ältere Menschen zu Hause.",
    ...over,
  };
}

/* Steht fuer buildMartaSig() aus index.ts — die echte Signatur kann hier
   nicht importiert werden (index.ts startet beim Import einen Server). Was
   zaehlt, ist dass der Block ueberhaupt DURCHGEREICHT wird: genau das
   fehlte, weshalb die Vermittler-Mail ohne Grussformel, ohne
   Ansprechpartnerin und ohne Siegel beim Partner ankam. */
const SIG = '<div id="marta-sig">Mit freundlichen Gruessen — Marta Kapcio</div>';

const basis = {
  anrede: "Guten Tag Herr Wilde,",
  signatur: SIG,
  kundeLabel: "Familie Schmidt",
  bruttopreis: 2650,
  provisionProTag: 10,
  empfehlung: kraft(),
  sichtbarGesamt: 5,
  fotoCid: null as string | null,
};

Deno.test("Preis: Kundenpreis rechnet auf dem ANGEZEIGTEN Tagessatz weiter", () => {
  const p = vermittlerPreis(2650, 10);
  assertEquals(p.monatssatz, 2650);
  // 2650/30 = 88,33 → angezeigt 88. Der Partner liest "88 + 10 = 98";
  // rechneten wir auf der ungerundeten Zahl, stünde dort 98,33 → 98 und
  // die Addition im Kopf ginge nicht auf.
  assertEquals(p.tagessatz, 88);
  assertEquals(p.kundeTagessatz, 98);
});

Deno.test("Preis: ohne Provision bleibt der Kundenpreis unser Preis", () => {
  assertEquals(vermittlerPreis(3000, 0).kundeTagessatz, 100);
});

Deno.test("Mail 1: Provisionsblock nennt beide Zahlen und den Kunden", () => {
  const html = vermittlerAngebotHtml(basis);
  assertStringIncludes(html, "88&nbsp;€");
  assertStringIncludes(html, "2.650&nbsp;€");
  assertStringIncludes(html, "Ihre Provision");
  assertStringIncludes(html, "10&nbsp;€/Tag");
  assertStringIncludes(html, "Familie Schmidt");
  assertStringIncludes(html, "98&nbsp;€/Tag");
  assertStringIncludes(html, ANREISE_HINWEIS);
});

Deno.test("Mail 1: kein Portal, kein Token, keine Kunden-Konditionen", () => {
  const html = vermittlerAngebotHtml(basis) + vermittlerKraefteHtml({
    anrede: basis.anrede, signatur: SIG, kundeLabel: basis.kundeLabel, fuenf: [kraft()], cids: [null],
  });
  // Der Token des Leads öffnet das Kundenportal (Patientenbogen,
  // Bewerbungen, Vertragsunterschrift). Er darf in dieser Mail nirgends
  // stehen — auch nicht im Abmelde-Link der Fußzeile.
  assert(!html.includes("token="), "Token-Parameter in der Vermittler-Mail");
  assert(!html.includes("?token"), "Portal-Link in der Vermittler-Mail");
  assert(!html.includes("/abmelden"), "Abmelde-Link in der Vermittler-Mail");
  assert(!html.includes("goto="), "Portal-Sprungziel in der Vermittler-Mail");
  // Widerspruch zum Provisionsblock: diese Sätze gehören dem Kundenpfad.
  assert(!html.includes("Vermittlungsgebühren"), "Kunden-Kondition in der Vermittler-Mail");
  assert(!html.includes("Direktanbieter"), "Kunden-Kondition in der Vermittler-Mail");
});

Deno.test("Fußnote ersetzt den Kundensatz und trägt keinen Link", () => {
  assert(!VERMITTLER_FUSSNOTE.includes("<a"), "Link in der Vermittler-Fußnote");
  assert(!VERMITTLER_FUSSNOTE.includes("Kalkulation"));
  assertStringIncludes(VERMITTLER_FUSSNOTE, "Antwort auf Ihre Anfrage");
});

Deno.test("Mail 1: die Ankündigung von Mail 2 nur, wenn es mehr als eine Kraft gibt", () => {
  assertStringIncludes(vermittlerAngebotHtml(basis), "in den nächsten Stunden");
  // Eine einzige Kraft: die Ankündigung wäre ein Versprechen, das Mail 2
  // nicht halten kann.
  const eine = vermittlerAngebotHtml({ ...basis, sichtbarGesamt: 1 });
  assert(!eine.includes("in den nächsten Stunden"));
  assert(!vermittlerAngebotText({ ...basis, sichtbarGesamt: 1 }).includes("in den nächsten Stunden"));
});

Deno.test("Mail 1: ohne Empfehlung wird keine Kraft behauptet", () => {
  const ohne = vermittlerAngebotHtml({ ...basis, empfehlung: null, sichtbarGesamt: 0 });
  assert(!ohne.includes("Unsere Empfehlung"));
  assert(!ohne.includes("und eine Betreuungskraft"));
  // Preis und Provision tragen die Mail trotzdem.
  assertStringIncludes(ohne, "Ihre Provision");
});

Deno.test("Mail 1: Haken sprechen den Vermittler an, nicht den Patienten", () => {
  const html = vermittlerAngebotHtml(basis);
  assertStringIncludes(html, "Entspricht dem angefragten Profil");
  // "Ihrem Wunschprofil" wäre der Wunsch des Lesers — er ist nicht der
  // Betreute.
  assert(!html.includes("Entspricht Ihrem Wunschprofil"));
  // Die übrigen Gründe bleiben.
  assertStringIncludes(html, "Erfahrung mit Rollstuhlpatienten");
});

Deno.test("ohne Kundennamen wird umschrieben — im richtigen Fall", () => {
  const html = vermittlerAngebotHtml({ ...basis, kundeLabel: null });
  // "für die Betreuung von ..." verlangt Dativ, "... zahlt damit" Nominativ.
  // Ein Name ist in allen Fällen gleich, der Ersatz nicht.
  assertStringIncludes(html, "Betreuung von <strong style=\"color:#2D1F0F;\">Ihrem Kunden</strong>");
  assertStringIncludes(html, "Ihr Kunde zahlt damit");
  assert(!html.includes("von <strong style=\"color:#2D1F0F;\">Ihren Kunden"));

  const liste = vermittlerKraefteHtml({ anrede: "x", signatur: SIG, kundeLabel: null, fuenf: [kraft()], cids: [null] });
  assertStringIncludes(liste, "für Ihren Kunden verfügbar");   // Akkusativ
  assertStringIncludes(liste, "Sie Ihrem Kunden vorstellen");  // Dativ
});

Deno.test("Mail 2: Liste nennt die tatsächliche Anzahl, ohne fünf zu versprechen", () => {
  const drei = { anrede: basis.anrede, signatur: SIG, kundeLabel: "Familie Schmidt", fuenf: [kraft(), kraft({ vorname: "Marzena", anzeigeName: "Marzena T." }), kraft({ vorname: "Halina", anzeigeName: "Halina W." })], cids: [null, null, null] };
  const html = vermittlerKraefteHtml(drei);
  // Zwei Stunden nach Mail 1 wird neu gerechnet — es können weniger sein.
  assertStringIncludes(html, "drei Betreuungskräfte");
  assert(!html.includes("fünf Betreuungskräfte"));
  assertStringIncludes(html, "Marzena T.");
  assertStringIncludes(html, "Verfügbare Betreuungskräfte");
  assertStringIncludes(html, "Die Konditionen aus meiner ersten Mail gelten unverändert");
});

Deno.test("Mail 2: eine einzige Kraft wird grammatisch richtig angekündigt", () => {
  const eine = { anrede: basis.anrede, signatur: SIG, kundeLabel: null, fuenf: [kraft()], cids: [null] };
  const html = vermittlerKraefteHtml(eine);
  assertStringIncludes(html, "eine Betreuungskraft");
  assertStringIncludes(html, "verfügbar ist");
  assert(!html.includes("Betreuungskräfte</strong>"));
});

Deno.test("Textfassung trägt dieselben Zahlen wie das HTML", () => {
  const text = vermittlerAngebotText(basis);
  assertStringIncludes(text, "88 € / Tag");
  assertStringIncludes(text, "2.650 € / Monat");
  assertStringIncludes(text, "98 €/Tag");
  assert(!text.includes("token="));
  assertStringIncludes(vermittlerKraefteText({ anrede: "x", signatur: SIG, kundeLabel: null, fuenf: [kraft()], cids: [null] }), "Maria K.");
});

Deno.test("Fremdtext wird escaped (Name und Vorstellung kommen von aussen)", () => {
  const boes = kraft({ anzeigeName: '<script>x</script>', vorstellung: 'a & b <b>c</b>' });
  const html = vermittlerAngebotHtml({ ...basis, empfehlung: boes });
  assert(!html.includes("<script>"));
  assertStringIncludes(html, "&lt;script&gt;");
});

Deno.test("Stufe sieht in beiden Mails gleich aus — gefüllte Pille (#667)", () => {
  /* Martin, 08.09.2026: die Stufe ist das Vertrauenssignal und darf nicht
     als blasse graue Pille untergehen. Was für die Kundenmail gilt, gilt
     hier auch — sonst hätte dieselbe Kraft je nach Empfänger ein anderes
     Abzeichen. */
  const gefuellt = "background:#8B7355;border-radius:999px";
  assertStringIncludes(vermittlerAngebotHtml(basis), gefuellt);
  assertStringIncludes(
    vermittlerKraefteHtml({ anrede: "x", signatur: SIG, kundeLabel: null, fuenf: [kraft()], cids: [null] }),
    gefuellt,
  );
});

Deno.test("ohne Einsätze trägt die Kurzaussage der Stufe die Zeile", () => {
  // Eine neue Kraft hat keine Einsatzzahl — dann steht dort die Aussage
  // statt einer nackten "0 Einsätze".
  const neu = kraft({ einsaetze: 0, stufeZusatz: "Neu bei Primundus" });
  const html = vermittlerAngebotHtml({ ...basis, empfehlung: neu });
  assertStringIncludes(html, "Neu bei Primundus");
  assert(!html.includes("0 Einsätze"));
});

Deno.test("Mail 1 traegt die Signatur mit Ansprechpartnerin", () => {
  const html = vermittlerAngebotHtml(basis);
  assertStringIncludes(html, "marta-sig");
  // ...und zwar ganz unten, nach dem Angebot.
  assert(html.indexOf("marta-sig") > html.indexOf("Tagessatz"));
});

Deno.test("Mail 2 traegt die Signatur ebenfalls", () => {
  const html = vermittlerKraefteHtml({
    anrede: basis.anrede, signatur: SIG, kundeLabel: "Familie Schmidt",
    fuenf: [kraft()], cids: [null],
  });
  assertStringIncludes(html, "marta-sig");
});

Deno.test("die Textfassungen gruessen mit Namen und Durchwahl", () => {
  for (const t of [
    vermittlerAngebotText(basis),
    vermittlerKraefteText({ anrede: basis.anrede, signatur: SIG, kundeLabel: null, fuenf: [kraft()], cids: [null] }),
  ]) {
    assertStringIncludes(t, "Mit freundlichen Grüßen");
    assertStringIncludes(t, "Marta Kapcio");
    assertStringIncludes(t, "089 200 000 830");
  }
});
