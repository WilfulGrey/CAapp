// Registry #124: Der Orphan-Cancel-Sweep (Bewerbung aus mamamia verschwunden ⇒ offene
// Erinnerungen abbrechen) kannte nur die alten Reminder-Typen. Die neuen
// `application_erinnerung_1/2/letzte` (Registry #96/#97) liefen daran vorbei — eine
// zurückgezogene Bewerbung bekam weiter „… noch 2 Tage für Sie reserviert“.
//
// Dieser Test hält die zwei Kopien zusammen: `REMINDER_TYPES` hier und
// `ERINNERUNG_TYPEN` im Versand (project 3/send-scheduled-emails/stopRegeln.ts).
// Edge Functions können nicht über Ordnergrenzen importieren, der Test darf es.
import { assert, assertEquals } from "@std/assert";
import { REMINDER_TYPES } from "../index.ts";
import {
  ERINNERUNG_ALT,
  ERINNERUNG_NEU,
  ERINNERUNG_TYPEN,
} from "../../../../project 3/supabase/functions/send-scheduled-emails/stopRegeln.ts";

Deno.test("REMINDER_TYPES: neue Erinnerungstypen sind dem Sweep bekannt (#124)", () => {
  for (const typ of ERINNERUNG_NEU) {
    assert(REMINDER_TYPES.includes(typ), `Sweep kennt ${typ} nicht`);
  }
  assert(REMINDER_TYPES.includes("application_erinnerung_1"));
  assert(REMINDER_TYPES.includes("application_erinnerung_2"));
  assert(REMINDER_TYPES.includes("application_erinnerung_letzte"));
});

Deno.test("REMINDER_TYPES: alte Typen bleiben (Zeilen aus der Warteschlange vor dem 27.09.)", () => {
  for (const typ of ERINNERUNG_ALT) {
    assert(REMINDER_TYPES.includes(typ), `Sweep kennt ${typ} nicht mehr`);
  }
  assert(REMINDER_TYPES.includes("interest_reminder"));
});

Deno.test("REMINDER_TYPES == ERINNERUNG_TYPEN + interest_reminder (Spiegel bleibt deckungsgleich)", () => {
  const erwartet = new Set<string>([...ERINNERUNG_TYPEN, "interest_reminder"]);
  assertEquals(new Set(REMINDER_TYPES), erwartet);
  // keine Doppelungen in der Liste (sonst wären es zwei `.in()`-Werte für denselben Typ)
  assertEquals(new Set(REMINDER_TYPES).size, REMINDER_TYPES.length);
});
