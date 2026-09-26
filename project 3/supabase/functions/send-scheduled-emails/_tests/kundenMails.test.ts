// Rauchtests der neuen Kundenmails (Vorschau v2, Martin 26.09.2026) — jede Mail: Anrede,
// richtiger Knopf und Link, keine Platzhalter, Textfassung vorhanden, klein genug für Gmail.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  angebotMail,
  eingangsLabel,
  erinnerungMail,
  heimVergleich,
  type Kontext,
  type KundenMail,
  nachfass2Mail,
  nachfass3Mail,
  neuePflegekraefteMail,
  nudge1Betreff,
  nudge1Mail,
  nudge1Vorschau,
  nudge2Mail,
  portalLink,
  reservierungBeendetMail,
  sucheStandMail,
  vierDingeMail,
} from "../kundenMails.ts";
import { RUECKMELDUNG_KNOEPFE } from "../kette.ts";
import type { Empfehlung } from "../empfehlung.ts";

const PORTAL = "https://kundenportal.primundus.de";
const SITE = "https://kostenrechner.primundus.de";
const k = (token: string | null = "tok123"): Kontext => ({
  anrede: "Guten Tag Frau Müller",
  site: SITE,
  portal: (p) => portalLink(PORTAL, token, SITE, p),
  token,
  marta: "<p>Mit freundlichen Grüßen<br>Marta Kapcio</p>",
});
const kalk = {
  bruttopreis: 3050, eigenanteil: 1621.75,
  formularDaten: { betreuung_fuer: "ehepaar", pflegegrad: 4, mobilitaet: "rollstuhl", nachteinsaetze: "taeglich", deutschkenntnisse: "sehr-gut", geschlecht: "weiblich" },
};
const empf: Empfehlung = {
  caregiverId: 7, vorname: "Maria", anzeigeName: "Maria K.", fakten: "6 Jahre Erfahrung", alter: 62, deutschWort: "Gut",
  erfahrungJahre: 6, einsaetze: 14, stufe: "Elite", stufeZusatz: "", fotoUrl: null,
  gruende: ["Erfahrung mit Demenz", "Ab sofort verfügbar"], deutschBalken: 3, erfahrungKurz: "6 J. Erfahrung", vorstellung: "",
};
const sichtbar = (html: string) => html.replace(/<div style="display:none[^>]*>[^<]*<\/div>/, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

function pruefe(name: string, m: KundenMail, knopf: string, link: string) {
  assertStringIncludes(m.html, "Guten Tag Frau Müller,", `${name}: Anrede`);
  assertStringIncludes(m.text, "Guten Tag Frau Müller,", `${name}: Anrede Text`);
  assertStringIncludes(m.html, `>${knopf}</a>`, `${name}: Knopf`);
  assertStringIncludes(m.html, link, `${name}: Link`);
  assertStringIncludes(m.text, link, `${name}: Link im Text`);
  for (const f of [m.html, m.text, m.betreff, m.vorschau]) {
    assert(!/undefined|NaN|\[object Object\]/.test(f), `${name}: Platzhalter`);
  }
  const s = sichtbar(m.html);
  for (const wort of ["Kostenrechner", "Betreuungskräfte", "4–7", "in Ruhe", "vorbereitet", "Hallo ", "—", "vervollständigen", "Bewerbungen anfragen"]) {
    assert(!s.includes(wort) && !m.text.includes(wort), `${name}: enthält „${wort}"`);
  }
  assert(m.html.length < 60_000, `${name}: ${m.html.length} Zeichen`);
  assert(m.vorschau.length > 20 && m.vorschau.length < 120, `${name}: Vorschautext`);
  assertStringIncludes(m.html, m.vorschau.replace(/'/g, "&#39;").slice(0, 20));
}

Deno.test("Portal-Link: Token + Parameter, leere fallen weg, ohne Token die Website", () => {
  assertEquals(portalLink(PORTAL + "/", "a b", SITE, { goto: "anfragen", m: "eb", job: null }), `${PORTAL}/?token=a%20b&goto=anfragen&m=eb`);
  assertEquals(portalLink(PORTAL, null, SITE, { goto: "anfragen" }), SITE);
});

Deno.test("01 Angebot: Preis, Punkte, Frage, Empfehlung, Schritte, Angaben", () => {
  const m = angebotMail(k(), {
    kalkulation: kalk, careStartTiming: "sofort", herkunft: null, portalBetreff: "X", angabenHinweis: null,
    resubmit: false, empfehlung: { e: empf, cid: "c1@primundus.de", sichtbar: 5 },
  });
  pruefe("01", m, "Ja, Bewerbungen erhalten", `${PORTAL}/?token=tok123&goto=anfragen&m=eb`);
  const s = sichtbar(m.html);
  for (const t of ["3.050 €", "Keine Vermittlungsgebühr", "Kein Vertrag vor Ihrer Auswahl", "Täglich kündbar, taggenau abgerechnet",
    "Bestpreisgarantie", "Passt Ihnen das Angebot?", "5 passende Pflegekräfte", "Fünf Pflegekräfte passen", "Maria K.", "Erfahrung mit Demenz",
    "Alle 5 Pflegekräfte ansehen", "So geht es weiter", "Anreise schon ab 3 Tagen", "72 Stunden", "1.742 € weniger", "Gewünschter Start Sofort"]) {
    assertStringIncludes(s, t, t);
  }
  assertStringIncludes(m.html, "cid:c1@primundus.de");
  assertStringIncludes(m.html, `${PORTAL}/?token=tok123&cg=7&m=eb`);
  assertEquals(m.betreff, "Ihr Angebot zur 24-Stunden-Betreuung – Primundus");
  assertEquals(m.vorschau, "3.050 € im Monat, fünf passende Pflegekräfte. Passt Ihnen das Angebot?");
});

Deno.test("01 Angebot: ohne Empfehlung, Resubmit, eingekaufter Lead", () => {
  const ohne = angebotMail(k(), { kalkulation: kalk, careStartTiming: null, herkunft: null, portalBetreff: "X", angabenHinweis: null, resubmit: true, empfehlung: null });
  assert(!sichtbar(ohne.html).includes("passende Pflegekräfte passen"));
  assert(!sichtbar(ohne.html).includes("Für Sie ausgewählt"));
  assertStringIncludes(ohne.betreff, "aktualisiertes Angebot");
  const portal = angebotMail(k(), {
    kalkulation: kalk, careStartTiming: null, herkunft: "Pflegehilfe", portalBetreff: "Portal-Betreff", resubmit: true, empfehlung: null,
    angabenHinweis: { html: "<p>Diese Angaben haben wir übernommen.</p>", text: "Diese Angaben haben wir übernommen." },
  });
  assertEquals(portal.betreff, "Portal-Betreff");
  assertStringIncludes(sichtbar(portal.html), "über Pflegehilfe");
  assertStringIncludes(portal.text, "Diese Angaben haben wir übernommen.");
  // ohne Kalkulation: kein Preis, keine Heim-Zeile, trotzdem die Punkte
  const leer = angebotMail(k(), { kalkulation: null, careStartTiming: null, herkunft: null, portalBetreff: "X", angabenHinweis: null, resubmit: false, empfehlung: null });
  assert(!/€ im Monat|weniger/.test(sichtbar(leer.html)));
  assertStringIncludes(sichtbar(leer.html), "Keine Vermittlungsgebühr");
});

Deno.test("Heim-Vergleich nur mit echter Kalkulation unter dem Heim-Schnitt", () => {
  assertEquals(heimVergleich({ eigenanteil: 1621.75 }), { eigen: 1622, diff: 1742 });
  assertEquals(heimVergleich({ eigenanteil: 3500 }), null);
  assertEquals(heimVergleich(null), null);
  assertEquals(eingangsLabel("care_start_timing", "sofort"), "Sofort");
});

Deno.test("02 Nudge 1: Betreff und Vorschau nach Anzahl", () => {
  assertEquals(nudge1Betreff(5), "Fünf passende Pflegekräfte – es fehlen nur 2 Minuten");
  assertEquals(nudge1Betreff(1), "Eine passende Pflegekraft – es fehlen nur 2 Minuten");
  assertEquals(nudge1Vorschau(["Maria", "Ewa", "Jolanta", "Beata", "Irena"]), "Maria, Ewa und drei weitere könnten sich bei Ihnen bewerben.");
  assertEquals(nudge1Vorschau(["Maria", "Ewa", "Jolanta"]), "Maria, Ewa und eine weitere könnten sich bei Ihnen bewerben.");
  assertEquals(nudge1Vorschau(["Maria"]), "Maria könnte sich bei Ihnen bewerben.");
  const mit = nudge1Mail(k(), { html: "<table>LISTE</table>", text: "LISTE", vornamen: ["Maria", "Ewa"] });
  pruefe("02", mit, "Bewerbungen erhalten", `${PORTAL}/?token=tok123&goto=anfragen&m=pn1`);
  assertStringIncludes(mit.html, "LISTE");
  assertStringIncludes(sichtbar(mit.html), "diese zwei Pflegekräfte passen");
  const ohne = nudge1Mail(k(), null);
  pruefe("02 ohne Liste", ohne, "Bewerbungen erhalten", "goto=anfragen&m=pn1");
});

Deno.test("03–06, 08, 09: Knopf und Ziel", () => {
  pruefe("03", nudge2Mail(k()), "Bewerbungen erhalten", "goto=anfragen&m=pn2");
  const vier = vierDingeMail(k(), kalk);
  pruefe("04", vier, "Bewerbungen erhalten", "goto=anfragen&m=wp");
  for (const t of ["Bei uns ist alles transparent.", "Sie binden sich nicht.", "Sie zahlen nie zu viel.", "Sie sind nie allein.", "60.000", "20 Jahre"]) {
    assertStringIncludes(sichtbar(vier.html), t);
  }
  pruefe("05", nachfass2Mail(k()), "Bewerbungen erhalten", "goto=anfragen&m=nf2");
  const n3 = nachfass3Mail(k(), "Müller, Anna");
  pruefe("06", n3, RUECKMELDUNG_KNOEPFE.interesse, `${SITE}/rueckmeldung?token=tok123&knopf=interesse`);
  assertStringIncludes(n3.html, `>${RUECKMELDUNG_KNOEPFE["nicht-relevant"]}</a>`);
  // ohne Token: Antwort per Mail an info@, nie ein toter Link
  assertStringIncludes(nachfass3Mail(k(null), "Müller, Anna").html, "mailto:info@primundus.de?subject=");
  pruefe("08", sucheStandMail(k()), "Pflegekräfte einladen", "goto=matches&m=st2");
  pruefe("09", neuePflegekraefteMail(k()), "Neue Pflegekräfte ansehen", "goto=matches&m=npk");
});

Deno.test("12–14 Erinnerungen: Countdown, Karte, Knopf öffnet die Bewerbung", () => {
  const pk = { name: "Maria K.", alter: 62, deutsch: "Gut", jahre: 6, einsaetze: 14, foto: null };
  const angebot = { tagessatz: 102, zeitraum: "15.10.2026 – 10.12.2026", reisekosten: 125 };
  const url = `${PORTAL}/?token=tok123&job=u1&view=application&m=er1`;
  const H = 60 * 60 * 1000;
  const e1 = erinnerungMail(k(), { stufe: "1", pk, angebot, url, restMs: 52 * H });
  pruefe("12", e1, "Angebot prüfen", url);
  assertEquals(e1.betreff, "Marias Bewerbung: noch 2 Tage für Sie reserviert");
  assertStringIncludes(sichtbar(e1.html), "Noch 2 Tage für Sie reserviert");
  assertStringIncludes(sichtbar(e1.html), "102 € / Tag");
  const e2 = erinnerungMail(k(), { stufe: "2", pk, angebot, url, restMs: 24 * H });
  assertEquals(e2.betreff, "Noch 24 Stunden: Marias Bewerbung");
  const e3 = erinnerungMail(k(), { stufe: "letzte", pk, angebot, url, restMs: 8 * H });
  assertEquals(e3.betreff, "Nur noch 8 Stunden reserviert: Marias Bewerbung");
  assertStringIncludes(sichtbar(e3.html), "Danach endet die Reservierung automatisch.");
  // Ende unbekannt: kein erfundener Countdown
  const ohne = erinnerungMail(k(), { stufe: "2", pk, angebot: { tagessatz: null, zeitraum: null, reisekosten: null }, url, restMs: null });
  assertEquals(ohne.betreff, "Marias Bewerbung wartet auf Ihre Antwort");
  assert(!/reserviert|Stunden|Tage/.test(sichtbar(ohne.html).replace("Reservierung", "")));
});

Deno.test("16 Reservierung beendet: eine oder mehrere Pflegekräfte", () => {
  const eine = reservierungBeendetMail(k(), ["Maria"]);
  pruefe("16", eine, "Stand Ihrer Suche ansehen", "goto=anfragen&m=rb");
  assertEquals(eine.betreff, "Marias Reservierung ist abgelaufen – Ihre Suche läuft weiter");
  assertStringIncludes(sichtbar(eine.html), "Passte Maria nicht?");
  const zwei = reservierungBeendetMail(k(), ["Maria", "Ewa"]);
  assertStringIncludes(sichtbar(zwei.html), "Bewerbungen von Maria und Ewa sind abgelaufen");
  const niemand = reservierungBeendetMail(k(), []);
  assertEquals(niemand.betreff, "Reservierung abgelaufen – Ihre Suche läuft weiter");
});
