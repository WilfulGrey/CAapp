import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  wachstum, potenzial, ergebnisJeMonat, berlinTag, wochenStart, tagPlus,
  PROFIL_EREIGNISSE, EINSATZ_STATUS, WACHSTUM_START,
  type WLead, type WEreignis, type WEinsatz, type AdsKostenTag, type MonatsEinstellung,
} from '@/lib/wachstum';
import { PORTAL_PREISE } from '@/lib/lead-kosten';

/**
 * Wachstum auf einen Blick: Potenzialentwicklung im laufenden Monat, Kunden im
 * Einsatz je Tag, Anfragen und fertige Profile je Woche (Martin, 14.09.2026),
 * dazu das Ergebnis je Monat aus Provision, Werbung und Gemeinkosten (15.09.).
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
    const [adsKosten, kosten] = await Promise.all([
      alle<AdsKostenTag>((a, b) => supabase.from('ads_kosten_tag')
        .select('tag, kosten_netto')
        .gte('tag', WACHSTUM_START)
        .order('tag').range(a, b)),
      supabase.from('wachstum_monat').select('monat, provision_je_kunde, variabel_je_kunde, gemeinkosten').order('monat'),
    ]);
    /* Fehlt die Tabelle (Migration noch nicht eingespielt), rechnet die Seite mit
       den Standardwerten weiter und sagt das deutlich dazu — Speichern geht dann nicht. */
    const tabelleFehlt = !!kosten.error && ['42P01', 'PGRST205'].includes(String(kosten.error.code));
    if (kosten.error && !tabelleFehlt) throw new Error(kosten.error.message);
    const einstellungen = (kosten.data ?? []) as MonatsEinstellung[];

    return NextResponse.json({
      ...wachstum({ leads, ereignisse, einsaetze, von, heute }),
      potenzial: potenzial({ leads, ereignisse, einsaetze, heute }),
      ergebnis: ergebnisJeMonat({ leads, einsaetze, adsKosten, einstellungen, portalPreise: PORTAL_PREISE, heute }),
      kostenTabelleFehlt: tabelleFehlt,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
