import { assert, assertEquals } from "@std/assert";
import { istAusAds } from "../queries.ts";

/*
 * Anzeigen-Erkennung (Martin, 06.09.2026: „ich glaube nicht, dass die
 * aufteilung ads und übrige (organisch) stimmt").
 *
 * Google Ads kennzeichnet auf zwei Wegen: manuelle UTM-Parameter und
 * automatisches Tagging, das NUR eine Klick-ID setzt. Wer nur auf „cpc"
 * prüft, schreibt Klick-ID-Besucher den organischen zu.
 */
Deno.test("utm_medium=cpc zählt als Anzeige", () => {
  assert(istAusAds({ utm_medium: "cpc" }));
});

Deno.test("Klick-ID ohne utm zählt als Anzeige", () => {
  assert(istAusAds({ gclid: "abc123" }));
  assert(istAusAds({ wbraid: "w1" }));
  assert(istAusAds({ gbraid: "g1" }));
});

Deno.test("leere Klick-ID zählt NICHT als Anzeige", () => {
  assertEquals(istAusAds({ gclid: "", wbraid: "  ", gbraid: null }), false);
});

Deno.test("organische Sitzung bleibt organisch", () => {
  assertEquals(istAusAds({ utm_medium: "organic", referrer: "https://www.google.com/" }), false);
  assertEquals(istAusAds({}), false);
});
