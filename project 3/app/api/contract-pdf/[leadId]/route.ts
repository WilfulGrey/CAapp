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
import { buildVertragAttachmentPdf, formatSignedAtBerlin, type VertragInput } from '../../../../lib/vertrag';

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
async function handleGet(
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
      .select('application_id, contract_snapshot, signatur, signed_at')
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

    // KANON zuerst (Michał: „1 i ten sam, niezmieniany plik"): der beim
    // Akzept einmalig gerenderte PDF aus dem Bucket — Byte-identisch mit
    // Mail-Anhang und Mamamia-Upload. Nur wenn er (Alt-Buchung) fehlt,
    // fällt der Endpoint auf einen Re-Render zurück.
    const appIdNum = Number(acceptance.application_id);
    if (Number.isFinite(appIdNum)) {
      try {
        const { data: canon } = await supabase.storage
          .from('contracts')
          .download(`${leadId}/${appIdNum}.pdf`);
        if (canon) {
          const buf = Buffer.from(await canon.arrayBuffer());
          if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
            return new NextResponse(new Uint8Array(buf), {
              status: 200,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename="Betreuungsvertrag_Primundus.pdf"',
                'Cache-Control': 'private, max-age=300',
              },
            });
          }
        }
      } catch (e) {
        console.error('[contract-pdf] canonical download failed, falling back to render:', e instanceof Error ? e.message : String(e));
      }
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
    // signed_at: ISO-String aus DB → deutsches Format in Europe/Berlin.
    // NIE getHours(): der Server läuft UTC — genau daraus entstanden zwei
    // Verträge mit zwei Uhrzeiten (17:00 UTC vs 19:00 deutscher Zeit).
    const signedAt = typeof acceptance.signed_at === 'string'
      ? formatSignedAtBerlin(acceptance.signed_at)
      : undefined;

    const attachment = await buildVertragAttachmentPdf(vertragsDaten, {
      signaturName,
      signedAt,
      auditNote: 'Vertragsversion v1.1',
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

// ─── Telemetria RAM (diagnoza OOM — plan 2026-08-09; format: [req] …) ───
import { withMem } from '@/lib/memlog';
export const GET = withMem('contract-pdf', handleGet);
