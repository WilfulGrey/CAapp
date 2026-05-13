import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  try {
    console.log('[PDF] Starte PDF-Generierung für Lead:', params.leadId);

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', params.leadId)
      .maybeSingle();

    if (error) {
      console.error('[PDF] Datenbankfehler:', error);
      return NextResponse.json(
        { error: 'Datenbankfehler', details: error.message },
        { status: 500 }
      );
    }

    if (!lead) {
      console.error('[PDF] Lead nicht gefunden:', params.leadId);
      return NextResponse.json(
        { error: 'Lead nicht gefunden' },
        { status: 404 }
      );
    }

    if (!lead.kalkulation) {
      console.error('[PDF] Keine Kalkulation vorhanden für Lead:', params.leadId);
      return NextResponse.json(
        { error: 'Keine Kalkulation für diesen Lead vorhanden' },
        { status: 404 }
      );
    }

    console.log('[PDF] Lead gefunden, generiere PDF mit Puppeteer...');
    console.log('[PDF] Kalkulation-Daten:', JSON.stringify(lead.kalkulation).substring(0, 200));

    const kalk = lead.kalkulation;

    const pflegegeld = kalk.zuschüsse?.items?.find((z: any) => z.name === 'pflegegeld')?.betrag_monatlich || 0;
    const entlastungsbudget = kalk.zuschüsse?.items?.find((z: any) => z.name === 'entlastungsbudget_neu')?.betrag_monatlich || 0;
    const steuervorteil = kalk.zuschüsse?.items?.find((z: any) => z.name === 'steuervorteil')?.betrag_monatlich || 0;

    const formData = kalk.formularDaten || kalk.formular_daten || {};

    const leadData = {
      betreuungFuer: formData.betreuung_fuer || formData.betreuungFuer || 'Unbekannt',
      pflegegrad: formData.pflegegrad || 0,
      mobilitaet: formData.mobilitaet || 'Unbekannt',
      nachteinsaetze: formData.nachteinsaetze || 'Unbekannt',
      deutschkenntnisse: formData.deutschkenntnisse || 'Unbekannt',
      erfahrung: formData.erfahrung || 'Unbekannt',
      // PDF "Pflegekraft jetzt finden" CTA — points at the CA app handoff
      // (kundenportal). Prefer NEXT_PUBLIC_PORTAL_URL + ?token=…; falls
      // back to "#" when the lead has no token (very early stage) or the
      // env var isn't configured. The PDF stays usable but the button
      // is a no-op in that case.
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

    const { generateKalkulationPDF } = await import('@/lib/pdf-generator-pdfkit');
    const buffer = await generateKalkulationPDF(leadData, kalkulationData);

    console.log('[PDF] PDF erfolgreich generiert, Größe:', buffer.length, 'bytes');

    const filename = `Primundus_Kalkulation_${lead.vorname || 'Lead'}_${lead.id.substring(0, 8)}.pdf`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[PDF] Fehler bei PDF-Generierung:', error);
    console.error('[PDF] Error Stack:', error instanceof Error ? error.stack : 'Kein Stack');

    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    const errorStack = error instanceof Error ? error.stack : '';

    return NextResponse.json(
      {
        error: 'Fehler bei PDF-Generierung',
        details: errorMessage,
        stack: errorStack
      },
      { status: 500 }
    );
  }
}
