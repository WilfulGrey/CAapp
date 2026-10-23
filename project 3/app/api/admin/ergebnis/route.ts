import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ergebnisJeMonat, berlinTag, EINSATZ_STATUS, WACHSTUM_START,
  type WLead, type WEinsatz, type AdsKostenTag, type MonatsEinstellung,
} from '@/lib/wachstum';
import { PORTAL_PREISE } from '@/lib/lead-kosten';

/**
 * Ergebnis je Monat für /admin/ergebnis (Martin, 15.09.2026: „Mach für das
 * finanzielle Ergebnis einen eigenen Menüpunkt"): Provision je Kunde minus
 * variable Kosten, Werbung (Google + eingekaufte Anfragen, automatisch) und
 * Gemeinkosten (Eingabe je Monat). Rechnen: lib/wachstum.ts `ergebnisJeMonat`.
 *
 * Service-Key hinter dem Admin-Cookie; an den Browser gehen nur Summen.
 */

const SEITE = 1000; // PostgREST liefert höchstens 1000 Zeilen je Abruf

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

  const heute = berlinTag(new Date());
  try {
    const [leads, einsaetze, adsKosten, kosten] = await Promise.all([
      alle<WLead>((a, b) => supabase.from('leads')
        .select('id, source, ist_test, email, vorname, nachname, created_at')
        .order('id').range(a, b)),
      alle<WEinsatz>((a, b) => supabase.from('lead_jobs')
        .select('lead_id, status, anreise, abreise')
        .in('status', EINSATZ_STATUS)
        .order('id').range(a, b)),
      alle<AdsKostenTag>((a, b) => supabase.from('ads_kosten_tag')
        .select('tag, kosten_netto')
        .gte('tag', WACHSTUM_START)
        .order('tag').range(a, b)),
      supabase.from('wachstum_monat').select('monat, provision_je_kunde, variabel_je_kunde, gemeinkosten').order('monat'),
    ]);
    /* Fehlt die Tabelle (Migration nicht eingespielt), rechnet die Seite mit den
       Standardwerten weiter und sagt das deutlich dazu — Speichern geht dann nicht. */
    const tabelleFehlt = !!kosten.error && ['42P01', 'PGRST205'].includes(String(kosten.error.code));
    if (kosten.error && !tabelleFehlt) throw new Error(kosten.error.message);
    const einstellungen = (kosten.data ?? []) as MonatsEinstellung[];

    return NextResponse.json({
      heute,
      monate: ergebnisJeMonat({ leads, einsaetze, adsKosten, einstellungen, portalPreise: PORTAL_PREISE, heute }),
      kostenTabelleFehlt: tabelleFehlt,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
