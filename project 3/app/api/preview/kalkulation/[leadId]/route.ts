import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildKalkulationHTML } from '@/lib/pdf-html-builder';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { leadId: string } }
) {
  try {
    console.log('[HTML Preview] Lade Lead:', params.leadId);

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', params.leadId)
      .maybeSingle();

    if (error || !lead) {
      return new NextResponse('Lead nicht gefunden', { status: 404 });
    }

    if (!lead.kalkulation) {
      return new NextResponse('Keine Kalkulation vorhanden', { status: 404 });
    }

    const kalk = lead.kalkulation;

    const pflegegeld = kalk.zuschüsse?.items?.find((z: any) => z.name === 'pflegegeld')?.betrag_monatlich || 0;
    const entlastungsbudget = kalk.zuschüsse?.items?.find((z: any) => z.name === 'entlastungsbudget_neu')?.betrag_monatlich || 0;
    const steuervorteil = kalk.zuschüsse?.items?.find((z: any) => z.name === 'steuervorteil')?.betrag_monatlich || 0;

    const leadData = {
      betreuungFuer: kalk.formular_daten?.betreuung_fuer || 'Unbekannt',
      pflegegrad: kalk.formular_daten?.pflegegrad || 0,
      mobilitaet: kalk.formular_daten?.mobilitaet || 'Unbekannt',
      nachteinsaetze: kalk.formular_daten?.nachteinsaetze || 'Unbekannt',
      deutschkenntnisse: kalk.formular_daten?.deutschkenntnisse || 'Unbekannt',
      erfahrung: kalk.formular_daten?.erfahrung || 'Unbekannt',
      // Mirror of the production /api/pdf/kalkulation route: same magic-link
      // handoff into CA app, falling back to "#" when env / token missing.
      vertragsLink: (() => {
        const portalBase = process.env.NEXT_PUBLIC_PORTAL_URL ?? '';
        if (!portalBase || !lead.token) return '#';
        return `${portalBase.replace(/\/$/, '')}/?token=${encodeURIComponent(lead.token)}`;
      })(),
    };

    const kalkulationData = {
      bruttopreis: kalk.bruttopreis || 0,
      pflegegeld,
      entlastungsbudgetMtl: entlastungsbudget,
      steuervorteil,
      eigenanteil: kalk.eigenanteil || 0,
    };

    const html = buildKalkulationHTML(leadData, kalkulationData);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('[HTML Preview] Fehler:', error);
    return new NextResponse('Fehler beim Generieren der HTML-Vorschau', { status: 500 });
  }
}
