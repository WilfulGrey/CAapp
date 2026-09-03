/* Fünf-Liste in der Nudge-Mail (+4 h) — Martin, 03.09.2026: "alle 5
 * Pflegekräfte zeigen und Fokus darauf setzen, ob der Kunde sich schon alle
 * angeschaut hat". Der Unterbau ist derselbe wie bei der Empfehlung der
 * Angebotsmail (holeMatchings) — hier nur ohne getCaregiver je Zeile. */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  holeFuenf, fuenfListeHtml, fuenfListeText, fotoBudget, zahlwort,
  HAKEN_VERFUEGBAR, type Empfehlung,
} from "../empfehlung.ts";

const JETZT = new Date("2026-09-03T10:00:00Z");

function cg(over: Record<string, unknown>) {
  return {
    is_show: true,
    caregiver: {
      id: 1, first_name: "Anna", last_name: "Kowalska", gender: "female", year_of_birth: 1975,
      germany_skill: "level_2", care_experience: "5", available_from: "2026-09-01 00:00:00",
      hp_total_jobs: 3, avatar: { aws_url: "https://s3/x.jpg" },
      ...over,
    },
  };
}

function e(over: Partial<Empfehlung> = {}): Empfehlung {
  return {
    caregiverId: 1, vorname: "Anna", anzeigeName: "Anna K.", fakten: "5 Jahre Erfahrung · 3 Primundus-Einsätze",
    alter: 51, deutschWort: "Mittel", erfahrungJahre: 5, einsaetze: 3, stufe: "Bewährt", fotoUrl: "https://s3/x.jpg",
    gruende: [HAKEN_VERFUEGBAR], deutschBalken: 2, erfahrungKurz: "5 J. Erfahrung", vorstellung: "",
    ...over,
  };
}

Deno.test("holeFuenf: liefert ALLE gewählten Kräfte in Portal-Reihenfolge, ohne getCaregiver", async () => {
  const rufe: string[] = [];
  const r = await holeFuenf({
    supabaseUrl: "https://s", key: "k", token: "t", jobOfferId: 1, now: JETZT,
    formularDaten: { deutschkenntnisse: "kommunikativ" },
    fetchFn: (url, init) => {
      const u = String(url);
      if (u.includes("onboard")) { rufe.push("onboard"); return Promise.resolve(Response.json({ session_token: "jwt", job_offer_id: 1 })); }
      const body = JSON.parse(String((init as RequestInit).body)); rufe.push(body.action);
      return Promise.resolve(Response.json({ data: { JobOfferMatchingsWithPagination: { data: [
        cg({ id: 5, hp_total_jobs: 4 }), cg({ id: 9, hp_total_jobs: 11 }), cg({ id: 2, hp_total_jobs: 2 }),
      ] } } }));
    },
  });
  assert(r, "Ergebnis fehlt");
  assertEquals(r.sichtbarGesamt, 3);
  assertEquals(r.fuenf.map((x) => x.caregiverId), [9, 5, 2]);
  assertEquals(rufe, ["onboard", "listMatchings"], "kein getCaregiver je Zeile");
});

Deno.test("holeFuenf: kein Token / keine Matches → null (Rückfall auf alten Text)", async () => {
  assertEquals(await holeFuenf({ supabaseUrl: "https://s", key: "k", token: "", jobOfferId: 1, formularDaten: {},
    fetchFn: () => { throw new Error("nicht rufen"); } }), null);
  assertEquals(await holeFuenf({ supabaseUrl: "https://s", key: "k", token: "t", jobOfferId: 1, formularDaten: {},
    fetchFn: (url) => String(url).includes("onboard")
      ? Promise.resolve(Response.json({ session_token: "jwt" }))
      : Promise.resolve(Response.json({ data: { JobOfferMatchingsWithPagination: { data: [] } } })) }), null);
});

Deno.test("fuenfListeHtml: eine Zeile je Kraft, Foto per CID oder Initialen, keine Ø-Dauer", () => {
  const fuenf = [e({ caregiverId: 1, anzeigeName: "Anna K.", vorname: "Anna" }), e({ caregiverId: 2, anzeigeName: "Beata M.", vorname: "Beata", alter: null })];
  const html = fuenfListeHtml(fuenf, ["cid-1", null], ["https://p/1", "https://p/2"], "https://p/alle");
  assertStringIncludes(html, 'src="cid:cid-1"');
  assertStringIncludes(html, ">B<");                     // Initialen-Kachel für die zweite
  assertStringIncludes(html, "Anna K.");
  assertStringIncludes(html, "Beata M.");
  assertStringIncludes(html, "2 Kräfte verfügbar");
  assertStringIncludes(html, 'href="https://p/1"');
  assertStringIncludes(html, "Alle 2 Profile im Portal ansehen");
  assert(!html.includes("Ø"), "keine Durchschnittsdauer");
  assert(!html.includes("https://s3/"), "nie die rohe S3-URL");
});

Deno.test("fuenfListeHtml/Text: leer bei null Kräften", () => {
  assertEquals(fuenfListeHtml([], [], [], "x"), "");
  assertEquals(fuenfListeText([], [], "x"), "");
});

Deno.test("fuenfListeText: nummeriert, mit Profil-Link je Kraft", () => {
  const t = fuenfListeText([e(), e({ caregiverId: 2, anzeigeName: "Beata M." })], ["https://p/1", "https://p/2"], "https://p/alle");
  assertStringIncludes(t, "1. Anna K., 51 J. · Bewährt · 5 Jahre Erfahrung");
  assertStringIncludes(t, "2. Beata M.");
  assertStringIncludes(t, "Profil: https://p/2");
});

Deno.test("fotoBudget: je Foto und in Summe, obere zuerst", () => {
  assertEquals(fotoBudget([50_000, 200_000, 100_000, 100_000, 100_000]), [true, false, true, true, true]);
  assertEquals(fotoBudget([110_000, 110_000, 110_000, 110_000, 110_000]), [true, true, true, false, false]);
  assertEquals(fotoBudget([null, 0, 30_000]), [false, false, true]);
});

Deno.test("zahlwort: eins bis fünf als Wort, darüber Ziffer", () => {
  assertEquals(zahlwort(5), "fünf"); assertEquals(zahlwort(5, true), "Fünf");
  assertEquals(zahlwort(1), "eine"); assertEquals(zahlwort(7), "7");
});
