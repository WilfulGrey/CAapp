// Google Ads REST v23 — minimaler Client für den Offline-Conversion-Upload.
// Kein SDK: Token-Refresh + ein Upload-Call, mehr braucht der Job nicht.

import type { ClickConversionPayload } from "./conversions.ts";

export interface GoogleAdsSecrets {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

// Kunden-IDs Primundus (Kundenkonto + Verwaltungskonto). Per Env
// überschreibbar (Staging/Test), Default = Prod-Realität.
export const CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "9240286999";
export const LOGIN_CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "6512570737";

// Conversion-Aktion „Qualifizierter Lead (Patientendaten)" — angelegt
// 14.08.2026 via API (type UPLOAD_CLICKS, category QUALIFIED_LEAD,
// secondary). Siehe docs/google-ads-tracking.md.
export const QUALIFIED_LEAD_ACTION = Deno.env.get("GOOGLE_ADS_QUALIFIED_LEAD_ACTION") ??
  `customers/${CUSTOMER_ID}/conversionActions/7720728390`;

// Secrets: Env zuerst (falls jemand sie doch als Function-Secrets setzt),
// sonst Supabase Vault via RPC get_google_ads_secrets (Migration
// 20260814122000). Hintergrund: das CLI-Token darf auf diesem Projekt
// keine Function-Env-Secrets setzen (403) — der Vault ist der Weg, den
// auch get_smtp_config nutzt. Fehlen beide Quellen → null (Function
// skippt inert, z. B. Staging).
export async function readSecrets(
  supabase: { rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
): Promise<GoogleAdsSecrets | null> {
  const fromEnv: GoogleAdsSecrets = {
    developerToken: Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
    clientId: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "",
    refreshToken: Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN") ?? "",
  };
  if (fromEnv.developerToken && fromEnv.clientId && fromEnv.clientSecret && fromEnv.refreshToken) {
    return fromEnv;
  }

  const { data, error } = await supabase.rpc("get_google_ads_secrets");
  if (error) {
    console.warn("get_google_ads_secrets RPC:", error.message);
    return null;
  }
  const v = (data ?? {}) as Record<string, unknown>;
  const s: GoogleAdsSecrets = {
    developerToken: typeof v.developerToken === "string" ? v.developerToken : "",
    clientId: typeof v.clientId === "string" ? v.clientId : "",
    clientSecret: typeof v.clientSecret === "string" ? v.clientSecret : "",
    refreshToken: typeof v.refreshToken === "string" ? v.refreshToken : "",
  };
  if (!s.developerToken || !s.clientId || !s.clientSecret || !s.refreshToken) return null;
  return s;
}

export async function fetchAccessToken(s: GoogleAdsSecrets): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s.clientId,
      client_secret: s.clientSecret,
      refresh_token: s.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    throw new Error(`oauth token refresh failed: HTTP ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  }
  const data = await resp.json();
  if (typeof data?.access_token !== "string") throw new Error("oauth response without access_token");
  return data.access_token;
}

export interface UploadResponse {
  results?: Array<Record<string, unknown>>;
  partialFailureError?: unknown;
}

export async function uploadClickConversions(
  accessToken: string,
  s: GoogleAdsSecrets,
  conversions: ClickConversionPayload[],
): Promise<UploadResponse> {
  const resp = await fetch(
    `https://googleads.googleapis.com/v23/customers/${CUSTOMER_ID}:uploadClickConversions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": s.developerToken,
        "login-customer-id": LOGIN_CUSTOMER_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversions, partialFailure: true }),
    },
  );
  if (!resp.ok) {
    // Request-Level-Fehler (Auth, Quota, …) — kompletter Lauf retriable,
    // NICHTS wird als hochgeladen markiert.
    throw new Error(`uploadClickConversions failed: HTTP ${resp.status} ${(await resp.text()).slice(0, 300)}`);
  }
  return await resp.json();
}
