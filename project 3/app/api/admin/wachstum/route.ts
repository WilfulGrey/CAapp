import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  wachstum, potenzial, berlinTag, wochenStart, tagPlus,
  PROFIL_EREIGNISSE, EINSATZ_STATUS, WACHSTUM_START,
  type WLead, type WEreignis, type WEinsatz,
} from '@/lib/wachstum';

/**
 * Wachstum auf einen Blick: Potenzialentwicklung im laufenden Monat, Kunden im
 * Einsatz je Tag, Anfragen und fertige Profile je Woche (Martin, 14.09.2026).
 *
 * Server-seitig mit dem Service-Key; an den Browser gehen nur Summen, keine
 * Namen oder Adressen.
 */

const SEITE = 1000; // PostgREST liefert höchstens 1000 Zeilen je Abruf; sortiert nach id, damit Seiten sich nicht überlappen

async function alle<T>(abruf: (von: number, bis: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const zeilen: T[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await abruf(von, von + SEITE - 1);
    if (error) throw new Error(error.message);
    zeilen.push(...(data ?? []));
    if (!data || data.length < SEITE) return zeilen;
  }
}

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get('admin_auth')?.value ?? '';
  if (cookie !== (process.env.ADMIN_PASSWORD || 'primundus2026')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Serverschlüssel fehlt' }, { status: 500 });
  const supabase: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  /* Zeitraum: ganze Wochen (?wochen=12) oder alles seit dem Portal-Start. */
  const heute = berlinTag(new Date());
  const wochenParam = Number(request.nextUrl.searchParams.get('wochen'));
  const von = Number.isFinite(wochenParam) && wochenParam >= 4 && wochenParam <= 104
    ? (() => { const v = tagPlus(wochenStart(heute), -7 * (wochenParam - 1)); return v < WACHSTUM_START ? WACHSTUM_START : v; })()
    : WACHSTUM_START;

  try {
    const [leads, ereignisse, einsaetze] = await Promise.all([
      alle<WLead>((a, b) => supabase.from('leads')
        .select('id, source, status, ist_test, email, vorname, nachname, created_at')
        .order('id').range(a, b)),
      alle<WEreignis>((a, b) => supabase.from('lead_events')
        .select('lead_id, event_type, created_at')
        .in('event_type', PROFIL_EREIGNISSE)
        .order('id').range(a, b)),
      alle<WEinsatz>((a, b) => supabase.from('lead_jobs')
        .select('lead_id, status, anreise, abreise')
        .in('status', [...EINSATZ_STATUS, 'geplant']) // geplant = offene Suche, fürs Potenzial
        .order('id').range(a, b)),
    ]);
    return NextResponse.json({
      ...wachstum({ leads, ereignisse, einsaetze, von, heute }),
      potenzial: potenzial({ leads, ereignisse, einsaetze, heute }),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
