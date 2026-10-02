// Registry #110: still zurückgezogene Bewerbung nach der Buchung.
// Fixtures = Einträge aus Mamamias Änderungsprotokoll (Prod, 02.10.2026),
// wörtlich bis auf Personennamen (Repo ist öffentlich).

import { assert, assertEquals } from "@std/assert";
import {
  brauchtWeitereSeite,
  GESCHWISTER_MARGE_MS,
  KARENZ_MS,
  type LogEintrag,
  rotiere,
  stilleRuecknahme,
  withdrawnAlarmIsLive,
} from "../stilleRuecknahme.ts";
import { checkStilleRuecknahmen, handleRequest, type HandlerDeps, type WatchedAcceptance } from "../index.ts";

const e = (
  logable_type: string,
  logable_id: number | string,
  title: string,
  created_at: string,
  custom_author_name: string,
  data: string | Record<string, unknown> | null,
): LogEintrag => ({ logable_type, logable_id, title, created_at, custom_author_name, data });

// MM-Kunde 10960, Job 37336 (Fall Hunkirchen).
const HUNKIRCHEN: LogEintrag[] = [
  e("application", 13734, "application_created", "2026-09-24T12:06:49.000000Z", "Rekruterin B.", "{\"employee\": \"Rekruterin B.\", \"created_at\": \"2026-09-24 14:06:48\"}"),
  e("confirmation", 5089, "confirmation_created", "2026-09-24T17:43:53.000000Z", "Kunden Portal", "{\"caregiver\": null, \"arrival_at\": \"2026-10-01\", \"departure_at\": \"2026-11-20\"}"),
  e("application", 13681, "application_rejected", "2026-09-24T17:43:53.000000Z", "Kunden P.", "{\"reject_type\": \"serviceAgency\", \"rejected_at\": \"2026-09-24 19:43:53\", \"reject_message\": \"Zaakceptowano inną wklejkę na to zlecenie\"}"),
  e("confirmation", 5089, "confirmation_rejected", "2026-09-25T12:03:40.000000Z", "System", "{\"caregiver\": null, \"reject_type\": \"caregiverAgency\", \"reject_message\": \"pk hat Amttermin, kann nicht kommen\"}"),
  e("application", 13824, "application_created", "2026-09-28T06:44:48.000000Z", "Rekruterin A.", "{\"employee\": \"Rekruterin A.\", \"created_at\": \"2026-09-28 08:44:47\"}"),
  e("application", 13841, "application_created", "2026-09-28T09:17:08.000000Z", "Rekruter C.", "{\"employee\": \"Rekruter C.\", \"created_at\": \"2026-09-28 11:17:07\"}"),
  e("confirmation", 5122, "confirmation_created", "2026-09-28T09:33:33.000000Z", "Kunden Portal", "{\"caregiver\": null, \"arrival_at\": \"2026-10-01\", \"departure_at\": \"2026-11-20\"}"),
  e("application", 13841, "application_rejected", "2026-09-28T09:33:33.000000Z", "Kunden P.", "{\"reject_type\": \"serviceAgency\", \"rejected_at\": \"2026-09-28 11:33:33\", \"reject_message\": \"Zaakceptowano inną wklejkę na to zlecenie\"}"),
  e("application", 13824, "application_rejected", "2026-09-28T09:34:01.000000Z", "Rekruterin A.", "{\"reject_type\": \"caregiverAgency\", \"rejected_at\": \"2026-09-28 11:33:59\", \"reject_message\": \"Die PK hat abgesagt.\"}"),
];
const ZEILE_5122 = { application_id: 13824, mamamia_confirmation_id: 5122, accepted_at: "2026-09-28 09:33:26.889048+00" };
const ZEILE_5089 = { application_id: 13734, mamamia_confirmation_id: 5089, accepted_at: "2026-09-24 17:43:46.622712+00" };
const T_R_5122 = Date.parse("2026-09-28T09:34:01Z");
const SPAETER = T_R_5122 + KARENZ_MS + 60_000;

