/*
 * Zwei Zusagen des Morgen-Reports, die sich beide lautlos umkehren lassen.
 *
 * 1) Im Balken „Leads je Tag" IST der Balken die Lead-Anzahl, und der
 *    ausgefüllte Anteil (Leads mit Patientenprofil) wächst von UNTEN nach
 *    oben. Bis zum 01.09.2026 hing er oben — Martin: „das füllt sich von
 *    unten auf und nicht von oben, das ist unlogisch." In der E-Mail-Tabelle
 *    entscheidet allein die Reihenfolge der <div>, also prüft der Test sie.
 *
 * 2) „Woher kamen die Leads" trennt Formular und Chat anhand von
 *    `leads.source`. Alles mit Präfix `chat:` (und das historische
 *    `pria-chat`) ist der Chat, alles andere das Formular. Eine neue
 *    Quelle ohne Präfix darf NICHT still im Chat landen.
 */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { buildReportEmail } from "../template.ts";
import type { DailyStats, PeriodStats } from "../queries.ts";

const tag = (over: Partial<DailyStats> = {}): DailyStats => ({
  visitors: 50, wizardStarted: 10, wizardCompleted: 5, wizardCompletedIncludingTests: 5,
  leadsEigene: 5, leadsEingekauft: 0, profileEigene: 1, profileEingekauft: 0,
  kostenEingekauft: 0, portaleOhnePreis: [],
  patientDataSaved: 1, caregiverInvited: 0, interestShown: 0, applicationReceived: 0,
  bookings: 0, deviceMobile: 40, deviceDesktop: 8, deviceTablet: 2,
  sourceDirect: 10, sourceReferral: 40, funnelStepViewed: {}, wizardOpenedBySource: {},
  leadsBySource: {}, besucherJeSeite: {}, ...over,
});
const stat = (avg: number) => ({ avg, top: avg, topDate: "31.08." });
const periode = (leadsBySource: Record<string, number>): PeriodStats => ({
  sums: { wizardCompleted: 33, leadsEigene: 30, leadsEingekauft: 3, patientDataSaved: 12, profileEigene: 11, profileEingekauft: 1, kostenEingekauft: 111 },
  tage: 7,
  visitors: stat(60), wizardStarted: stat(10), wizardCompleted: stat(5),
  patientDataSaved: stat(1.7), caregiverInvited: stat(0), interestShown: stat(0),
  applicationReceived: stat(0), bookings: stat(0),
  convLeadVisitor: 8.4, convProfilLead: 32, convInviteProfil: 0,
  convAppInvite: 0, convBookingApp: 0,
  leadsBySource, besucherJeSeite: {}, days: [],
});
const bauen = (opts: Partial<Parameters<typeof buildReportEmail>[0]> = {}) =>
  buildReportEmail({
    yesterday: tag(), period: periode({ rechner: 32, "chat:kosten-berechnen": 1 }),
    yesterdayLabel: "31.08.2026", periodLabel: "letzte 7 Tage",
    totalLeads: 400, bookedCustomers: 10, totalBookings: 12,
    siteUrl: "https://kostenrechner.primundus.de", ...opts,
  });

