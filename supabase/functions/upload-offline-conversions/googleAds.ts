// Google Data Manager API — Transport für den Offline-Conversion-Upload.
//
// Seit 19.08.2026: `events:ingest` (datamanager.googleapis.com) statt
// ConversionUploadService.UploadClickConversions — der alte Endpoint ist für
// neue Integrationen gesperrt (CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE;
// vier Cron-Läufe 15.–19.08. scheiterten so unsichtbar als „retriable").
// Eigener OAuth-Scope https://www.googleapis.com/auth/datamanager → eigener
// Refresh-Token (Vault: google_oauth_refresh_token_dm, via RPC
// get_google_ads_secrets.dmRefreshToken; Migration 20260819120000).

import type { DmEvent } from "./conversions.ts";

export interface GoogleAdsSecrets {
  clientId: string;
  clientSecret: string;
  /** Scope datamanager — NUR für events:ingest. Leer = Upload skippt. */
  dmRefreshToken: string;
}

export const CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "9240286999";
export const LOGIN_CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "6512570737";

// Conversion-Aktion „Qualifizierter Lead (Patientendaten)" — als
// productDestinationId braucht Data Manager NUR die numerische ID.
export const QUALIFIED_LEAD_ACTION_ID = Deno.env.get("GOOGLE_ADS_QUALIFIED_LEAD_ACTION_ID") ?? "7720728390";
export const DESTINATION_REFERENCE = "qualified_lead";

export async function readSecrets(
  supabase: { rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
): Promise<GoogleAdsSecrets | null> {
  const fromEnv: GoogleAdsSecrets = {
    clientId: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "",
    dmRefreshToken: Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN_DM") ?? "",
  };
  if (fromEnv.clientId && fromEnv.clientSecret && fromEnv.dmRefreshToken) return fromEnv;

  const { data, error } = await supabase.rpc("get_google_ads_secrets");
  if (error) {
    console.warn("get_google_ads_secrets RPC:", error.message);
    return null;
  }
  const v = (data ?? {}) as Record<string, unknown>;
  const s: GoogleAdsSecrets = {
    clientId: typeof v.clientId === "string" ? v.clientId : "",
    clientSecret: typeof v.clientSecret === "string" ? v.clientSecret : "",
    dmRefreshToken: typeof v.dmRefreshToken === "string" ? v.dmRefreshToken : "",
  };
  if (!s.clientId || !s.clientSecret) return null;
  return s; // dmRefreshToken darf leer sein → Handler skippt mit klarer Meldung
}

export async function fetchAccessToken(s: GoogleAdsSecrets): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s.clientId,
      client_secret: s.clientSecret,
      refresh_token: s.dmRefreshToken,
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

export interface IngestResult {
  ok: boolean;
  status: number;
  requestId?: string;
  body: string;
}

// Fast-fail-Semantik: EIN fehlerhaftes Event lässt den ganzen Request mit
// HTTP 400 scheitern — der Handler isoliert dann per Einzel-Ingest.
export async function ingestEvents(
  accessToken: string,
  events: DmEvent[],
  validateOnly = false,
): Promise<IngestResult> {
  const resp = await fetch("https://datamanager.googleapis.com/v1/events:ingest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      validateOnly,
      destinations: [{
        reference: DESTINATION_REFERENCE,
        operatingAccount: { accountType: "GOOGLE_ADS", accountId: CUSTOMER_ID },
        loginAccount: { accountType: "GOOGLE_ADS", accountId: LOGIN_CUSTOMER_ID },
        productDestinationId: QUALIFIED_LEAD_ACTION_ID,
      }],
      // Einwilligung kommt vom Cookie-Banner des Kostenrechners; ohne sie
      // entsteht gar kein gclid-Lead (Erfassung ist consent-gated).
      consent: { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_GRANTED" },
      events,
    }),
  });
  const body = (await resp.text()).slice(0, 1000);
  let requestId: string | undefined;
  try {
    requestId = JSON.parse(body)?.requestId;
  } catch { /* body kein JSON — egal */ }
  return { ok: resp.ok, status: resp.status, requestId, body };
}
