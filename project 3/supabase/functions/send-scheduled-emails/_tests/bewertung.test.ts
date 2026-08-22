import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  BEWERTUNG_STICHTAG,
  bewertungAusschlussgrund,
  getBewertungsanfrageTemplate,
  imBewertungsfenster,
  type BewertungsLead,
} from "../bewertung.ts";

const basis: BewertungsLead = {
  id: "l1", vorname: "Christina", nachname: "Kutz", anrede_text: "Frau",
  token: "tok123", email: "k@example.org", status: "angebot_erstellt",
  created_at: "2026-08-14T09:00:00.000Z",
};
const jetzt = new Date("2026-08-21T10:30:00.000Z");

Deno.test("faellig: 7 Tage alt, aktiver Status, keine Bewerbungsphase", () => {
  assertEquals(bewertungAusschlussgrund(basis, [], jetzt), null);
});

Deno.test("zu frisch: unter 7 Tagen", () => {
  const l = { ...basis, created_at: "2026-08-18T09:00:00.000Z" };
  assertEquals(bewertungAusschlussgrund(l, [], jetzt), "zu_frisch");
});

Deno.test("vor Stichtag: Bestand bleibt unberuehrt", () => {
  const l = { ...basis, created_at: "2026-08-01T09:00:00.000Z" };
  assertEquals(bewertungAusschlussgrund(l, [], jetzt), "vor_stichtag");
});

Deno.test("nicht_interessiert: hartes Sende-Stopp", () => {
  const l = { ...basis, status: "nicht_interessiert" };
  assertEquals(bewertungAusschlussgrund(l, [], jetzt), "nicht_interessiert");
});

Deno.test("Kunde: gehoert zu Trigger 2, nicht Tag 7", () => {
  for (const s of ["vertrag_abgeschlossen", "betreuung_beauftragt", "folge_einsatz"]) {
    assertEquals(bewertungAusschlussgrund({ ...basis, status: s }, [], jetzt), "kunde_trigger2");
  }
});

Deno.test("Bewerbungsphase: pending application_* verschiebt", () => {
  assertEquals(
    bewertungAusschlussgrund(basis, ["application_reminder_4h"], jetzt),
    "bewerbungsphase",
  );
});

Deno.test("ohne Token oder E-Mail: kein Versand", () => {
  assertEquals(bewertungAusschlussgrund({ ...basis, token: null }, [], jetzt), "kein_kontakt");
  assertEquals(bewertungAusschlussgrund({ ...basis, email: null }, [], jetzt), "kein_kontakt");
});

Deno.test("Fenster: 10:30 Berlin drin, 14:00 draussen", () => {
  assertEquals(imBewertungsfenster(new Date("2026-08-21T08:30:00.000Z")), true);  // 10:30 Berlin (CEST)
  assertEquals(imBewertungsfenster(new Date("2026-08-21T12:00:00.000Z")), false); // 14:00 Berlin
  assertEquals(imBewertungsfenster(new Date("2026-08-21T23:30:00.000Z")), false); // 01:30 Berlin
});

Deno.test("Template: Betreff, drei Antwort-Links mit Token, Anrede", () => {
  const tpl = getBewertungsanfrageTemplate(basis, "https://kostenrechner.primundus.de");
  assertEquals(tpl.subject, "Wie fanden Sie unser Angebot?");
  for (const a of ["hilfreich", "teils", "nein"]) {
    assertStringIncludes(tpl.html, `/feedback?token=tok123&a=${a}`);
  }
  assertStringIncludes(tpl.html, "Guten Tag Frau Kutz");
  assertStringIncludes(tpl.text, "/feedback?token=tok123");
});

Deno.test("Stichtag ist der 14.08. (Martin: nur Neuanfragen)", () => {
  assertEquals(BEWERTUNG_STICHTAG, "2026-08-14");
});
