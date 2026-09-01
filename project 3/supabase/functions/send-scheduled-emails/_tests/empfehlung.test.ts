import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  baueEmpfehlung,
  empfehlungHtml,
  empfehlungText,
  holeEmpfehlung,
  anforderungenAusAnfrage,
  anzeigeName,
  haken,
  HAKEN_WUNSCHPROFIL,
  KORALLE,
  kundenFakten,
  passtZumTermin,
  textAusblenden,
  vorstellungstext,
  stufenWort,
  waehleFuenf,
  type CaregiverExtra,
  type Matching,
} from "../empfehlung.ts";

const JETZT = new Date("2026-09-01T10:00:00Z");

function cg(over: Partial<Matching["caregiver"]> & { id: number }): Matching {
  return {
    caregiver: {
      first_name: "Maria",
      gender: "female",
      year_of_birth: 1972,
      germany_skill: "level_2",
      care_experience: "7",
      available_from: "2026-09-14T00:00:00Z",
      last_contact_at: "2026-08-30T00:00:00Z",
      hp_total_jobs: 3,
      avatar: { aws_url: "https://s3/foto.jpg" },
      ...over,
    },
  };
}

// ── Auswahl der fünf ──────────────────────────────────────────────────────

Deno.test("waehleFuenf: nie mehr als fünf — das Portal zeigt genau fünf", () => {
  const viele = Array.from({ length: 12 }, (_, i) => cg({ id: i + 1 }));
  assertEquals(waehleFuenf(viele, "kommunikativ", JETZT).length, 5);
});

Deno.test("waehleFuenf: Sprachwunsch filtert strikt auf die gewählte Stufe", () => {
  const liste = [
    cg({ id: 1, germany_skill: "level_2" }),
    cg({ id: 2, germany_skill: "level_4" }), // teurer als bezahlt → raus
    cg({ id: 3, germany_skill: "level_1" }), // schwächer → raus
  ];
  const ids = waehleFuenf(liste, "kommunikativ", JETZT).map((m) => m.caregiver.id);
  assertEquals(ids, [1]);
});

Deno.test("waehleFuenf: unbekannte Deutschstufe fliegt NICHT raus", () => {
  const liste = [cg({ id: 1, germany_skill: null })];
  assertEquals(waehleFuenf(liste, "kommunikativ", JETZT).length, 1);
});

Deno.test("waehleFuenf: is_show=false wird ausgeblendet", () => {
  const liste: Matching[] = [{ ...cg({ id: 1 }), is_show: false }, cg({ id: 2 })];
  assertEquals(waehleFuenf(liste, null, JETZT).map((m) => m.caregiver.id), [2]);
});

Deno.test("waehleFuenf: Duplikate derselben Pflegekraft nur einmal", () => {
  const liste = [cg({ id: 7 }), cg({ id: 7 }), cg({ id: 8 })];
  assertEquals(waehleFuenf(liste, null, JETZT).length, 2);
});

Deno.test("waehleFuenf: über 60 kommt rein, wenn sonst keine fünf da sind", () => {
  const liste = [cg({ id: 1, year_of_birth: 1950 }), cg({ id: 2 })];
  const ids = waehleFuenf(liste, null, JETZT).map((m) => m.caregiver.id);
  assertEquals(ids.length, 2);
  assert(ids.includes(1), "Rückfall greift nicht — Liste wäre zu kurz");
});

Deno.test("waehleFuenf: über 60 fliegt raus, sobald fünf jüngere da sind", () => {
  const liste = [
    cg({ id: 99, year_of_birth: 1950 }),
    ...Array.from({ length: 5 }, (_, i) => cg({ id: i + 1 })),
  ];
  const ids = waehleFuenf(liste, null, JETZT).map((m) => m.caregiver.id);
  assertEquals(ids.includes(99), false);
});

