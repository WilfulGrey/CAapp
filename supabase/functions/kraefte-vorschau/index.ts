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
  query KraefteVorschau($limit: Int, $page: Int) {
    CaregiversWithPagination(limit: $limit, page: $page) {
      last_page
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

// Die Liste ist seitenweise (Laravel-Paginator: limit/page, last_page). Der
// erste Wurf las nur Seite 1 mit 400 Kräften — das waren die NEUESTEN, alle
// mit 0 Einsätzen; die Stammkräfte standen auf den Seiten dahinter. Deshalb
// alle Seiten (Deckel 8 × 400), einmal je 10 Minuten.
const LISTE_LIMIT = 400;
const MAX_SEITEN = 8;
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
  type Seite = { CaregiversWithPagination?: { data?: RohKraft[]; last_page?: number } };
  const ladeSeite = (page: number) =>
    mamamiaRequest<Seite>({
      endpoint: Deno.env.get("MAMAMIA_ENDPOINT")!,
      token,
      query: LISTE_QUERY,
      variables: { limit: LISTE_LIMIT, page },
      fetchFn,
    });
  // Seite 1 verrät die Seitenzahl, der Rest kommt parallel — zwei Umläufe
  // statt acht (jeder mamamia-Aufruf kostet 0,7–2,5 s, und der Kunde wartet
  // gerade auf der Matching-Animation).
  const erste = await ladeSeite(1);
  const letzte = Math.min(erste?.CaregiversWithPagination?.last_page ?? 1, MAX_SEITEN);
  const weitere = await Promise.all(
    Array.from({ length: Math.max(0, letzte - 1) }, (_, i) => ladeSeite(i + 2)),
  );
  const kraefte = [erste, ...weitere].flatMap((s) => s?.CaregiversWithPagination?.data ?? []);
  cache = { at: Date.now(), kraefte };
  return kraefte;
}

/** Nur Zählwerte, keine Personendaten — zum Prüfen des Pools. */
export function statistik(alle: RohKraft[], now: Date = new Date()) {
  const bis = now.getTime() + 60 * 24 * 3600 * 1000;
  const bald = (iso?: string | null) => !!iso && Number.isFinite(new Date(iso).getTime()) && new Date(iso).getTime() <= bis;
  return {
    gesamt: alle.length,
    gesperrt: alle.filter((k) => k.caregiver_status?.is_blocked).length,
    mitEinsaetzen: alle.filter((k) => (k.hp_total_jobs ?? 0) > 0).length,
    mitErfahrung: alle.filter((k) => (parseInt(k.care_experience ?? "", 10) || 0) > 0).length,
    promoFoto: alle.filter((k) => k.avatar_retouched_promo?.aws_url).length,
    retuschiertesFoto: alle.filter((k) => k.avatar_retouched?.aws_url).length,
    verfuegbar60: alle.filter((k) => bald(k.available_from)).length,
    ohneDatum: alle.filter((k) => !k.available_from).length,
  };
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
    if (body && typeof body === "object" && (body as { stats?: unknown }).stats === true) {
      return Response.json(statistik(alle), { headers: CORS });
    }
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
