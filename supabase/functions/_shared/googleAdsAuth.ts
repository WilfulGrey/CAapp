// Google-Ads-Zugang für Edge Functions (Primundus-Konto 924-028-6999).
//
// Secrets: Env zuerst (falls gesetzt), sonst Supabase-Vault via RPC
// get_google_ads_secrets (Migration 20260814122000, service_role-only) —
// gleiche Quelle wie upload-offline-conversions/googleAds.ts (dortige
// lokale Kopie kann bei Gelegenheit hierher konsolidiert werden).
// Fehlen beide Quellen (z. B. Staging ohne Vault-Einträge) → null; Aufrufer
// müssen fail-soft bleiben (Report ohne Ads-Block statt keine Mail).

export interface GoogleAdsSecrets {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export const ADS_CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "9240286999";
export const ADS_LOGIN_CUSTOMER_ID = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "6512570737";

type RpcClient = {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function getGoogleAdsSecrets(supabase: RpcClient): Promise<GoogleAdsSecrets | null> {
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

export async function fetchAdsAccessToken(s: GoogleAdsSecrets): Promise<string> {
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
    throw new Error(`oauth token refresh failed: HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (typeof data?.access_token !== "string") throw new Error("oauth response without access_token");
  return data.access_token;
}

/** GAQL-Search gegen das Primundus-Konto; wirft bei HTTP-Fehlern. */
export async function adsSearch(
  accessToken: string,
  s: GoogleAdsSecrets,
  query: string,
): Promise<Array<Record<string, unknown>>> {
  const resp = await fetch(
    `https://googleads.googleapis.com/v23/customers/${ADS_CUSTOMER_ID}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": s.developerToken,
        "login-customer-id": ADS_LOGIN_CUSTOMER_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!resp.ok) {
    throw new Error(`googleAds:search failed: HTTP ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  }
  const data = await resp.json();
  return Array.isArray(data?.results) ? data.results : [];
}
