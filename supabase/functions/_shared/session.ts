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
    const { customer_id, job_offer_id, lead_id } = payload as Record<string, unknown>;
    if (typeof customer_id !== "number" || typeof job_offer_id !== "number" || typeof lead_id !== "string") {
      return null;
    }
    return { customer_id, job_offer_id, lead_id };
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
export function sessionCookieHeader(jwt: string, maxAgeSec: number = DEFAULT_TTL_SEC): string {
  return `${COOKIE_NAME}=${jwt}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
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