// MM-Kunde 9753 (Fall Berg, Registry #78): fremd adoptierte Confirmation 4296, 13074 verfiel nach 72 h.
const BERG: LogEintrag[] = [
  e("confirmation", 4296, "confirmation_created", "2026-08-05T11:20:09.000000Z", "Team SA", "{\"caregiver\": null, \"arrival_at\": \"2026-08-17\", \"departure_at\": \"2026-09-28\"}"),
  e("confirmation", 4296, "confirmation_dates_changed", "2026-09-07T08:49:17.000000Z", "Team SA", "{\"caregiver\": null, \"departure_at\": {\"new\": \"2026-10-04\", \"old\": \"2026-09-28\"}}"),
  e("application", 13074, "application_created", "2026-09-14T12:05:45.000000Z", "Rekruterin D.", "{\"employee\": \"Rekruterin D.\", \"created_at\": \"2026-09-14 14:05:44\"}"),
  e("confirmation", 4296, "confirmation_updated", "2026-09-15T13:05:09.000000Z", "Kunden Portal", "{\"caregiver\": null, \"application_id\": {\"new\": 13074, \"old\": 11198}}"),
  e("application", 13074, "application_rejected", "2026-09-17T12:30:09.000000Z", "System", "{\"reject_type\": null, \"rejected_at\": \"2026-09-17 14:30:09\", \"reject_message\": \"Application expired after 72 hours\"}"),
  e("confirmation", 4296, "confirmation_dates_changed", "2026-09-25T12:39:58.000000Z", "Team SA", "{\"caregiver\": null, \"departure_at\": {\"new\": \"2026-10-09\", \"old\": \"2026-10-04\"}}"),
];

// Synthetischer Kunde: Buchung C=900 für A=800, angenommen um 10:00:00.
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", ".000000Z");
const T0 = Date.parse("2026-10-01T10:00:00Z");
const ZEILE_800 = { application_id: 800, mamamia_confirmation_id: 900, accepted_at: "2026-10-01 10:00:00+00" };
const gebucht = (tC = T0 + 7_000): LogEintrag[] => [
  e("confirmation", 900, "confirmation_created", iso(tC), "Kunden Portal", null),
];
const abgesagt = (t: number): LogEintrag => e("application", 800, "application_rejected", iso(t), "Rekruterin", { reject_type: "caregiverAgency", reject_message: "x" });
const LANGE_DANACH = T0 + 10 * KARENZ_MS;

// ─── Regel ─────────────────────────────────────────────────────────────────

Deno.test("Hunkirchen 13824/5122: Bewerbung kurz nach der Buchung abgelehnt, Buchung nie storniert ⇒ Treffer", () => {
  const p = stilleRuecknahme(HUNKIRCHEN, ZEILE_5122, SPAETER);
  assertEquals(p.treffer, {
    rejected_at: "2026-09-28T09:34:01.000Z",
    von: "Rekruterin A.",
    reject_type: "caregiverAgency",
    reject_message: "Die PK hat abgesagt.",
    confirmation_created_at: "2026-09-28T09:33:33.000Z",
  });
  assertEquals(p.unbekannt, []);
});

Deno.test("Karenz: vor 60 min still, ab genau 60 min Treffer", () => {
  assertEquals(stilleRuecknahme(HUNKIRCHEN, ZEILE_5122, T_R_5122 + KARENZ_MS - 1).treffer, null);
  assert(stilleRuecknahme(HUNKIRCHEN, ZEILE_5122, T_R_5122 + KARENZ_MS).treffer !== null);
});

Deno.test("Hunkirchen 13734/5089: bewusstes Storno (confirmation_rejected) ⇒ still", () => {
  assertEquals(stilleRuecknahme(HUNKIRCHEN, ZEILE_5089, SPAETER), { treffer: null, unbekannt: [] });
});

Deno.test("Geschwister-Absage in derselben Sekunde wie die Buchung ⇒ still", () => {
  const zeile = { application_id: 13841, mamamia_confirmation_id: 5122, accepted_at: ZEILE_5122.accepted_at };
  assertEquals(stilleRuecknahme(HUNKIRCHEN, zeile, SPAETER).treffer, null);
});

