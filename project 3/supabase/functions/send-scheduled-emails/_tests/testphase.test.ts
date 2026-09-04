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

/* Registry #50: Domain-Liste statt globalem Schalter — ein Portal allein
 * in der Testphase, waehrend die anderen scharf laufen. */
Deno.test("Domain-Liste: nur das genannte Portal wird umgeleitet, '1' bleibt alle", () => {
  const helfer = { source: "portal:pflege-helfer24.de", email: "k@x.de" };
  const hilfe = { source: "portal:pflegehilfe.org", email: "k@x.de" };
  assertEquals(testphaseUmleitung(helfer, "pflege-helfer24.de")?.empfaenger, TESTPHASE_EMPFAENGER);
  assertEquals(testphaseUmleitung(hilfe, "pflege-helfer24.de"), null);
  assertEquals(testphaseUmleitung(hilfe, "pflege-helfer24.de, pflegehilfe.org")?.empfaenger, TESTPHASE_EMPFAENGER);
  assertEquals(testphaseUmleitung(hilfe, "1")?.empfaenger, TESTPHASE_EMPFAENGER);
});
