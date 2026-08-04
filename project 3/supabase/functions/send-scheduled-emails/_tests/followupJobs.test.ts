import { assertEquals } from "@std/assert";
import { appendJobParam, reminderBookedCancel } from "../followupJobs.ts";

// ─── appendJobParam ─────────────────────────────────────────────────────────

Deno.test("appendJobParam: URL mit ?token → &job angehängt", () => {
  assertEquals(
    appendJobParam("https://portal.test/?token=abc", "11111111-2222-3333-4444-555555555555"),
    "https://portal.test/?token=abc&job=11111111-2222-3333-4444-555555555555",
  );
});

Deno.test("appendJobParam: URL ohne Query → ?job angehängt", () => {
  assertEquals(
    appendJobParam("https://portal.test/", "u-1"),
    "https://portal.test/?job=u-1",
  );
});

Deno.test("appendJobParam: null/undefined UUID → URL unverändert (fail-soft plain link)", () => {
  assertEquals(appendJobParam("https://portal.test/?token=abc", null), "https://portal.test/?token=abc");
  assertEquals(appendJobParam("https://portal.test/?token=abc", undefined), "https://portal.test/?token=abc");
});

Deno.test("appendJobParam: leere URL bleibt leer (kein kaputter Link)", () => {
  assertEquals(appendJobParam("", "u-1"), "");
});

Deno.test("appendJobParam: UUID wird URL-encodiert", () => {
  assertEquals(
    appendJobParam("https://portal.test/?token=abc", "a b&c"),
    "https://portal.test/?token=abc&job=a%20b%26c",
  );
});

// ─── reminderBookedCancel (Bug #24: job-aware Cancel) ───────────────────────

Deno.test("cancel: nicht_interessiert cancelt IMMER — auch bei geplantem Job", () => {
  assertEquals(
    reminderBookedCancel({ isBeauftragt: false, isNichtInteressiert: true, reminderJobStatus: "geplant" }),
    true,
  );
  assertEquals(
    reminderBookedCancel({ isBeauftragt: true, isNichtInteressiert: true, reminderJobStatus: "geplant" }),
    true,
  );
});

Deno.test("cancel: weder beauftragt noch nicht_interessiert → Reminder läuft", () => {
  assertEquals(
    reminderBookedCancel({ isBeauftragt: false, isNichtInteressiert: false, reminderJobStatus: null }),
    false,
  );
});

Deno.test("cancel: beauftragt + Reminder-Job AKTUELL geplant → überlebt (Kern des Fixes)", () => {
  // Folge-Einsatz-Kunde: alter Accept macht isBeauftragt=true lead-weit,
  // aber der Reminder gehört zum NEUEN, noch unbesetzten Job.
  assertEquals(
    reminderBookedCancel({ isBeauftragt: true, isNichtInteressiert: false, reminderJobStatus: "geplant" }),
    false,
  );
});

Deno.test("cancel: beauftragt + Job gebucht/abgeschlossen/storniert → cancelt", () => {
  for (const status of ["gebucht", "abgeschlossen", "storniert"]) {
    assertEquals(
      reminderBookedCancel({ isBeauftragt: true, isNichtInteressiert: false, reminderJobStatus: status }),
      true,
      `status=${status} muss canceln`,
    );
  }
});

Deno.test("cancel: beauftragt + kein Job-Kontext (Legacy-Reminder) → cancelt wie vor dem Fix", () => {
  assertEquals(
    reminderBookedCancel({ isBeauftragt: true, isNichtInteressiert: false, reminderJobStatus: null }),
    true,
  );
});
