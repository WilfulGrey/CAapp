// Nachtruhe in der Edge-Fn-Kopie — muss sich identisch zu lib/quiet-hours.ts
// verhalten (zwei Dateien, weil Edge Functions nicht aus lib/ importieren).
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ausDerNachtruhe } from "../quietHours.ts";

const berlin = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);

Deno.test("Tagzeit bleibt unveraendert", () => {
  const d = new Date("2026-08-19T12:30:00Z");
  assertEquals(ausDerNachtruhe(d).toISOString(), d.toISOString());
});

Deno.test("01:00 nachts -> 08:00 desselben Tages", () => {
  assertEquals(berlin(ausDerNachtruhe(new Date("2026-08-19T23:00:00Z"))), "20.08., 08:00");
});

Deno.test("22:30 -> naechster Morgen", () => {
  assertEquals(berlin(ausDerNachtruhe(new Date("2026-08-19T20:30:00Z"))), "20.08., 08:00");
});

Deno.test("Winterzeit trifft ebenfalls 08:00", () => {
  assertEquals(ausDerNachtruhe(new Date("2026-12-05T02:00:00Z")).toISOString(), "2026-12-05T07:00:00.000Z");
});