// Der Fall, der Mail und Portal auseinanderlaufen ließe.
Deno.test("waehleFuenf: Platz 1 ist die Kraft mit den meisten Einsätzen — wie im Portal", () => {
  const liste = [
    cg({ id: 1, hp_total_jobs: 13, avatar: { aws_url: "https://s3/a.jpg" } }),
    cg({ id: 2, hp_total_jobs: 20, avatar: null }), // ohne Foto, aber erfahrener
  ];
  // rangVergleich allein setzte #1 nach vorn (Foto schlägt Gleichstand in der
  // Stufe). Das Portal zieht danach die meisten Einsätze nach oben.
  assertEquals(waehleFuenf(liste, null, JETZT)[0].caregiver.id, 2);
});

Deno.test("waehleFuenf: leere Eingabe → leeres Ergebnis, kein Absturz", () => {
  assertEquals(waehleFuenf([], "kommunikativ", JETZT).length, 0);
});

// ── Die drei Haken ────────────────────────────────────────────────────────

Deno.test("haken: Punkt 1 steht immer, nie mehr als drei", () => {
  const l = haken(cg({ id: 1 }).caregiver, null, {}, JETZT);
  assertEquals(l[0], HAKEN_WUNSCHPROFIL);
  assert(l.length <= 3);
});

Deno.test("haken: greift die Anforderungen aus der Anfrage auf", () => {
  const l = haken(
    cg({ id: 1 }).caregiver, null,
    { mobilitaet: "rollstuhl", nachteinsaetze: "gelegentlich" },
    JETZT,
  );
  assertEquals(l, [
    HAKEN_WUNSCHPROFIL,
    "Erfahrung mit Rollstuhlpatienten",
    "Erfahrung mit nächtlichen Einsätzen",
  ]);
});

Deno.test("haken: höchstens zwei Punkte aus der Anfrage, dann ist Schluss", () => {
  const l = haken(
    cg({ id: 1 }).caregiver, null,
    { mobilitaet: "bettlaegerig", nachteinsaetze: "taeglich", betreuung_fuer: "ehepaar", pflegegrad: 5 },
    JETZT,
  );
  assertEquals(l.length, 3);
  assertEquals(l.includes("Erfahrung in der Betreuung von Ehepaaren"), false);
});

Deno.test("haken: ohne besondere Anforderungen füllen die Standards auf", () => {
  const l = haken(
    cg({ id: 1, germany_skill: "level_2" }).caregiver,
    { driving_license: "yes" },
    { deutschkenntnisse: "kommunikativ", fuehrerschein: "ja", care_start_timing: "2-4-wochen" },
    JETZT,
  );
  // Reihenfolge der Standards: Termin → Deutsch → Führerschein
  assertEquals(l, [
    HAKEN_WUNSCHPROFIL,
    "Zum gewünschten Termin verfügbar",
    "Deutschkenntnisse wie gewünscht",
  ]);
});

Deno.test("haken: Führerschein nur, wenn der Kunde ihn wollte UND die Kraft einen hat", () => {
  const ohneWunsch = haken(
    cg({ id: 1 }).caregiver, { driving_license: "yes" }, { fuehrerschein: "nein" }, JETZT,
  );
  assertEquals(ohneWunsch.includes("Führerschein vorhanden"), false);

  const ohneNachweis = haken(
    cg({ id: 1, germany_skill: null, available_from: null }).caregiver,
    { driving_license: null },
    { fuehrerschein: "ja" },
    JETZT,
  );
  assertEquals(ohneNachweis.includes("Führerschein vorhanden"), false);
});

Deno.test("haken: kein Deutsch-Punkt, wenn die Stufe unbekannt ist", () => {
  const l = haken(
    cg({ id: 1, germany_skill: null, available_from: null }).caregiver,
    null, { deutschkenntnisse: "kommunikativ" }, JETZT,
  );
  assertEquals(l.includes("Deutschkenntnisse wie gewünscht"), false);
});

Deno.test("haken: ohne jeden Beleg bleibt nur der erste Punkt stehen", () => {
  const l = haken(cg({ id: 1, germany_skill: null, available_from: null }).caregiver, null, {}, JETZT);
  assertEquals(l, [HAKEN_WUNSCHPROFIL]);
});

