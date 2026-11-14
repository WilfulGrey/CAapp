// Rauchtests der neuen Kundenmails (Vorschau v2, Martin 26.09.2026) — jede Mail: Anrede,
// richtiger Knopf und Link, keine Platzhalter, Textfassung vorhanden, klein genug für Gmail.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  anreiseDatum,
  anreiseMail,
  anreiseZeit,
  angebotMail,
  type AngebotEingabe,
  type AngebotKraft,
  eigenanteilAus,
  erinnerungMail,
  heimVergleich,
  type Kontext,
  kraftFakten,
  type KundenMail,
  nachfass2Mail,
  nachfass3Mail,
  neuePflegekraefteMail,
  PORTAL_ERKLAERUNG,
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
import { BESTPREIS_URL, TELEFON_HREF, WHATSAPP_HREF } from "../mailBausteine.ts";
import { martaKarteHtml } from "../martaKarte.ts";

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
const sichtbar = (html: string) => html.replace(/<div style="display:none[^>]*>[^<]*<\/div>/, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
/** Wie sichtbar, aber ohne die Lücke, die ein Tag vor Komma oder Punkt hinterlässt („830 ," → „830,"). */
const lesbar = (html: string) => sichtbar(html).replace(/ ([,.])/g, "$1").trim();

function pruefe(name: string, m: KundenMail, knopf: string, link: string, o: { gedankenstrich?: boolean } = {}) {
  assertStringIncludes(m.html, `>${knopf}</a>`, `${name}: Knopf`);
  grundregeln(name, m, link, o);
}

/** Was jede Kundenmail erfüllt, unabhängig von der Form des Knopfs. */
function grundregeln(name: string, m: KundenMail, link: string, o: { gedankenstrich?: boolean } = {}) {
  assertStringIncludes(m.html, "Guten Tag Frau Müller,", `${name}: Anrede`);
  assertStringIncludes(m.text, "Guten Tag Frau Müller,", `${name}: Anrede Text`);
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

/* Angebotsmail wie der Minimal-Einstieg des Portals (Registry #148, Martin 08.11.2026: „genauso wie im Portal“, Entwurf
   freigegeben mit „Ja, perfekt“). Standardfall eine Person mit Pflegegrad 3: 3.050 € − 599 − 295 − 333 = 1.823 €, im
   Pflegeheim 3.364 € → rund 1.541 € weniger. */
const kalkEine = {
  bruttopreis: 3050, eigenanteil: 1822.75,
  formularDaten: { betreuung_fuer: "1-person", pflegegrad: 3, mobilitaet: "rollator", nachteinsaetze: "gelegentlich", deutschkenntnisse: "kommunikativ", geschlecht: "weiblich" },
  "zuschüsse": { items: [
    { name: "pflegegeld", label: "Pflegegeld", betrag_monatlich: 599, betrag_jaehrlich: 7188, in_kalkulation: true },
    { name: "entlastungsbudget_neu", label: "Entlastungsbudget", betrag_monatlich: 294.92, betrag_jaehrlich: 3539, in_kalkulation: true },
    { name: "steuervorteil", label: "Steuervorteil", betrag_monatlich: 333.33, betrag_jaehrlich: 4000, in_kalkulation: true },
  ] },
};
const KRAEFTE: AngebotKraft[] = [
  { caregiverId: 11, vorname: "Maria", alter: 58, erfahrungJahre: 12, deutschWort: "Gut", cid: "kraft-0" },
  { caregiverId: 22, vorname: "Ewa", alter: null, erfahrungJahre: 1, deutschWort: null, cid: null },
];
const eingabe = (o: Partial<AngebotEingabe> = {}): AngebotEingabe =>
  ({ kalkulation: kalkEine, herkunft: null, portalBetreff: "X", resubmit: false, empfehlung: { sichtbar: 2, kraefte: KRAEFTE }, ...o });
const STERNE = { schnitt: "4,9", anzahl: 126 };
/** „Angebot & Pflegekräfte anzeigen" führt oben ins Portal (Registry #163, Martin 14.11.2026; bis dahin „Bewerbungen erhalten"
 *  ins Formular), „Alle Pflegekräfte anzeigen" zur Liste, „Ansehen" ins Profil. */
const KNOPF = `${PORTAL}/?token=tok123&m=eb`;
/** Der Knopftext, wie er im HTML steht (`&` maskiert) und in `lesbar` erscheint. */
const KNOPF_HTML = "Angebot &amp; Pflegekräfte anzeigen";
const ALLE = `${PORTAL}/?token=tok123&m=eb&goto=matches`;
const profil = (id: number) => `${PORTAL}/?token=tok123&cg=${id}&m=eb`;
const ERKLAERUNG = "Im Kundenportal sehen Sie Ihr Angebot und passende Pflegekräfte. Beschreiben Sie einmal kurz die Pflegesituation, das dauert etwa 2 Minuten. Danach können sich Pflegekräfte direkt bei Ihnen bewerben. Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.";
const zaehle = (html: string, teil: string) => html.split(teil).length - 1;

function inFolge(name: string, text: string, teile: string[]) {
  let ab = 0;
  for (const t of teile) {
    const i = text.indexOf(t, ab);
    assert(i >= 0, `${name}: „${t}" fehlt oder steht an falscher Stelle`);
    ab = i + t.length;
  }
}

/** Grundregeln plus der Knopf der Angebotsmail: zweizeilig, genau einmal, oben ins Portal. */
function pruefeAngebot(name: string, m: KundenMail) {
  grundregeln(name, m, KNOPF);
  assertEquals(zaehle(m.html, `href="${KNOPF}"`), 1, `${name}: genau ein Knopf ins Portal`);
  inFolge(`${name} Knopf`, m.html, [`href="${KNOPF}"`, `${KNOPF_HTML}&nbsp;&rarr;</span>`, "100% kostenfrei &amp; unverbindlich</span>"]);
  assertStringIncludes(m.text, `Angebot & Pflegekräfte anzeigen (100% kostenfrei & unverbindlich): ${KNOPF}`);
  // Der frühere Knopf und sein Sprung ins Formular sind weg.
  for (const alt of ["Bewerbungen erhalten", "goto=anfragen"]) {
    assert(!m.html.includes(alt) && !m.text.includes(alt), `${name}: enthält noch „${alt}"`);
  }
  // „Einladen" heißt in der Mail „Ansehen" (Martin 08.11.: „weil die das noch gar nicht verstehen, was Einladen bedeutet").
  for (const wort of ["Einladen", "einladen", "Eingeladen"]) {
    assert(!m.html.includes(wort) && !m.text.includes(wort), `${name}: enthält „${wort}"`);
  }
}

Deno.test("01 Angebot (#148): Inhalt und Reihenfolge wie der freigegebene Entwurf", () => {
  const m = angebotMail({ ...k(), bewertung: STERNE }, eingabe());
  pruefeAngebot("01", m);
  assertEquals(ERKLAERUNG, PORTAL_ERKLAERUNG.replace(/ /g, " "), "Erklärung zum Portal im freigegebenen Wortlaut");
  inFolge("HTML", lesbar(m.html), [
    "Guten Tag Frau Müller,",
    "vielen Dank für Ihre Anfrage. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.",
    "Ihr persönliches Angebot", "3.050 € / Monat", "Nach Zuschüssen ca. 1.823 € im Monat", "rund 1.541 € weniger als im Pflegeheim",
    "Bestpreisgarantie", "Keine Vorauszahlung", "Keine Vermittlungsgebühr", "Keine Mindestlaufzeit",
    "4,9", "126 Bewertungen", "20 Jahre Erfahrung", "6× in Folge Testsieger",
    "Passende Pflegekräfte 2",
    "Maria, 58", "12 Jahre Erfahrung", "Deutsch Gut", "3.050 €", "Ansehen",
    "Ewa", "1 Jahr Erfahrung", "3.050 €", "Ansehen",
    "Alle Pflegekräfte anzeigen",
    ERKLAERUNG,
    KNOPF_HTML,
    "Viele Grüße Marta Kapcio Pflegeberaterin bei Primundus",
    "Fragen? 089 200 000 830, täglich 8–20 Uhr, auch per WhatsApp.",
  ]);
  assertStringIncludes(m.html, "&#9733;".repeat(5));
  inFolge("Text", m.text, [
    "Guten Tag Frau Müller,\n\nvielen Dank für Ihre Anfrage. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.\n\n",
    "IHR PERSÖNLICHES ANGEBOT\n3.050 € / Monat\nNach Zuschüssen ca. 1.823 € im Monat\nrund 1.541 € weniger als im Pflegeheim\n"
      + `✓ Bestpreisgarantie: ${BESTPREIS_URL}\n✓ Keine Vorauszahlung\n✓ Keine Vermittlungsgebühr\n✓ Keine Mindestlaufzeit\n`
      + "★★★★★ 4,9 · 126 Bewertungen · 20 Jahre Erfahrung · 6× in Folge Testsieger\n\n",
    `PASSENDE PFLEGEKRÄFTE (2)\n- Maria, 58 · 12 Jahre Erfahrung · Deutsch Gut · 3.050 € · Ansehen: ${profil(11)}\n`
      + `- Ewa · 1 Jahr Erfahrung · 3.050 € · Ansehen: ${profil(22)}\nAlle Pflegekräfte anzeigen: ${ALLE}\n\n`,
    `${PORTAL_ERKLAERUNG}\n\nAngebot & Pflegekräfte anzeigen (100% kostenfrei & unverbindlich): ${KNOPF}\n\n`,
    "Viele Grüße\nMarta Kapcio\nPflegeberaterin bei Primundus",
    "Fragen? 089 200 000 830, täglich 8–20 Uhr, auch per WhatsApp (https://wa.me/4989200000830).",
  ]);
  // Links: Bestpreisgarantie, je Pflegekraft Foto/Name/„Ansehen" aufs Profil, die Liste, der Knopf, Telefon, WhatsApp.
  assertEquals(zaehle(m.html, `href="${BESTPREIS_URL}"`), 1);
  assertEquals(zaehle(m.html, `href="${profil(11)}"`), 3);
  assertEquals(zaehle(m.html, `href="${profil(22)}"`), 3);
  assertEquals(zaehle(m.html, `href="${ALLE}"`), 1);
  assertEquals(zaehle(m.html, "<a "), 1 + 6 + 1 + 1 + 2, "sonst keine Links");
  // Fotos als angehängte Bilder (cid), ohne Foto die Initiale.
  assertEquals(zaehle(m.html, 'src="cid:kraft-0"'), 2, "Outlook- und übrige Fassung");
  assertStringIncludes(m.html, ">E</div>");
  // Fällt weg: Chips, Testsieger-Satz, Ablauf, alter Knopf, Vertragszeile, Martas große Karte.
  for (const weg of ["Eine Person", "Pflegegrad", "Gerne übernehmen wir", "zum sechsten Mal in Folge", "So geht es weiter",
    "Häufige Fragen", "Angebot &amp; Pflegekräfte ansehen", "Kein Vertrag vor Ihrer Auswahl", "Mit freundlichen Grüßen", "MARTA"]) {
    assert(!m.html.includes(weg) && !m.text.includes(weg), `enthält noch „${weg}"`);
  }
  assert(!m.html.includes(k().marta), "ohne Martas große Karte");
  // Betreff und Vorschau wie vor #148.
  assertEquals(m.betreff, "Ihr Angebot und 2 passende Pflegekräfte");
  assertEquals(m.vorschau, "3.050 € im Monat, täglich kündbar. Zwei passende Pflegekräfte sind für Sie ausgewählt.");
});

Deno.test("01 Angebot: Telefon und WhatsApp mit denselben Links wie Martas Karte", () => {
  const m = angebotMail({ ...k(), bewertung: STERNE }, eingabe());
  const karte = martaKarteHtml({ fuer: "kunde", bewertung: STERNE, siteUrl: SITE, presseLogos: false });
  for (const href of [TELEFON_HREF, WHATSAPP_HREF]) {
    assertStringIncludes(m.html, `href="${href}"`);
    assertStringIncludes(karte, `href="${href}"`);
  }
});

Deno.test("01 Angebot: Ehepaar mit Zuschüssen wie im Portal, ohne Zuschüsse keine grüne Zeile und kein Heimvergleich", () => {
  const paar = angebotMail(k(), eingabe({ kalkulation: kalkPosten }));
  inFolge("Ehepaar", lesbar(paar.html), ["3.050 € / Monat", "Nach Zuschüssen ca. 1.622 € im Monat", "rund 1.742 € weniger als im Pflegeheim", "Bestpreisgarantie"]);
  assertStringIncludes(paar.text, "3.050 € / Monat\nNach Zuschüssen ca. 1.622 € im Monat\nrund 1.742 € weniger als im Pflegeheim\n✓ Bestpreisgarantie");
  // Das Portal zeigt keinen Satz zur Rechnung für eine Person, die Mail auch nicht.
  assert(!paar.html.includes("Gerechnet ist") && !paar.text.includes("Gerechnet ist"));

  const ohne = angebotMail(k(), eingabe({ kalkulation: kalk }));
  const s = lesbar(ohne.html);
  inFolge("ohne Zuschüsse", s, ["Ihr persönliches Angebot", "3.050 € / Monat", "Bestpreisgarantie", "Keine Mindestlaufzeit"]);
  for (const weg of ["Nach Zuschüssen", "weniger", "Pflegeheim"]) {
    assert(!s.includes(weg) && !ohne.text.includes(weg), `enthält „${weg}"`);
  }
  assertStringIncludes(ohne.text, "IHR PERSÖNLICHES ANGEBOT\n3.050 € / Monat\n✓ Bestpreisgarantie");
});

Deno.test("01 Angebot: Pflegekräfte höchstens fünf, Angaben nur wenn vorhanden, Name maskiert", () => {
  const sieben = Array.from({ length: 7 }, (_, i) => ({ ...KRAEFTE[0], caregiverId: 100 + i, vorname: `K${i}`, cid: null }));
  const m = angebotMail(k(), eingabe({ empfehlung: { sichtbar: 5, kraefte: sieben } }));
  assertEquals(zaehle(m.html, ">Ansehen</a>"), 5);
  assertStringIncludes(lesbar(m.html), "Passende Pflegekräfte 5");
  assert(!m.html.includes(profil(105)) && !m.text.includes(profil(105)), "die sechste fehlt");
  assertEquals(m.betreff, "Ihr Angebot und 5 passende Pflegekräfte");

  const knapp = angebotMail(k(), eingabe({ empfehlung: { sichtbar: 1, kraefte: [{ caregiverId: 7, vorname: "A<b>", alter: null, erfahrungJahre: 0, deutschWort: null, cid: null }] } }));
  assertStringIncludes(knapp.html, "A&lt;b&gt;");
  assert(!knapp.html.includes("A<b>"));
  assertStringIncludes(knapp.text, `- A<b> · 3.050 € · Ansehen: ${profil(7)}`);
  assertEquals(knapp.betreff, "Ihr Angebot und eine passende Pflegekraft");
  assertEquals(knapp.vorschau, "3.050 € im Monat, täglich kündbar. Eine passende Pflegekraft ist für Sie ausgewählt.");

  assertEquals(kraftFakten({ erfahrungJahre: 0, deutschWort: null }), []);
  assertEquals(kraftFakten({ erfahrungJahre: 1, deutschWort: "Gut" }), ["1 Jahr Erfahrung", "Deutsch Gut"]);
  assertEquals(kraftFakten({ erfahrungJahre: 12, deutschWort: null }), ["12 Jahre Erfahrung"]);
});

Deno.test("01 Angebot: ohne Pflegekräfte keine Karte, Erklärung und Knopf bleiben", () => {
  for (const empfehlung of [null, { sichtbar: 3 }, { sichtbar: 3, kraefte: [] }]) {
    const m = angebotMail(k(), eingabe({ empfehlung }));
    pruefeAngebot(`01 ohne Karte ${JSON.stringify(empfehlung)}`, m);
    for (const weg of ["Passende Pflegekräfte", "PASSENDE PFLEGEKRÄFTE", "Alle Pflegekräfte anzeigen", "goto=matches", "cg="]) {
      assert(!m.html.includes(weg) && !m.text.includes(weg), `enthält „${weg}"`);
    }
    inFolge("ohne Karte", lesbar(m.html), ["Keine Mindestlaufzeit", ERKLAERUNG, KNOPF_HTML]);
    assertEquals(zaehle(m.html, "<a "), 4, "Bestpreisgarantie, Knopf, Telefon, WhatsApp");
  }
  const ohne = angebotMail(k(), eingabe({ empfehlung: null }));
  assertEquals(ohne.betreff, "Ihr Angebot zur 24-Stunden-Betreuung – Primundus");
  assertEquals(ohne.vorschau, "3.050 € im Monat, täglich kündbar, ohne Vermittlungsgebühr.");
});

Deno.test("01 Angebot: erneute Anfrage und eingekaufter Lead", () => {
  const neu = angebotMail(k(), eingabe({ resubmit: true }));
  assertStringIncludes(lesbar(neu.html), "Guten Tag Frau Müller, vielen Dank für Ihre erneute Anfrage. Ich habe Ihre Angaben übernommen und Ihr Angebot angepasst. Ihr persönliches Angebot");
  assertStringIncludes(neu.text, "vielen Dank für Ihre erneute Anfrage. Ich habe Ihre Angaben übernommen und Ihr Angebot angepasst.");
  assertEquals(neu.betreff, "Ihr aktualisiertes Angebot und 2 passende Pflegekräfte");
  assertEquals(angebotMail(k(), eingabe({ resubmit: true, empfehlung: null })).betreff, "Ihr aktualisiertes Angebot zur 24-Stunden-Betreuung – Primundus");
  // Herkunft schlägt Resubmit: Portalname im Einstieg, eigener Betreff.
  const portal = angebotMail(k(), eingabe({ herkunft: "Pflegehilfe", portalBetreff: "Portal-Betreff", resubmit: true }));
  assertStringIncludes(lesbar(portal.html), "vielen Dank für Ihre Anfrage über Pflegehilfe. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.");
  assertStringIncludes(portal.text, "vielen Dank für Ihre Anfrage über Pflegehilfe. Hier ist Ihr Angebot zur 24-Stunden-Betreuung.");
  assertEquals(portal.betreff, "Portal-Betreff");
  assertStringIncludes(angebotMail(k(), eingabe({ herkunft: "A<b>" })).html, "A&lt;b&gt;");
});

/* Hinweis zu den Angaben bei eingekauften Leads: Wortlaut aus herkunft.ts wie bis #148 live, nur der Gedankenstrich ist ein
   Punkt. Bedingungen wie bis #148: jede Herkunft; „vorsichtig angenommen", wenn `angenommene_felder` nicht leer ist oder
   fehlt, sonst „übernommen". */
const HINWEIS_ANGENOMMEN = "Diese Angaben haben wir aus Ihrer Anfrage bei Pflegehilfe übernommen und dort, wo uns etwas fehlte, vorsichtig angenommen. Im Kundenportal können Sie alles in einer Minute korrigieren. Der Preis passt sich sofort an.";
const HINWEIS_UEBERNOMMEN = "Diese Angaben haben wir aus Ihrer Anfrage bei Pflegehilfe übernommen. Stimmt etwas nicht, können Sie es im Kundenportal in einer Minute korrigieren. Der Preis passt sich sofort an.";

Deno.test("01 Angebot: eingekaufter Lead mit Annahmen, Hinweis klein direkt unter dem Kasten", () => {
  const ehepaar = { ...kalkPosten, angenommene_felder: ["betreuung_fuer", "nachteinsaetze"] };
  const m = angebotMail({ ...k(), bewertung: STERNE },
    eingabe({ kalkulation: ehepaar, herkunft: "Pflegehilfe", angenommeneFelder: ehepaar.angenommene_felder, portalBetreff: "Portal-Betreff" }));
  pruefeAngebot("01 Pflegehilfe", m);
  assertEquals(zaehle(m.html, "<a "), 11, "der Hinweis bringt keinen Link mit");
  inFolge("HTML", lesbar(m.html), [
    "vielen Dank für Ihre Anfrage über Pflegehilfe.", "Ihr persönliches Angebot", "Keine Mindestlaufzeit", "6× in Folge Testsieger",
    HINWEIS_ANGENOMMEN, "Passende Pflegekräfte", ERKLAERUNG, KNOPF_HTML,
  ]);
  inFolge("Text", m.text, ["IHR PERSÖNLICHES ANGEBOT\n3.050 € / Monat\n", "6× in Folge Testsieger\n\n",
    `${HINWEIS_ANGENOMMEN}\n\nPASSENDE PFLEGEKRÄFTE (2)\n`]);
  // Direkt nach dem Kasten, ohne etwas dazwischen; der Kasten rückt dafür näher heran.
  assert(/<\/table>\s*<p [^>]*>Diese Angaben haben wir/.test(m.html), "Hinweis direkt unter dem Kasten");
  assertStringIncludes(m.html, 'style="margin:0 0 10px;border:1px solid');
  // Kleine Schrift wie die Kontaktzeile: derselbe Stil, nur der Abstand darf anders sein.
  const stil = (anfang: string) => m.html.match(new RegExp(`<p style="([^"]*)">${anfang}`))?.[1].replace(/margin:[^;]*;/, "");
  assertEquals(stil("Diese Angaben haben wir"), stil("Fragen\\?"));
  assert(stil("Diese Angaben haben wir")?.includes("font-size:14.5px"));
  assertEquals(zaehle(m.html, "Diese Angaben haben wir"), 1, "einmal");
});

Deno.test("01 Angebot: Färbung des Hinweises nach angenommene_felder, Rechner-Leads ohne Hinweis", () => {
  const mit = (felder?: unknown) => angebotMail(k(), eingabe({ herkunft: "Pflegehilfe", angenommeneFelder: felder }));
  // Fehlt die Liste (Altbestand), gilt der vorsichtigere Text.
  for (const felder of [undefined, null, ["betreuung_fuer"]]) {
    const m = mit(felder);
    assertStringIncludes(lesbar(m.html), HINWEIS_ANGENOMMEN, `angenommen bei ${JSON.stringify(felder)}`);
    assertStringIncludes(m.text, HINWEIS_ANGENOMMEN);
  }
  const alles = mit([]);
  pruefeAngebot("01 Pflegehilfe ohne Annahmen", alles);
  assertStringIncludes(lesbar(alles.html), HINWEIS_UEBERNOMMEN);
  assertStringIncludes(alles.text, HINWEIS_UEBERNOMMEN);
  assert(!alles.html.includes("vorsichtig angenommen") && !alles.text.includes("vorsichtig angenommen"));
  // Ohne Preis kein Kasten; der Hinweis steht dann unter dem Einstieg (bis #148: bei jeder Herkunft).
  const ohnePreis = angebotMail(k(), eingabe({ kalkulation: null, herkunft: "Pflegehilfe", angenommeneFelder: [] }));
  inFolge("ohne Preis", lesbar(ohnePreis.html), ["über Pflegehilfe.", HINWEIS_UEBERNOMMEN, "Passende Pflegekräfte", KNOPF_HTML]);
  // Rechner-Leads (ohne Herkunft) sehen nichts davon, auch wenn eine Liste in der Kalkulation stünde.
  for (const felder of [undefined, [], ["betreuung_fuer"]]) {
    const r = angebotMail(k(), eingabe({ angenommeneFelder: felder }));
    assert(!r.html.includes("Diese Angaben") && !r.text.includes("Diese Angaben"), `Rechner-Lead ${JSON.stringify(felder)}`);
    assertStringIncludes(r.html, 'style="margin:0 0 14px;border:1px solid', "Kasten-Abstand wie ohne Hinweis");
  }
});

Deno.test("01 Angebot: ohne Bewertung keine Sterne, ohne Preis kein Kasten und keine Preise an den Pflegekräften", () => {
  const ohneSterne = angebotMail(k(), eingabe());
  assert(!ohneSterne.html.includes("Bewertungen") && !ohneSterne.html.includes("&#9733;"));
  assert(!ohneSterne.text.includes("★") && !ohneSterne.text.includes("Bewertungen"));
  inFolge("ohne Sterne", lesbar(ohneSterne.html), ["Keine Mindestlaufzeit", "20 Jahre Erfahrung", "6× in Folge Testsieger"]);
  assertStringIncludes(ohneSterne.text, "✓ Keine Mindestlaufzeit\n20 Jahre Erfahrung · 6× in Folge Testsieger\n");

  const leer = angebotMail(k(), eingabe({ kalkulation: null }));
  pruefeAngebot("01 ohne Kalkulation", leer);
  const s = lesbar(leer.html);
  assert(!/Ihr persönliches Angebot|€|Zuschüssen|Bestpreisgarantie/.test(s), s);
  assert(!/IHR PERSÖNLICHES ANGEBOT|€|Bestpreisgarantie/.test(leer.text));
  inFolge("ohne Kalkulation", s, ["Passende Pflegekräfte 2", "Maria, 58", "Ansehen", "Ewa", "Ansehen", ERKLAERUNG]);
  assertEquals(leer.vorschau, "Ihr persönliches Angebot zur 24-Stunden-Betreuung.");
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
  assertEquals(eigenanteilAus(kalkEine)?.eigen, 1823);
});

Deno.test("Heim-Vergleich nur mit echter Kalkulation unter dem Heim-Schnitt", () => {
  assertEquals(heimVergleich({ eigenanteil: 1621.75 }), { eigen: 1622, diff: 1742 });
  assertEquals(heimVergleich({ eigenanteil: 3500 }), null);
  assertEquals(heimVergleich(null), null);
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
  name: "Ewa Lis", fotoCid: "foto-1", datum: "2026-10-12", von: "14:00", bis: "18:00", verkehrsmittel: "Minibus",
  strasse: "Musterstraße 12", plzOrt: "80687 München", geaendert: false,
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
    "Guten Tag Frau Müller,", "wir haben die Anreise Ihrer Pflegekraft organisiert.", "Ihre Anreisedaten", "Ewa Lis",
    "Musterstraße 12", "80687 München", "Hierhin wird Ewa gebracht.", "Minibus", "Montag, 12.10.2026,", "14–18 Uhr",
    "089 200 000 830", "Ansonsten melde ich mich nach der Anreise",
    "Ich wünsche Ihnen und Ewa einen guten Start.", "Marta Kapcio",
  ]) assertStringIncludes(s, t);
  assertStringIncludes(m.html, 'src="cid:foto-1"');
  assert(!s.includes("Hinweis") && !m.text.includes("Hinweis"), "Hinweis bleibt draußen (Michał 09.10.)");
  for (const t of ["Guten Tag Frau Müller,", "Verkehrsmittel: Minibus", "Ankunft: Montag, 12.10.2026, 14–18 Uhr", "Mit freundlichen Grüßen"]) {
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

Deno.test("Anreise: ohne Adresse und Foto fallen die Zeilen weg", () => {
  const m = anreiseMail(k(), { ...anreise, strasse: null, plzOrt: null, fotoCid: null });
  ohnePlatzhalter("anreise-leer", m);
  const s = sichtbar(m.html);
  for (const t of ["Adresse", "Hierhin"]) assert(!s.includes(t), t);
  assert(!m.html.includes("cid:"));
  assert(!m.text.includes("Adresse:"));
});

Deno.test("Anreise: Text aus mamamia wird maskiert", () => {
  const m = anreiseMail(k(), { ...anreise, strasse: "Weg <b>1</b>" });
  assertStringIncludes(m.html, "Weg &lt;b&gt;1&lt;/b&gt;");
  assert(!m.html.includes("<b>1</b>"));
});
