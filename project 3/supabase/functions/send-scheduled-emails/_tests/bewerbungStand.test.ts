// Registry #125: Der Versand fragt vor jeder Bewerbungs-Erinnerung bei mamamia nach, ob die
// Bewerbung noch steht. Pure Regeln + der kleine Client mit gefälschtem fetch.
import { assert, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import {
  _standTokenCacheLeeren,
  bewerbungStand,
  STAND_WIEDERHOLUNGEN,
  standAus,
  standDepsAusEnv,
  standNochmalUm,
} from "../bewerbungStand.ts";

Deno.test("standAus: Pflegekraft in der Liste ⇒ aktiv, sonst weg (Zahl und Text gleich)", () => {
  const liste = [{ id: 14789, caregiver_id: 32527 }, { id: 14746, caregiver_id: 15184 }];
  assertEquals(standAus(liste, 32527), "aktiv");
  assertEquals(standAus(liste, "32527"), "aktiv");
  assertEquals(standAus(liste, 36358), "weg");
  assertEquals(standAus([], 32527), "weg");
  assertEquals(standAus([{ id: 1, caregiver_id: null }], 32527), "weg");
});

Deno.test("standAus je Bewerbung (Registry #136): mit application_id zählt nur genau diese", () => {
  const liste = [{ id: 14746, caregiver_id: 15184 }];
  assertEquals(standAus(liste, 15184, 14746), "aktiv");
  assertEquals(standAus(liste, 15184, "14746"), "aktiv");
  // Die alte Bewerbung 14728 ist weg, auch wenn die Kraft mit der neuen in der Liste steht.
  assertEquals(standAus(liste, 15184, 14728), "weg");
  // Ohne application_id (Zeile von vor #136): wie bisher je Pflegekraft.
  assertEquals(standAus(liste, 15184, null), "aktiv");
  assertEquals(standAus(liste, 15184), "aktiv");
});

Deno.test("standNochmalUm: zehn Minuten später, höchstens dreimal, danach null (= wie bisher senden)", () => {
  const jetzt = new Date("2026-10-16T10:00:00Z");
  assertEquals(standNochmalUm(1, jetzt), "2026-10-16T10:10:00.000Z");
  assertEquals(standNochmalUm(STAND_WIEDERHOLUNGEN, jetzt), "2026-10-16T10:10:00.000Z");
  assertEquals(standNochmalUm(STAND_WIEDERHOLUNGEN + 1, jetzt), null);
});

Deno.test("standDepsAusEnv: alle vier Secrets nötig", () => {
  const voll: Record<string, string> = {
    MAMAMIA_ENDPOINT: "https://mm.test/graphql",
    MAMAMIA_AUTH_ENDPOINT: "https://mm.test/graphql/auth",
    MAMAMIA_AGENCY_EMAIL: "portal@test",
    MAMAMIA_AGENCY_PASSWORD: "geheim",
  };
  const deps = standDepsAusEnv((k) => voll[k]);
  assert(deps);
  assertEquals(deps.endpoint, "https://mm.test/graphql");
  for (const fehlt of Object.keys(voll)) {
    assertEquals(standDepsAusEnv((k) => (k === fehlt ? undefined : voll[k])), null, `ohne ${fehlt}`);
  }
});

type Aufruf = { url: string; body: Record<string, unknown>; auth: string | null };

function fakeFetch(antworten: (aufruf: Aufruf, nr: number) => Response | Promise<Response>) {
  const aufrufe: Aufruf[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const aufruf: Aufruf = {
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")),
      auth: headers.get("authorization"),
    };
    aufrufe.push(aufruf);
    return await antworten(aufruf, aufrufe.length);
  }) as typeof fetch;
  return { f, aufrufe };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const DEPS = {
  endpoint: "https://mm.test/graphql",
  authEndpoint: "https://mm.test/graphql/auth",
  email: "portal@test",
  password: "geheim",
  timeoutMs: 1000,
};

Deno.test("bewerbungStand: Login, dann Liste des Jobs — aktiv / weg; Token wird je Instanz wiederverwendet", async () => {
  _standTokenCacheLeeren();
  const { f, aufrufe } = fakeFetch((a) => {
    if (a.url.endsWith("/auth")) return json({ data: { LoginAgency: { token: "tok-1" } } });
    const vars = a.body.variables as { job_offer_id: number };
    const data = vars.job_offer_id === 38118
      ? [{ id: 14789, caregiver_id: 32527 }, { id: 14746, caregiver_id: 15184 }]
      : [];
    return json({ data: { JobOfferApplicationsWithPagination: { total: data.length, data } } });
  });
  assertEquals(await bewerbungStand({ ...DEPS, fetchFn: f }, 38118, 32527), "aktiv");
  assertEquals(await bewerbungStand({ ...DEPS, fetchFn: f }, 38118, 36358), "weg");
  // Job-genau: dieselbe Pflegekraft auf einem anderen Job zählt nicht
  assertEquals(await bewerbungStand({ ...DEPS, fetchFn: f }, 38673, 32527), "weg");
  // Registry #136: Zeile kennt ihre Bewerbung — nur genau diese zählt
  assertEquals(await bewerbungStand({ ...DEPS, fetchFn: f }, 38118, 15184, 14746), "aktiv");
  assertEquals(await bewerbungStand({ ...DEPS, fetchFn: f }, 38118, 15184, 14728), "weg");
  const logins = aufrufe.filter((a) => a.url.endsWith("/auth"));
  assertEquals(logins.length, 1, "ein Login je warmer Instanz");
  const listen = aufrufe.filter((a) => !a.url.endsWith("/auth"));
  assertEquals(listen.length, 5);
  assertEquals(listen[0].auth, "Bearer tok-1");
  assertEquals((listen[0].body.variables as Record<string, unknown>).limit, 100);
  assertStringIncludes(String(listen[0].body.query), "JobOfferApplicationsWithPagination");
  assert(!String(listen[0].body.query).includes("rejected_at"), "rejected_at bricht auf PROD jede Abfrage (11.–13.07.)");
});

Deno.test("bewerbungStand: Fehler werfen — HTTP, GraphQL-Fehler, Login ohne Token (nie „weg“ raten)", async () => {
  _standTokenCacheLeeren();
  const http500 = fakeFetch((a) =>
    a.url.endsWith("/auth") ? json({ data: { LoginAgency: { token: "t" } } }) : json({}, 500)
  );
  await assertRejects(() => bewerbungStand({ ...DEPS, fetchFn: http500.f }, 1, 1), Error, "HTTP 500");

  _standTokenCacheLeeren();
  const gql = fakeFetch((a) =>
    a.url.endsWith("/auth")
      ? json({ data: { LoginAgency: { token: "t" } } })
      : json({ errors: [{ message: "Internal server error" }] })
  );
  await assertRejects(() => bewerbungStand({ ...DEPS, fetchFn: gql.f }, 1, 1), Error, "Internal server error");

  _standTokenCacheLeeren();
  const ohneToken = fakeFetch(() => json({ data: { LoginAgency: { token: null } } }));
  await assertRejects(() => bewerbungStand({ ...DEPS, fetchFn: ohneToken.f }, 1, 1), Error, "ohne token");
});

Deno.test("bewerbungStand: abgelaufener Token ⇒ einmal neu anmelden", async () => {
  _standTokenCacheLeeren();
  let logins = 0;
  const { f } = fakeFetch((a) => {
    if (a.url.endsWith("/auth")) {
      logins += 1;
      return json({ data: { LoginAgency: { token: `tok-${logins}` } } });
    }
    if (a.auth === "Bearer tok-1") return json({}, 401);
    return json({ data: { JobOfferApplicationsWithPagination: { total: 1, data: [{ id: 1, caregiver_id: 7 }] } } });
  });
  assertEquals(await bewerbungStand({ ...DEPS, fetchFn: f }, 5, 7), "aktiv");
  assertEquals(logins, 2);
});

Deno.test("bewerbungStand: volle Seite ⇒ nächste Seite lesen", async () => {
  _standTokenCacheLeeren();
  const { f, aufrufe } = fakeFetch((a) => {
    if (a.url.endsWith("/auth")) return json({ data: { LoginAgency: { token: "t" } } });
    const page = (a.body.variables as { page: number }).page;
    const data = page === 1
      ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1, caregiver_id: 1000 + i }))
      : [{ id: 101, caregiver_id: 42 }];
    return json({ data: { JobOfferApplicationsWithPagination: { total: 101, data } } });
  });
  assertEquals(await bewerbungStand({ ...DEPS, fetchFn: f }, 5, 42), "aktiv");
  assertEquals(aufrufe.filter((a) => !a.url.endsWith("/auth")).length, 2);
});

Deno.test("Quelltext-Wächter: der Versand fragt im Erinnerungs-Zweig nach und bricht bei „weg“ ab", async () => {
  const src = await Deno.readTextFile(new URL("../index.ts", import.meta.url));
  assertStringIncludes(src, 'from "./bewerbungStand.ts"');
  assertStringIncludes(src, "await bewerbungStand(");
  assertStringIncludes(src, 'stand === "weg"');
  assertStringIncludes(src, 'quelle: "versand"');
  assertStringIncludes(src, "standNochmalUm(");
});