Deno.test("anforderungenAusAnfrage: bettlägerig schlägt Rollstuhl, Rollator kommt zuletzt", () => {
  assertEquals(anforderungenAusAnfrage({ mobilitaet: "bettlaegerig" })[0], "Erfahrung mit bettlägerigen Patienten");
  assertEquals(anforderungenAusAnfrage({ mobilitaet: "rollstuhl" })[0], "Erfahrung mit Rollstuhlpatienten");
  const beides = anforderungenAusAnfrage({ mobilitaet: "rollator", nachteinsaetze: "mehrmals" });
  assertEquals(beides[0], "Erfahrung mit nächtlichen Einsätzen");
});

Deno.test("anforderungenAusAnfrage: 'nein' bei Nachteinsätzen ist keine Anforderung", () => {
  assertEquals(anforderungenAusAnfrage({ nachteinsaetze: "nein" }), []);
});

Deno.test("passtZumTermin: nur innerhalb des Wunschfensters", () => {
  // 2-4-wochen = 21 Tage ab dem 01.09.
  assertEquals(passtZumTermin("2026-09-14T00:00:00Z", "2-4-wochen", JETZT), true);
  assertEquals(passtZumTermin("2026-11-01T00:00:00Z", "2-4-wochen", JETZT), false);
  // Ohne Datum gilt die Kraft im Portal als sofort verfügbar.
  assertEquals(passtZumTermin(null, "sofort", JETZT), true);
  // Unbekannter Wunsch → kein Versprechen.
  assertEquals(passtZumTermin("2026-09-02T00:00:00Z", null, JETZT), false);
});

// ── Anzeige ───────────────────────────────────────────────────────────────

Deno.test("stufenWort trifft die Schwellen des Portals", () => {
  assertEquals(stufenWort(12), "Elite");
  assertEquals(stufenWort(6), "Stammkraft");
  assertEquals(stufenWort(2), "Bewährt");
  assertEquals(stufenWort(1), "Bekannt");
  assertEquals(stufenWort(0, 4), "Berufserfahren");
  assertEquals(stufenWort(0, 0), "Neu dabei");
});

Deno.test("empfehlungHtml: Foto per CID, nie die ablaufende S3-URL", () => {
  const { empfehlung } = baueEmpfehlung(cg({ id: 42 }), null, {}, 4, JETZT);
  const html = empfehlungHtml(empfehlung, "foto@primundus.de", "https://p/?token=t&cg=42", "https://p/?token=t", 4);
  assertStringIncludes(html, 'src="cid:foto@primundus.de"');
  assertEquals(html.includes("s3/foto.jpg"), false);
});

Deno.test("empfehlungHtml: ohne Foto Initialen statt kaputtem Bild", () => {
  const { empfehlung } = baueEmpfehlung(cg({ id: 42 }), null, {}, 4, JETZT);
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://p", 4);
  assertEquals(html.includes("<img"), false);
  assertStringIncludes(html, ">M</div>");
});

Deno.test("empfehlungHtml: Zähler oben und im Sekundärlink, beide dynamisch", () => {
  const { empfehlung } = baueEmpfehlung(cg({ id: 42 }), null, {}, 5, JETZT);
  const fuenf = empfehlungHtml(empfehlung, null, "https://p", "https://a", 5);
  assertStringIncludes(fuenf, "Fünf passende Betreuungskräfte für Sie");
  assertStringIncludes(fuenf, "Alle 5 Betreuungskräfte ansehen");
  // Der lange Erklärabsatz ist ersatzlos raus.
  assertEquals(fuenf.includes("ist eine von"), false);
  assertEquals(fuenf.includes("Weitere"), false);

  // Genau eine Kraft: Einzahl oben, kein Sekundärlink.
  const eine = empfehlungHtml(empfehlung, null, "https://p", "https://a", 1);
  assertStringIncludes(eine, "Eine passende Betreuungskraft für Sie");
  assertEquals(eine.includes("Alle 1"), false);
});

