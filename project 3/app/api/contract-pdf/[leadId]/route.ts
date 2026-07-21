// On-demand PDF-Render des unterschriebenen Dienstleistungsvertrags.
//
// Aufgerufen vom Portal (BookedScreen "Vertragskasten") via <iframe> oder
// Download-Button, damit der Kunde nach Buchung den schönen Mustervertrag-
// PDF im Portal sehen kann — nicht nur als Mail-Anhang.
//
// Quelle der Daten: lead_application_acceptances (befüllt beim Buchen vom
// gleichen Bridge-Endpoint /api/lead-event, der die Mail-Anhänge baut).
// Wir lesen contract_snapshot + signatur + signed_at und füttern sie in
// denselben buildVertragAttachmentPdf-Helper. → Mail-PDF und Portal-PDF
// sind 1:1 identisch.
//
// Auth: Token-basiert wie /api/lead-event GET. Der Kunde hat über das
// Magic-Link-Token Zugriff auf seinen eigenen Lead.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildVertragAttachmentPdf, type VertragInput } from '../../../../lib/vertrag';

export const dynamic = 'force-dynamic';
// PDF-Render dauert 1-3s + braucht Chromium → forciert Node.js-Runtime,
// damit puppeteer-core + @sparticuz/chromium laden können (Edge geht nicht).
export const runtime = 'nodejs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET /api/contract-pdf/[leadId]?token=<magic-link-token>
//
// Liefert das unterschriebene Vertrags-PDF (application/pdf) für den Lead.
// 404 wenn keine Acceptance-Row existiert (= noch nicht gebucht) oder die
// Acceptance-Row keinen contract_snapshot hat (= alte Buchung vor B3).
export async function GET(
  request: NextRequest,
  { params }: { params: { leadId: string } },
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[contract-pdf] missing Supabase env');
      return NextResponse.json(
        { error: 'server misconfigured' },
        { status: 500, headers: corsHeaders },
      );
    }

    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json(
        { error: 'token required' },
        { status: 400, headers: corsHeaders },
      );
    }
    const leadId = params.leadId;
    if (!leadId || !/^[0-9a-f-]{36}$/i.test(leadId)) {
      return NextResponse.json(
        { error: 'invalid leadId' },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Token-Check: leadId + token müssen zusammenpassen. Schützt vor
    // Cross-Lead-Zugriff (Kunde A sollte Vertrag von Kunde B nicht sehen).
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('token', token)
      .maybeSingle();
    if (!lead) {
      return NextResponse.json(
        { error: 'lead not found' },
        { status: 404, headers: corsHeaders },
      );
    }

    // Neueste Acceptance-Row holen. Pro Lead sollte es genau eine geben
    // (Kunde akzeptiert eine Bewerbung); ORDER BY signed_at DESC als
    // Safety, falls historisch zwei Acceptances drin sind.
    const { data: acceptance, error: accErr } = await supabase
      .from('lead_application_acceptances')
      .select('contract_snapshot, signatur, signed_at, signed_ort, consent_read, consent_widerruf, contract_version')
      .eq('lead_id', leadId)
      .order('signed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (accErr) {
      console.error('[contract-pdf] supabase error:', accErr.message);
      return NextResponse.json(
        { error: 'db error' },
        { status: 500, headers: corsHeaders },
      );
    }
    if (!acceptance || !acceptance.contract_snapshot) {
      return NextResponse.json(
        { error: 'no signed contract yet' },
        { status: 404, headers: corsHeaders },
      );
    }

    const snap = acceptance.contract_snapshot as Record<string, unknown>;
    // Defensive Mapping: Snapshot-Form aus AngebotPruefenModal stimmt mit
    // VertragInput überein, aber wir wollen TS happy machen.
    const vertragsDaten: VertragInput = {
      datum: typeof snap.datum === 'string' ? snap.datum : undefined,
      vertragsbeginn:
        typeof snap.vertragsbeginn === 'string' ? snap.vertragsbeginn : undefined,
      voraussAbreise:
        typeof snap.voraussAbreise === 'string' ? snap.voraussAbreise : undefined,
      tagessatz: typeof snap.tagessatz === 'string' ? snap.tagessatz : undefined,
      ag: (snap.ag as VertragInput['ag']) ?? undefined,
      le: (snap.le as VertragInput['le']) ?? null,
      dl: (snap.dl as VertragInput['dl']) ?? undefined,
    };

    // Signatur-Daten — wenn keine Signatur (= Vertrag noch nicht signiert,
    // sollte bei unserer Acceptance-Logik nicht passieren), fallen wir auf
    // AG-Namen zurück, damit das PDF trotzdem rendert.
    const signaturName =
      typeof acceptance.signatur === 'string' && acceptance.signatur.trim()
        ? acceptance.signatur.trim()
        : (vertragsDaten.ag?.name ?? 'Auftraggeber');
    // signed_at: ISO-String aus DB → menschenlesbares DE-Format
    let signedAt: string | undefined;
    if (typeof acceptance.signed_at === 'string') {
      const d = new Date(acceptance.signed_at);
      if (!Number.isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        signedAt = `${dd}.${mm}.${d.getFullYear()} um ${hh}:${mi} Uhr`;
      }
    }

    // Version aus der Row (gepinnt beim Signieren); Alt-Zeilen ohne Spalte
    // → v1.0 (der bis dahin einzige Text). Ort + Consents rendern mit,
    // damit Portal-PDF == Mail-PDF (gleiche Datenquelle, gleiche Optik).
    const contractVersion =
      typeof acceptance.contract_version === 'string' && acceptance.contract_version.trim()
        ? acceptance.contract_version.trim()
        : 'v1.0';
    const attachment = await buildVertragAttachmentPdf(vertragsDaten, {
      signaturName,
      signedAt,
      signedOrt:
        typeof acceptance.signed_ort === 'string' && acceptance.signed_ort.trim()
          ? acceptance.signed_ort.trim()
          : undefined,
      consents: {
        read: acceptance.consent_read === true,
        widerruf: acceptance.consent_widerruf === true,
      },
      auditNote: `Vertragsversion ${contractVersion}`,
    });

    // Wenn der Fallback HTML statt PDF geliefert hat (Chrome-Render fail),
    // dann auch entsprechend ausliefern — besser als 500.
    const isPdf = attachment.contentType.startsWith('application/pdf');
    const body =
      typeof attachment.content === 'string'
        ? attachment.content
        : new Uint8Array(attachment.content);

    return new NextResponse(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': attachment.contentType,
        // inline = im Browser-Tab anzeigen statt Download (so kann
        // <iframe src=...> den PDF im Vertragskasten zeigen).
        'Content-Disposition': `inline; filename="${attachment.filename}"`,
        // Token in URL → nicht in shared caches. Browser darf cachen.
        'Cache-Control': isPdf ? 'private, max-age=300' : 'no-store',
      },
    });
  } catch (e) {
    console.error(
      '[contract-pdf] error:',
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json(
      { error: 'failed' },
      { status: 500, headers: corsHeaders },
    );
  }
}
