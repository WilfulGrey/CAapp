// Stopp- und Zeitregeln der Kundenmails (26.09.2026) — siehe stopRegeln.ts.
import { assert, assertEquals } from "@std/assert";
import {
  eingangDerBewerbung,
  erinnerungStopp,
  erinnerungStufe,
  genitiv,
  type LeadEreignis,
  neuePflegekraefteEntscheidung,
  reaktionAufBewerbung,
  reservierungAktiv,
  reservierungsEnde,
  reserviertBisAus,
  reserviertRest,
  sucheStandStopp,
  VOR_DEM_ABSENDEN,
  vorAbsendenStopp,
} from "../stopRegeln.ts";

const H = 60 * 60 * 1000;

Deno.test("Vier Dinge, Nachfass 2 und 3 stoppen, sobald die Pflegesituation steht", () => {
  for (const t of ["warum_primundus", "nachfass_2", "nachfass_3"]) assert(VOR_DEM_ABSENDEN.has(t));
  const basis = { beauftragt: false, nichtInteressiert: false };
  assertEquals(vorAbsendenStopp({ ...basis, meilenstein: "none" }), null);
  assertEquals(vorAbsendenStopp({ ...basis, meilenstein: "portal_opened" }), null);
  assertEquals(vorAbsendenStopp({ ...basis, meilenstein: "patient_data_saved" }), "patient_data_saved");
  assertEquals(vorAbsendenStopp({ ...basis, meilenstein: "caregiver_invited" }), "caregiver_invited");
  assertEquals(vorAbsendenStopp({ beauftragt: true, nichtInteressiert: false, meilenstein: "none" }), "betreuung_beauftragt");
  assertEquals(vorAbsendenStopp({ beauftragt: false, nichtInteressiert: true, meilenstein: "none" }), "nicht_interessiert");
});

Deno.test("Erinnerungsstufen: neue und alte Typen", () => {
  assertEquals(erinnerungStufe("application_erinnerung_1"), "1");
  assertEquals(erinnerungStufe("application_erinnerung_2"), "2");
  assertEquals(erinnerungStufe("application_erinnerung_letzte"), "letzte");
  assertEquals(erinnerungStufe("application_reminder"), "1");
  assertEquals(erinnerungStufe("application_reminder_12h"), "1");
  assertEquals(erinnerungStufe("application_last_chance"), "letzte");
  assertEquals(erinnerungStufe("interest_reminder"), null);
  // Präfix application_ bleibt (bewertung.ts hält die Bewertungsanfrage zurück).
  for (const t of ["application_erinnerung_1", "application_erinnerung_2", "application_erinnerung_letzte"]) assert(t.startsWith("application_"));
});

Deno.test("Reservierung endet 72 h nach dem ERSTEN Eingang, auf die volle Stunde abgerundet", () => {
  const erster = Date.parse("2026-09-26T13:47:12Z");
  assertEquals(reservierungsEnde([erster + 5 * H, erster])!.toISOString(), "2026-09-29T13:00:00.000Z");
  assertEquals(reservierungsEnde([]), null);
  // metadata.reserviert_bis hat Vorrang
  assertEquals(reserviertBisAus("2026-09-29T20:00:00.000Z", [erster])!.toISOString(), "2026-09-29T20:00:00.000Z");
  assertEquals(reserviertBisAus(null, [erster])!.toISOString(), "2026-09-29T13:00:00.000Z");
  assertEquals(reserviertBisAus("kaputt", []), null);
});

Deno.test("Countdown-Text", () => {
  assertEquals(reserviertRest(52 * H), "noch 2 Tage");
  assertEquals(reserviertRest(47.6 * H), "noch 2 Tage");
  assertEquals(reserviertRest(24 * H - 4 * 60 * 1000), "noch 24 Stunden");
  assertEquals(reserviertRest(8 * H), "noch 8 Stunden");
  assertEquals(reserviertRest(1.2 * H), "noch 1 Stunde");
});

Deno.test("Erinnerung entfällt: abgelaufen, zu dicht, doppelt", () => {
  const ok = { restMs: 30 * H, seitLetzterMailMs: 20 * H, letzteSchonGesendet: false };
  assertEquals(erinnerungStopp({ stufe: "1", ...ok }), null);
  assertEquals(erinnerungStopp({ stufe: "1", ...ok, restMs: 0.5 * H }), "reservierung_abgelaufen");
  assertEquals(erinnerungStopp({ stufe: "letzte", ...ok, restMs: -H }), "reservierung_abgelaufen");
  // 8-Uhr-Stau: alte +4 h-Zeile kurz nach der +1 h-Zeile
  assertEquals(erinnerungStopp({ stufe: "1", ...ok, seitLetzterMailMs: 2 * H }), "zu_dicht");
  // die letzte Erinnerung fällt nie wegen Nähe weg …
  assertEquals(erinnerungStopp({ stufe: "letzte", ...ok, seitLetzterMailMs: 2 * H }), null);
  // … aber nie zweimal
  assertEquals(erinnerungStopp({ stufe: "letzte", ...ok, letzteSchonGesendet: true }), "doppelt");
  // ohne bekanntes Ende: kein Abbruch wegen Ablauf
  assertEquals(erinnerungStopp({ stufe: "2", ...ok, restMs: null }), null);
});