Deno.test("empfehlungHtml: keine Überschrift über den Haken", () => {
  const { empfehlung } = baueEmpfehlung(
    cg({ id: 42 }), null, { mobilitaet: "rollstuhl" }, 5, JETZT,
  );
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 5);
  assertStringIncludes(html, HAKEN_WUNSCHPROFIL);
  assertEquals(/Warum .* zu Ihren Angaben passt|Passt besonders gut/.test(html), false);
});

Deno.test("empfehlungHtml: keine interne Kennzahl in der Darstellung", () => {
  const { empfehlung } = baueEmpfehlung(
    cg({ id: 42, hp_total_jobs: 9, hp_avg_mission_days: 84 }), null, {}, 5, JETZT,
  );
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 5);
  assertEquals(html.includes("Ø"), false);
  assertEquals(html.includes("pro Einsatz"), false);
});

Deno.test("empfehlungHtml: zeigt die Bausteine der Profil-Detailseite", () => {
  const { empfehlung } = baueEmpfehlung(
    cg({ id: 42, first_name: "Maria", last_name: "Kowalska", hp_total_jobs: 9 }),
    { about_de: "Maria betreut seit sieben Jahren ältere Menschen zu Hause und legt besonderen Wert auf einen ruhigen, verlässlichen Tagesablauf." },
    {}, 5, JETZT,
  );
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 5);
  assertStringIncludes(html, "Erfahrung");
  assertStringIncludes(html, "Deutschkenntnisse");
  assertStringIncludes(html, "7 J. Erfahrung");
  assertStringIncludes(html, "Über Maria");
  assertStringIncludes(html, "Stammkraft");
});

Deno.test("empfehlungHtml: CTA in Korallrot wie Website und Portal", () => {
  const { empfehlung } = baueEmpfehlung(cg({ id: 42 }), null, {}, 5, JETZT);
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 5);
  assertEquals(KORALLE, "#E76F63");
  assertStringIncludes(html, 'bgcolor="#E76F63"');
  // Kein gruener Knopf mehr — gruen bleibt fuer Haken und Verfuegbarkeit.
  assertEquals(html.includes("#2A9D5C"), false);
});

Deno.test("empfehlungHtml: langer Text laeuft aus statt hart abzubrechen", () => {
  const lang = "Maria ".repeat(90);
  const { empfehlung } = baueEmpfehlung(cg({ id: 42 }), { about_de: lang }, {}, 5, JETZT);
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 5);
  assertStringIncludes(html, "#A9A9B0");
  assertStringIncludes(html, "…");
});

Deno.test("empfehlungHtml: Sprache und Schreibweise wie im Portal", () => {
  const { empfehlung } = baueEmpfehlung(
    cg({ id: 42, first_name: "Maria", last_name: "Kowalska", hp_total_jobs: 9 }), null, {}, 5, JETZT,
  );
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 5);
  assertStringIncludes(html, "Unsere Empfehlung");
  assertStringIncludes(html, "Maria K.");
  assertStringIncludes(html, "Mittel");
});

Deno.test("empfehlungHtml: Button trägt den Vornamen und zeigt aufs Profil", () => {
  const { empfehlung } = baueEmpfehlung(cg({ id: 42, first_name: "Grazyna" }), null, {}, 3, JETZT);
  const html = empfehlungHtml(empfehlung, null, "https://portal/?token=t&cg=42", "https://portal/?token=t", 3);
  assertStringIncludes(html, "Grazyna ansehen");
  assertStringIncludes(html, 'href="https://portal/?token=t&cg=42"');
});

Deno.test("empfehlungHtml: Initiale ja, ausgeschriebener Nachname nie", () => {
  const { empfehlung } = baueEmpfehlung(
    cg({ id: 42, first_name: "Maria", last_name: "Kowalska" }), null, {}, 3, JETZT,
  );
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 3);
  assertStringIncludes(html, "Maria K.");
  assertEquals(html.includes("Kowalska"), false);
});

Deno.test("kundenFakten: ohne Zahlen ein ehrlicher Satz statt eines Strichs", () => {
  assertEquals(
    kundenFakten({ id: 1, care_experience: null, hp_total_jobs: 0 }),
    "bereit für den ersten Einsatz",
  );
});

