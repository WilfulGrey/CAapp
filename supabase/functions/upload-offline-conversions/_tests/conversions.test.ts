import { assertEquals, assertThrows } from "@std/assert";
import {
  buildDmEvent,
  extractValue,
  formatRfc3339,
  isOldEnough,
  pickClickId,
  type QualifiedLeadCandidate,
} from "../conversions.ts";

const BASE: QualifiedLeadCandidate = {
  leadId: "11111111-2222-3333-4444-555555555555",
  conversionAt: "2026-08-15T11:57:20.123456+00:00",
  gclid: null,
  wbraid: null,
  gbraid: null,
  value: null,
};

Deno.test("pickClickId: gclid vor wbraid vor gbraid, null ohne IDs", () => {
  assertEquals(pickClickId({ gclid: "G", wbraid: "W", gbraid: "B" }), { type: "gclid", id: "G" });
  assertEquals(pickClickId({ gclid: null, wbraid: "W", gbraid: "B" }), { type: "wbraid", id: "W" });
  assertEquals(pickClickId({ gclid: null, wbraid: null, gbraid: "B" }), { type: "gbraid", id: "B" });
  assertEquals(pickClickId({ gclid: null, wbraid: null, gbraid: null }), null);
});

Deno.test("formatRfc3339: UTC mit Z, Mikrosekunden gekappt, TZ-Umrechnung", () => {
  assertEquals(formatRfc3339("2026-08-15T11:57:20.123456+00:00"), "2026-08-15T11:57:20Z");
  assertEquals(formatRfc3339("2026-08-14T09:15:00+02:00"), "2026-08-14T07:15:00Z");
  assertThrows(() => formatRfc3339("kaputt"));
});

Deno.test("isOldEnough: 6h-Guard", () => {
  const now = Date.parse("2026-08-14T12:00:00Z");
  assertEquals(isOldEnough("2026-08-14T05:59:00Z", now), true);
  assertEquals(isOldEnough("2026-08-14T06:01:00Z", now), false);
  assertEquals(isOldEnough("invalid", now), false);
});

Deno.test("buildDmEvent: gclid + transactionId + Wert nur wenn > 0", () => {
  const withValue = buildDmEvent({ ...BASE, gclid: "GCLID1", value: 2850 }, "qualified_lead")!;
  assertEquals(withValue.adIdentifiers, { gclid: "GCLID1" });
  assertEquals(withValue.transactionId, BASE.leadId);
  assertEquals(withValue.destinationReferences, ["qualified_lead"]);
  assertEquals(withValue.eventTimestamp, "2026-08-15T11:57:20Z");
  assertEquals(withValue.eventSource, "WEB");
  assertEquals(withValue.conversionValue, 2850);
  assertEquals(withValue.currency, "EUR");

  const noValue = buildDmEvent({ ...BASE, wbraid: "WB1", value: 0 }, "qualified_lead")!;
  assertEquals(noValue.adIdentifiers, { wbraid: "WB1" });
  assertEquals("conversionValue" in noValue, false);
  assertEquals("currency" in noValue, false);

  assertEquals(buildDmEvent(BASE, "qualified_lead"), null);
});

Deno.test("extractValue: bruttopreis fail-soft", () => {
  assertEquals(extractValue({ bruttopreis: 2750 }), 2750);
  assertEquals(extractValue({ bruttopreis: 0 }), null);
  assertEquals(extractValue({ bruttopreis: "2750" }), null);
  assertEquals(extractValue(null), null);
  assertEquals(extractValue("x"), null);
});

Deno.test("buildDmEvent: transactionId-Override + eigene Destination für Buchungen", () => {
  const ev = buildDmEvent({ ...BASE, gclid: "GCLID9", value: 400 }, "booking", "booking-lead-9")!;
  assertEquals(ev.transactionId, "booking-lead-9");
  assertEquals(ev.destinationReferences, ["booking"]);
  assertEquals(ev.conversionValue, 400);
  assertEquals(ev.currency, "EUR");
});
