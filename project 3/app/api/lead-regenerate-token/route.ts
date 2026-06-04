import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, getTokenRegenerationEmailTemplate } from '@/lib/email';
import { generateToken, getTokenExpiry } from '@/lib/calculation';

// Token regeneration endpoint. Two distinct entry paths:
//
// 1. Portal path (`{ token, source: 'portal' }`) — the customer hits the
//    portal with an expired magic-link, clicks "Neuen Link senden". The
//    OLD token in the body is proof of identity (they had the link from
//    their email originally). Random URLs return 404 — we don't regen
//    on guesses.
//
// 2. Admin path (`{ lead_id, source: 'admin-silent' | 'admin-with-email' }`)
//    — admin in the kostenrechner panel clicks a button on the lead
//    detail page. `admin-silent` rotates the token without sending mail
//    (admin will hand off the URL via own channel). `admin-with-email`
//    rotates AND sends the same magic-link email the portal path uses.
//
// Dedupe: within 60 seconds of a previous token_regenerated lead_event
// row, we re-use the just-rotated token + skip the email. Three rapid
// portal clicks ⇒ one email + one rotation. Admin can still force a
// fresh rotation by waiting out the window.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLOSED_STATUSES = [
  'vertrag_abgeschlossen',
  'betreuung_beauftragt',
  'nicht_interessiert',
] as const;

const DEDUPE_WINDOW_MS = 60_000;

const ALLOWED_SOURCES = ['portal', 'admin-silent', 'admin-with-email'] as const;
type Source = (typeof ALLOWED_SOURCES)[number];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  let body: { token?: unknown; lead_id?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_body');
  }

  const source = body.source as Source;
  if (!ALLOWED_SOURCES.includes(source)) {
    return jsonError(400, 'invalid_source');
  }

  const token = typeof body.token === 'string' && body.token.length > 0 ? body.token : null;
  const leadId = typeof body.lead_id === 'string' && body.lead_id.length > 0 ? body.lead_id : null;

  // Source-specific input validation
  if (source === 'portal') {
    // Portal MUST present the old token (identity proof). lead_id ignored
    // even if sent — never trust portal callers to address arbitrary leads.
    if (!token) return jsonError(400, 'token_required');
  } else {
    // Admin paths use lead_id. Portal token there would be a misconfig.
    if (!leadId) return jsonError(400, 'lead_id_required');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Lookup lead. NB: NOT filtering by token_expires_at — expired tokens are
  // exactly the case we want to handle here.
  const leadQuery = token
    ? supabase.from('leads').select('*').eq('token', token).maybeSingle()
    : supabase.from('leads').select('*').eq('id', leadId!).maybeSingle();
  const { data: lead, error: leadErr } = await leadQuery;

  if (leadErr) {
    console.error('lead lookup failed:', leadErr.message);
    return jsonError(500, 'lookup_failed');
  }
  if (!lead) {
    return jsonError(404, 'unknown_token');
  }
  if (CLOSED_STATUSES.includes(lead.status)) {
    return jsonError(403, 'lead_closed');
  }
  if (!lead.email) {
    // No mailbox to send to. Admin-silent path could still succeed — we
    // just rotate without mail attempt. Portal / admin-with-email fail.
    if (source !== 'admin-silent') {
      return jsonError(409, 'lead_has_no_email');
    }
  }

  // Dedupe: read most recent token_regenerated event for this lead within
  // the dedupe window. If hit, re-use existing rotation — don't double-mail.
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { data: recent } = await supabase
    .from('lead_events')
    .select('id, created_at, metadata')
    .eq('lead_id', lead.id)
    .eq('event_type', 'token_regenerated')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);

  if (recent && recent.length > 0) {
    // Already rotated very recently — return the current token. lead.token
    // reflects the rotation, so portalUrl can be built from it.
    return NextResponse.json(
      {
        masked_email: maskEmail(lead.email),
        sent: false,
        deduped: true,
        new_token: source.startsWith('admin') ? lead.token : undefined,
      },
      { headers: corsHeaders },
    );
  }

  // Generate + write the new token.
  const newToken = generateToken();
  const newExpiry = getTokenExpiry();

  const { error: updateErr } = await supabase
    .from('leads')
    .update({
      token: newToken,
      token_expires_at: newExpiry.toISOString(),
      token_used: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);

  if (updateErr) {
    console.error('lead token update failed:', updateErr.message);
    return jsonError(500, 'rotation_failed');
  }

  const shouldSendEmail = source !== 'admin-silent' && Boolean(lead.email);
  const portalBase = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://kundenportal.primundus.de';
  const portalUrl = `${portalBase.replace(/\/$/, '')}/?token=${encodeURIComponent(newToken)}`;

  // Audit row first so dedupe works even if the email errors mid-flight.
  const { error: eventErr } = await supabase.from('lead_events').insert({
    lead_id: lead.id,
    event_type: 'token_regenerated',
    metadata: {
      source,
      sent_email: shouldSendEmail,
      old_token_prefix: typeof lead.token === 'string' ? lead.token.slice(0, 8) : null,
      new_token_expires_at: newExpiry.toISOString(),
    },
  });
  if (eventErr) {
    console.error('lead_events insert failed:', eventErr.message);
    // Don't fail the request — rotation already happened. Logs only.
  }

  if (shouldSendEmail) {
    const leadWithNewToken = { ...lead, token: newToken };
    sendEmail(lead.email, getTokenRegenerationEmailTemplate(leadWithNewToken, portalUrl)).catch(
      (e) => {
        console.error('token regen email failed:', e instanceof Error ? e.message : String(e));
      },
    );
  }

  return NextResponse.json(
    {
      masked_email: maskEmail(lead.email),
      sent: shouldSendEmail,
      deduped: false,
      new_token: source.startsWith('admin') ? newToken : undefined,
    },
    { headers: corsHeaders },
  );
}

function jsonError(status: number, code: string) {
  return NextResponse.json({ error: code }, { status, headers: corsHeaders });
}

function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] ?? ''}*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