Deno.test("Berg 13074/4296: adoptierte Fremd-Confirmation (vor der Unterschrift angelegt) ⇒ still", () => {
  const zeile = { application_id: 13074, mamamia_confirmation_id: 4296, accepted_at: "2026-09-15 13:05:02.317751+00" };
  assertEquals(stilleRuecknahme(BERG, zeile, Date.parse("2026-10-02T12:00:00Z")).treffer, null);
});

Deno.test("Regel 2: Buchung genau 2 min vor der Unterschrift zählt, 1 s früher nicht", () => {
  const spaeteAbsage = abgesagt(T0 + 60_000);
  assert(stilleRuecknahme([...gebucht(T0 - 120_000), spaeteAbsage], ZEILE_800, LANGE_DANACH).treffer !== null);
  assertEquals(stilleRuecknahme([...gebucht(T0 - 121_000), spaeteAbsage], ZEILE_800, LANGE_DANACH).treffer, null);
});

Deno.test("Regel 4: Absage genau 5 s nach der Buchung still, 6 s danach Treffer", () => {
  const tC = T0 + 7_000;
  assertEquals(stilleRuecknahme([...gebucht(tC), abgesagt(tC + GESCHWISTER_MARGE_MS)], ZEILE_800, LANGE_DANACH).treffer, null);
  assert(stilleRuecknahme([...gebucht(tC), abgesagt(tC + GESCHWISTER_MARGE_MS + 1_000)], ZEILE_800, LANGE_DANACH).treffer !== null);
});

Deno.test("Regel 4: Bewerbung war schon vor der Buchung weg (Neubuchung nach T+0-Alarm) ⇒ still, auch mit späterer Absage", () => {
  const tC = T0 + 3_600_000;
  const p = stilleRuecknahme([...gebucht(tC), abgesagt(T0 + 30_000), abgesagt(tC + 600_000)], ZEILE_800, LANGE_DANACH);
  assertEquals(p.treffer, null);
});

Deno.test("Regel 3: confirmation_updated hängt C auf eine andere Bewerbung ⇒ still", () => {
  const umgehaengt = e("confirmation", 900, "confirmation_updated", iso(T0 + 20_000), "Team SA", "{\"application_id\": {\"new\": 801, \"old\": 800}}");
  assertEquals(stilleRuecknahme([...gebucht(), umgehaengt, abgesagt(T0 + 60_000)], ZEILE_800, LANGE_DANACH).treffer, null);
});

Deno.test("Regel 3: confirmation_updated ohne application_id (z. B. Datei) ⇒ ignoriert, Treffer bleibt", () => {
  const datei = e("confirmation", 900, "confirmation_updated", iso(T0 + 20_000), "Kunden Portal", { caregiver: null });
  assert(stilleRuecknahme([...gebucht(), datei, abgesagt(T0 + 60_000)], ZEILE_800, LANGE_DANACH).treffer !== null);
});

Deno.test("Regel 3: data nicht parsebar ⇒ still", () => {
  const kaputt = e("confirmation", 900, "confirmation_updated", iso(T0 + 20_000), "Kunden Portal", "{kaputt");
  const p = stilleRuecknahme([...gebucht(), kaputt, abgesagt(T0 + 60_000)], ZEILE_800, LANGE_DANACH);
  assertEquals(p.treffer, null);
  assertEquals(p.unbekannt, ["confirmation:confirmation_updated:data"]);
});

Deno.test("Regel 3: unbekannter Titel an C ⇒ still + gemeldet", () => {
  const neu = e("confirmation", 900, "confirmation_deleted", iso(T0 + 20_000), "System", null);
  const p = stilleRuecknahme([...gebucht(), neu, abgesagt(T0 + 60_000)], ZEILE_800, LANGE_DANACH);
  assertEquals(p, { treffer: null, unbekannt: ["confirmation:confirmation_deleted"] });
});

Deno.test("unbekannter Titel an A nach der Buchung ⇒ nur gemeldet, Treffer bleibt", () => {
  const neu = e("application", 800, "application_deleted", iso(T0 + 30_000), "System", null);
  const p = stilleRuecknahme([...gebucht(), neu, abgesagt(T0 + 60_000)], ZEILE_800, LANGE_DANACH);
  assert(p.treffer !== null);
  assertEquals(p.unbekannt, ["application:application_deleted"]);
});

