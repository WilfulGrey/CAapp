// Service-role-Bramka für server-to-server-Aufrufe einer Edge Function.
//
// Zwei akzeptierte Formen des Bearer-Tokens:
//   1. exakt der SUPABASE_SERVICE_ROLE_KEY (constant-time verglichen) — deckt
//      auch die neuen `sb_secret_…`-Keys ab, die KEIN JWT sind;
//   2. ein JWT mit Claim `role: "service_role"`.
//
// ⚠ Zweig 2 prüft KEINE Signatur. Das ist nur sicher, weil das Supabase-
// Gateway die Signatur vorher verifiziert (`verify_jwt`, Default für jede
// Function ohne `[functions.<name>] verify_jwt = false` in config.toml und
// ohne `--no-verify-jwt` beim Deploy). Wer eine Function, die diesen Helper
// nutzt, mit `--no-verify-jwt` deployt, öffnet den privilegierten Pfad für
// jeden, der ein JSON `{"role":"service_role"}` base64-kodieren kann.
//
// Kopie der beiden Helfer aus sync-acceptance/index.ts (dort nicht
// exportiert, und der Import zöge das Deno.serve-Bootstrap mit). Dritte Kopie
// in upload-offline-conversions/index.ts. Bei der nächsten Berührung dieser
// Functions auf diesen Helper umstellen (Registry #55).

export function isServiceRoleBearer(authorization: string | null | undefined, serviceKey: string): boolean {
  const auth = authorization ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!bearer) return false;
  return timingSafeEqual(bearer, serviceKey) || jwtRole(bearer) === "service_role";
}

// Role-Claim aus einem (vom Gateway bereits signatur-geprüften) JWT lesen.
// Nicht-JWT-Strings → null.
export function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

// Constant-time string compare.
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
