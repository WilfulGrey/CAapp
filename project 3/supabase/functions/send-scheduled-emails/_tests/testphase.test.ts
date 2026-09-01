/* Deno-Test der Testphase-Umleitung — Spiegel des vitest-Tests
 * (src/__tests__/portalSchutz.test.ts). Logik-Kopie: siehe testphase.ts. */
import { assertEquals } from "jsr:@std/assert";
import { testphaseUmleitung, TESTPHASE_EMPFAENGER } from "../testphase.ts";

Deno.test("Flag an + Portal-Lead → Team-Adressen + Betreff-Praefix", () => {
  const u = testphaseUmleitung({ source: "portal:pflegehilfe.org", email: "kunde@example.org" }, "1");
  assertEquals(u?.empfaenger, TESTPHASE_EMPFAENGER);
  assertEquals(u?.betreffPraefix, "[TESTPHASE → kunde@example.org] ");
});

Deno.test("Flag aus → keine Umleitung", () => {
  assertEquals(testphaseUmleitung({ source: "portal:pflegehilfe.org", email: "k@x.de" }, undefined), null);
  assertEquals(testphaseUmleitung({ source: "portal:pflegehilfe.org", email: "k@x.de" }, "0"), null);
});

Deno.test("Flag an, kein Portal-Lead → keine Umleitung", () => {
  assertEquals(testphaseUmleitung({ source: "rechner", email: "k@x.de" }, "1"), null);
  assertEquals(testphaseUmleitung({ source: null, email: "k@x.de" }, "1"), null);
});