Deno.test("logable_id als String und Mikrosekunden-Zeiten ⇒ gleiche Auswertung", () => {
  const alsString = HUNKIRCHEN.map((x) => ({ ...x, logable_id: String(x.logable_id) }));
  assert(stilleRuecknahme(alsString, ZEILE_5122, SPAETER).treffer !== null);
});

Deno.test("Anker-Zeile (A === C) und Zeile ohne Confirmation ⇒ still", () => {
  assertEquals(stilleRuecknahme(HUNKIRCHEN, { ...ZEILE_5122, application_id: 5122 }, SPAETER).treffer, null);
  assertEquals(stilleRuecknahme(HUNKIRCHEN, { ...ZEILE_5122, mamamia_confirmation_id: null }, SPAETER).treffer, null);
});

// ─── Blättern, Rotation, Schalter ──────────────────────────────────────────

Deno.test("brauchtWeitereSeite: Ende, ausreichend alt, leer ⇒ nein; zu jung und mehr da ⇒ ja", () => {
  const seite = [e("application", 1, "application_created", "2026-09-28T09:00:00.000000Z", "x", null)];
  const grenze = Date.parse("2026-09-20T00:00:00Z");
  assertEquals(brauchtWeitereSeite(seite, 100, 100, grenze), false);
  assertEquals(brauchtWeitereSeite(seite, 1, 150, Date.parse("2026-09-29T00:00:00Z")), false);
  assertEquals(brauchtWeitereSeite([], 0, 150, grenze), false);
  assertEquals(brauchtWeitereSeite(seite, 100, 150, grenze), true);
});

Deno.test("rotiere: leer bleibt leer, Start wandert alle 15 min", () => {
  assertEquals(rotiere([], 0), []);
  const takt = 15 * 60_000;
  assertEquals(rotiere([1, 2, 3], 0), [1, 2, 3]);
  assertEquals(rotiere([1, 2, 3], 1 * takt), [2, 3, 1]);
  assertEquals(rotiere([1, 2, 3], 5 * takt), [3, 1, 2]);
});

Deno.test("withdrawnAlarmIsLive: nur „1“/„true“ schalten scharf", () => {
  const vorher = Deno.env.get("WITHDRAWN_ALARM_LIVE");
  try {
    for (const [wert, live] of [["1", true], ["true", true], [" TRUE ", true], ["0", false], ["false", false], ["yes", false], ["", false]] as const) {
      Deno.env.set("WITHDRAWN_ALARM_LIVE", wert);
      assertEquals(withdrawnAlarmIsLive(), live, `Wert ${JSON.stringify(wert)}`);
    }
    Deno.env.delete("WITHDRAWN_ALARM_LIVE");
    assertEquals(withdrawnAlarmIsLive(), false);
  } finally {
    if (vorher === undefined) Deno.env.delete("WITHDRAWN_ALARM_LIVE");
    else Deno.env.set("WITHDRAWN_ALARM_LIVE", vorher);
  }
});

// ─── Phase im Cron ─────────────────────────────────────────────────────────

const SECRETS = {
  supabaseUrl: "https://supa.example",
  supabaseServiceKey: "srv",
  mamamiaEndpoint: "https://mm.example/graphql",
  mamamiaAuthEndpoint: "https://mm.example/graphql/auth",
  mamamiaAgencyEmail: "a@e",
  mamamiaAgencyPassword: "pw",
  kostenrechnerUrl: "https://kr.example",
};

interface Netz {
  fetch: typeof fetch;
  logCalls: Array<{ kunde: number; seite: number }>;
  posts: Array<{ auth: string | null; body: Record<string, unknown> }>;
}