Deno.test("kundenFakten: Einzahl bleibt Einzahl", () => {
  assertEquals(
    kundenFakten({ id: 1, care_experience: "1", hp_total_jobs: 1 }),
    "1 Jahr Erfahrung &middot; 1 Primundus-Einsatz",
  );
});

Deno.test("anzeigeName: ohne Nachname bleibt der Vorname allein stehen", () => {
  assertEquals(anzeigeName("Maria", null), "Maria");
  assertEquals(anzeigeName("Maria", "Kowalska"), "Maria K.");
});

Deno.test("empfehlungText: trägt dieselben Aussagen wie das HTML", () => {
  const { empfehlung } = baueEmpfehlung(
    cg({ id: 42, hp_total_jobs: 7 }),
    { smoking: "no" } as CaregiverExtra,
    { deutschkenntnisse: "kommunikativ" },
    4,
    JETZT,
  );
  const txt = empfehlungText(empfehlung, "https://p", "https://a", 4);
  assertStringIncludes(txt, "VIER PASSENDE BETREUUNGSKRÄFTE FÜR SIE");
  assertStringIncludes(txt, "Maria, 54");
  assertStringIncludes(txt, "UNSERE EMPFEHLUNG");
  assertStringIncludes(txt, "Alle 4 Betreuungskräfte ansehen");
});

Deno.test("baueEmpfehlung: unplausibles Geburtsjahr → kein Alter statt Unsinn", () => {
  const { empfehlung } = baueEmpfehlung(cg({ id: 1, year_of_birth: 2020 }), null, {}, 2, JETZT);
  assertEquals(empfehlung.alter, null);
});

Deno.test("empfehlungHtml: keine Herkunftszeile — steht auch im Portal nicht", () => {
  const { empfehlung } = baueEmpfehlung(cg({ id: 1 }), null, {}, 3, JETZT);
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 3);
  assertEquals(/Polen|Polnisch|Nationalit/.test(html), false);
});

// ── Datenbeschaffung: jeder Ausfall endet in null, nie in einem Halbbild ──

Deno.test("holeEmpfehlung: ohne Token sofort null", async () => {
  const r = await holeEmpfehlung({
    supabaseUrl: "https://s", key: "k", token: "", jobOfferId: null, formularDaten: {},
    fetchFn: () => { throw new Error("darf nicht rufen"); },
  });
  assertEquals(r, null);
});

Deno.test("holeEmpfehlung: ohne job_offer und mit abgeschaltetem Onboarding → null, kein mamamia-Write", async () => {
  let gerufen = false;
  const r = await holeEmpfehlung({
    supabaseUrl: "https://s", key: "k", token: "t", jobOfferId: null, formularDaten: {},
    darfOnboarden: false,
    fetchFn: () => { gerufen = true; throw new Error("nicht erwartet"); },
  });
  assertEquals(r, null);
  assertEquals(gerufen, false, "Onboarding wurde trotz Schalter gerufen");
});

Deno.test("holeEmpfehlung: Onboarding-Fehler → null, Mail läuft weiter", async () => {
  const r = await holeEmpfehlung({
    supabaseUrl: "https://s", key: "k", token: "t", jobOfferId: 1, formularDaten: {},
    fetchFn: () => Promise.resolve(new Response("boom", { status: 500 })),
  });
  assertEquals(r, null);
});

Deno.test("holeEmpfehlung: keine Matches → null (Ersatztext statt leerem Kasten)", async () => {
  const r = await holeEmpfehlung({
    supabaseUrl: "https://s", key: "k", token: "t", jobOfferId: 1, formularDaten: {},
    fetchFn: (url) => {
      const u = String(url);
      if (u.includes("onboard")) {
        return Promise.resolve(Response.json({ session_token: "jwt", job_offer_id: 1 }));
      }
      return Promise.resolve(Response.json({ data: { JobOfferMatchingsWithPagination: { data: [] } } }));
    },
  });
  assertEquals(r, null);
});

