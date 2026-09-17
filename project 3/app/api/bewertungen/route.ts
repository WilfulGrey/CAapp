import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { withMem } from '@/lib/memlog';
import { bestaetigungsMail } from '@/lib/bewertungen-mails';
import { fehlerText, supabaseDienst, type Supa } from '@/lib/bewertungen-server';
import {
  AKTIVE_STATUS,
  apiBasis,
  clientIp,
  corsHeaders,
  EMAIL_SPERRE_MS,
  FEHLER,
  IP_FENSTER_MS,
  ipHash,
  istObjekt,
  limitFehler,
  listenAntwort,
  LISTEN_SPALTEN,
  MAX_LISTE,
  neuerToken,
  pruefeEingabe,
  QUELLE,
  tokenHash,
  TURNSTILE_URL,
  turnstileFormular,
  turnstileOk,
  verwerfGrund,
  type BewertungZeile,
} from '@/lib/bewertungen';

// Kundenbewertungen für primundus.de/erfahrungen (Vertrag und Env: lib/bewertungen.ts).
//   GET  → veröffentlichte Bewertungen, öffentlich, 5 Minuten im CDN
//   POST → neue Bewertung „unbestaetigt“ + Bestätigungsmail an die Person

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cors(request: NextRequest): Record<string, string> {
  return corsHeaders(request.headers.get('origin'), process.env.BEWERTUNG_CORS_EXTRA);
}

