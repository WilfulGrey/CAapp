import { SignJWT, jwtVerify } from "jose";
import type { SessionPayload } from "./sessionTypes.ts";
export type { SessionPayload };

const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24h
const COOKIE_NAME = "session";

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload,
  secret: string,
  ttlSec: number = DEFAULT_TTL_SEC,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSec)
    .sign(secretKey(secret));
}

export async function verifySessionToken(
  jwt: string,
  secret: string,
): Promise<SessionPayload | null> {
  if (!jwt || typeof jwt !== "string") return null;
  try {
    const { payload } = await jwtVerify(jwt, secretKey(secret));
    const { customer_id, job_offer_id, lead_id, email } = payload as Record<string, unknown>;
    if (typeof customer_id !== "number" || typeof job_offer_id !== "number" || typeof lead_id !== "string") {
      return null;
    }
    // `email` is required (added in K6). Older sessions without `email`
    // are treated as expired so the user is re-onboarded with the new shape.
    if (typeof email !== "string" || email.length === 0) return null;
    return { customer_id, job_offer_id, lead_id, email };
  } catch {
    return null;
  }
}

// SameSite=None required because the portal (e.g. localhost:5173 or
// portal.primundus.de) is a DIFFERENT site from the Edge Function host
// (*.supabase.co). SameSite=Lax would block the cookie on cross-site
// fetch() calls, breaking every mamamia-proxy request after onboarding.
// Secure flag is still enforced; Chrome treats localhost as a secure
// context so this works in dev over HTTP too.
//
// `Partitioned` (CHIPS — Cookies Having Independent Partitioned State)
// added 2026-05-07 after Bug #13i: iOS WebKit (Safari + Chrome) ITP
// silently dropped the cross-site session cookie even with SameSite=None
// + Secure, so onboard set the cookie but mamamia-proxy never received
// it on subsequent calls → matchings/applications never loaded on
// iPhone. With `Partitioned`, the cookie is scoped to the top-level
// site partition (caapp-beta.onrender.com), bypassing third-party
// cookie restrictions. Supported in Safari 16.4+ / Chrome 118+ /
// Firefox 124+ (Mar 2024). For older browsers, ignored gracefully —
// falls back to plain SameSite=None behavior.
export function sessionCookieHeader(jwt: string, maxAgeSec: number = DEFAULT_TTL_SEC): string {
  return `${COOKIE_NAME}=${jwt}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0`;
}

export function parseCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...vs] = part.trim().split("=");
    if (k === name) {
      const raw = vs.join("=");
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}
