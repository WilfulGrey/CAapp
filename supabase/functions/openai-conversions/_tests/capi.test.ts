import { assertEquals } from "@std/assert";
import { baueLeadEvent, bewerteAntwort, inBloecke, istImFenster, WERT_ANFRAGE_MINOR, capiUrl } from "../capi.ts";

Deno.test("baut ein lead_created-Ereignis ohne Personendaten, Wert in Cent, id = lead_id", () => {
  const ev = baueLeadEvent({ leadId: "lead-1", createdAt: "2026-09-11T08:00:00.000Z", oppref: "gAAAAAB" });
  assertEquals(ev.id, "lead-1");
  assertEquals(ev.type, "lead_created");
  assertEquals(ev.oppref, "gAAAAAB");
  assertEquals(ev.action_source, "web");
  assertEquals(ev.source_url, "https://kostenrechner.primundus.de/");
  assertEquals(ev.timestamp_ms, Date.parse("2026-09-11T08:00:00.000Z"));
  assertEquals(ev.data, { type: "customer_action", amount: 2000, currency: "EUR" });
  assertEquals(WERT_ANFRAGE_MINOR, 2000);
  assertEquals(Object.keys(ev).sort(), ["action_source", "data", "id", "oppref", "source_url", "timestamp_ms", "type"]);
});

Deno.test("Zeitfenster: nur die letzten 6 Tage, keine Zukunft, kaputte Zeit = raus", () => {
  const jetzt = Date.parse("2026-09-11T12:00:00Z");
  assertEquals(istImFenster("2026-09-11T11:00:00Z", jetzt), true);
  assertEquals(istImFenster("2026-09-05T12:00:01Z", jetzt), true);
  assertEquals(istImFenster("2026-09-04T11:00:00Z", jetzt), false);
  assertEquals(istImFenster("2026-09-11T12:30:00Z", jetzt), false);
  assertEquals(istImFenster("kaputt", jetzt), false);
});

Deno.test("Antwortbewertung: 2xx angenommen, 400/422 permanent, Rest später", () => {
  assertEquals(bewerteAntwort(200), "uploaded");
  assertEquals(bewerteAntwort(202), "uploaded");
  assertEquals(bewerteAntwort(400), "permanent_failure");
  assertEquals(bewerteAntwort(422), "permanent_failure");
  assertEquals(bewerteAntwort(401), "retry");
  assertEquals(bewerteAntwort(429), "retry");
  assertEquals(bewerteAntwort(503), "retry");
  assertEquals(bewerteAntwort(0), "retry");
});

Deno.test("Blöcke und URL", () => {
  assertEquals(inBloecke([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(inBloecke([], 2), []);
  assertEquals(capiUrl("8xPJ"), "https://bzr.openai.com/v1/events?pid=8xPJ");
});