Deno.test("Genitiv", () => {
  assertEquals(genitiv("Maria"), "Marias");
  assertEquals(genitiv("Agnes"), "Agnes'");
  assertEquals(genitiv("Beatrix"), "Beatrix'");
});

Deno.test("Neue Pflegekräfte: nicht nachts, nicht während einer Reservierung", () => {
  const tag = new Date("2026-09-26T10:00:00Z"); // 12:00 Berlin
  const basis = { jetzt: tag, beauftragt: false, nichtInteressiert: false, reagiertSeitAnlage: false, reservierungAktiv: false };
  assertEquals(neuePflegekraefteEntscheidung(basis), { aktion: "senden" });
  assertEquals(neuePflegekraefteEntscheidung({ ...basis, reservierungAktiv: true }), { aktion: "abbrechen", grund: "reservierung_aktiv" });
  assertEquals(neuePflegekraefteEntscheidung({ ...basis, reagiertSeitAnlage: true }), { aktion: "abbrechen", grund: "reaction_received" });
  const nachts = neuePflegekraefteEntscheidung({ ...basis, jetzt: new Date("2026-09-26T22:30:00Z") }); // 00:30 Berlin
  assertEquals(nachts.aktion, "verschieben");
  if (nachts.aktion === "verschieben") assertEquals(nachts.bis.toISOString(), "2026-09-27T06:00:00.000Z");
});

Deno.test("Aktive Reservierung: echte Bewerbung < 72 h ohne Antwort", () => {
  const jetzt = new Date("2026-09-26T10:00:00Z");
  const vor = (h: number) => new Date(jetzt.getTime() - h * H).toISOString();
  const ein = (cg: number, h: number, extra: Record<string, unknown> = {}) =>
    ({ event_type: "application_received", created_at: vor(h), metadata: { caregiver_id: cg, ...extra } });
  assert(reservierungAktiv([ein(1, 10)], jetzt));
  assert(!reservierungAktiv([ein(1, 80)], jetzt));
  assert(!reservierungAktiv([ein(1, 10, { seeded: true })], jetzt));
  assert(!reservierungAktiv([ein(1, 10), { event_type: "application_rejected", created_at: vor(1), metadata: { caregiver_id: 1 } }], jetzt));
  assert(reservierungAktiv([ein(1, 10), ein(2, 5), { event_type: "application_accepted_internal", created_at: vor(1), metadata: { caregiver_id: 1 } }], jetzt));
});

Deno.test("Stand nach 2 Tagen entfällt mit Bewerbung oder neuem Interesse", () => {
  const basis = { beauftragt: false, nichtInteressiert: false, bewerbungDa: false, interesseSeitAnlage: false };
  assertEquals(sucheStandStopp(basis), null);
  assertEquals(sucheStandStopp({ ...basis, bewerbungDa: true }), "bewerbung_da");
  assertEquals(sucheStandStopp({ ...basis, interesseSeitAnlage: true }), "interesse_da");
  assertEquals(sucheStandStopp({ ...basis, beauftragt: true }), "betreuung_beauftragt");
});

// ── Registry #126: Reaktion je Bewerbung ──────────────────────────────────

// PROD-Verlauf Kundin 52dc3e9d, Pflegekraft 15184 (Job 38118), wörtlich aus lead_events:
// Absage aus dem Portal mit application_id als TEXT und ohne Job, Eingänge mit Zahl und Job.
const FALL_52DC: LeadEreignis[] = [
  { event_type: "application_received", created_at: "2026-10-14T14:17:00.779Z", metadata: { caregiver_id: 15184, application_id: 14728, mamamia_job_offer_id: 38118 } },
  { event_type: "application_rejected", created_at: "2026-10-14T14:33:37.332Z", metadata: { caregiver_id: 15184, application_id: "14728" } },
  { event_type: "application_received", created_at: "2026-10-15T09:18:15.916Z", metadata: { caregiver_id: 15184, application_id: 14746, mamamia_job_offer_id: 38118 } },
];

