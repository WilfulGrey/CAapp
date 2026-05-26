// Origin allow-list for the CA app + the calculator that triggers
// /onboard-to-mamamia from the magic-link redirect. Both Render hosts
// (prod slot + staging slot) get an entry plus the production portal
// domain. Localhost is kept for dev. Unknown origins are rejected (fall
// through to localhost so cookies/credentials are never sent to a
// hostile origin).
//
// Slot naming (per CLAUDE.md §"URL convention"):
//   caapp-beta.onrender.com           = PROD slot (custom domain: kundenportal.primundus.de)
//   kostenrechner-beta.onrender.com   = PROD slot (custom domain: kostenrechner.primundus.de)
//   caapp-staging.onrender.com        = STAGING slot (no custom domain)
//   kostenrechner-staging.onrender.com= STAGING slot (no custom domain)
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "https://portal.primundus.de",
  "https://kundenportal.primundus.de",
  "https://caapp-beta.onrender.com",
  "https://kostenrechner-beta.onrender.com",
  "https://caapp-staging.onrender.com",
  "https://kostenrechner-staging.onrender.com",
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Credentials": "true",
    // x-session-token added 2026-05-07 (Bug #13j) — frontend re-sends the
    // session JWT as a header for browsers that drop the cross-site cookie
    // (iOS WebKit incognito). Without this in the allow-list, preflight
    // rejects the actual request.
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
