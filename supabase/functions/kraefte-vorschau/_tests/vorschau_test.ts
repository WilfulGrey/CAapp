import { stichtag } from "../index.ts";
import { assertEquals } from "@std/assert";
import { alterAus, anonymisiere, passtZuWuenschen, type RohKraft, waehleVorschau } from "../vorschau.ts";
import { handleRequest } from "../index.ts";

const JETZT = new Date("2026-09-09T12:00:00Z");
const promo = { aws_url: "https://cdn/promo.jpg" };
const ret = { aws_url: "https://cdn/ret.jpg" };

function kraft(p: Partial<RohKraft> & { id: number }): RohKraft {
  return {
    first_name: "Anna Maria", gender: "female", year_of_birth: 1974, germany_skill: "level_2",
    care_experience: "7", available_from: "2026-09-20", hp_total_jobs: 3, driving_license: "no",
    caregiver_status: { is_blocked: false }, avatar_retouched_promo: promo, avatar_retouched: ret,
    ...p,
  };
}

Deno.test("Filter: Deutsch-Wunsch, Geschlecht, Führerschein, Sperre", () => {
  const w = { deutsch: "kommunikativ", geschlecht: "weiblich", fuehrerschein: "ja" };
  assertEquals(passtZuWuenschen(kraft({ id: 1, driving_license: "yes_manual" }), w), true);
  assertEquals(passtZuWuenschen(kraft({ id: 2 }), w), false, "kein Führerschein");
  assertEquals(passtZuWuenschen(kraft({ id: 3, driving_license: "yes", gender: "male" }), w), false);
  assertEquals(passtZuWuenschen(kraft({ id: 4, driving_license: "yes", germany_skill: "level_3" }), w), false);
  assertEquals(passtZuWuenschen(kraft({ id: 5, driving_license: "yes", germany_skill: null }), w), true, "Stufe unbekannt zählt wie im Portal als passend");
  assertEquals(passtZuWuenschen(kraft({ id: 6, driving_license: "yes", caregiver_status: { is_blocked: true } }), w), false);
  assertEquals(passtZuWuenschen(kraft({ id: 7, gender: "male" }), { deutsch: null, geschlecht: "egal", fuehrerschein: "nein" }), true);
});

Deno.test("Auswahl: bald verfügbar zuerst, darin Stufe vor Erfahrung vor Werbefoto, nie ohne Foto", () => {
  const alle = [
    kraft({ id: 1, hp_total_jobs: 1, available_from: "2026-09-15" }),
    kraft({ id: 2, hp_total_jobs: 12, available_from: "2026-09-12" }),
    kraft({ id: 3, hp_total_jobs: 8, available_from: "2027-03-01" }),                      // zu spät → nie
    kraft({ id: 4, hp_total_jobs: 8, avatar_retouched_promo: null }),                       // Stammkraft, nur retuschiert
    kraft({ id: 5, hp_total_jobs: 8, available_from: null }),                              // Verfügbarkeit unbekannt → Topf 2
    kraft({ id: 6, hp_total_jobs: 20, avatar_retouched_promo: null, avatar_retouched: null }), // kein Foto → nie
    kraft({ id: 7, hp_total_jobs: 0, care_experience: "9", available_from: "2026-09-16" }),   // neu, aber 9 Jahre
    kraft({ id: 8, hp_total_jobs: 0, care_experience: "0", available_from: "2026-09-10" }),   // neu, 0 Jahre
  ];
  const v = waehleVorschau(alle, { deutsch: "kommunikativ", geschlecht: "egal", fuehrerschein: "nein" }, JETZT);
  assertEquals(v.map((k) => k.id), [2, 4, 1], "Elite, dann Stammkraft trotz fehlendem Werbefoto, dann Bekannt");
  assertEquals(v[0].stufe, "Elite");
  const nurNeue = waehleVorschau(alle.filter((k) => (k.hp_total_jobs ?? 0) === 0), { deutsch: null, geschlecht: "egal", fuehrerschein: "nein" }, JETZT);
  assertEquals(nurNeue.map((k) => k.id), [7, 8], "ohne Einsätze zählt die Berufserfahrung");
});

Deno.test("Anonymisierung: nur Vorname, Alter, Stufe, Erfahrung, Deutsch, Foto, Datum", () => {
  const a = anonymisiere(kraft({ id: 9, first_name: " Katarzyna Anna ", year_of_birth: 1970, care_experience: "12 Jahre", hp_total_jobs: 6, germany_skill: "level_3" }), JETZT);
  assertEquals(a, {
    id: 9, vorname: "Katarzyna", alter: 56, deutschWort: "Gut", erfahrungJahre: 12, einsaetze: 6,
    stufe: "Stammkraft", fotoUrl: promo.aws_url, verfuegbarAb: "2026-09-20",
  });
  assertEquals(Object.keys(a).includes("last_name"), false);
});

Deno.test("Handler: leere Liste statt 5xx, wenn mamamia ausfällt", async () => {
  const req = new Request("http://x/", { method: "POST", body: JSON.stringify({ deutsch: "gut" }), headers: { "content-type": "application/json" } });
  const res = await handleRequest(req, () => Promise.reject(new Error("mamamia down")));
  assertEquals(res.status, 200);
  const j = await res.json();
  assertEquals(j.kraefte, []);
  assertEquals(j.fehler, true);
});

Deno.test("Handler: Wünsche werden gelesen und angewendet", async () => {
  const req = new Request("http://x/", { method: "POST", body: JSON.stringify({ geschlecht: "maennlich" }), headers: { "content-type": "application/json" } });
  const res = await handleRequest(req, () => Promise.resolve([kraft({ id: 1 }), kraft({ id: 2, gender: "male", first_name: "Piotr" })]));
  const j = await res.json();
  assertEquals(j.kraefte.map((k: { vorname: string }) => k.vorname), ["Piotr"]);
  assertEquals(j.gesamt, 2);
});

Deno.test("Stichtag: 60 Tage zurück, ISO-Datum", () => {
  assertEquals(stichtag(new Date("2026-09-09T22:00:00Z")), "2026-07-11");
  assertEquals(stichtag(new Date("2026-03-01T00:00:00Z"), 30), "2026-01-30");
});

Deno.test("Alter: birth_date taggenau vor year_of_birth, sonst null", () => {
  const now = new Date("2026-09-09T12:00:00Z");
  assertEquals(alterAus({ birth_date: "1962-09-10", year_of_birth: 1962 }, now), 63, "Geburtstag morgen");
  assertEquals(alterAus({ birth_date: "1962-09-09", year_of_birth: 1962 }, now), 64, "Geburtstag heute");
  assertEquals(alterAus({ birth_date: null, year_of_birth: 1970 }, now), 56);
  assertEquals(alterAus({ birth_date: "kaputt", year_of_birth: null }, now), null);
});
