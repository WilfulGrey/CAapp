import { assertEquals, assertThrows } from "@std/assert";
import { kampagnenKosten, kampagnenKostenAbfrage, pruefeNachtrag } from "../queries.ts";

/*
 * Kosten je Kampagne für die Admin-Seite „Trichter“ (Registry #142, 27.10.2026).
 * Der Morgenbericht schreibt sie nach ads_kosten_kampagne_tag (gestern + zwei Tage davor);
 * hier geprüft wird das Umrechnen der Ads-Antwort (Mikros → Euro, Zahlen als Text,
 * Doppelzeilen, je Tag), die Abfrage und der Zeitraum fürs Nachtragen.
 */
Deno.test("Ads-Antwort → eine Zeile je Tag und Kampagne in Euro", () => {
  const rows = [
    { segments: { date: "2026-10-27" }, campaign: { id: "23745538003", name: "High Intent" }, metrics: { costMicros: "41230000", clicks: "17", impressions: "240" } },
    { segments: { date: "2026-10-27" }, campaign: { id: "23585162828", name: "PM-Deutschland_int_Kosten" }, metrics: { costMicros: "22555000", clicks: "9", impressions: "180" } },
    { segments: { date: "2026-10-26" }, campaign: { id: "23745538003", name: "High Intent" }, metrics: { costMicros: "10000000", clicks: "4", impressions: "50" } },
  ];
  assertEquals(kampagnenKosten(rows), [
    { tag: "2026-10-26", kampagne_id: "23745538003", kampagne_name: "High Intent", kosten_netto: 10, klicks: 4, impressionen: 50 },
    { tag: "2026-10-27", kampagne_id: "23585162828", kampagne_name: "PM-Deutschland_int_Kosten", kosten_netto: 22.56, klicks: 9, impressionen: 180 },
    { tag: "2026-10-27", kampagne_id: "23745538003", kampagne_name: "High Intent", kosten_netto: 41.23, klicks: 17, impressionen: 240 },
  ]);
});

Deno.test("mehrere Zeilen derselben Kampagne am selben Tag werden addiert", () => {
  const rows = [
    { segments: { date: "2026-10-27" }, campaign: { id: "1" }, metrics: { costMicros: "1000000", clicks: "1", impressions: "10" } },
    { segments: { date: "2026-10-27" }, campaign: { id: "1", name: "X" }, metrics: { costMicros: "2500000", clicks: "2", impressions: "5" } },
  ];
  assertEquals(kampagnenKosten(rows), [
    { tag: "2026-10-27", kampagne_id: "1", kampagne_name: "X", kosten_netto: 3.5, klicks: 3, impressionen: 15 },
  ]);
});

Deno.test("Zeilen ohne Kampagnen-ID oder Tag fallen weg, fehlende Kennzahlen zählen 0", () => {
  assertEquals(kampagnenKosten([
    { segments: { date: "2026-10-27" }, metrics: { costMicros: "5" } },
    { campaign: { id: "3" }, metrics: { costMicros: "5" } },
    { segments: { date: "2026-10-27" }, campaign: { id: "2" } },
  ]), [
    { tag: "2026-10-27", kampagne_id: "2", kampagne_name: null, kosten_netto: 0, klicks: 0, impressionen: 0 },
  ]);
});

Deno.test("Abfrage nur für einen gültigen Zeitraum", () => {
  assertEquals(
    kampagnenKostenAbfrage("2026-10-25", "2026-10-27"),
    "SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date BETWEEN '2026-10-25' AND '2026-10-27' AND metrics.impressions > 0",
  );
  assertThrows(() => kampagnenKostenAbfrage("2026-10-27' OR 1=1", "2026-10-27"));
  assertThrows(() => kampagnenKostenAbfrage("2026-10-28", "2026-10-27"));
  assertThrows(() => kampagnenKostenAbfrage("2026-02-30", "2026-03-01"));
});

Deno.test("Nachtragen: gültige Tage, bis vor heute, höchstens 120 Tage", () => {
  assertEquals(pruefeNachtrag("2026-09-01", "2026-10-26", "2026-10-27"), { ok: true, von: "2026-09-01", bis: "2026-10-26" });
  assertEquals(pruefeNachtrag("2026-09-01", "2026-10-27", "2026-10-27").ok, false); // heute ist nicht fertig
  assertEquals(pruefeNachtrag("2026-10-02", "2026-10-01", "2026-10-27").ok, false);
  assertEquals(pruefeNachtrag("2026-01-01", "2026-10-26", "2026-10-27").ok, false);
  assertEquals(pruefeNachtrag(20260901, "2026-10-26", "2026-10-27").ok, false);
  assertEquals(pruefeNachtrag("2026-09-01'--", "2026-10-26", "2026-10-27").ok, false);
});
