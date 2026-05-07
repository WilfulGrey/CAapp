import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  createSessionToken,
  verifySessionToken,
  sessionCookieHeader,
  parseCookie,
  clearSessionCookieHeader,
} from "../../_shared/session.ts";

const SECRET = "test-secret-must-be-at-least-32-bytes-long-okay";

Deno.test("createSessionToken + verifySessionToken: round-trip works", async () => {
  const jwt = await createSessionToken({
    customer_id: 7566,
    job_offer_id: 16225,
    lead_id: "aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa",
    email: "test@example.com",
  }, SECRET);

  const payload = await verifySessionToken(jwt, SECRET);
  assertEquals(payload?.customer_id, 7566);
  assertEquals(payload?.job_offer_id, 16225);
  assertEquals(payload?.lead_id, "aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa");
  assertEquals(payload?.email, "test@example.com");
});

Deno.test("verifySessionToken: missing email returns null (K6 forces re-onboard)", async () => {
  // Old payload shape (pre-K6) — no `email` field. Verification must reject
  // so the user gets a fresh JWT with the new shape.
  const legacyPayload = {
    customer_id: 1,
    job_offer_id: 2,
    lead_id: "x",
  } as unknown as Parameters<typeof createSessionToken>[0];
  const jwt = await createSessionToken(legacyPayload, SECRET);
  const payload = await verifySessionToken(jwt, SECRET);
  assertEquals(payload, null);
});

Deno.test("verifySessionToken: wrong secret returns null", async () => {
  const jwt = await createSessionToken({
    customer_id: 1,
    job_offer_id: 2,
    lead_id: "x",
    email: "test@example.com",
  }, SECRET);
  const payload = await verifySessionToken(jwt, "different-secret-32-bytes-or-longerrrr");
  assertEquals(payload, null);
});

Deno.test("verifySessionToken: malformed token returns null", async () => {
  assertEquals(await verifySessionToken("not-a-jwt", SECRET), null);
  assertEquals(await verifySessionToken("", SECRET), null);
});

Deno.test("verifySessionToken: expired token returns null", async () => {
  const jwt = await createSessionToken({
    customer_id: 1,
    job_offer_id: 2,
    lead_id: "x",
    email: "test@example.com",
  }, SECRET, -10); // already expired
  const payload = await verifySessionToken(jwt, SECRET);
  assertEquals(payload, null);
});

Deno.test("sessionCookieHeader: has HttpOnly, Secure, SameSite=None, Partitioned, Path=/", () => {
  const header = sessionCookieHeader("abc.def.ghi", 86400);
  assertStringIncludes(header, "session=abc.def.ghi");
  assertStringIncludes(header, "HttpOnly");
  assertStringIncludes(header, "Secure");
  // SameSite=None required for cross-site fetch from portal (localhost:5173
  // or portal.primundus.de) to Edge Function on *.supabase.co.
  assertStringIncludes(header, "SameSite=None");
  // Partitioned (CHIPS) added 2026-05-07 — iOS WebKit (Safari + Chrome)
  // ITP silently dropped cross-site session cookie even with SameSite=None
  // + Secure (Bug #13i, Test iPhone Customer 7659).
  assertStringIncludes(header, "Partitioned");
  assertStringIncludes(header, "Path=/");
  assertStringIncludes(header, "Max-Age=86400");
});

Deno.test("parseCookie: extracts specific cookie by name", () => {
  assertEquals(
    parseCookie("session=abc; other=xyz", "session"),
    "abc"
  );
  assertEquals(
    parseCookie("other=xyz; session=abc", "session"),
    "abc"
  );
  assertEquals(
    parseCookie("nocookie=true", "session"),
    null
  );
  assertEquals(parseCookie("", "session"), null);
  assertEquals(parseCookie(null, "session"), null);
});

Deno.test("parseCookie: handles URL-encoded values", () => {
  const encoded = encodeURIComponent("value with spaces");
  assertEquals(
    parseCookie(`session=${encoded}`, "session"),
    "value with spaces",
  );
});

Deno.test("clearSessionCookieHeader: produces expire header", () => {
  const header = clearSessionCookieHeader();
  assertStringIncludes(header, "session=");
  assertStringIncludes(header, "Max-Age=0");
  assertStringIncludes(header, "HttpOnly");
});