function json(request: NextRequest, body: unknown, status: number, cache: string): NextResponse {
  return NextResponse.json(body, { status, headers: { ...cors(request), 'Cache-Control': cache } });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

async function handleGet(request: NextRequest) {
  try {
    const { data, error } = await supabaseDienst()
      .from('bewertungen')
      .select(LISTEN_SPALTEN)
      .eq('status', 'veroeffentlicht')
      // Wie gezeigt: coalesce(datum, veroeffentlicht_am). datum wird beim Freigeben
      // und Eintragen gesetzt; listenAntwort sortiert den Rest exakt nach.
      .order('datum', { ascending: false, nullsFirst: false })
      .order('veroeffentlicht_am', { ascending: false, nullsFirst: false })
      .limit(MAX_LISTE);
    if (error) throw new Error(error.message);
    const antwort = listenAntwort((data ?? []) as unknown as BewertungZeile[], new Date());
    return json(request, antwort, 200, 'public, s-maxage=300, stale-while-revalidate=600');
  } catch (e) {
    console.error('[bewertungen] Liste laden:', fehlerText(e));
    return json(request, { ok: false, fehler: { _: 'Die Bewertungen konnten gerade nicht geladen werden.' } }, 500, 'no-store');
  }
}

async function pruefeTurnstile(secret: string, token: string, ip: string | null): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  try {
    const res = await fetch(TURNSTILE_URL, {
      method: 'POST',
      body: turnstileFormular(secret, token, ip),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const ok = turnstileOk(await res.json());
    if (!ok) console.warn('[bewertungen] Turnstile abgelehnt');
    return ok;
  } catch (e) {
    console.error('[bewertungen] Turnstile nicht erreichbar:', fehlerText(e));
    return false;
  }
}

async function zaehle(anfrage: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await anfrage;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function limitPruefen(supabase: Supa, hash: string | null, email: string, jetzt: number): Promise<string | null> {
  const seit = (ms: number) => new Date(jetzt - ms).toISOString();
  const [ipAnzahl24h, emailAnzahl30Tage] = await Promise.all([
    hash
      ? zaehle(supabase.from('bewertungen').select('id', { count: 'exact', head: true }).eq('ip_hash', hash).gte('erstellt_am', seit(IP_FENSTER_MS)))
      : Promise.resolve(null),
    // E-Mail steht klein geschrieben in der Tabelle (pruefeEingabe) ⇒ eq reicht.
    zaehle(supabase.from('bewertungen').select('id', { count: 'exact', head: true }).eq('email', email).in('status', [...AKTIVE_STATUS]).gte('erstellt_am', seit(EMAIL_SPERRE_MS))),
  ]);
  return limitFehler({ ipAnzahl24h, emailAnzahl30Tage });
}

async function handlePost(request: NextRequest) {
  const antwort = (body: unknown, status: number) => json(request, body, status, 'no-store');

  // Nur JSON: ein Formular einer fremden Seite (text/plain, ohne Preflight)
  // kommt so nicht durch.
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return antwort({ ok: false, fehler: { _: FEHLER.anfrage } }, 400);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return antwort({ ok: false, fehler: { _: FEHLER.anfrage } }, 400);
  }
  if (!istObjekt(body)) return antwort({ ok: false, fehler: { _: FEHLER.anfrage } }, 400);

  const jetzt = Date.now();
  const verwerfen = verwerfGrund(body, jetzt);
  if (verwerfen) {
    // Still: Bots erfahren nicht, woran es lag. Im Log steht der Grund.
    console.warn(`[bewertungen] still verworfen: ${verwerfen}`);
    return antwort({ ok: true }, 202);
  }

  const pruefung = pruefeEingabe(body);
  if (!pruefung.ok) return antwort({ ok: false, fehler: pruefung.fehler }, 400);
  const d = pruefung.daten;
  const ip = clientIp((name) => request.headers.get(name));

  let turnstile: boolean | null = null;
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (secret) {
    turnstile = await pruefeTurnstile(secret, typeof body.turnstile_token === 'string' ? body.turnstile_token : '', ip);
    if (!turnstile) return antwort({ ok: false, fehler: { _: FEHLER.turnstile } }, 400);
  }

  try {
    const supabase = supabaseDienst();
    const salz = process.env.BEWERTUNG_HASH_SALT;
    if (!salz) console.warn('[bewertungen] BEWERTUNG_HASH_SALT fehlt, ip_hash nutzt den festen Ersatzwert');
    const hash = ipHash(ip, salz);

    const limit = await limitPruefen(supabase, hash, d.email, jetzt);
    if (limit) return antwort({ ok: false, fehler: { _: limit } }, 429);

    const bestaetigenToken = neuerToken();
    // Der Moderations-Token wird bei der Bestätigung neu erzeugt (nur dort
    // kommt er in eine Mail); hier nur, damit die Spalte nie leer ist.
    const { data: zeile, error } = await supabase
      .from('bewertungen')
      .insert({
        sterne: d.sterne,
        text: d.text,
        name: d.name,
        ort: d.ort,
        email: d.email,
        ip_hash: hash,
        user_agent: (request.headers.get('user-agent') ?? '').slice(0, 500) || null,
        status: 'unbestaetigt',
        bestaetigen_token_hash: tokenHash(bestaetigenToken),
        moderation_token_hash: tokenHash(neuerToken()),
        quelle: QUELLE,
        herkunft: 'formular',
        turnstile_ok: turnstile,
      })
      .select('id')
      .single();
    if (error || !zeile) throw new Error(error?.message ?? 'Insert ohne Zeile');

    const basis = apiBasis(process.env);
    const mail = bestaetigungsMail({ ...d, link: `${basis}/api/bewertungen/bestaetigen?t=${bestaetigenToken}`, basis });
    // Ohne Ops-BCC: die Mail trägt einen gültigen Bestätigungslink.
    const r = await sendEmail(d.email, mail, undefined, { skipBcc: true });
    if (r.success) console.log(`[bewertungen] eingegangen id=${zeile.id} sterne=${d.sterne}`);
    else console.error(`[bewertungen] Bestätigungsmail fehlgeschlagen id=${zeile.id}:`, r.error);
    return antwort({ ok: true }, 202);
  } catch (e) {
    console.error('[bewertungen] Speichern:', fehlerText(e));
    return antwort({ ok: false, fehler: { _: FEHLER.server } }, 500);
  }
}

export const GET = withMem('bewertungen GET', handleGet);
export const POST = withMem('bewertungen POST', handlePost);
