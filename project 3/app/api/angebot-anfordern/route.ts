import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findOrCreateLead, logEvent } from '@/lib/lead-management';
import { Kalkulation } from '@/lib/calculation';
import {
  sendEmail,
  getTeamNotificationTemplate,
  getAngebotsEmailTemplate,
} from '@/lib/email';
import { detectGenderFromName } from '@/lib/calculation';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = (serviceKey && serviceKey.length > 10 ? serviceKey : null)
    || (anonKey && anonKey.length > 10 ? anonKey : null);

  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(url, key);
}

const supabase = getSupabaseClient();

async function scheduleEmail(
  leadId: string,
  email: string,
  emailType: 'angebot' | 'eingangsbestaetigung',
  delayMinutes: number,
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/schedule-email`;

  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'Apikey': anonKey,
      },
      body: JSON.stringify({
        lead_id: leadId,
        email_type: emailType,
        recipient_email: email,
        delay_minutes: delayMinutes,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Edge Function Fehler: ${response.status} - ${text}` };
    }

    const result = await response.json();
    return { success: result.success === true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function flushScheduledEmails(): Promise<void> {
  // Fire-and-forget — when we schedule an Eingangsbestätigung with delay=0,
  // we want it dispatched right away rather than waiting up to 5 min for
  // the next pg_cron tick. Errors are non-fatal: cron will pick it up on
  // the next tick anyway.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const key = (serviceKey && serviceKey.length > 10) ? serviceKey : anonKey;
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-scheduled-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'Apikey': key,
      },
      body: '{}',
    });
  } catch (err) {
    console.warn('flushScheduledEmails failed:', err instanceof Error ? err.message : String(err));
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.leadId && body.sendEmailOnly) {
      return handleSendAngebotsEmailOnly(body.leadId);
    }

    const {
      vorname,
      email,
      telefon,
      careStartTiming,
      kalkulation,
    }: {
      vorname: string;
      email: string;
      telefon?: string;
      careStartTiming?: string;
      kalkulation: Kalkulation;
    } = body;

    if (!vorname || !email || !kalkulation) {
      return NextResponse.json(
        { error: 'Vorname, E-Mail und Kalkulation erforderlich' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Ungültige E-Mail-Adresse' },
        { status: 400 }
      );
    }

    const nameParts = vorname.trim().split(/\s+/);
    const parsedVorname = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0];
    const parsedNachname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
    const detectedAnrede = detectGenderFromName(parsedVorname) || undefined;

    const { lead, isNew, isUpgrade } = await findOrCreateLead(
      email,
      'angebot_requested',
      {
        vorname: parsedVorname,
        nachname: parsedNachname || undefined,
        anrede: detectedAnrede,
        telefon,
        care_start_timing: careStartTiming,
        kalkulation,
      }
    );

    // Fire-and-forget all email/scheduling side-effects — the customer's
    // hand-off into CA app should NOT wait on Ionos SMTP. The Eingangs-
    // bestätigung used to be a direct sendEmail() call here, but Render →
    // Ionos was timing out, so it's now scheduled via the same edge-
    // function pipeline that handles Angebot/Nachfass (delay=0 + an
    // immediate flushScheduledEmails so we don't wait for the next 5-min
    // pg_cron tick). Render Web Services don't tear down on response, so
    // the orphan promises continue running until the runtime decides
    // they're done.
    scheduleEmail(lead.id, email, 'eingangsbestaetigung', 0)
      .then(async (r) => {
        if (r.success) {
          await logEvent(lead.id, 'email_eingangsbestaetigung_scheduled', { to: email, token: lead.token });
          flushScheduledEmails();
        } else {
          console.error('Eingangsbestaetigung schedule fehlgeschlagen:', r.error);
          await logEvent(lead.id, 'email_eingangsbestaetigung_schedule_failed', { to: email, error: r.error });
        }
      })
      .catch((e) => console.error('schedule eingangs threw:', e instanceof Error ? e.message : String(e)));

    scheduleEmail(lead.id, email, 'angebot', 15)
      .then(async (r) => {
        if (r.success) {
          await logEvent(lead.id, 'email_angebot_scheduled', { to: email });
        } else {
          console.error('Fehler beim Schedulen der Angebotsmail:', r.error);
          await logEvent(lead.id, 'email_angebot_schedule_failed', { error: r.error });
        }
      })
      .catch((e) => console.error('scheduleAngebot threw:', e instanceof Error ? e.message : String(e)));

    const teamEmail = getTeamNotificationTemplate(lead, 'angebot_requested');
    sendEmail('info@primundus.de', teamEmail)
      .then(async (r) => {
        if (r.success) {
          await logEvent(lead.id, 'team_notified', { status: 'angebot_requested' });
        } else {
          console.error('Team-Benachrichtigung fehlgeschlagen:', r.error);
        }
      })
      .catch((e) => console.error('team send threw:', e instanceof Error ? e.message : String(e)));

    // Response contract — used by the result page to drive the seamless
    // hand-off into the CA app (kundenportal). `token` is the persistent
    // 14-day magic-link token already generated by findOrCreateLead;
    // `portalUrl` is the pre-built ${NEXT_PUBLIC_PORTAL_URL}/?token=...
    // URL the result page redirects to (and that the Eingangsbestätigung
    // email also embeds). Both are non-secret — token is single-customer
    // scoped and gated by token_expires_at on the receiving side.
    const portalBase = process.env.NEXT_PUBLIC_PORTAL_URL ?? '';
    const portalUrl = portalBase && lead.token
      ? `${portalBase.replace(/\/$/, '')}/?token=${encodeURIComponent(lead.token)}`
      : null;

    if (portalUrl) {
      // Funnel signal — the customer gets a portal-ready handoff URL.
      // The `portal_handoff_redirect` event (fired client-side once the
      // browser actually navigates) is the closer half of the pair.
      await logEvent(lead.id, 'portal_handoff_link_built', { portalUrl });
    }

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      isNew,
      isUpgrade,
      // emailSent / angebotsEmailScheduled are now best-effort — fired in
      // the background, so the response can't reflect their outcome. The
      // result page treats portalUrl as the only thing it actually needs.
      emailDispatched: true,
      token: lead.token ?? null,
      portalUrl,
      message: 'Angebot angefordert',
    });
  } catch (error) {
    console.error('Fehler bei Angebotsanforderung:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Full error stack:', error.stack);
    }
    return NextResponse.json(
      { error: 'Fehler bei Angebotsanforderung', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function handleSendAngebotsEmailOnly(leadId: string) {
  try {
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: 'Lead nicht gefunden', details: leadError?.message },
        { status: 404 }
      );
    }

    const angebotsEmail = getAngebotsEmailTemplate(lead, lead.kalkulation);
    const emailResult = await sendEmail(lead.email, angebotsEmail);

    if (emailResult.success) {
      await logEvent(lead.id, 'email_angebot_sent', {
        to: lead.email,
        triggered_by: 'scheduled_email',
      });
    } else {
      await logEvent(lead.id, 'email_angebot_failed', {
        to: lead.email,
        error: emailResult.error,
        triggered_by: 'scheduled_email',
      });
    }

    return NextResponse.json({
      success: emailResult.success,
      emailSent: emailResult.success,
      emailError: emailResult.error,
    });
  } catch (error) {
    console.error('Fehler beim Senden der Angebotsmail:', error);
    return NextResponse.json(
      { error: 'Fehler beim Senden der Angebotsmail', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
