// Stopp- und Zeitregeln der Kundenmails (26.09.2026) — siehe stopRegeln.ts.
import { assert, assertEquals } from "@std/assert";
import {
  erinnerungStopp,
  erinnerungStufe,
  genitiv,
  neuePflegekraefteEntscheidung,
  reservierungAktiv,
  reservierungsEnde,
  reserviertBisAus,
  reserviertRest,
  sucheStandStopp,
  VOR_DEM_ABSENDEN,
  vorAbsendenStopp,
} from "../stopRegeln.ts";

const H = 60 * 60 * 1000;

Deno.test("Vier Dinge, Nachfass 2 und 3 stoppen, sobald die Pflegesituation steht", () => {
  for (const t of ["warum_primundus", "nachfass_2", "nachfass_3"]) assert(VOR_DEM_ABSENDEN.has(t));
  const basis = { beauftragt: false, nichtInteressiert: false };
  assertEquals(vorAbsendenStopp({ ...basis, meilenstein: "none" }), null);
  assertEquals(vorAbsendenStopp({ ...basis, meilenstein: "portal_opened" }), null);
  assertEquals(vorAbsendenStopp({ ...basis, meilenstein: "patient_data_saved" }), "patient_data_saved");
  assertEquals(vorAbsendenStopp({ ...basis, meilenstein: "caregiver_invited" }), "caregiver_invited");
  assertEquals(vorAbsendenStopp({ beauftragt: true, nichtInteressiert: false, meilenstein: "none" }), "betreuung_beauftragt");
  assertEquals(vorAbsendenStopp({ beauftragt: false, nichtInteressiert: true, meilenstein: "none" }), "nicht_interessiert");
});

Deno.test("Erinnerungsstufen: neue und alte Typen", () => {
  assertEquals(erinnerungStufe("application_erinnerung_1"), "1");
  assertEquals(erinnerungStufe("application_erinnerung_2"), "2");
  assertEquals(erinnerungStufe("application_erinnerung_letzte"), "letzte");
  assertEquals(erinnerungStufe("application_reminder"), "1");
  assertEquals(erinnerungStufe("application_reminder_12h"), "1");
  assertEquals(erinnerungStufe("application_last_chance"), "letzte");
  assertEquals(erinnerungStufe("interest_reminder"), null);
  // Präfix application_ bleibt (bewertung.ts hält die Bewertungsanfrage zurück).
  for (const t of ["application_erinnerung_1", "application_erinnerung_2", "application_erinnerung_letzte"]) assert(t.startsWith("application_"));
});

Deno.test("Reservierung endet 72 h nach dem ERSTEN Eingang, auf die volle Stunde abgerundet", () => {
  const erster = Date.parse("2026-09-26T13:47:12Z");
  assertEquals(reservierungsEnde([erster + 5 * H, erster])!.toISOString(), "2026-09-29T13:00:00.000Z");
  assertEquals(reservierungsEnde([]), null);
  // metadata.reserviert_bis hat Vorrang
  assertEquals(reserviertBisAus("2026-09-29T20:00:00.000Z", [erster])!.toISOString(), "2026-09-29T20:00:00.000Z");
  assertEquals(reserviertBisAus(null, [erster])!.toISOString(), "2026-09-29T13:00:00.000Z");
  assertEquals(reserviertBisAus("kaputt", []), null);
});

Deno.test("Countdown-Text", () => {
  assertEquals(reserviertRest(52 * H), "noch 2 Tage");
  assertEquals(reserviertRest(47.6 * H), "noch 2 Tage");
  assertEquals(reserviertRest(24 * H - 4 * 60 * 1000), "noch 24 Stunden");
  assertEquals(reserviertRest(8 * H), "noch 8 Stunden");
  assertEquals(reserviertRest(1.2 * H), "noch 1 Stunde");
});

