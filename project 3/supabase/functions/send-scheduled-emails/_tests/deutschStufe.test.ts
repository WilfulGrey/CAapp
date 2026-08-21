import { assertEquals } from "@std/assert";
import { deutschStufe } from "../deutschStufe.ts";

// Anlass (Martin, 19.08.2026): In einer Nachfassmail stand „Deutsch A2-B1"
// statt „Deutsch Mittel". Erste Korrektur bildete den CEFR-TEXT rückwärts ab
// und erfand damit eine vierte Definition derselben Skala — zurückgebaut.
// Jetzt gilt: beschriftet wird aus dem ROHWERT des Systems, das Wort ist nur
// Rückfall. Muster vom Kundenportal (language.bucket + language.level).

Deno.test("mamamia-Rohwert (Detektor) hat Vorrang", () => {
  assertEquals(deutschStufe("level_0"), "Grund");
  assertEquals(deutschStufe("level_1"), "Grund");
  assertEquals(deutschStufe("level_2"), "Mittel");
  assertEquals(deutschStufe("level_3"), "Gut");
  assertEquals(deutschStufe("level_4"), "Gut");
});

Deno.test("Portal-Bucket wird ebenso verstanden", () => {
  assertEquals(deutschStufe("grund"), "Grund");
  assertEquals(deutschStufe("mittel"), "Mittel");
  assertEquals(deutschStufe("gut"), "Gut");
});

Deno.test("Rohwert schlaegt ein abweichendes Wort", () => {
  // Genau der Vorfall: Warteschlange traegt veralteten Text, Rohwert stimmt.
  assertEquals(deutschStufe("level_2", "A2-B1"), "Mittel");
  assertEquals(deutschStufe("level_3", "B1-B2"), "Gut");
});

Deno.test("ohne Rohwert dient ein gueltiges Wort als Rueckfall", () => {
  assertEquals(deutschStufe(null, "Mittel"), "Mittel");
  assertEquals(deutschStufe(undefined, "Gut"), "Gut");
  assertEquals(deutschStufe("", "Grund"), "Grund");
});

Deno.test("CEFR-Altbestand ohne Rohwert wird NICHT geraten", () => {
  // Lieber keine Angabe als eine erfundene Rueckabbildung (Święta zasada 1.5).
  assertEquals(deutschStufe(null, "A2-B1"), null);
  assertEquals(deutschStufe(null, "B1-B2"), null);
});

Deno.test("leer und unbekannt ergeben null — Zeile entfaellt", () => {
  assertEquals(deutschStufe(null, null), null);
  assertEquals(deutschStufe(undefined, undefined), null);
  assertEquals(deutschStufe("level_9", "fliessend"), null);
});
