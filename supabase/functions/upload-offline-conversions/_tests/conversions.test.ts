import { assertEquals, assertThrows } from "@std/assert";
import {
  buildClickConversion,
  classifyFailure,
  extractValue,
  formatConversionDateTime,
  isOldEnough,
  parsePartialFailures,
  pickClickId,
  type QualifiedLeadCandidate,
} from "../conversions.ts";

const BASE: QualifiedLeadCandidate = {
  leadId: "11111111-2222-3333-4444-555555555555",
  conversionAt: "2026-08-14T07:30:05.123456+00:00",
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

Deno.test("formatConversionDateTime: UTC mit +00:00, Mikrosekunden gekappt", () => {
  assertEquals(formatConversionDateTime("2026-08-14T07:30:05.123456+00:00"), "2026-08-14 07:30:05+00:00");
  // CEST-Input wird nach UTC gedreht (09:15 Berlin = 07:15 UTC)
  assertEquals(formatConversionDateTime("2026-08-14T09:15:00+02:00"), "2026-08-14 07:15:00+00:00");
  assertThrows(() => formatConversionDateTime("kaputt"));
});

Deno.test("isOldEnough: 6h-Guard", () => {
  const now = Date.parse("2026-08-14T12:00:00Z");
  assertEquals(isOldEnough("2026-08-14T05:59:00Z", now), true);
  assertEquals(isOldEnough("2026-08-14T06:01:00Z", now), false);
  assertEquals(isOldEnough("invalid", now), false);
});

Deno.test("buildClickConversion: gclid + orderId + Wert nur wenn > 0", () => {
  const withValue = buildClickConversion(
    { ...BASE, gclid: "GCLID1", value: 3999 },
    "customers/9240286999/conversionActions/7720728390",
  )!;
  assertEquals(withValue.gclid, "GCLID1");
  assertEquals(withValue.orderId, BASE.leadId);
  assertEquals(withValue.conversionValue, 3999);
  assertEquals(withValue.currencyCode, "EUR");
  assertEquals(withValue.conversionDateTime, "2026-08-14 07:30:05+00:00");

  const noValue = buildClickConversion({ ...BASE, wbraid: "WB1", value: null }, "act")!;
  assertEquals(noValue.wbraid, "WB1");
  assertEquals("conversionValue" in noValue, false);
  assertEquals("gclid" in noValue, false);

  assertEquals(buildClickConversion(BASE, "act"), null);
});

Deno.test("extractValue: bruttopreis fail-soft", () => {
  assertEquals(extractValue({ bruttopreis: 4172.5 }), 4172.5);
  assertEquals(extractValue({ bruttopreis: 0 }), null);
  assertEquals(extractValue({ bruttopreis: "4000" }), null);
  assertEquals(extractValue(null), null);
  assertEquals(extractValue("x"), null);
});

Deno.test("classifyFailure: CLICK_NOT_FOUND permanent, Unbekanntes retriable", () => {
  assertEquals(classifyFailure("CLICK_NOT_FOUND"), "permanent");
  assertEquals(classifyFailure("EXPIRED_CLICK"), "permanent");
  assertEquals(classifyFailure("TOO_RECENT_CLICK"), "retriable");
  assertEquals(classifyFailure("IRGENDWAS_NEUES"), "retriable");
  assertEquals(classifyFailure(undefined), "retriable");
});

Deno.test("parsePartialFailures: Index-Mapping aus GoogleAdsFailure", () => {
  const failures = parsePartialFailures({
    code: 3,
    message: "partial failure",
    details: [{
      "@type": "type.googleapis.com/google.ads.googleads.v23.errors.GoogleAdsFailure",
      errors: [
        {
          errorCode: { conversionUploadError: "CLICK_NOT_FOUND" },
          message: "The click could not be found.",
          location: { fieldPathElements: [{ fieldName: "conversions", index: 2 }] },
        },
        {
          errorCode: { conversionUploadError: "TOO_RECENT_CLICK" },
          message: "too recent",
          location: { fieldPathElements: [{ fieldName: "conversions", index: 0 }] },
        },
      ],
    }],
  });
  assertEquals(failures.size, 2);
  assertEquals(failures.get(2)?.code, "CLICK_NOT_FOUND");
  assertEquals(failures.get(0)?.code, "TOO_RECENT_CLICK");
  assertEquals(parsePartialFailures(undefined).size, 0);
  assertEquals(parsePartialFailures({ details: "x" }).size, 0);
});
