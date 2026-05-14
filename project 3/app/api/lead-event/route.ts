import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Bridge endpoint: the CA-App portal reports customer milestones back to the
// kostenrechner lead so the Nachfass emails can branch. Token-authenticated —
// the magic-link token (leads.token) is the shared identifier between the
// kostenrechner and the portal.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ALLOWED_EVENTS = ['portal_opened', 'patient_data_saved', 'caregiver_invited'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const { token, event } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400, headers: corsHeaders });
    }
    if (!ALLOWED_EVENTS.includes(event)) {
      return NextResponse.json({ error: 'invalid event' }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('token', token)
      .maybeSingle();

    if (!lead) {
      return NextResponse.json({ error: 'lead not found' }, { status: 404, headers: corsHeaders });
    }

    // Dedupe — only the first occurrence of each milestone matters for the
    // Nachfass branching, so repeated calls are harmless no-ops.
    const { data: existing } = await supabase
      .from('lead_events')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('event_type', event)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: event,
        metadata: { source: 'caapp' },
      });
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('lead-event error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: corsHeaders });
  }
}