Deno.test("Reaktion je Bewerbung: Absage der alten Bewerbung gilt nicht für die neue (Fall 52dc3e9d)", () => {
  assertEquals(reaktionAufBewerbung(FALL_52DC, { caregiverId: 15184, applicationId: 14746 }), false);
  assertEquals(reaktionAufBewerbung(FALL_52DC, { caregiverId: "15184", applicationId: "14746" }), false);
  // Die alte Bewerbung selbst ist beantwortet.
  assertEquals(reaktionAufBewerbung(FALL_52DC, { caregiverId: 15184, applicationId: 14728 }), true);
  // Altzeile ohne application_id: wie bisher je Pflegekraft.
  assertEquals(reaktionAufBewerbung(FALL_52DC, { caregiverId: 15184 }), true);
  assertEquals(reaktionAufBewerbung(FALL_52DC, { caregiverId: 15184, applicationId: null }), true);
});

Deno.test("Reaktion je Bewerbung: Absage der NEUEN Bewerbung zählt (gleiche id oder später)", () => {
  const mitAbsage = [...FALL_52DC, { event_type: "application_rejected", created_at: "2026-10-16T08:00:00Z", metadata: { caregiver_id: 15184, application_id: "14746" } }];
  assertEquals(reaktionAufBewerbung(mitAbsage, { caregiverId: 15184, applicationId: 14746 }), true);
  // Annahme des Annahme-Detektors (ohne application_id) NACH dem Eingang zählt …
  const annahme = (zeit: string): LeadEreignis => ({ event_type: "application_accepted_internal", created_at: zeit, metadata: { caregiver_id: 15184, mamamia_job_offer_id: 38118 } });
  assertEquals(reaktionAufBewerbung([...FALL_52DC, annahme("2026-10-15T12:00:00Z")], { caregiverId: 15184, applicationId: 14746 }), true);
  // … VOR dem Eingang nicht.
  assertEquals(reaktionAufBewerbung([...FALL_52DC, annahme("2026-10-15T09:00:00Z")], { caregiverId: 15184, applicationId: 14746 }), false);
  // Gleiche application_id zählt auch mit schiefem Zeitstempel.
  const schief: LeadEreignis = { event_type: "application_rejected", created_at: "2026-10-15T09:18:00Z", metadata: { caregiver_id: 15184, application_id: 14746 } };
  assertEquals(reaktionAufBewerbung([...FALL_52DC, schief], { caregiverId: 15184, applicationId: 14746 }), true);
});

Deno.test("Reaktion je Bewerbung: andere Pflegekräfte zählen nie, ohne Reaktion nie", () => {
  const fremd: LeadEreignis = { event_type: "application_rejected", created_at: "2026-10-16T08:00:00Z", metadata: { caregiver_id: 32527, application_id: 14789 } };
  assertEquals(reaktionAufBewerbung([...FALL_52DC.filter((e) => e.event_type === "application_received"), fremd], { caregiverId: 15184, applicationId: 14746 }), false);
  assertEquals(reaktionAufBewerbung([], { caregiverId: 15184, applicationId: 14746 }), false);
  assertEquals(reaktionAufBewerbung([], { caregiverId: 15184 }), false);
});

Deno.test("Reaktion je Bewerbung: Eingang unauffindbar ⇒ wie bisher (im Zweifel keine Mail)", () => {
  // Zeile kennt 99999, aber kein application_received dazu (nur ein still erfasstes zählt nicht).
  const ohneEingang: LeadEreignis[] = [
    { event_type: "application_received", created_at: "2026-10-15T09:18:15Z", metadata: { caregiver_id: 15184, application_id: 99999, seeded: true } },
    { event_type: "application_rejected", created_at: "2026-10-14T14:33:37Z", metadata: { caregiver_id: 15184, application_id: "14728" } },
  ];
  assertEquals(eingangDerBewerbung(ohneEingang, 99999), null);
  assertEquals(reaktionAufBewerbung(ohneEingang, { caregiverId: 15184, applicationId: 99999 }), true);
  assertEquals(eingangDerBewerbung(FALL_52DC, 14746), Date.parse("2026-10-15T09:18:15.916Z"));
});

Deno.test("Aktive Reservierung je Bewerbung: neue Bewerbung nach Absage ist reserviert", () => {
  const jetzt = new Date("2026-10-16T10:00:00Z");
  // Neue Bewerbung 14746 (vor 25 h) ist offen, obwohl die Kraft für 14728 abgesagt wurde.
  assert(reservierungAktiv(FALL_52DC, jetzt));
  // Nach der Absage auch der neuen: nichts mehr reserviert.
  assert(!reservierungAktiv([...FALL_52DC, { event_type: "application_rejected", created_at: "2026-10-16T09:00:00Z", metadata: { caregiver_id: 15184, application_id: 14746 } }], jetzt));
  // Eingänge ohne application_id (vor Registry #35): wie bisher je Pflegekraft.
  const alt: LeadEreignis[] = [
    { event_type: "application_received", created_at: "2026-10-15T09:18:15Z", metadata: { caregiver_id: 15184 } },
    { event_type: "application_rejected", created_at: "2026-10-14T14:33:37Z", metadata: { caregiver_id: 15184 } },
  ];
  assert(!reservierungAktiv(alt, jetzt));
});
