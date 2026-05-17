import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, getTeamNotificationTemplate } from '@/lib/email';

// Bridge endpoint: the CA-App portal reports customer milestones back to the
// kostenrechner lead so the Nachfass emails can branch. Token-authenticated —
// the magic-link token (leads.token) is the shared identifier between the
// kostenrechner and the portal.
//
// Side effect (added 2026-05): also triggers internal team notification mails
// for `patient_data_saved` (once per lead) and `caregiver_invited` (every
// invitation). Existing milestone semantics for the Nachfass-Kette are kept
// — patient_data_saved is still deduped in lead_events; caregiver_invited is
// inserted every time so a team mail goes out per invite.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ALLOWED_EVENTS = ['portal_opened', 'patient_data_saved', 'caregiver_invited'];
const TEAM_NOTIFY_EVENTS = ['patient_data_saved', 'caregiver_invited'];
const TEAM_NOTIFY_RECIPIENT = 'info@primundus.de';

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
    const { token, event, metadata } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400, headers: corsHeaders });
    }
    if (!ALLOWED_EVENTS.includes(event)) {
      return NextResponse.json({ error: 'invalid event' }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load the full lead row — needed for the team notification template (was
    // just `id` before, but the team mail uses kalkulation, contact data, etc.).
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (!lead) {
      return NextResponse.json({ error: 'lead not found' }, { status: 404, headers: corsHeaders });
    }

    // Dedupe rule per event:
    // - portal_opened / patient_data_saved → milestone (only first matters
    //   for Nachfass branching). Skip if already recorded.
    // - caregiver_invited → multiple invites per lead are expected; insert
    //   every time so we can fire one team mail per invite.
    let isFirstOccurrence = true;
    if (event !== 'caregiver_invited') {
      const { data: existing } = await supabase
        .from('lead_events')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('event_type', event)
        .limit(1);
      isFirstOccurrence = !existing || existing.length === 0;
    }

    if (event === 'caregiver_invited' || isFirstOccurrence) {
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: event,
        metadata: metadata && typeof metadata === 'object'
          ? { source: 'caapp', ...metadata }
          : { source: 'caapp' },
      });
    }

    // Team notification (fire-and-forget — never blocks the response).
    // patient_data_saved fires only on the first occurrence (milestone),
    // caregiver_invited fires on every invite.
    const shouldNotifyTeam =
      TEAM_NOTIFY_EVENTS.includes(event) &&
      (event === 'caregiver_invited' || isFirstOccurrence);

    if (shouldNotifyTeam) {
      const additionalData =
        event === 'caregiver_invited' && metadata && typeof metadata === 'object'
          ? { caregiverName: metadata.caregiver_name ?? metadata.caregiverName ?? '' }
          : undefined;
      const teamTemplate = getTeamNotificationTemplate(lead as any, event, additionalData);
      sendEmail(TEAM_NOTIFY_RECIPIENT, teamTemplate).catch((e) =>
        console.error('team notify send threw:', e instanceof Error ? e.message : String(e)),
      );
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('lead-event error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: corsHeaders });
  }
}
