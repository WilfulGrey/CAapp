/* Deno-Test der Bewertungszeile — Spiegel von src/__tests__/bewertungenStand.test.ts
 * (dort wird zusätzlich geprüft, dass diese Kopie dasselbe HTML liefert wie
 * project 3/lib/bewertungen-stand.ts). */
import { assert, assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert";
import {
  BEWERTUNGS_STAND_ERSATZ,
  BEWERTUNGS_STAND_URL,
  bewertungsZeileHtml,
  ladeBewertungsStand,
  pruefeBewertungsStand,
} from "../bewertungenStand.ts";

const GUELTIG = {
  schnitt: "4,9",
  wert: 4.89,
  anzahl: 126,
  url: "https://primundus.de/erfahrungen",
  stand: "2026-09-17T08:00:00.000Z",
};

const antwort = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

Deno.test("pruefeBewertungsStand: gültige Antwort", () => {
  assertEquals(pruefeBewertungsStand(GUELTIG), { schnitt: "4,9", anzahl: 126 });
});

Deno.test("pruefeBewertungsStand: verwirft kaputte Werte", () => {
  for (const schnitt of ["4.9", "4,89", "49", "", 4.9, "5,1", "0,9"]) {
    assertEquals(pruefeBewertungsStand({ ...GUELTIG, schnitt }), null, `schnitt ${schnitt}`);
  }
  for (const anzahl of [0, -3, 12.5, "126", Number.NaN, undefined]) {
    assertEquals(pruefeBewertungsStand({ ...GUELTIG, anzahl }), null, `anzahl ${anzahl}`);
  }
  for (const p of [null, undefined, "kaputt", 42, [GUELTIG]]) {
    assertEquals(pruefeBewertungsStand(p), null);
  }
});

Deno.test("bewertungsZeileHtml: Sterne, Zahlen, Link", () => {
  const html = bewertungsZeileHtml({ schnitt: "4,9", anzahl: 126 });
  assertEquals(html.match(/&#9733;/g)?.length, 5);
  assertStringIncludes(html, "color:#D4A843;");
  assertStringIncludes(html, '<strong style="color:#3D2B1F;">4,9</strong>');
  assertStringIncludes(html, '<strong style="color:#3D2B1F;">126</strong>');
  assertMatch(html, /<a href="https:\/\/primundus\.de\/erfahrungen"[^>]*>Erfahrungen lesen&nbsp;&rarr;<\/a>/);
  assertStringIncludes(html, "margin:0 0 24px 0;");
  assert(!html.includes("<img"));
});

Deno.test("ladeBewertungsStand: Erfolg ruft den Endpunkt mit Signal", async () => {
  let url = "";
  let signal: AbortSignal | null | undefined;
  const fetchFn = (async (u: string, init?: RequestInit) => {
    url = u;
    signal = init?.signal;
    return antwort(GUELTIG);
  }) as unknown as typeof fetch;
  assertEquals(await ladeBewertungsStand(fetchFn), { schnitt: "4,9", anzahl: 126 });
  assertEquals(url, BEWERTUNGS_STAND_URL);
  assert(signal instanceof AbortSignal);
});

Deno.test("ladeBewertungsStand: 404, kaputtes JSON, Netzfehler → Ersatzwert", async () => {
  const faelle = [
    (async () => antwort("<html>404</html>", 404)),
    (async () => antwort("{nicht json")),
    (async () => { throw new TypeError("fetch failed"); }),
  ] as unknown as (typeof fetch)[];
  for (const f of faelle) assertEquals(await ladeBewertungsStand(f), BEWERTUNGS_STAND_ERSATZ);
});

Deno.test("ladeBewertungsStand: hängender Server → Ersatzwert nach Timeout", async () => {
  const fetchFn = ((_u: string, init?: RequestInit) =>
    new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("timeout", "TimeoutError")));
    })) as unknown as typeof fetch;
  const start = Date.now();
  assertEquals(await ladeBewertungsStand(fetchFn, 30), BEWERTUNGS_STAND_ERSATZ);
  assert(Date.now() - start < 1000);
});
