// Abschied für laufende Kunden nachholen (Registry #168): Datenbank-Seite (abschied.ts) mit nachgebautem Supabase-Client
// und die Verdrahtung in index.ts als Quelltext-Wächter (index.ts startet beim Import einen Server). Anlass: Prüfung
// 15.11.2026, vorher war nur die reine Regel (kette.ts abschiedNachholen) getestet.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { abschiedNachholenFuer } from "../abschied.ts";
import { ABSCHIED_SATZ, KETTE_NACH_MAIL1 } from "../kette.ts";
import { sendezeitIso } from "../quietHours.ts";

type Aufruf = { tabelle: string; art: "select" | "insert"; filter: Record<string, unknown>; daten?: Record<string, unknown> };

/** Kleiner Supabase-Nachbau: select(...).eq().eq() liefert `zeilen` bzw. `lesefehler`, insert() liefert `schreibfehler`. */
function fakeSupabase(o: { zeilen?: unknown[]; lesefehler?: unknown; schreibfehler?: unknown } = {}) {
  const aufrufe: Aufruf[] = [];
  const client = {
    from(tabelle: string) {
      return {
        select(_spalten: string) {
          const a: Aufruf = { tabelle, art: "select", filter: {} };
          aufrufe.push(a);
          const kette = {
            eq(feld: string, wert: unknown) {
              a.filter[feld] = wert;
              return kette;
            },
            then(ok: (r: unknown) => unknown, nein?: (e: unknown) => unknown) {
              const r = o.lesefehler ? { data: null, error: o.lesefehler } : { data: o.zeilen ?? [], error: null };
              return Promise.resolve(r).then(ok, nein);
            },
          };
          return kette;
        },
        insert(daten: Record<string, unknown>) {
          aufrufe.push({ tabelle, art: "insert", filter: {}, daten });
          return Promise.resolve({ data: null, error: o.schreibfehler ?? null });
        },
      };
    },
  };
  return { client, aufrufe };
}

const ROW = { email_type: "nachfass_2", created_at: "2026-11-14T10:00:00.000Z" };
const LEAD = { id: "lead-1", email: "kundin@beispiel.de" };
// Dienstag 17.11.2026, 10:00 Berlin (09:00 UTC): außerhalb der Nachtruhe.
const TAG = new Date("2026-11-17T09:00:00.000Z");
// Dienstag 17.11.2026, 23:30 Berlin: Nachtruhe, Zeile erst am Morgen um 8.
const NACHT = new Date("2026-11-17T22:30:00.000Z");

Deno.test("Abschied nachholen: legt genau eine nachfass_3-Zeile an und meldet ihre Sendezeit", async () => {
  const { client, aufrufe } = fakeSupabase();
  const zeit = await abschiedNachholenFuer(client, ROW, LEAD, TAG);
  assertEquals(zeit, sendezeitIso(TAG));
  const inserts = aufrufe.filter((a) => a.art === "insert");
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].tabelle, "scheduled_emails");
  assertEquals(inserts[0].daten, {
    lead_id: "lead-1", email_type: "nachfass_3", recipient_email: "kundin@beispiel.de", scheduled_for: zeit, status: "pending",
  });
  // Gelesen wird nur der Abschied dieses Leads.
  const lesen = aufrufe.find((a) => a.art === "select")!;
  assertEquals(lesen.filter, { lead_id: "lead-1", email_type: "nachfass_3" });
});

Deno.test("Abschied nachholen: Nachtruhe wie scheduleFollowUp", async () => {
  const { client } = fakeSupabase();
  const zeit = await abschiedNachholenFuer(client, ROW, LEAD, NACHT);
  assertEquals(zeit, sendezeitIso(NACHT));
  assert(zeit !== NACHT.toISOString(), "nachts angelegt, aber erst morgens fällig");
});

Deno.test("Abschied nachholen: Anker ist created_at der verfallenden Zeile", async () => {
  // Abschied der alten Runde (vor dem Anker) zählt nicht: nachholen.
  const alt = fakeSupabase({ zeilen: [{ status: "sent", created_at: "2026-09-01T09:00:00Z", sent_at: "2026-09-03T09:00:00Z" }] });
  assert(await abschiedNachholenFuer(alt.client, ROW, LEAD, TAG));
  // Derselbe Abschied, aber die verfallende Zeile ist älter: gehört zu dieser Runde, nicht nachholen.
  const gleich = fakeSupabase({ zeilen: [{ status: "sent", created_at: "2026-09-01T09:00:00Z", sent_at: "2026-09-03T09:00:00Z" }] });
  assertEquals(await abschiedNachholenFuer(gleich.client, { ...ROW, created_at: "2026-08-30T09:00:00Z" }, LEAD, TAG), null);
  assertEquals(gleich.aufrufe.filter((a) => a.art === "insert").length, 0);
});

