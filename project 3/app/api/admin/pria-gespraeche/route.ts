/*
 * Gespräche fürs Admin lesen.
 *
 * Ohne `sid`: die Liste — je Gespräch eine Zeile mit Beginn, Dauer, Anzahl
 * Nachrichten, der ersten Kundenfrage und der Marke, ob daraus ein Lead wurde.
 * Mit `sid`: der ganze Verlauf.
 *
 * Serviceseitig, weil die Tabelle RLS ohne anon-Policies hat. Die Admin-Seite
 * liegt hinter dem bestehenden Login (middleware), deshalb reicht das hier.
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const db = supabase();
  if (!db) return NextResponse.json({ fehler: 'Supabase nicht konfiguriert.' }, { status: 503 });

  const sid = request.nextUrl.searchParams.get('sid');

  // ── Ein Gespräch am Stück ────────────────────────────────────────
  if (sid) {
    const { data, error } = await db
      .from('pria_gespraeche')
      .select('*')
      .eq('sid', sid)
      .order('zeit', { ascending: true });
    if (error) return NextResponse.json({ fehler: error.message }, { status: 500 });
    return NextResponse.json({ sid, zeilen: data ?? [] });
  }

  // ── Die Liste ────────────────────────────────────────────────────
  // Bewusst ohne SQL-Aggregat: die Menge ist klein, und eine RPC waere eine
  // zusaetzliche Migration fuer einen Bericht, der sich noch aendert.
  const { data, error } = await db
    .from('pria_gespraeche')
    .select('sid, rolle, text, ereignis, lead_id, zeit')
    .order('zeit', { ascending: false })
    .limit(4000);
  if (error) return NextResponse.json({ fehler: error.message }, { status: 500 });

  const proSid = new Map<string, any>();
  for (const z of data ?? []) {
    let g = proSid.get(z.sid);
    if (!g) {
      g = { sid: z.sid, beginn: z.zeit, ende: z.zeit, nachrichten: 0,
            ersteFrage: null as string | null, lead: false, leadId: null as string | null };
      proSid.set(z.sid, g);
    }
    // Absteigend sortiert: das zuletzt Gesehene ist das Frueheste.
    g.beginn = z.zeit;
    if (z.zeit > g.ende) g.ende = z.zeit;
    if (z.rolle === 'kunde' || z.rolle === 'pria') g.nachrichten++;
    if (z.rolle === 'kunde' && z.text) g.ersteFrage = z.text.slice(0, 120);
    if (z.ereignis === 'lead') g.lead = true;
    if (z.lead_id) g.leadId = z.lead_id;
  }

  // Array.from statt Spread: das Projekt kompiliert auf ein Ziel ohne
  // downlevelIteration, dort ist der Spread eines Iterators ein Typfehler.
  const liste = Array.from(proSid.values()).sort((a, b) => (a.ende < b.ende ? 1 : -1));
  return NextResponse.json({ gespraeche: liste });
}
