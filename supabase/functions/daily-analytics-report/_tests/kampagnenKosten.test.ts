import { assertEquals, assertThrows } from "@std/assert";
import { kampagnenKosten, kampagnenKostenAbfrage } from "../queries.ts";

/*
 * Kosten je Kampagne für die Admin-Seite „Trichter“ (Registry #142, 27.10.2026).
 * Der Morgenbericht schreibt sie nach ads_kosten_kampagne_tag; hier geprüft wird
 * nur das Umrechnen der Ads-Antwort (Mikros → Euro, Zahlen als Text, Doppelzeilen).
 */
Deno.test("Ads-Antwort → eine Zeile je Kampagne in Euro", () => {
  const rows = [
    { campaign: { id: "23745538003", name: "High Intent" }, metrics: { costMicros: "41230000", clicks: "17", impressions: "240" } },
    { campaign: { id: "23585162828", name: "PM-Deutschland_int_Kosten" }, metrics: { costMicros: "22555000", clicks: "9", impressions: "180" } },
  ];
  assertEquals(kampagnenKosten(rows, "2026-10-27"), [
    { tag: "2026-10-27", kampagne_id: "23745538003", kampagne_name: "High Intent", kosten_netto: 41.23, klicks: 17, impressionen: 240 },
    { tag: "2026-10-27", kampagne_id: "23585162828", kampagne_name: "PM-Deutschland_int_Kosten", kosten_netto: 22.56, klicks: 9, impressionen: 180 },
  ]);
});

Deno.test("mehrere Zeilen derselben Kampagne werden addiert", () => {
  const rows = [
    { campaign: { id: "1" }, metrics: { costMicros: "1000000", clicks: "1", impressions: "10" } },
    { campaign: { id: "1", name: "X" }, metrics: { costMicros: "2500000", clicks: "2", impressions: "5" } },
  ];
  assertEquals(kampagnenKosten(rows, "2026-10-27"), [
    { tag: "2026-10-27", kampagne_id: "1", kampagne_name: "X", kosten_netto: 3.5, klicks: 3, impressionen: 15 },
  ]);
});

Deno.test("Zeilen ohne Kampagnen-ID fallen weg, fehlende Kennzahlen zählen 0", () => {
  assertEquals(kampagnenKosten([{ metrics: { costMicros: "5" } }, { campaign: { id: "2" } }], "2026-10-27"), [
    { tag: "2026-10-27", kampagne_id: "2", kampagne_name: null, kosten_netto: 0, klicks: 0, impressionen: 0 },
  ]);
});

Deno.test("Abfrage nur für einen gültigen Tag", () => {
  assertEquals(
    kampagnenKostenAbfrage("2026-10-27"),
    "SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date = '2026-10-27' AND metrics.impressions > 0",
  );
  assertThrows(() => kampagnenKostenAbfrage("2026-10-27' OR 1=1"));
});
