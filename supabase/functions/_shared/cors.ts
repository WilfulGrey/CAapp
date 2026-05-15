// Origin allow-list for the CA app + the calculator that triggers
// /onboard-to-mamamia from the magic-link redirect. Production custom
// domains (kundenportal.primundus.de + kostenrechner.primundus.de) plus
// the Render beta hosts as fallback during cutover. Localhost is kept
// for dev. Unknown origins are rejected (fall through to localhost so
// cookies/credentials are never sent to a hostile origin).
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  // Production custom domains
  "https://kundenportal.primundus.de",
  "https://kostenrechner.primundus.de",
  // Render slot URLs (auto-assigned <slug>.onrender.com). Slug is
  // immutable on Render even though display names were renamed
  // from caapp-beta/kostenrechner-beta to caapp/kostenrechner on
  // 2026-05-14 — these *-beta URLs stay live until services are
  // recreated. Kept as fallback during primundus.de cutover.
  "https://caapp-beta.onrender.com",
  "https://kostenrechner-beta.onrender.com",
  // Legacy
  "https://portal.primundus.de",
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
