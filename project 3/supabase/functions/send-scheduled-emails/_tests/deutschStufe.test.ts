import { assertEquals } from "@std/assert";
import { deutschStufe } from "../deutschStufe.ts";

// Anlass (Martin, 19.08.2026, Screenshot einer Nachfassmail um 01:35):
// „Deutsch A2-B1" statt „Deutsch Mittel". Ursache war NICHT der Code — der
// sagte seit #470 das Richtige —, sondern der Schnappschuss in
// scheduled_emails.metadata: der Detektor schrieb bis zum (nie erfolgten)
// Prod-Deploy von #470 CEFR-Kürzel. Wartende Zeilen tragen ihren alten Wert
// bis zum Versand mit sich, deshalb wird beim Rendern normalisiert.

Deno.test("CEFR-Altbestand wird auf die 3 Kundenwörter gehoben", () => {
  assertEquals(deutschStufe("A1"), "Grund");
  assertEquals(deutschStufe("A1-A2"), "Grund");
  assertEquals(deutschStufe("A2-B1"), "Mittel");
  assertEquals(deutschStufe("B1-B2"), "Gut");
  assertEquals(deutschStufe("B2-C1"), "Gut");
});

Deno.test("bereits korrekte Wörter bleiben unverändert", () => {
  assertEquals(deutschStufe("Grund"), "Grund");
  assertEquals(deutschStufe("Mittel"), "Mittel");
  assertEquals(deutschStufe("Gut"), "Gut");
});

Deno.test("Leerraum stört nicht", () => {
  assertEquals(deutschStufe(" A2-B1 "), "Mittel");
  assertEquals(deutschStufe("  Gut"), "Gut");
});

Deno.test("leer/fehlend ergibt null — Zeile entfällt", () => {
  assertEquals(deutschStufe(null), null);
  assertEquals(deutschStufe(undefined), null);
  assertEquals(deutschStufe(""), null);
});

Deno.test("Unbekanntes wird NICHT roh ausgegeben", () => {
  // Lieber keine Angabe als eine, die der Kunde nicht einordnen kann
  // (Święta zasada 1: keine dummen Daten).
  assertEquals(deutschStufe("C2"), null);
  assertEquals(deutschStufe("level_3"), null);
  assertEquals(deutschStufe("fließend"), null);
});