Deno.test("Erinnerung entfällt: abgelaufen, zu dicht, doppelt", () => {
  const ok = { restMs: 30 * H, seitLetzterMailMs: 20 * H, letzteSchonGesendet: false };
  assertEquals(erinnerungStopp({ stufe: "1", ...ok }), null);
  assertEquals(erinnerungStopp({ stufe: "1", ...ok, restMs: 0.5 * H }), "reservierung_abgelaufen");
  assertEquals(erinnerungStopp({ stufe: "letzte", ...ok, restMs: -H }), "reservierung_abgelaufen");
  // 8-Uhr-Stau: alte +4 h-Zeile kurz nach der +1 h-Zeile
  assertEquals(erinnerungStopp({ stufe: "1", ...ok, seitLetzterMailMs: 2 * H }), "zu_dicht");
  // die letzte Erinnerung fällt nie wegen Nähe weg …
  assertEquals(erinnerungStopp({ stufe: "letzte", ...ok, seitLetzterMailMs: 2 * H }), null);
  // … aber nie zweimal
  assertEquals(erinnerungStopp({ stufe: "letzte", ...ok, letzteSchonGesendet: true }), "doppelt");
  // ohne bekanntes Ende: kein Abbruch wegen Ablauf
  assertEquals(erinnerungStopp({ stufe: "2", ...ok, restMs: null }), null);
});

Deno.test("Genitiv", () => {
  assertEquals(genitiv("Maria"), "Marias");
  assertEquals(genitiv("Agnes"), "Agnes'");
  assertEquals(genitiv("Beatrix"), "Beatrix'");
});

Deno.test("Neue Pflegekräfte: nicht nachts, nicht während einer Reservierung", () => {
  const tag = new Date("2026-09-26T10:00:00Z"); // 12:00 Berlin
  const basis = { jetzt: tag, beauftragt: false, nichtInteressiert: false, reagiertSeitAnlage: false, reservierungAktiv: false };
  assertEquals(neuePflegekraefteEntscheidung(basis), { aktion: "senden" });
  assertEquals(neuePflegekraefteEntscheidung({ ...basis, reservierungAktiv: true }), { aktion: "abbrechen", grund: "reservierung_aktiv" });
  assertEquals(neuePflegekraefteEntscheidung({ ...basis, reagiertSeitAnlage: true }), { aktion: "abbrechen", grund: "reaction_received" });
  const nachts = neuePflegekraefteEntscheidung({ ...basis, jetzt: new Date("2026-09-26T22:30:00Z") }); // 00:30 Berlin
  assertEquals(nachts.aktion, "verschieben");
  if (nachts.aktion === "verschieben") assertEquals(nachts.bis.toISOString(), "2026-09-27T06:00:00.000Z");
});

Deno.test("Aktive Reservierung: echte Bewerbung < 72 h ohne Antwort", () => {
  const jetzt = new Date("2026-09-26T10:00:00Z");
  const vor = (h: number) => new Date(jetzt.getTime() - h * H).toISOString();
  const ein = (cg: number, h: number, extra: Record<string, unknown> = {}) =>
    ({ event_type: "application_received", created_at: vor(h), metadata: { caregiver_id: cg, ...extra } });
  assert(reservierungAktiv([ein(1, 10)], jetzt));
  assert(!reservierungAktiv([ein(1, 80)], jetzt));
  assert(!reservierungAktiv([ein(1, 10, { seeded: true })], jetzt));
  assert(!reservierungAktiv([ein(1, 10), { event_type: "application_rejected", created_at: vor(1), metadata: { caregiver_id: 1 } }], jetzt));
  assert(reservierungAktiv([ein(1, 10), ein(2, 5), { event_type: "application_accepted_internal", created_at: vor(1), metadata: { caregiver_id: 1 } }], jetzt));
});

Deno.test("Stand nach 2 Tagen entfällt mit Bewerbung oder neuem Interesse", () => {
  const basis = { beauftragt: false, nichtInteressiert: false, bewerbungDa: false, interesseSeitAnlage: false };
  assertEquals(sucheStandStopp(basis), null);
  assertEquals(sucheStandStopp({ ...basis, bewerbungDa: true }), "bewerbung_da");
  assertEquals(sucheStandStopp({ ...basis, interesseSeitAnlage: true }), "interesse_da");
  assertEquals(sucheStandStopp({ ...basis, beauftragt: true }), "betreuung_beauftragt");
});
