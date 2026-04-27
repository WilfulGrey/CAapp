// Edge Function: /functions/v1/customer-verify
// POST body: { token: string }  (magic-link token from email)
// Cookie:    session=<JWT>      (current Primundus session)
//
// Flow:
//   1. Verify our session cookie → SessionPayload (incl. lead.email)
//   2. Call CustomerVerifyEmail(token) on Mamamia /graphql/auth (no agency auth)
//   3. Sanity-check the returned User.email matches session.email — otherwise
//      treat as someone else's magic link and reject.
//   4. Re-sign session JWT including the customer-scope token, return updated
//      cookie.

import {
  createSessionToken,
  parseCookie,
  sessionCookieHeader,
  verifySessionToken,
  type SessionPayload,
} from "../_shared/session.ts";
import { CUSTOMER_VERIFY_EMAIL } from "./operations/customerVerifyEmail.graphql.ts";

export interface VerifySecrets {
  mamamiaAuthEndpoint: string;
  sessionJwtSecret: string;
}

interface MamamiaUser {
  id: number;
  email: string;
  token: string;
}

interface MamamiaResponse {
  data?: { CustomerVerifyEmail?: MamamiaUser | null };
  errors?: Array<{ message?: string }>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(status: number, body: object, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders } as HeadersInit,
  });
}

export async function handle(
  req: Request,
  secrets: VerifySecrets,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<Response> {
  // 1. Session cookie — required (user must already have onboarded).
  const cookieHeader = req.headers.get("cookie");
  const sessionJwt = parseCookie(cookieHeader, "session");
  if (!sessionJwt) {
    return jsonResponse(401, { error: "missing session" });
  }
  const session = await verifySessionToken(sessionJwt, secrets.sessionJwtSecret);
  if (!session) {
    return jsonResponse(401, { error: "invalid session" });
  }

  // 2. Body must carry the magic-link token.
  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json body" });
  }
  const magicToken = body.token;
  if (typeof magicToken !== "string" || magicToken.length === 0) {
    return jsonResponse(400, { error: "missing token" });
  }

  // 3. Call Mamamia /graphql/auth (no auth header — this mutation is public).
  let mmResponse: MamamiaResponse;
  try {
    const res = await fetchFn(secrets.mamamiaAuthEndpoint, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        query: CUSTOMER_VERIFY_EMAIL,
        variables: { token: magicToken },
      }),
    });
    mmResponse = await res.json() as MamamiaResponse;
  } catch (e) {
    console.error("CustomerVerifyEmail fetch failed:", (e as Error).message);
    return jsonResponse(502, { error: "upstream unavailable" });
  }

  if (mmResponse.errors && mmResponse.errors.length > 0) {
    // Token was expired / used / invalid — Mamamia returns errors[].
    console.warn("CustomerVerifyEmail rejected:", mmResponse.errors[0]?.message);
    return jsonResponse(401, { error: "magic link invalid or expired" });
  }

  const user = mmResponse.data?.CustomerVerifyEmail;
  if (!user || typeof user.token !== "string" || user.token.length === 0) {
    return jsonResponse(401, { error: "magic link invalid" });
  }

  // 4. Defense in depth — the magic-link token is unguessable, but reject if
  //    the verified user's email doesn't match what we onboarded (in case
  //    someone hands their session cookie + a magic link for another account).
  if (user.email.toLowerCase() !== session.email.toLowerCase()) {
    console.warn("CustomerVerifyEmail email mismatch");
    return jsonResponse(403, { error: "email mismatch" });
  }

  // 5. Re-sign session JWT including the customer-scope token.
  const updatedPayload: SessionPayload = {
    ...session,
    customer_token: user.token,
  };
  const newJwt = await createSessionToken(updatedPayload, secrets.sessionJwtSecret);

  return jsonResponse(
    200,
    { verified: true, customer_id: session.customer_id },
    { "Set-Cookie": sessionCookieHeader(newJwt) },
  );
}