/** Die Segmente EINES Balkens in der Reihenfolge, in der sie im HTML stehen. */
function segmente(html: string, tagLabel: string): string[] {
  const karte = html.slice(html.indexOf("Leads je Tag"), html.indexOf("Conversion je Tag"));
  // Das Diagramm kuerzt das Label auf fuenf Zeichen ("31.08." -> "31.08").
  const kurz = tagLabel.slice(0, 5);
  const roh = karte.split('<td align="center"').find((z) => z.includes(`>${kurz}</p>`));
  assert(roh, `Balken ${tagLabel} nicht gefunden`);
  // Nur DIESE Zelle: der letzte Balken haette sonst den Rest der Mail dabei.
  const zelle = roh!.slice(0, roh!.indexOf("</td>"));
  return [...zelle.matchAll(/background:(#[0-9A-Fa-f]{3,6})/g)].map((m) => m[1].toLowerCase());
}

/** Die Farbe, die die Legende dem Profil-Anteil zuweist. */
function profilFarbeAusLegende(html: string): string {
  const bis = html.indexOf("mit Patientenprofil");
  const treffer = [...html.slice(0, bis).matchAll(/background:(#[0-9A-Fa-f]{3,6})/g)];
  assert(treffer.length > 0, "Legenden-Farbe nicht gefunden");
  return treffer[treffer.length - 1][1].toLowerCase();
}

Deno.test("Leads je Tag — der Profil-Anteil steht UNTEN im Balken", () => {
  const { html } = bauen({
    leadKohorten: [{ label: "31.08.", iso: "2026-08-31", leads: 10, mitProfil: 4 }],
  });
  const [oben, unten] = segmente(html, "31.08.");
  assertEquals(segmente(html, "31.08.").length, 2, "erwartet zwei Segmente");
  /* Die Legende benennt die Farbe des Profil-Anteils. Genau die muss im
     Balken UNTEN liegen — daran haengt die ganze Aenderung, deshalb wird
     sie aus der Mail selbst gelesen statt hier hart hingeschrieben. */
  const profilFarbe = profilFarbeAusLegende(html);
  assertEquals(unten, profilFarbe, `Profil-Anteil sitzt oben statt unten (oben ${oben}, unten ${unten})`);
  assert(oben !== profilFarbe, "oberes Segment hat die Profil-Farbe");
  assertStringIncludes(html, "mit Patientenprofil (unten)");
});

Deno.test("Leads je Tag — ohne Profile bleibt genau ein Segment", () => {
  const { html } = bauen({
    leadKohorten: [{ label: "30.08.", iso: "2026-08-30", leads: 5, mitProfil: 0 }],
  });
  assertEquals(segmente(html, "30.08.").length, 1);
});

Deno.test("Leads je Tag — alle mit Profil: ebenfalls ein Segment", () => {
  const { html } = bauen({
    leadKohorten: [{ label: "29.08.", iso: "2026-08-29", leads: 4, mitProfil: 4 }],
  });
  assertEquals(segmente(html, "29.08.").length, 1);
});

Deno.test("Woher kamen die Leads — chat: zählt zum Chat, alles andere zum Formular", () => {
  const { html, text } = bauen({
    period: periode({
      rechner: 20,
      "rechner:kosten-berechnen": 9,
      "kostenrechner-result": 3,      // Formular, obwohl anderer Name
      "chat:kosten-berechnen": 4,
      "pria-chat": 1,                 // historische Chat-Quelle
    }),
  });
  const block = html.slice(html.indexOf("Woher kamen die Leads"));
  assertStringIncludes(block, "Kostenrechner (Formular)");
  assertStringIncludes(block, "Pria (Chat-Knopf)");
  assertStringIncludes(block, "32 <span");   // 20 + 9 + 3
  assertStringIncludes(block, "5 <span");    // 4 + 1
  assertStringIncludes(text, "Kostenrechner (Formular)");
  // Der abgeschaffte Voll-Chat-Test darf nicht zurückkommen.
  assert(!html.includes("Chat-Test"), "alter Varianten-Block ist wieder da");
});

Deno.test("Woher kamen die Leads — mit Leads da, ohne Leads weg", () => {
  // Beide Richtungen, damit der Test nicht bestehen kann, indem der Block
  // ueberhaupt nicht existiert.
  const mit = bauen({ period: periode({ rechner: 3 }) });
  assertStringIncludes(mit.html, "Woher kamen die Leads");
  const ohne = bauen({ period: periode({}) });
  assert(!ohne.html.includes("Woher kamen die Leads"), "leerer Block steht im Weg");
});

/*
 * Diagramm 0 (Besucher je Tag, davon über Anzeigen) folgt derselben Regel
 * wie das Lead-Diagramm: der ausgefüllte Anteil wächst von UNTEN. Ergänzt
 * am 01.09.2026 auf Martins Wunsch, direkt mit der Regel abgesichert —
 * genau hier war der Fehler im Lead-Diagramm entstanden.
 */
function besucherSegmente(html: string, tagLabel: string): string[] {
  const karte = html.slice(html.indexOf("Besucher je Tag"), html.indexOf("Leads je Tag"));
  const roh = karte.split('<td align="center"').find((z) => z.includes(`>${tagLabel.slice(0, 5)}</p>`));
  assert(roh, `Besucher-Balken ${tagLabel} nicht gefunden`);
  const zelle = roh!.slice(0, roh!.indexOf("</td>"));
  return [...zelle.matchAll(/background:(#[0-9A-Fa-f]{3,6})/g)].map((m) => m[1].toLowerCase());
}

Deno.test("Besucher je Tag — der Ads-Anteil steht UNTEN im Balken", () => {
  const { html } = bauen({
    besucherKohorten: [{ label: "31.08.", iso: "2026-08-31", besucher: 50, ausAds: 34 }],
  });
  const [oben, unten] = besucherSegmente(html, "31.08.");
  // Farbe des Ads-Anteils aus der Legende lesen, nicht hart hinschreiben.
  const bis = html.indexOf("über Anzeigen (unten)");
  const treffer = [...html.slice(0, bis).matchAll(/background:(#[0-9A-Fa-f]{3,6})/g)];
  const adsFarbe = treffer[treffer.length - 1][1].toLowerCase();
  assertEquals(unten, adsFarbe, `Ads-Anteil sitzt oben statt unten (oben ${oben}, unten ${unten})`);
  assert(oben !== adsFarbe, "oberes Segment hat die Ads-Farbe");
});

Deno.test("Besucher je Tag — steht VOR dem Lead-Diagramm", () => {
  const { html } = bauen({
    besucherKohorten: [{ label: "31.08.", iso: "2026-08-31", besucher: 50, ausAds: 34 }],
    leadKohorten: [{ label: "31.08.", iso: "2026-08-31", leads: 5, mitProfil: 1 }],
  });
  assert(
    html.indexOf("Besucher je Tag") < html.indexOf("Leads je Tag"),
    "Besucher-Diagramm steht nicht an erster Stelle",
  );
});

Deno.test("Besucher je Tag — ohne Daten entfällt das Diagramm", () => {
  const mit = bauen({ besucherKohorten: [{ label: "31.08.", iso: "2026-08-31", besucher: 9, ausAds: 2 }] });
  assertStringIncludes(mit.html, "Besucher je Tag");
  const ohne = bauen({});
  assert(!ohne.html.includes("Besucher je Tag"), "leeres Diagramm steht im Weg");
});

/* Eingekaufte Leads getrennt ausweisen (Martin, 05.09.2026: „wir kaufen ja leads
   ein … wir muessen fuer unsere zahlen wissen, wie viele von uns und wie viele
   eingekaufte"). */
Deno.test("Bericht trennt eigene von eingekauften Leads", () => {
  const html = bauen({ yesterday: tag({ wizardCompleted: 7, leadsEigene: 4, leadsEingekauft: 3 }) }).html;
  // Leads-Kachel: statt des 7-Tage-Schnitts steht dort die Aufteilung.
  assertStringIncludes(html, "4 eigene");
  assertStringIncludes(html, "3 eingekauft");
  // Und im Tagesfazit im Klartext.
  assertStringIncludes(html, "davon 4 eigene, 3 eingekauft");
});

Deno.test("ohne eingekaufte Leads bleibt das Fazit schlank", () => {
  const html = bauen({ yesterday: tag({ wizardCompleted: 5, leadsEigene: 5, leadsEingekauft: 0 }) }).html;
  assert(!html.includes("eingekauft</"), "kein Zusatz im Fazit, wenn nichts eingekauft wurde");
});

Deno.test("Kosten je Lead rechnen mit den EIGENEN Leads", () => {
  /* Werbung erzeugt keine Portal-Leads. Wuerde die Rechnung sie mitzaehlen,
     saehen die Kosten je Lead guenstiger aus, als sie sind. */
  const html = bauen({
    yesterday: tag({ wizardCompleted: 10, leadsEigene: 4, leadsEingekauft: 6 }),
    adsSpend: { yesterday: 80, period: 560, periodDays: 7 },
  }).html;
  /* Genau in der Gruppe „Eigene Leads" pruefen, nicht im ganzen Dokument:
     „8,00 €" (80 ÷ 10) steht legitim als Gesamtwert in der Summenzeile. Die
     Gruppen-Kachel muss trotzdem durch die EIGENEN Leads teilen. */
  const gruppe = html.slice(html.indexOf("Eigene Leads (Werbung)"));
  // In der Kachel steht die Beschriftung VOR dem Wert.
  const kachel = gruppe.match(/>je Lead<[\s\S]{0,400}?([0-9.]*[0-9],[0-9]{2} €)/);
  assert(kachel, 'Kachel „je Lead“ in der eigenen Gruppe fehlt');
  assertEquals(kachel![1], "20,00 €"); // 80 ÷ 4 eigene, nicht 80 ÷ 10
});

/* Kosten nach Bereich (Martin, 05.09.2026): Werbung erzeugt nur eigene Leads,
   Einkauf nur eingekaufte. Beides getrennt zu rechnen ist der ganze Punkt. */
Deno.test("Kosten nach Bereich: eigene und eingekaufte getrennt je Lead und je Profil", () => {
  const html = bauen({
    yesterday: tag({
      wizardCompleted: 9, leadsEigene: 4, leadsEingekauft: 5,
      patientDataSaved: 3, profileEigene: 2, profileEingekauft: 1,
      kostenEingekauft: 185, portaleOhnePreis: [],
    }),
    adsSpend: { yesterday: 80, period: 560, periodDays: 7 },
  }).html;
  assertStringIncludes(html, "Eigene Leads (Werbung)");
  assertStringIncludes(html, "Eingekaufte Leads (Portale)");
  // Werbung 80 € auf 4 eigene Leads = 20 €, auf 2 Profile = 40 €.
  assertStringIncludes(html, "20,00 €");
  assertStringIncludes(html, "40,00 €");
  // Einkauf 185 € (5 × 37) auf 5 Leads = 37 €, auf 1 Profil = 185 €.
  assertStringIncludes(html, "37,00 €");
  assertStringIncludes(html, "185,00 €");
  // Gesamt 265 € steht in der Summenzeile.
  assertStringIncludes(html, "265,00 €");
  // Die Preise stehen als Fussnote dran, damit die Rechnung nachvollziehbar ist.
  assertStringIncludes(html, "pflegehilfe.org 37,00 €");
  assertStringIncludes(html, "pflege-helfer24.de 50,00 €");
});

Deno.test("fehlender Portalpreis wird gemeldet statt still mit 0 gerechnet", () => {
  const html = bauen({
    yesterday: tag({ wizardCompleted: 3, leadsEigene: 1, leadsEingekauft: 2, kostenEingekauft: 37, portaleOhnePreis: ["pflegebund.eu"] }),
    adsSpend: { yesterday: 20, period: 140, periodDays: 7 },
  }).html;
  assertStringIncludes(html, "Ohne hinterlegten Preis");
  assertStringIncludes(html, "pflegebund.eu");
});

/* Aufraeumen (Martin, 05.09.2026: „das mit eigene lead und ads ist doppelt —
   der dreierkasten reicht … je Profil haben wir auch schon oben"). */
Deno.test("keine doppelten Kosten-Kacheln mehr", () => {
  const html = bauen({
    yesterday: tag({ wizardCompleted: 9, leadsEigene: 4, leadsEingekauft: 5, patientDataSaved: 3, profileEigene: 2, profileEingekauft: 1, kostenEingekauft: 185 }),
    adsSpend: { yesterday: 80, period: 560, periodDays: 7 },
  }).html;
  // „je Lead" und „je Profil" genau einmal je Gruppe — nicht doppelt.
  assertEquals((html.match(/>je Lead</g) ?? []).length, 2);
  assertEquals((html.match(/>je Profil</g) ?? []).length, 2);
  // Die alte Kachel „je Patientenprofil" (Werbung ÷ ALLE Profile) ist weg.
  assert(!html.includes("je Patientenprofil"), "alte Kachel darf nicht mehr da sein");
});

Deno.test("je Profil rechnet je Gruppe, nicht ueber alle Profile", () => {
  /* Der Fehler, den Martin gesehen hat: 76,40 € ÷ 3 Profile = 25,47 €, obwohl
     nur 2 Profile aus eigenen Leads stammen (→ 38,20 €). */
  const html = bauen({
    yesterday: tag({ wizardCompleted: 9, leadsEigene: 4, leadsEingekauft: 5, patientDataSaved: 3, profileEigene: 2, profileEingekauft: 1, kostenEingekauft: 185 }),
    adsSpend: { yesterday: 76.4, period: 512.3, periodDays: 7 },
  }).html;
  assertStringIncludes(html, "38,20 €");
  assert(!html.includes("25,47 €"), "darf NICHT durch alle Profile teilen");
});
