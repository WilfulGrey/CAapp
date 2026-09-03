/* Fünf-Liste in der Nudge-Mail (+4 h) — Martin, 03.09.2026: "alle 5
 * Pflegekräfte zeigen und Fokus darauf setzen, ob der Kunde sich schon alle
 * angeschaut hat". Der Unterbau ist derselbe wie bei der Empfehlung der
 * Angebotsmail (holeMatchings) — hier nur ohne getCaregiver je Zeile. */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  holeFuenf, fuenfListeHtml, fuenfListeText, fotoBudget, zahlwort,
  HAKEN_VERFUEGBAR, type Empfehlung,
  kundenFakten,
  kraefteWort,
  fuenfBetreff,
  fotoImg,
  fotoErsatz,
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
  // Echte Avatar-Groessen (gemessen 03.09.2026): 45-180 KB als PNG. Alle
  // fuenf muessen passen — die erste Fassung liess nur 120 KB je Bild zu,
  // und der Kunde sah fuenf Initialen-Kacheln statt Gesichtern.
  assertEquals(fotoBudget([150_000, 116_000, 177_000, 164_000, 45_000]), [true, true, true, true, true]);
  assertEquals(fotoBudget([400_000, 50_000]), [false, true], "ein Ausreisser faellt heraus");
  assertEquals(fotoBudget([290_000, 290_000, 290_000, 290_000, 290_000]), [true, true, true, true, false], "Summe begrenzt");
  assertEquals(fotoBudget([null, 0, 30_000]), [false, false, true]);
});

Deno.test("zahlwort: eins bis fünf als Wort, darüber Ziffer", () => {
  assertEquals(zahlwort(5), "fünf"); assertEquals(zahlwort(5, true), "Fünf");
  assertEquals(zahlwort(1), "eine"); assertEquals(zahlwort(7), "7");
});

// Der Kunde las „1 Jahr Erfahrung &middot; 3 Primundus-Einsätze" (Martin,
// 03.09.2026): kundenFakten lieferte die HTML-Entität, und esc() machte aus
// dem „&" ein „&amp;". Seitdem steht dort das echte Zeichen — in HTML UND in
// der Nur-Text-Fassung.
Deno.test("Fakten tragen das echte Mittelpunkt-Zeichen, nie eine HTML-Entitaet", () => {
  const f = kundenFakten({ id: 1, care_experience: "4", hp_total_jobs: 9 } as never);
  assertEquals(f, "4 Jahre Erfahrung · 9 Primundus-Einsätze");
  const html = fuenfListeHtml([e({ fakten: f })], [null], ["https://p/1"], "https://p/alle");
  assert(!html.includes("&middot;"), "Entität im HTML");
  assert(!html.includes("&amp;"), "doppelt escaped");
  assertStringIncludes(html, "4 Jahre Erfahrung · 9 Primundus-Einsätze");
  assert(!fuenfListeText([e({ fakten: f })], ["https://p/1"], "x").includes("&middot;"), "Entität im Text");
});

// Reihenfolge wie die Portal-Karte: Name, darunter Deutsch, dann die Fakten.
Deno.test("Zeile: Deutsch steht VOR den Fakten, Trennlinie über alle Spalten", () => {
  const html = fuenfListeHtml([e(), e({ caregiverId: 2, anzeigeName: "Beata M." })],
    [null, null], ["https://p/1", "https://p/2"], "https://p/alle");
  assert(html.indexOf("Deutsch Mittel") < html.indexOf("5 Jahre Erfahrung"), "Deutsch muss über den Fakten stehen");
  assertStringIncludes(html, 'colspan="3" style="font-size:0;line-height:0;height:1px;background:#EFE9E0;"');
  // Profil-Hinweis je Zeile, mit der Hover-Klasse des Wrappers.
  assertEquals((html.match(/class="profil-link"/g) ?? []).length, 4, "je Zeile Name + Hinweis");
  assertStringIncludes(html, "Profil&nbsp;&rsaquo;");
});