// Protokoll je MM-Kunde; `fehler` = Kunden, deren Abfrage mit HTTP 500 scheitert.
function netz(opts: {
  protokoll: Record<number, LogEintrag[]>;
  total?: Record<number, number>;
  fehler?: number[];
  bridge?: { status: number; body?: Record<string, unknown> };
  vorJedemAufruf?: () => void;
}): Netz {
  const n: Netz = { fetch: undefined as unknown as typeof fetch, logCalls: [], posts: [] };
  n.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.endsWith("/graphql/auth")) {
      return Response.json({ data: { LoginAgency: { id: 1, name: "P", email: "x", token: "agency-jwt" } } });
    }
    if (url.endsWith("/api/lead-event")) {
      n.posts.push({ auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
      const b = opts.bridge ?? { status: 200, body: { ok: true } };
      return Response.json(b.body ?? {}, { status: b.status });
    }
    const { variables } = JSON.parse(String(init?.body)) as { variables: { id: number; limit: number; page: number } };
    opts.vorJedemAufruf?.();
    n.logCalls.push({ kunde: variables.id, seite: variables.page });
    if (opts.fehler?.includes(variables.id)) return new Response("boom", { status: 500 });
    const alle = [...(opts.protokoll[variables.id] ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const data = alle.slice((variables.page - 1) * variables.limit, variables.page * variables.limit);
    return Response.json({ data: { CustomerLogsWithPagination: { total: opts.total?.[variables.id] ?? alle.length, data } } });
  }) as typeof fetch;
  return n;
}

const zeile = (z: Partial<WatchedAcceptance> & Pick<WatchedAcceptance, "application_id" | "mamamia_confirmation_id" | "accepted_at">): WatchedAcceptance => ({
  lead_id: "lead-h",
  caregiver_id: 16414,
  lead_token: "tok-h",
  lead_mamamia_customer_id: 10960,
  ...z,
});

function deps(n: Netz, zeilen: WatchedAcceptance[] | (() => Promise<WatchedAcceptance[]>), nowFn: () => number = () => SPAETER): HandlerDeps {
  return {
    secrets: SECRETS,
    fetchFn: n.fetch,
    nowFn,
    supabase: {
      selectWatchedAcceptances: typeof zeilen === "function" ? zeilen : () => Promise.resolve(zeilen),
    },
  } as unknown as HandlerDeps;
}

async function mitSchalter<T>(wert: string | undefined, f: () => Promise<T>): Promise<T> {
  const vorher = Deno.env.get("WITHDRAWN_ALARM_LIVE");
  if (wert === undefined) Deno.env.delete("WITHDRAWN_ALARM_LIVE");
  else Deno.env.set("WITHDRAWN_ALARM_LIVE", wert);
  try {
    return await f();
  } finally {
    if (vorher === undefined) Deno.env.delete("WITHDRAWN_ALARM_LIVE");
    else Deno.env.set("WITHDRAWN_ALARM_LIVE", vorher);
  }
}

const HUNKIRCHEN_ZEILEN = [zeile(ZEILE_5122), zeile({ ...ZEILE_5089, caregiver_id: 12437 })];

Deno.test("Phase im Dry-Run: Treffer gezählt, KEIN Bridge-POST", async () => {
  const n = netz({ protokoll: { 10960: HUNKIRCHEN } });
  const r = await mitSchalter(undefined, () => checkStilleRuecknahmen(deps(n, HUNKIRCHEN_ZEILEN)));
  assertEquals(r.hits, 1);
  assertEquals(r.alerts, 0);
  assertEquals(r.rows_geprueft, 2);
  assertEquals(n.posts.length, 0);
});

Deno.test("Phase scharf: genau ein POST mit Service-Role, Event und Metadaten", async () => {
  const n = netz({ protokoll: { 10960: HUNKIRCHEN } });
  const r = await mitSchalter("1", () => checkStilleRuecknahmen(deps(n, HUNKIRCHEN_ZEILEN)));
  assertEquals(r.alerts, 1);
  assertEquals(n.posts.length, 1);
  const { auth, body } = n.posts[0];
  assertEquals(auth, "Bearer srv");
  assertEquals(body.event, "acceptance_withdrawn_alarm");
  assertEquals(body.token, "tok-h");
  const m = body.metadata as Record<string, unknown>;
  assertEquals(m.application_id, 13824);
  assertEquals(m.confirmation_id, 5122);
  assertEquals(m.rejected_at, "2026-09-28T09:34:01.000Z");
  assertEquals(m.reject_type, "caregiverAgency");
  assertEquals(m.source, "cron");
});

Deno.test("Phase scharf: Bridge meldet deduped ⇒ kein neuer Alarm gezählt", async () => {
  const n = netz({ protokoll: { 10960: HUNKIRCHEN }, bridge: { status: 200, body: { ok: true, deduped: true } } });
  const r = await mitSchalter("1", () => checkStilleRuecknahmen(deps(n, HUNKIRCHEN_ZEILEN)));
  assertEquals(r.alerts, 0);
  assertEquals(r.errors, 0);
  assertEquals(n.posts.length, 1);
});

Deno.test("Phase scharf: Bridge 401/502 ⇒ Fehler gezählt, kein Throw", async () => {
  for (const status of [401, 502]) {
    const n = netz({ protokoll: { 10960: HUNKIRCHEN }, bridge: { status } });
    const r = await mitSchalter("1", () => checkStilleRuecknahmen(deps(n, HUNKIRCHEN_ZEILEN)));
    assertEquals(r.alerts, 0, `HTTP ${status}`);
    assertEquals(r.errors, 1, `HTTP ${status}`);
  }
});

Deno.test("Phase: ein Kunde wirft ⇒ der andere wird trotzdem geprüft", async () => {
  const n = netz({ protokoll: { 10960: HUNKIRCHEN }, fehler: [777] });
  const zeilen = [zeile({ ...ZEILE_800, lead_mamamia_customer_id: 777 }), ...HUNKIRCHEN_ZEILEN];
  const r = await mitSchalter(undefined, () => checkStilleRuecknahmen(deps(n, zeilen)));
  assertEquals(r.errors, 1);
  assertEquals(r.hits, 1);
});

Deno.test("Phase: ein MM-Kunde mit zwei Leads ⇒ EIN Protokoll-Aufruf, je Zeile ein POST mit eigenem Token", async () => {
  const zweiter: LogEintrag[] = [
    e("confirmation", 901, "confirmation_created", "2026-09-28T09:40:07.000000Z", "Kunden Portal", null),
    e("application", 801, "application_rejected", "2026-09-28T09:41:00.000000Z", "Rekruter", null),
  ];
  const n = netz({ protokoll: { 10960: [...HUNKIRCHEN, ...zweiter] } });
  const zeilen = [
    zeile(ZEILE_5122),
    zeile({ lead_id: "lead-2", lead_token: "tok-2", application_id: 801, mamamia_confirmation_id: 901, accepted_at: "2026-09-28 09:40:00+00" }),
  ];
  const r = await mitSchalter("1", () => checkStilleRuecknahmen(deps(n, zeilen, () => Date.parse("2026-09-28T12:00:00Z"))));
  assertEquals(n.logCalls.length, 1);
  assertEquals(r.alerts, 2);
  assertEquals(n.posts.map((p) => p.body.token).sort(), ["tok-2", "tok-h"]);
});

Deno.test("Phase: Zeilen ohne Token oder MM-Kunde ⇒ übersprungen, keine Abfrage", async () => {
  const n = netz({ protokoll: {} });
  const zeilen = [zeile({ ...ZEILE_5122, lead_token: null }), zeile({ ...ZEILE_5089, lead_mamamia_customer_id: null })];
  const r = await checkStilleRuecknahmen(deps(n, zeilen));
  assertEquals(r.skipped, 2);
  assertEquals(n.logCalls.length, 0);
});

Deno.test("Phase: Seite 1 reicht nicht zurück ⇒ Seite 2; ohne Abdeckung nach 5 Seiten ⇒ unvollständig, nicht ausgewertet", async () => {
  // 150 Einträge, alle jünger als die Abdeckungsgrenze: Seite 2 wird geholt und reicht (Ende erreicht).
  const fuell = Array.from({ length: 150 }, (_, i) =>
    e("application", 50_000 + i, "application_created", iso(Date.parse("2026-09-28T10:00:00Z") + i * 1000), "x", null));
  const n1 = netz({ protokoll: { 10960: [...HUNKIRCHEN, ...fuell] } });
  const r1 = await mitSchalter(undefined, () => checkStilleRuecknahmen(deps(n1, [zeile(ZEILE_5122)])));
  assertEquals(n1.logCalls.map((c) => c.seite), [1, 2]);
  assertEquals(r1.hits, 1);

  // Mamamia meldet viel mehr, als in 5 Seiten zurückreicht ⇒ unvollständig.
  const viel = Array.from({ length: 600 }, (_, i) =>
    e("application", 60_000 + i, "application_created", iso(Date.parse("2026-09-29T00:00:00Z") + i * 1000), "x", null));
  const n2 = netz({ protokoll: { 10960: [...HUNKIRCHEN, ...viel] } });
  const r2 = await mitSchalter(undefined, () => checkStilleRuecknahmen(deps(n2, [zeile(ZEILE_5122)])));
  assertEquals(n2.logCalls.length, 5);
  assertEquals(r2.unvollstaendig, 1);
  assertEquals(r2.rows_geprueft, 0);
  assertEquals(r2.hits, 0);
});

Deno.test("Phase: Budget erschöpft ⇒ Rest aufgeschoben (eingespielte Uhr)", async () => {
  let uhr = SPAETER;
  const n = netz({ protokoll: {}, vorJedemAufruf: () => { uhr += 11_000; } });
  const zeilen = [1, 2, 3, 4].map((k) => zeile({ ...ZEILE_800, lead_mamamia_customer_id: k }));
  const r = await checkStilleRuecknahmen(deps(n, zeilen, () => uhr));
  assertEquals(n.logCalls.length, 2);
  assertEquals(r.aufgeschoben, 2);
  assertEquals(r.errors, 0);
});

Deno.test("Phase: Rotation — Startkunde wandert mit dem 15-min-Takt", async () => {
  const takt = 15 * 60_000;
  const zeilen = [11, 12, 13].map((k) => zeile({ ...ZEILE_800, lead_mamamia_customer_id: k }));
  const n = netz({ protokoll: {} });
  await checkStilleRuecknahmen(deps(n, zeilen, () => 4 * takt));
  assertEquals(n.logCalls.map((c) => c.kunde), [12, 13, 11]);
});

Deno.test("Phase: Laden der Zeilen scheitert ⇒ Fehler gezählt; keine Zeilen ⇒ keine Abfrage; alter Adapter ⇒ No-op", async () => {
  const n = netz({ protokoll: {} });
  const r1 = await checkStilleRuecknahmen(deps(n, () => Promise.reject(new Error("db weg"))));
  assertEquals(r1.errors, 1);
  const r2 = await checkStilleRuecknahmen(deps(n, []));
  assertEquals(r2.rows_geladen, 0);
  assertEquals(n.logCalls.length, 0);
  const r3 = await checkStilleRuecknahmen({ secrets: SECRETS, supabase: {} } as unknown as HandlerDeps);
  assertEquals(r3.rows_geladen, 0);
});

Deno.test("Batch: Fehler in der neuen Phase hält Discovery nicht auf", async () => {
  let discoveryGefragt = false;
  const n = netz({ protokoll: {} });
  const res = await handleRequest(new Request("https://x/detect", { method: "POST", body: "{}" }), {
    secrets: SECRETS,
    fetchFn: n.fetch,
    supabase: {
      fetchActiveLeads: () => Promise.resolve([]),
      selectWatchedAcceptances: () => Promise.reject(new Error("db weg")),
      fetchDiscoveryLeads: () => {
        discoveryGefragt = true;
        return Promise.resolve([]);
      },
      stampLeadJobsChecked: () => Promise.resolve(),
      markLeadFolgeEinsatz: () => Promise.resolve(),
      upsertLeadJobs: () => Promise.resolve(),
    },
  } as unknown as HandlerDeps);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.withdrawn.errors, 1);
  assert(discoveryGefragt);
  assert(typeof body.withdrawn_ms === "number" && typeof body.discovery_ms === "number");
});
