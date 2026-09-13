import { assertEquals } from "@std/assert";
import { imVersandfenster, type Kontakt, type MailKey, naechsteMail, planeLauf, type Versand } from "../plan.ts";

// Mittwoch, 16.09.2026, 10:00 Berliner Zeit (UTC+2)
const MI_10 = new Date("2026-09-16T08:00:00Z");
const TAG = 24 * 60 * 60 * 1000;
const vor = (tage: number) => new Date(MI_10.getTime() - tage * TAG).toISOString();

let n = 0;
function kontakt(domain = `firma${++n}.de`, status = "aktiv"): Kontakt {
  const id = `k${++n}`;
  return { id, email: `info@${domain}`, domain, status };
}
function gesendet(k: Kontakt, mail: MailKey, tageHer: number): Versand {
  return { kontakt_id: k.id, mail, status: "gesendet", erstellt_am: vor(tageHer), gesendet_am: vor(tageHer) };
}
const alleFrei = new Set<MailKey>(["haupt", "nf1", "nf2", "nf3"]);

Deno.test("Versandfenster: nur Mo–Fr 9–17 Uhr Berliner Zeit", () => {
  assertEquals(imVersandfenster(MI_10), true);
  assertEquals(imVersandfenster(new Date("2026-09-16T06:59:00Z")), false); // 8:59
  assertEquals(imVersandfenster(new Date("2026-09-16T15:00:00Z")), false); // 17:00
  assertEquals(imVersandfenster(new Date("2026-09-19T08:00:00Z")), false); // Samstag
});

Deno.test("ohne Freigabe geht nichts raus", () => {
  const k = [kontakt(), kontakt()];
  assertEquals(planeLauf(MI_10, k, [], new Set()), []);
  assertEquals(planeLauf(MI_10, k, [], new Set(["nf1"])), []); // nf1 frei, Hauptmail aber nicht
});

Deno.test("Hauptmail nur an aktive Kontakte", () => {
  const aktiv = kontakt();
  const ab = kontakt(undefined, "abgemeldet");
  const plan = planeLauf(MI_10, [aktiv, ab], [], new Set(["haupt"]));
  assertEquals(plan.map((p) => [p.kontakt.id, p.mail]), [[aktiv.id, "haupt"]]);
});

Deno.test("pro Lauf höchstens 10 und pro Firmen-Domain nur eine", () => {
  const viele = Array.from({ length: 25 }, () => kontakt());
  assertEquals(planeLauf(MI_10, viele, [], new Set(["haupt"])).length, 10);
  const netz = [kontakt("aterima-care.de"), kontakt("aterima-care.de"), kontakt("aterima-care.de")];
  assertEquals(planeLauf(MI_10, netz, [], new Set(["haupt"])).length, 1);
  const frei = [kontakt("gmail.com"), kontakt("gmail.com")];
  assertEquals(planeLauf(MI_10, frei, [], new Set(["haupt"])).length, 2);
});

Deno.test("pro Firmen-Domain höchstens 5 am Tag", () => {
  const netz = Array.from({ length: 8 }, () => kontakt("brinkmann-pflegevermittlung.de"));
  const heute = netz.slice(0, 5).map((k) => ({ ...gesendet(k, "haupt", 0), gesendet_am: new Date(MI_10.getTime() - 3 * 60 * 60 * 1000).toISOString() }));
  assertEquals(planeLauf(MI_10, netz, heute, new Set(["haupt"])), []);
});

Deno.test("höchstens 40 pro Stunde", () => {
  const schon = Array.from({ length: 40 }, () => kontakt());
  const letzteStunde = schon.map((k) => ({ ...gesendet(k, "haupt", 0), gesendet_am: new Date(MI_10.getTime() - 20 * 60 * 1000).toISOString() }));
  const neu = [kontakt()];
  assertEquals(planeLauf(MI_10, [...schon, ...neu], letzteStunde, new Set(["haupt"])), []);
});

Deno.test("Nachfass 1 frühestens 3 Tage nach der Hauptmail und nur mit Freigabe", () => {
  const k = kontakt();
  assertEquals(naechsteMail(k, [gesendet(k, "haupt", 2)], alleFrei, MI_10), null);
  assertEquals(naechsteMail(k, [gesendet(k, "haupt", 3)], alleFrei, MI_10), "nf1");
  assertEquals(naechsteMail(k, [gesendet(k, "haupt", 3)], new Set(["haupt"]), MI_10), null);
});

Deno.test("Nachfass 2 an Tag 7, mit 3 Tagen Abstand zur vorigen Mail", () => {
  const k = kontakt();
  assertEquals(naechsteMail(k, [gesendet(k, "haupt", 10), gesendet(k, "nf1", 1)], alleFrei, MI_10), null);
  assertEquals(naechsteMail(k, [gesendet(k, "haupt", 10), gesendet(k, "nf1", 3)], alleFrei, MI_10), "nf2");
  assertEquals(naechsteMail(k, [gesendet(k, "haupt", 6), gesendet(k, "nf1", 3)], alleFrei, MI_10), null);
});

Deno.test("nach Nachfass 3 ist Schluss", () => {
  const k = kontakt();
  const alle = [gesendet(k, "haupt", 30), gesendet(k, "nf1", 27), gesendet(k, "nf2", 23), gesendet(k, "nf3", 16)];
  assertEquals(naechsteMail(k, alle, alleFrei, MI_10), null);
});

Deno.test("reserviert oder fehler blockiert die Reihe statt doppelt zu senden", () => {
  const k = kontakt();
  const res: Versand = { kontakt_id: k.id, mail: "haupt", status: "reserviert", erstellt_am: vor(5), gesendet_am: null };
  const fehl: Versand = { ...res, status: "fehler" };
  assertEquals(naechsteMail(k, [res], alleFrei, MI_10), null);
  assertEquals(naechsteMail(k, [fehl], alleFrei, MI_10), null);
});

Deno.test("Nachfassmails vor neuen Hauptmails", () => {
  const alt = kontakt();
  const neu = kontakt();
  const plan = planeLauf(MI_10, [neu, alt], [gesendet(alt, "haupt", 4)], alleFrei);
  assertEquals(plan.map((p) => p.mail), ["nf1", "haupt"]);
});
