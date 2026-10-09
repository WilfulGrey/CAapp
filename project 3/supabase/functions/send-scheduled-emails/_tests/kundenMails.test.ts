// Rauchtests der neuen Kundenmails (Vorschau v2, Martin 26.09.2026) — jede Mail: Anrede,
// richtiger Knopf und Link, keine Platzhalter, Textfassung vorhanden, klein genug für Gmail.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  anreiseDatum,
  anreiseMail,
  anreiseZeit,
  angebotFragen,
  angebotMail,
  eigenanteilAus,
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

function pruefe(name: string, m: KundenMail, knopf: string, link: string, o: { gedankenstrich?: boolean } = {}) {
  assertStringIncludes(m.html, "Guten Tag Frau Müller,", `${name}: Anrede`);
  assertStringIncludes(m.text, "Guten Tag Frau Müller,", `${name}: Anrede Text`);
  assertStringIncludes(m.html, `>${knopf}</a>`, `${name}: Knopf`);
  assertStringIncludes(m.html, link, `${name}: Link`);
  assertStringIncludes(m.text, link, `${name}: Link im Text`);
  for (const f of [m.html, m.text, m.betreff, m.vorschau]) {
    assert(!/undefined|NaN|\[object Object\]/.test(f), `${name}: Platzhalter`);
  }
  const s = sichtbar(m.html);
  // „vervollständigen" ist seit dem Portal-Rückbau (02.10.2026) wieder Portal-Wortlaut („Pflegesituation vervollständigen").
  // Gedankenstrich nur dort erlaubt, wo Portal-Texte wörtlich stehen (Angebotsmail: Portal-FAQ, Martin 08.10.2026).
  const verboten = ["Kostenrechner", "Betreuungskräfte", "4–7", "in Ruhe", "vorbereitet", "Hallo ", "Bewerbungen anfragen", ...(o.gedankenstrich ? [] : ["—"])];
  for (const wort of verboten) {
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

/* Kalkulation mit Zuschuss-Posten wie aus lib/calculation.ts (Ehepaar, Pflegegrad 4): 3.050 − 800 − 295 − 333 = 1.622 €. */
const kalkPosten = {
  ...kalk,
  "zuschüsse": { items: [
    { name: "pflegegeld", label: "Pflegegeld", betrag_monatlich: 800, betrag_jaehrlich: 9600, in_kalkulation: true },
    { name: "entlastungsbudget_neu", label: "Entlastungsbudget", betrag_monatlich: 294.92, betrag_jaehrlich: 3539, in_kalkulation: true },
    { name: "steuervorteil", label: "Steuervorteil", betrag_monatlich: 333.33, betrag_jaehrlich: 4000, in_kalkulation: true },
  ] },
};

Deno.test("01 Angebot: Preis, Knopf oben und unten, Schritte vor den Pflegekräften, Angaben, Fragen", () => {
  const m = angebotMail(k(), {
    kalkulation: kalk, careStartTiming: "sofort", herkunft: null, portalBetreff: "X", angabenHinweis: null,
    resubmit: false, empfehlung: { e: empf, cid: "c1@primundus.de", sichtbar: 5 }, datum: "08.10.2026",
  });
  // Martin 03.10.2026: Knopf unter dem Preis und unten, beide auf Angebot und Pflegekräfte (Portal oben, kein goto).
  const start = `${PORTAL}/?token=tok123&m=eb`;
  pruefe("01", m, "Angebot &amp; Pflegekräfte ansehen", start, { gedankenstrich: true });
  assertEquals(m.html.split(`href="${start}"`).length - 1, 2, "zwei Knöpfe aufs Portal");
  assertEquals(m.text.split(`Angebot & Pflegekräfte ansehen: ${start}`).length - 1, 2, "zwei Links im Text");
  const s = sichtbar(m.html);
  for (const t of ["Ihr Angebot vom 08.10.2026", "Gerne übernehmen wir die Rund-um-Betreuung", "zum sechsten Mal in Folge als Testsieger",
    "Für zwei Personen mit Pflegegrad 4", "3.050 €", "Lohn, Steuern, Gebühren: alles drin", "Keine Vermittlungsgebühr",
    "Kein Vertrag vor Ihrer Auswahl", "Täglich kündbar, taggenau abgerechnet", "Bestpreisgarantie", "1.742 € weniger",
    "So geht es weiter", "Pflegesituation ergänzen und Pflegekräfte einladen", "Jetzt vervollständigen", "Bewerbungen erhalten",
    "Sie entscheiden", "Wir kümmern uns um alles", "ab 3 Tagen nach Ihrer Zusage", "Ihre 5 passenden Pflegekräfte",
    "Echte Profile, ausgewählt nach Ihren Angaben.", "Maria K.", "Erfahrung mit Demenz", "Pflegekräfte einladen",
    "Es fehlen noch Angaben zur Pflegesituation.", "Grundlage Ihres Angebots", "Gewünschter Start Sofort", "Häufige Fragen",
    "Was bedeuten die Deutsch-Niveaus (Grund, Mittel, Gut)?", "Ich habe ein günstigeres Angebot. Was kann ich tun?"]) {
    assertStringIncludes(s, t, t);
  }
  for (const weg of ["Passt Ihnen das Angebot?", "Ja, Bewerbungen erhalten", "72 Stunden", "goto=anfragen", "Gehe ich mit dem Einladen",
    "Alle 5 Pflegekräfte ansehen", "Wie kommen die ca."]) {
    assert(!m.html.includes(weg) && !m.text.includes(weg), `enthält noch „${weg}"`);
  }
  // Reihenfolge wie im Portal: Karte, Schritte, Pflegekräfte, Einladen-Knopf, Angaben, Fragen.
  const pos = (t: string) => s.indexOf(t);
  assert(m.html.indexOf(start) < m.html.indexOf("Keine Vermittlungsgebühr"), "erster Knopf steht über den Punkten");
  assert(pos("Bestpreisgarantie") < pos("So geht es weiter"), "Schritte nach der Karte");
  assert(pos("So geht es weiter") < pos("Ihre 5 passenden Pflegekräfte"), "Schritte vor den Pflegekräften");
  assert(pos("Maria K.") < pos("Es fehlen noch Angaben"), "Hinweis unter den Pflegekräften");
  assert(pos("Es fehlen noch Angaben") < pos("Grundlage Ihres Angebots") && pos("Grundlage Ihres Angebots") < pos("Häufige Fragen"));
  assert(pos("Was bedeuten die Deutsch-Niveaus") < pos("Ich habe ein günstigeres Angebot"), "Deutsch-Niveaus zuerst");
  assert(!s.includes("von 5 aus"), "ohne Bewertungsstand keine Sterne");
  assertStringIncludes(m.html, `${PORTAL}/?token=tok123&goto=matches&m=eb`);
  assertStringIncludes(m.html, "cid:c1@primundus.de");
  assertStringIncludes(m.html, `${PORTAL}/?token=tok123&cg=7&m=eb`);
  assertEquals(m.betreff, "Ihr Angebot und 5 passende Pflegekräfte");
  assertEquals(m.vorschau, "3.050 € im Monat, täglich kündbar. Fünf passende Pflegekräfte sind für Sie ausgewählt.");
});

Deno.test("01 Angebot: Karte mit Zuschüssen — erst die vier Punkte, dann der Kasten; Rechnung in den Fragen", () => {
  const m = angebotMail(k(), { kalkulation: kalkPosten, careStartTiming: null, herkunft: null, portalBetreff: "X", angabenHinweis: null, resubmit: false, empfehlung: null });
  const s = sichtbar(m.html);
  assertStringIncludes(s, "Nach Zuschüssen ca. 1.622 € im Monat");
  assertStringIncludes(s, "Pflegegeld, Entlastungsbudget und Steuerersparnis können Ihren Eigenanteil auf diesen Betrag senken. Gerechnet ist mit den Zuschüssen für eine Person.");
  assert(s.indexOf("Täglich kündbar, taggenau abgerechnet") < s.indexOf("Nach Zuschüssen"), "Martin 08.10.: erst die Vorteile, dann die Zuschüsse");
  assert(s.indexOf("Kosten entstehen erst") < s.indexOf("Nach Zuschüssen"));
  assert(m.text.indexOf("Täglich kündbar, taggenau abgerechnet") < m.text.indexOf("Nach Zuschüssen"), "Textfassung in derselben Reihenfolge");
  assert(!s.includes("1.742 € weniger"), "Kasten ersetzt den Heimvergleich");
  assertStringIncludes(s, "Wie kommen die ca. 1.622 € Eigenanteil zustande?");
  assertStringIncludes(s, "So rechnen wir: 3.050 € im Monat, abzüglich 800 € Pflegegeld bei Pflegegrad 4, bis zu 295 € Entlastungsbudget (3.539 € im Jahr) und bis zu 333 € Steuerersparnis (4.000 € im Jahr).");
  // ohne Empfehlung: alter Betreff, Vorschau ohne Pflegekräfte
  assertEquals(m.betreff, "Ihr Angebot zur 24-Stunden-Betreuung – Primundus");
  assertEquals(m.vorschau, "3.050 € im Monat, täglich kündbar, ohne Vermittlungsgebühr.");
});

Deno.test("Eigenanteil: nur mit lesbaren Posten und aufgehender Rechnung", () => {
  const e = eigenanteilAus(kalkPosten);
  assertEquals(e?.eigen, 1622);
  assertEquals(e?.posten.map((p) => p.wort), ["Pflegegeld", "Entlastungsbudget", "Steuerersparnis"]);
  assertEquals(e?.ehepaar, true);
  assertEquals(eigenanteilAus(kalk), null, "ohne Posten");
  assertEquals(eigenanteilAus({ ...kalkPosten, eigenanteil: 1700 }), null, "Abweichung über 2 €");
  const fremd = { ...kalkPosten, "zuschüsse": { items: [...kalkPosten["zuschüsse"].items, { name: "unbekannt", betrag_monatlich: 50, betrag_jaehrlich: 600, in_kalkulation: true }] } };
  assertEquals(eigenanteilAus(fremd), null, "unbekannter Posten");
  const ohnePg = { bruttopreis: 3050, eigenanteil: 2716.67, formularDaten: { betreuung_fuer: "1-person", pflegegrad: 0 }, "zuschüsse": { items: [
    { name: "steuervorteil", betrag_monatlich: 333.33, betrag_jaehrlich: 4000, in_kalkulation: true },
    { name: "pflegegeld", betrag_monatlich: 0, betrag_jaehrlich: 0, in_kalkulation: false },
  ] } };
  assertEquals(eigenanteilAus(ohnePg)?.posten.map((p) => p.name), ["steuervorteil"]);
});

Deno.test("Fragen: Deutsch-Niveaus zuerst, keine Einladen-Frage, Eigenanteil nur mit Kasten", () => {
  const ohne = angebotFragen(null).map((f) => f.frage);
  assertEquals(ohne, ["Was bedeuten die Deutsch-Niveaus (Grund, Mittel, Gut)?", "Ich habe ein günstigeres Angebot. Was kann ich tun?",
    "Ist das legal?", "Wie läuft die Betreuung ab?", "Was brauche ich zu Hause?"]);
  const mit = angebotFragen(eigenanteilAus(kalkPosten)).map((f) => f.frage);
  assertEquals(mit[4], "Wie kommen die ca. 1.622&nbsp;€ Eigenanteil zustande?");
  assertEquals(mit.length, 6);
});

Deno.test("01 Angebot: Sterne unter dem oberen Knopf, wie auf primundus.de", () => {
  const m = angebotMail({ ...k(), bewertung: { schnitt: "4,9", anzahl: 126 } }, {
    kalkulation: kalk, careStartTiming: null, herkunft: null, portalBetreff: "X", angabenHinweis: null, resubmit: false, empfehlung: null,
  });
  const s = sichtbar(m.html);
  assertStringIncludes(s, "4,9 von 5 aus 126 Bewertungen");
  assertStringIncludes(m.html, 'href="https://primundus.de/erfahrungen"');
  assert(m.html.indexOf("von 5 aus") < m.html.indexOf("Keine Vermittlungsgebühr"), "Sterne direkt unter dem Knopf");
  assertStringIncludes(m.text, "★★★★★ 4,9 von 5 aus 126 Bewertungen: https://primundus.de/erfahrungen");
  assertEquals(m.vorschau, "3.050 € im Monat, täglich kündbar, ohne Vermittlungsgebühr.");
});

Deno.test("01 Angebot: ohne Empfehlung, Resubmit, eingekaufter Lead", () => {
  const ohne = angebotMail(k(), { kalkulation: kalk, careStartTiming: null, herkunft: null, portalBetreff: "X", angabenHinweis: null, resubmit: true, empfehlung: null });
  assert(!sichtbar(ohne.html).includes("passende Pflegekräfte passen"));
  assert(!sichtbar(ohne.html).includes("Für Sie ausgewählt"));
  assertStringIncludes(sichtbar(ohne.html), "vielen Dank für Ihre erneute Anfrage. Ich habe Ihre Angaben übernommen und Ihr Angebot angepasst.");
  assertStringIncludes(sichtbar(ohne.html), "So geht es weiter");
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
  assertEquals(leer.vorschau, "Ihr persönliches Angebot zur 24-Stunden-Betreuung.");
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

// ── Anreise (Registry #119) ─────────────────────────────────────────────────
const anreise = {
  name: "Ewa L.", fotoCid: "foto-1", datum: "2026-10-12", von: "14:00", bis: "18:00", verkehrsmittel: "Minibus",
  hinweis: "Ewa reist mit einem Koffer an.", strasse: "Musterstraße 12", plzOrt: "80687 München", geaendert: false,
};

function ohnePlatzhalter(name: string, m: KundenMail) {
  for (const f of [m.html, m.text, m.betreff, m.vorschau]) assert(!/undefined|NaN|\[object Object\]|null/.test(f), `${name}: Platzhalter`);
  assert(new TextEncoder().encode(m.html).length < 90_000, `${name}: zu groß`);
}

Deno.test("Anreise: Datum mit Wochentag, Zeitfenster", () => {
  assertEquals(anreiseDatum("2026-10-12"), "Montag, 12.10.2026");
  assertEquals(anreiseDatum("2026-10-18"), "Sonntag, 18.10.2026");
  assertEquals(anreiseZeit("14:00", "18:00"), "14–18 Uhr");
  assertEquals(anreiseZeit("09:30", "12:00"), "9:30–12 Uhr");
  assertEquals(anreiseZeit("14:00", null), "ab 14 Uhr");
  assertEquals(anreiseZeit("14:00", "14:00"), "14 Uhr");
});

Deno.test("Anreise: Mail wie die Vorlage", () => {
  const m = anreiseMail(k(), anreise);
  ohnePlatzhalter("anreise", m);
  assertEquals(m.betreff, "Anreisedaten Ihrer Pflegekraft – Montag, 12.10.2026");
  assertEquals(m.vorschau, "Ihre Anreisedaten: Montag, 12.10.2026, 14–18 Uhr.");
  const s = sichtbar(m.html);
  for (const t of [
    "Guten Tag Frau Müller,", "wir haben die Anreise Ihrer Pflegekraft organisiert.", "Ihre Anreisedaten", "Ewa L.",
    "Musterstraße 12", "80687 München", "Hierhin wird Ewa gebracht.", "Minibus", "Montag, 12.10.2026,", "14–18 Uhr",
    "Ewa reist mit einem Koffer an.", "089 200 000 830", "Ansonsten melde ich mich nach der Anreise",
    "Ich wünsche Ihnen und Ewa einen guten Start.", "Marta Kapcio",
  ]) assertStringIncludes(s, t);
  assertStringIncludes(m.html, 'src="cid:foto-1"');
  for (const t of ["Guten Tag Frau Müller,", "Verkehrsmittel: Minibus", "Ankunft: Montag, 12.10.2026, 14–18 Uhr", "Hinweis: Ewa reist", "Mit freundlichen Grüßen"]) {
    assertStringIncludes(m.text, t);
  }
});

Deno.test("Anreise: geänderte Daten → anderer Betreff und Einstieg", () => {
  const m = anreiseMail(k(), { ...anreise, geaendert: true });
  assertEquals(m.betreff, "Geänderte Anreisedaten Ihrer Pflegekraft – Montag, 12.10.2026");
  assertStringIncludes(m.vorschau, "Geänderte Anreisedaten:");
  assertStringIncludes(sichtbar(m.html), "die Anreisedaten Ihrer Pflegekraft haben sich geändert.");
});

Deno.test("Anreise: Verkehrsmittel auf Deutsch, Unbekanntes wie geliefert", () => {
  assertStringIncludes(sichtbar(anreiseMail(k(), { ...anreise, verkehrsmittel: "Sindbad" }).html), "Reisebus (Sindbad)");
  const selbst = sichtbar(anreiseMail(k(), { ...anreise, verkehrsmittel: "Own transport" }).html);
  assertStringIncludes(selbst, "Eigene Anreise");
  assertStringIncludes(selbst, "Hierhin reist Ewa selbst an.");
  assert(!selbst.includes("gebracht"));
  assertStringIncludes(sichtbar(anreiseMail(k(), { ...anreise, verkehrsmittel: "Zug" }).html), "Zug");
});

Deno.test("Anreise: ohne Hinweis, Adresse und Foto fallen die Zeilen weg", () => {
  const m = anreiseMail(k(), { ...anreise, hinweis: null, strasse: null, plzOrt: null, fotoCid: null });
  ohnePlatzhalter("anreise-leer", m);
  const s = sichtbar(m.html);
  for (const t of ["Hinweis", "Adresse", "Hierhin"]) assert(!s.includes(t), t);
  assert(!m.html.includes("cid:"));
  assert(!m.text.includes("Hinweis:") && !m.text.includes("Adresse:"));
});

Deno.test("Anreise: Text aus mamamia wird maskiert, Zeilenumbrüche bleiben", () => {
  const m = anreiseMail(k(), { ...anreise, hinweis: "Fahrer <ruft> an\nab 13 Uhr" });
  assertStringIncludes(m.html, "Fahrer &lt;ruft&gt; an<br>ab 13 Uhr");
  assert(!m.html.includes("<ruft>"));
});
