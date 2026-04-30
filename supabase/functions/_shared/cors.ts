// Origin allow-list for the CA app + the calculator that triggers
// /onboard-to-mamamia from the magic-link redirect. Both Render beta
// hosts get an entry plus the production portal domain. Localhost is
// kept for dev. Unknown origins are rejected (fall through to localhost
// so cookies/credentials are never sent to a hostile origin).
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "https://portal.primundus.de",
  "https://kundenportal.primundus.de",
  "https://caapp-beta.onrender.com",
  "https://kostenrechner-beta.onrender.com",
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