Deno.test("holeEmpfehlung: Glücksfall — beste Kraft plus Gründe", async () => {
  const rufe: string[] = [];
  const r = await holeEmpfehlung({
    supabaseUrl: "https://s", key: "k", token: "t", jobOfferId: 1, now: JETZT,
    formularDaten: { deutschkenntnisse: "kommunikativ", geschlecht: "weiblich", fuehrerschein: "ja" },
    fetchFn: (url, init) => {
      const u = String(url);
      if (u.includes("onboard")) {
        rufe.push("onboard");
        return Promise.resolve(Response.json({ session_token: "jwt", job_offer_id: 1 }));
      }
      const body = JSON.parse(String((init as RequestInit).body));
      rufe.push(body.action);
      if (body.action === "listMatchings") {
        return Promise.resolve(Response.json({
          data: {
            JobOfferMatchingsWithPagination: {
              data: [cg({ id: 5, hp_total_jobs: 4 }), cg({ id: 9, hp_total_jobs: 11 })],
            },
          },
        }));
      }
      return Promise.resolve(Response.json({
        data: { Caregiver: { smoking: "no", driving_license: "yes" } },
      }));
    },
  });
  assert(r !== null);
  assertEquals(r!.empfehlung.caregiverId, 9, "nicht die erfahrenste Kraft empfohlen");
  assertEquals(r!.sichtbarGesamt, 2);
  assertEquals(r!.empfehlung.gruende.length, 3);
  assertEquals(rufe, ["onboard", "listMatchings", "getCaregiver"]);
});

Deno.test("holeEmpfehlung: getCaregiver-Ausfall kostet Gründe, nicht die Empfehlung", async () => {
  const r = await holeEmpfehlung({
    supabaseUrl: "https://s", key: "k", token: "t", jobOfferId: 1, now: JETZT,
    formularDaten: { deutschkenntnisse: "kommunikativ" },
    fetchFn: (url, init) => {
      const u = String(url);
      if (u.includes("onboard")) return Promise.resolve(Response.json({ session_token: "jwt" }));
      const body = JSON.parse(String((init as RequestInit).body));
      if (body.action === "listMatchings") {
        return Promise.resolve(Response.json({
          data: { JobOfferMatchingsWithPagination: { data: [cg({ id: 5 })] } },
        }));
      }
      return Promise.resolve(new Response("nope", { status: 500 }));
    },
  });
  assert(r !== null);
  assertEquals(r!.empfehlung.caregiverId, 5);
  assertStringIncludes(r!.empfehlung.gruende.join(" "), HAKEN_WUNSCHPROFIL);
});


// ── Vorstellungstext ──────────────────────────────────────────────────────

Deno.test("vorstellungstext: about_de hat Vorrang, dann motivation", () => {
  assertEquals(
    vorstellungstext(cg({ id: 1 }).caregiver, { about_de: "Echt.", motivation: "Zweitrangig." }, "Maria"),
    "Echt.",
  );
  assertEquals(
    vorstellungstext(cg({ id: 1 }).caregiver, { about_de: "  ", motivation: "Zweitrangig." }, "Maria"),
    "Zweitrangig.",
  );
});

Deno.test("vorstellungstext: ohne Text ein Satz aus echten Feldern, nichts Erfundenes", () => {
  const t = vorstellungstext(cg({ id: 1, hp_total_jobs: 9 }).caregiver, null, "Maria");
  assertStringIncludes(t, "7 Jahre Erfahrung");
  assertStringIncludes(t, "mittlerem Niveau");
  assertStringIncludes(t, "9 erfolgreich abgeschlossenen Einsätzen");
});

Deno.test("vorstellungstext: ohne jede Zahl bleibt er leer statt zu behaupten", () => {
  assertEquals(
    vorstellungstext({ id: 1, care_experience: null, germany_skill: null, hp_total_jobs: 0 }, null, "Maria"),
    "",
  );
});

