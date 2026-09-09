/* ─── Edge Function: kraefte-vorschau ─────────────────────────────────────
 *
 * POST { deutsch, geschlecht, fuehrerschein }  →  { kraefte: VorschauKraft[], gesamt }
 *
 * Wird vom Kostenrechner VOR der Kontaktschranke aufgerufen (anonym, ohne
 * Lead). Holt die Agentur-weite Kräfteliste aus mamamia (einmal je 10
 * Minuten, dann aus dem Speicher — der Aufruf ist der teure Teil, nicht die
 * Größe der Antwort) und wählt lokal drei passende, gerade verfügbare Kräfte.
 * Siehe vorschau.ts für Filter, Reihenfolge und Datenschutz-Regeln.
 *
 * Fällt mamamia aus oder fehlt ein Secret: HTTP 200 mit leerer Liste. Der
 * Rechner zeigt dann seinen bisherigen Kasten. Nie ein 5xx an den Browser,
 * nie ein Wartezustand im Formular.
 */
import { getOrRefreshAgencyToken, mamamiaRequest } from "../_shared/mamamiaClient.ts";
import { type RohKraft, waehleVorschau, type Wuensche } from "./vorschau.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const LISTE_QUERY = /* GraphQL */ `
  query KraefteVorschau($limit: Int) {
    CaregiversWithPagination(limit: $limit) {
      data {
        id first_name gender year_of_birth germany_skill care_experience
        available_from last_contact_at hp_total_jobs driving_license
        caregiver_status { is_blocked }
        avatar_retouched_promo { aws_url }
        avatar_retouched { aws_url }
      }
    }
  }
`;

const LISTE_LIMIT = 400;
const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; kraefte: RohKraft[] } | null = null;

export async function ladeKraefte(fetchFn: typeof fetch = fetch): Promise<RohKraft[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.kraefte;
  const token = await getOrRefreshAgencyToken({
    authEndpoint: Deno.env.get("MAMAMIA_AUTH_ENDPOINT")!,
    email: Deno.env.get("MAMAMIA_AGENCY_EMAIL")!,
    password: Deno.env.get("MAMAMIA_AGENCY_PASSWORD")!,
    fetchFn,
  });
  const data = await mamamiaRequest<{ CaregiversWithPagination?: { data?: RohKraft[] } }>({
    endpoint: Deno.env.get("MAMAMIA_ENDPOINT")!,
    token,
    query: LISTE_QUERY,
    variables: { limit: LISTE_LIMIT },
    fetchFn,
  });
  const kraefte = data?.CaregiversWithPagination?.data ?? [];
  cache = { at: Date.now(), kraefte };
  return kraefte;
}

export function _resetCache() { cache = null; }

function wuenscheAus(body: unknown): Wuensche {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.length <= 40 ? v : null);
  return { deutsch: s(b.deutsch), geschlecht: s(b.geschlecht), fuehrerschein: s(b.fuehrerschein) };
}

export async function handleRequest(req: Request, lade: () => Promise<RohKraft[]> = ladeKraefte): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const w = wuenscheAus(body);
  try {
    const alle = await lade();
    const kraefte = waehleVorschau(alle, w);
    return Response.json({ kraefte, gesamt: alle.length }, { headers: CORS });
  } catch (e) {
    console.error("[kraefte-vorschau] leer wegen Fehler:", e instanceof Error ? e.message : String(e));
    return Response.json({ kraefte: [], gesamt: 0, fehler: true }, { headers: CORS });
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleRequest(req));
}
