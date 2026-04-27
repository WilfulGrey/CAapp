// Supabase Edge Function: customer-verify
// POST /functions/v1/customer-verify  body: { token: <magic-link-token> }
// Cookie: session=<JWT from onboard-to-mamamia>
//
// Exchanges a Mamamia magic-link token (from the email triggered by
// SendInvitationCustomer) for a customer-scope User.token, and re-issues
// our session cookie with `customer_token` embedded so subsequent
// mamamia-proxy mutations can use it.

import { corsHeaders } from "../_shared/cors.ts";
import { handle, type VerifySecrets } from "./handler.ts";

// Bootstrap (prod only). The handler is exported separately for testing.
if (import.meta.main) {
  const secrets: VerifySecrets = {
    mamamiaAuthEndpoint: Deno.env.get("MAMAMIA_AUTH_ENDPOINT")!,
    sessionJwtSecret: Deno.env.get("SESSION_JWT_SECRET")!,
  };

  Deno.serve(async (req: Request) => {
    const origin = req.headers.get("origin");
    const baseHeaders = corsHeaders(origin);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: baseHeaders });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { ...baseHeaders, "Content-Type": "application/json" },
      });
    }

    let res: Response;
    try {
      res = await handle(req, secrets);
    } catch (e) {
      console.error("customer-verify crashed:", (e as Error).message);
      res = new Response(JSON.stringify({ error: "internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Merge CORS onto handler response, preserving Set-Cookie.
    const merged = new Headers(res.headers);
    for (const [k, v] of Object.entries(baseHeaders)) merged.set(k, v);
    return new Response(res.body, { status: res.status, headers: merged });
  });
}