Deno.test("textAusblenden: kurzer Text bleibt ganz, langer laeuft in zwei Stufen aus", () => {
  const kurz = textAusblenden("Ein kurzer Satz.");
  assertEquals(kurz.gekuerzt, false);
  assertEquals(kurz.blass, "");

  const lang = textAusblenden("Wort ".repeat(120));
  assertEquals(lang.gekuerzt, true);
  assert(lang.klar.length > 0 && lang.blass.length > 0);
  // An Wortgrenzen geschnitten — kein abgehacktes Wort am Ende.
  assertEquals(lang.klar.endsWith("Wort"), true);
});

Deno.test("empfehlungHtml: Verfügbarkeitszeile ist raus — sie stand doppelt", () => {
  const { empfehlung } = baueEmpfehlung(cg({ id: 42 }), null, {}, 5, JETZT);
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 5);
  assertEquals(/Verfügbar ab|Sofort verfügbar/.test(html), false);
  // Das Datum lebt weiter im Haken, wenn es zum Wunschtermin passt.
  const mitTermin = baueEmpfehlung(
    cg({ id: 42 }), null, { care_start_timing: "2-4-wochen" }, 5, JETZT,
  ).empfehlung;
  assert(mitTermin.gruende.includes("Zum gewünschten Termin verfügbar"));
});

Deno.test("empfehlungHtml: Überschrift und Zähler stehen IM Kasten, nicht darüber", () => {
  const { empfehlung } = baueEmpfehlung(cg({ id: 42 }), null, {}, 5, JETZT);
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 5);
  const kastenAuf = html.indexOf("border:2px solid #8B7355");
  const kopf = html.indexOf("Unsere Empfehlung");
  const satz = html.indexOf("passende Betreuungskräfte für Sie");
  assert(kastenAuf >= 0, "Kasten fehlt");
  assert(kopf > kastenAuf, "Überschrift steht noch ausserhalb des Kastens");
  // Der Satz mit der Zahl gehoert bewusst DAVOR.
  assert(satz < kastenAuf, "Überschrift steht nicht mehr ueber dem Kasten");
  // Die Zahl steht nur einmal — nicht noch einmal in der Kopfleiste.
  assertEquals((html.match(/verfügbar/g) ?? []).length, 0);
});

Deno.test("empfehlungHtml: keine Karte in der Karte", () => {
  const { empfehlung } = baueEmpfehlung(
    cg({ id: 42 }), { about_de: "Ein langer Vorstellungstext. ".repeat(12) }, {}, 5, JETZT,
  );
  const html = empfehlungHtml(empfehlung, null, "https://p", "https://a", 5);
  // Genau EIN gerahmter Aussenkasten; die zwei Kacheln zaehlen nicht als Karte.
  assertEquals((html.match(/border:2px solid #8B7355/g) ?? []).length, 1);
  // Der "Ueber"-Abschnitt steht auf Weiss, nicht in einem grauen Kasten.
  // (#F5F5F6 allein reicht als Probe nicht — die Stufen-Plakette nutzt
  // denselben Ton als Pillen-Hintergrund; gesucht ist der KASTEN.)
  assertEquals(/border-radius:16px;background:#F5F5F6/.test(html), false);
  assertEquals(html.includes("Über Maria"), true);
});

Deno.test("empfehlungHtml: Profil-Link am Namen zeigt auf dieselbe Seite wie der Knopf", () => {
  const { empfehlung } = baueEmpfehlung(cg({ id: 42 }), null, {}, 5, JETZT);
  const html = empfehlungHtml(empfehlung, null, "https://portal/?token=t&cg=42", "https://a", 5);
  assertStringIncludes(html, 'class="profil-link" href="https://portal/?token=t&cg=42"');
  assertStringIncludes(html, "Zum Profil");
  // Beide Wege fuehren zum selben Ziel — sonst landet der Kunde je nach
  // Klick woanders.
  const ziele = [...html.matchAll(/href="([^"]*cg=42[^"]*)"/g)].map((m) => m[1]);
  assertEquals(new Set(ziele).size, 1);
  assertEquals(ziele.length, 2);
});
