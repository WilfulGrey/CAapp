import { assertEquals, assertStringIncludes } from "@std/assert";
import { createSessionToken, verifySessionToken } from "../../_shared/session.ts";
import { handle } from "../handler.ts";

const SECRETS = {
  mamamiaAuthEndpoint: "https://beta.example/graphql/auth",
  sessionJwtSecret: "x".repeat(40),
};

const SESSION_PAYLOAD = {
  customer_id: 7570,
  job_offer_id: 16226,
  lead_id: "c4286032-9e06-453d-93f2-52779127c8e5",
  email: "test@example.com",
};

async function makeCookie(): Promise<string> {
  const jwt = await createSessionToken(SESSION_PAYLOAD, SECRETS.sessionJwtSecret);
  return `session=${jwt}`;
}

function okFetch(response: object): typeof fetch {
  return async () => new Response(JSON.stringify(response), { status: 200 });
}

function baseReq(body: object, cookie: string | null = null): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "http://localhost:5173",
  };
  if (cookie) headers.cookie = cookie;
  return new Request("https://x/functions/v1/customer-verify", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ─── Happy path ────────────────────────────────────────────────────────────

Deno.test("verify: exchanges magic-link token for customer JWT, embeds in session cookie", async () => {
  const cookie = await makeCookie();
  // CustomerVerifyEmail returns User { id, token } — we extract token,
  // re-sign session JWT with `customer_token` field, return updated cookie.
  const res = await handle(
    baseReq({ token: "magic-link-token-from-email" }, cookie),
    SECRETS,
    okFetch({
      data: {
        CustomerVerifyEmail: {
          id: 9001,
          email: "test@example.com",
          token: "31|customer-scope-jwt-from-mamamia",
        },
      },
    }),
  );

  assertEquals(res.status, 200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  assertStringIncludes(setCookie, "session=");
  assertStringIncludes(setCookie, "HttpOnly");
  assertStringIncludes(setCookie, "SameSite=None");

  // Decode the new session cookie and verify customer_token landed.
  const newJwt = setCookie.match(/session=([^;]+)/)?.[1] ?? "";
  const payload = await verifySessionToken(newJwt, SECRETS.sessionJwtSecret);
  assertEquals(payload?.customer_id, 7570);
  assertEquals(payload?.customer_token, "31|customer-scope-jwt-from-mamamia");

  // Body confirms verification succeeded so portal can re-fetch.
  const body = await res.json();
  assertEquals(body.verified, true);
});

// ─── Validation ────────────────────────────────────────────────────────────

Deno.test("verify: missing session cookie → 401", async () => {
  const res = await handle(
    baseReq({ token: "magic-link" }, null),
    SECRETS,
    okFetch({}),
  );
  assertEquals(res.status, 401);
});

Deno.test("verify: missing token field → 400", async () => {
  const cookie = await makeCookie();
  const res = await handle(baseReq({}, cookie), SECRETS, okFetch({}));
  assertEquals(res.status, 400);
});

Deno.test("verify: Mamamia rejects token (expired/invalid) → 401", async () => {
  const cookie = await makeCookie();
  const failFetch: typeof fetch = async () =>
    new Response(JSON.stringify({
      errors: [{ message: "Magic link expired or invalid" }],
    }), { status: 200 });
  const res = await handle(
    baseReq({ token: "expired-magic-link" }, cookie),
    SECRETS,
    failFetch,
  );
  assertEquals(res.status, 401);
});

// ─── Email mismatch — defense in depth ────────────────────────────────────

Deno.test("verify: rejects when Mamamia returns a user with different email than session", async () => {
  const cookie = await makeCookie();
  const res = await handle(
    baseReq({ token: "magic-link-for-someone-else" }, cookie),
    SECRETS,
    okFetch({
      data: {
        CustomerVerifyEmail: {
          id: 9999,
          email: "attacker@example.com", // mismatch with session.email
          token: "stolen-magic-link-token",
        },
      },
    }),
  );
  assertEquals(res.status, 403);
});