Deno.test("Abschied nachholen: nichts bei offenem Abschied, anderem Typ, fehlender Adresse", async () => {
  const offen = fakeSupabase({ zeilen: [{ status: "pending", created_at: "2026-11-14T10:00:00Z", sent_at: null }] });
  assertEquals(await abschiedNachholenFuer(offen.client, ROW, LEAD, TAG), null);
  assertEquals(offen.aufrufe.filter((a) => a.art === "insert").length, 0);

  const anderer = fakeSupabase();
  assertEquals(await abschiedNachholenFuer(anderer.client, { ...ROW, email_type: "warum_primundus" }, LEAD, TAG), null);
  assertEquals(anderer.aufrufe.length, 0);

  // recipient_email ist NOT NULL: ohne Adresse kein Insert, kein „abschied_eingeplant“.
  for (const email of [null, "", "  "]) {
    const ohne = fakeSupabase();
    assertEquals(await abschiedNachholenFuer(ohne.client, ROW, { id: "lead-1", email }, TAG), null, String(email));
    assertEquals(ohne.aufrufe.filter((a) => a.art === "insert").length, 0);
  }
});

Deno.test("Abschied nachholen: Lese- oder Schreibfehler ergeben null, nie eine Sendezeit", async () => {
  const lesen = fakeSupabase({ lesefehler: { message: "timeout" } });
  assertEquals(await abschiedNachholenFuer(lesen.client, ROW, LEAD, TAG), null);
  assertEquals(lesen.aufrufe.filter((a) => a.art === "insert").length, 0, "lieber kein Abschied als ein doppelter");

  const schreiben = fakeSupabase({ schreibfehler: { message: "null value in column \"recipient_email\"" } });
  assertEquals(await abschiedNachholenFuer(schreiben.client, ROW, LEAD, TAG), null);
});

// ── Verdrahtung in index.ts ────────────────────────────────────────────────────────────────────────────────────────────
const SRC = await Deno.readTextFile(new URL("../index.ts", import.meta.url));

Deno.test("Quelltext-Wächter: Gestrichen-Zweig holt den Abschied nach, erst nach Abmeldung und Pause", () => {
  assertStringIncludes(SRC, 'import { abschiedNachholenFuer } from "./abschied.ts";');
  const abmeldung = SRC.indexOf('metadata: { reason: "unsubscribed" }');
  const pause = SRC.indexOf('metadata: { reason: "pausiert", bis: pause.bis }');
  const gestrichen = SRC.indexOf("if (GESTRICHENE_MAILS.has(scheduledEmail.email_type)) {");
  const aufruf = SRC.indexOf("await abschiedNachholenFuer(supabase, scheduledEmail, lead as Lead)");
  for (const [name, i] of Object.entries({ abmeldung, pause, gestrichen, aufruf })) assert(i > 0, name);
  assert(abmeldung < gestrichen && pause < gestrichen, "Abmeldung und Pause vor dem Gestrichen-Zweig");
  assert(gestrichen < aufruf, "Aufruf im Gestrichen-Zweig");
  // Im selben Zweig und vor dessen continue; das Ereignis meldet die Sendezeit nur, wenn es eine gibt.
  const zweig = SRC.slice(gestrichen, SRC.indexOf("continue;", gestrichen));
  assertStringIncludes(zweig, "await abschiedNachholenFuer(supabase, scheduledEmail, lead as Lead)");
  assertStringIncludes(zweig, "...(abschied ? { abschied_eingeplant: abschied } : {})");
  // Nur EINE Stelle legt den Nachholer an (keine Kopie in index.ts).
  assertEquals(SRC.match(/abschiedNachholenFuer\(/g)?.length, 1);
});

Deno.test("Quelltext-Wächter: Abschied nur noch aus der Kette, nicht mehr nach dem Versand von nachfass_2", () => {
  assert(KETTE_NACH_MAIL1.some(([typ, min]) => typ === "nachfass_3" && min === 72 * 60));
  assert(!/scheduleFollowUp\([^)]*"nachfass_3"/.test(SRC), "keine zweite Planung von nachfass_3 in index.ts");
});

Deno.test("Quelltext-Wächter: Bewertungsanfrage ruht, sonst stimmt der Abschiedssatz nicht", () => {
  /* ABSCHIED_SATZ verspricht nach dem Abschied (+72 h) keine weitere Mail zu dieser Anfrage. runBewertungsRunde schickt
     an Tag 7 eine Bewertungsanfrage, hat aber keinen Schalter: Sie ruht nur, weil die Abfrage die 200 ältesten Leads
     seit dem Stichtag liest. Schlägt dieser Test an, wurde die Abfrage geändert: vorher mit Martin klären, ob Leads nach
     dem Abschied ausgenommen werden oder der Satz sich ändert (Regel Registry #70: Satz über künftige Mails steht neben
     der Kette, die ihn wahr macht). */
  assertStringIncludes(ABSCHIED_SATZ, "nicht mehr");
  const start = SRC.indexOf("async function runBewertungsRunde(");
  const rumpf = SRC.slice(start, SRC.indexOf("\n}\n", start));
  assert(start > 0);
  assertStringIncludes(rumpf, '.order("created_at", { ascending: true })');
  assertStringIncludes(rumpf, ".limit(200);");
  assertStringIncludes(SRC.slice(start - 1200, start), "ACHTUNG Abschiedssatz");
});
