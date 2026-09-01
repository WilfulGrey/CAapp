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
  patientDataSaved: 1, caregiverInvited: 0, interestShown: 0, applicationReceived: 0,
  bookings: 0, deviceMobile: 40, deviceDesktop: 8, deviceTablet: 2,
  sourceDirect: 10, sourceReferral: 40, funnelStepViewed: {}, wizardOpenedBySource: {},
  leadsBySource: {}, besucherJeSeite: {}, ...over,
});
const stat = (avg: number) => ({ avg, top: avg, topDate: "31.08." });
const periode = (leadsBySource: Record<string, number>): PeriodStats => ({
  sums: { wizardCompleted: 33, patientDataSaved: 12 },
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
