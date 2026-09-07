import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { quellenAuswertung, gruppenSumme } from '@/lib/lead-kosten';

/**
 * Kosten und Ertrag je Lead-Quelle über einen frei wählbaren Zeitraum.
 *
 * Martin, 06.09.2026: „geil wäre, wenn wir einen bereich hätten im system wo
 * wir das so sehen könnten, filtern könnten und auch nach zeit filtern … das
 * eingekaufte nicht nur als summe zeigen, sondern nach jeder quelle, um diese
 * besser zu bewerten."
 *
 * Server-seitig mit dem Service-Key: der Anon-Key liegt im Browser-Bundle,
 * Kostendaten gehören dort nicht hin.
 */
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get('admin_auth')?.value ?? '';
  if (cookie !== (process.env.ADMIN_PASSWORD || 'primundus2026')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Serverschlüssel fehlt' }, { status: 500 });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const tage = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('days') ?? 30)));
  const bis = new Date();
  const von = new Date(bis.getTime() - tage * 24 * 60 * 60 * 1000);
  const vonIso = von.toISOString();

  const [leadsRes, kostenRes] = await Promise.all([
    supabase.from('leads').select('id, source, ist_test').gte('created_at', vonIso),
    supabase.from('ads_kosten_tag').select('kosten_netto').gte('tag', vonIso.slice(0, 10)),
  ]);
  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 });

  const leads = leadsRes.data ?? [];
  /* Profile über die Ereignisse der Leads: nur so zählt ein Profil zu SEINER
     Quelle, auch wenn es Tage nach dem Lead ausgefüllt wurde. */
  const profile = new Set<string>();
  if (leads.length > 0) {
    const ids = leads.map((l) => l.id);
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await supabase
        .from('lead_events')
        .select('lead_id')
        .eq('event_type', 'patient_data_saved')
        .in('lead_id', ids.slice(i, i + 500));
      for (const e of data ?? []) if (e.lead_id) profile.add(String(e.lead_id));
    }
  }

  const werbekosten = (kostenRes.data ?? []).reduce((s, r) => s + Number(r.kosten_netto ?? 0), 0);
  const { zeilen, ohnePreis } = quellenAuswertung(leads, profile, werbekosten);

  return NextResponse.json({
    tage,
    von: vonIso.slice(0, 10),
    werbekosten: Math.round(werbekosten * 100) / 100,
    /* Fehlt für einen Teil des Zeitraums die Werbe-Zeile, ist die Summe zu
       niedrig — das muss dranstehen, sonst wirken die Kosten je Lead zu gut. */
    werbetageVorhanden: (kostenRes.data ?? []).length,
    zeilen,
    ohnePreis,
    summe: gruppenSumme(zeilen),
    eigene: gruppenSumme(zeilen, 'eigene'),
    eingekauft: gruppenSumme(zeilen, 'eingekauft'),
  });
}