// Bei nur einer Kraft stand „Eine Pflegekraefte zur Auswahl" und „eine
// Pflegekraefte haben wir vorbereitet" (aufgefallen 03.09.2026 in der
// Vorschau). Zahl und Wort gehoeren zusammen.
Deno.test("Singular: eine Pflegekraft, nicht eine Pflegekraefte", () => {
  assertEquals(kraefteWort(1), "eine Pflegekraft");
  assertEquals(kraefteWort(1, true), "Eine Pflegekraft");
  assertEquals(kraefteWort(5), "fünf Pflegekräfte");
  assertEquals(fuenfBetreff(1), "Eine Pflegekraft zur Auswahl – soll sie es sein?");
  assertEquals(fuenfBetreff(5), "Fünf Pflegekräfte zur Auswahl – wer soll es sein?");
});

// Reihenfolge der Sprachzeile wie im SA-Portal, Verfuegbarkeit daneben
// (Martin, 03.09.2026): „Deutsch ●●● Gut  ✓ Ab sofort verfuegbar",
// darunter erst Erfahrung und Einsaetze.
Deno.test("Sprachzeile: Label vor den Punkten, Wert dahinter, Verfuegbarkeit daneben", () => {
  const html = fuenfListeHtml([e()], [null], ["https://p/1"], "https://p/alle");
  const iLabel = html.indexOf(">Deutsch<");
  const iBalken = html.indexOf("border-radius:3px;background:#8B7355");
  const iWert = html.indexOf(">Mittel<");
  const iTermin = html.indexOf(HAKEN_VERFUEGBAR);
  const iFakten = html.indexOf("5 Jahre Erfahrung");
  assert(iLabel > -1 && iBalken > iLabel, "Label muss VOR den Punkten stehen");
  assert(iWert > iBalken, "Wert muss NACH den Punkten stehen");
  assert(iTermin > iWert && iTermin < iFakten, "Verfuegbarkeit gehoert in die Sprachzeile, vor die Fakten");
});

// Outlook Desktop kennt kein object-fit: ein Hochformat wuerde dort auf ein
// Quadrat gequetscht — und die Haelfte der Avatare IST Hochformat (gemessen
// 03.09.2026). Deshalb bekommt Outlook das Bild proportional, alle anderen
// den quadratischen Beschnitt. Eine Funktion fuer Empfehlungs-Karte UND Liste.
Deno.test("fotoImg: Outlook proportional, alle anderen quadratisch beschnitten", () => {
  const h = fotoImg("cid-1", "Anna K.", 56, 12);
  const mso = h.slice(h.indexOf("[if mso]"), h.indexOf("<![endif]"));
  assertStringIncludes(mso, 'width="56"');
  assert(!mso.includes('height="56"'), "Outlook darf KEINE feste Hoehe bekommen");
  assert(!mso.includes("object-fit"), "Outlook kennt object-fit nicht");
  const rest = h.slice(h.indexOf("[if !mso]"));
  assertStringIncludes(rest, 'height="56"');
  assertStringIncludes(rest, "object-fit:cover");
  assertStringIncludes(rest, "border-radius:12px");
  assertStringIncludes(rest, "-ms-interpolation-mode:bicubic");
  // Nie die rohe S3-URL — sie ist nach ~30 Min tot.
  assert(!h.includes("http"), "kein externer Bildpfad");
  assertEquals((h.match(/cid:cid-1/g) ?? []).length, 2, "beide Fassungen zeigen dasselbe Bild");
});

Deno.test("fotoImg: Liste und Empfehlungs-Karte benutzen dieselbe Funktion", () => {
  const liste = fuenfListeHtml([e()], ["cid-1"], ["https://p/1"], "https://p/alle");
  assertStringIncludes(liste, fotoImg("cid-1", "Anna K.", 56, 12));
  assertStringIncludes(fuenfListeHtml([e()], [null], ["https://p/1"], "x"), fotoErsatz("Anna", 56, 12, 22));
});
