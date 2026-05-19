import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendEmail,
  getTeamNotificationTemplate,
  getCaregiverInterestEmailTemplate,
  getApplicationReceivedEmailTemplate,
  type CaregiverDisplay,
} from '@/lib/email';

// Bridge endpoint: the CA-App portal reports customer milestones back to the
// kostenrechner lead so the Nachfass emails can branch. Token-authenticated —
// the magic-link token (leads.token) is the shared identifier between the
// kostenrechner and the portal.
//
// Side effects:
// - Internal team notification mails for `patient_data_saved` (once per lead)
//   and `caregiver_invited` (every invitation) — PR #106.
// - Customer mails for `caregiver_interest_shown` (Mail A: a caregiver liked
//   the lead in Mamamia) and `application_received` (Mail B: staff sent the
//   formal application document to the customer) — PR #109. Caregiver display
//   info travels in the event `metadata`; no DB dedupe, one mail per event.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ALLOWED_EVENTS = [
  'portal_opened',
  'patient_data_saved',
  'caregiver_invited',
  'caregiver_interest_shown',
  'application_received',
  // PR #123: customer confirmed acceptance via AngebotPruefenModal step 2.
  // MVP path — Mamamia NOT notified, Primundus team gets a notification
  // email with the contract form data and handles contract paperwork
  // manually. Acceptance row persisted in lead_application_acceptances.
  'application_accepted_internal',
];
const TEAM_NOTIFY_EVENTS = [
  'patient_data_saved',
  'caregiver_invited',
  'caregiver_interest_shown',
  'application_received',
  'application_accepted_internal',
];
// Events, die in der Team-Mail einen Pflegekraft-Namen anzeigen sollen.
// Liest caregiver_name aus dem Event-Metadata und steckt ihn als
// additionalData in getTeamNotificationTemplate.
const TEAM_NOTIFY_CAREGIVER_EVENTS = new Set([
  'caregiver_invited',
  'caregiver_interest_shown',
  'application_received',
]);
const TEAM_NOTIFY_RECIPIENT = 'info@primundus.de';
// Events, die KEINEN DB-Dedupe verwenden — pro Auftreten ein Eintrag und
// (falls eine Mail dranhängt) eine Mail. Mehrere Pflegekräfte können Interesse
// zeigen, mehrere Bewerbungen können auf einen Lead landen.
const NON_DEDUPED_EVENTS = new Set([
  'caregiver_invited',
  'caregiver_interest_shown',
  'application_received',
]);
// Customer-facing Mails (an die Lead-Email) je Event. Trigger sind die neuen
// Caregiver-Lifecycle-Events; das eigentliche Hooking aus Mamamia kommt
// separat — der Endpoint nimmt die Events bereits entgegen.
const CUSTOMER_MAIL_EVENTS = new Set([
  'caregiver_interest_shown',
  'application_received',
]);

function extractCaregiverDisplay(metadata: any): CaregiverDisplay | null {
  if (!metadata || typeof metadata !== 'object') return null;
  // Accept both snake_case (matches CA-app `reportLeadEvent` payload) and
  // camelCase keys (matches existing CaregiverDisplay type) — defensive
  // because the caller (Mamamia hook, CA-app, manual test) might vary.
  const name = metadata.caregiver_name ?? metadata.caregiverName;
  if (!name || typeof name !== 'string' || !name.trim()) return null;
  return {
    name: name.trim(),
    badgeLevel: metadata.caregiver_badge_level ?? metadata.badgeLevel,
    yearsExperience: metadata.caregiver_years_experience ?? metadata.yearsExperience,
    einsatzCount: metadata.caregiver_einsatz_count ?? metadata.einsatzCount,
    photoUrl: metadata.caregiver_photo_url ?? metadata.photoUrl,
    aboutText: metadata.caregiver_about_text ?? metadata.aboutText,
  };
}

function buildPortalUrl(lead: { token?: string | null }): string {
  const portalBase = process.env.NEXT_PUBLIC_PORTAL_URL || '';
  if (!portalBase || !lead.token) return '';
  return `${portalBase.replace(/\/$/, '')}/?token=${encodeURIComponent(lead.token)}`;
}

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

    // Phone sync: when the portal saves the patient form, it ships the
    // current phone in metadata.phone. We mirror it to leads.telefon so
    // the team-notification template + any later admin lookup see the
    // value the customer most recently entered (Mamamia Customer.phone is
    // the source of truth but leads.telefon is what kostenrechner-side
    // code reads). Runs even on dedupe-suppressed events so a re-save
    // with an edited number still propagates.
    if (
      event === 'patient_data_saved' &&
      metadata &&
      typeof metadata === 'object' &&
      typeof metadata.phone === 'string'
    ) {
      const newPhone = metadata.phone.trim();
      if (newPhone && newPhone !== lead.telefon) {
        const { error: updateErr } = await supabase
          .from('leads')
          .update({ telefon: newPhone })
          .eq('id', lead.id);
        if (updateErr) {
          console.error('leads.telefon update failed:', updateErr.message);
        } else {
          lead.telefon = newPhone;
        }
      }
    }

    // Acceptance persistence (application_accepted_internal): UPSERT a
    // dedicated row in lead_application_acceptances with the full contract
    // form data. Idempotent on (lead_id, application_id) — re-clicking
    // "Akzeptieren" doesn't duplicate. Frontend queries this table via
    // mamamia-proxy.listAcceptedApplications on portal load to flip the
    // matching app's status to 'accepted' → BookedScreen renders.
    if (event === 'application_accepted_internal' && metadata && typeof metadata === 'object') {
      const m = metadata as Record<string, unknown>;
      const rawAppId = m.application_id;
      const appId = typeof rawAppId === 'number' ? rawAppId : Number(rawAppId);
      if (Number.isFinite(appId)) {
        const rawCaregiverId = m.caregiver_id;
        const caregiverId = typeof rawCaregiverId === 'number'
          ? rawCaregiverId
          : (typeof rawCaregiverId === 'string' && rawCaregiverId
              ? Number(rawCaregiverId)
              : null);
        const { error: accErr } = await supabase
          .from('lead_application_acceptances')
          .upsert({
            lead_id: lead.id,
            application_id: appId,
            caregiver_id: typeof caregiverId === 'number' && Number.isFinite(caregiverId) ? caregiverId : null,
            contract_patient: m.contract_patient ?? {},
            contract_contact: m.contract_contact ?? {},
          }, { onConflict: 'lead_id,application_id' });
        if (accErr) {
          console.error('lead_application_acceptances upsert failed:', accErr.message);
        }
      } else {
        console.warn('application_accepted_internal: missing/invalid application_id in metadata');
      }
    }

    // Dedupe rule per event:
    // - portal_opened / patient_data_saved → milestone (only first matters
    //   for Nachfass branching). Skip if already recorded.
    // - caregiver_invited / caregiver_interest_shown / application_received →
    //   multiple events per lead expected (different caregivers, mehrere
    //   Bewerbungen); insert every time so one mail goes per event.
    const isDeduped = !NON_DEDUPED_EVENTS.has(event);
    let isFirstOccurrence = true;
    if (isDeduped) {
      const { data: existing } = await supabase
        .from('lead_events')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('event_type', event)
        .limit(1);
      isFirstOccurrence = !existing || existing.length === 0;
    }

    if (!isDeduped || isFirstOccurrence) {
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: event,
        metadata: metadata && typeof metadata === 'object'
          ? { source: 'caapp', ...metadata }
          : { source: 'caapp' },
      });
    }

    // Team notification (fire-and-forget — never blocks the response).
    // - patient_data_saved → einmal pro Lead (Milestone, deduped)
    // - caregiver_invited / caregiver_interest_shown / application_received →
    //   pro Event eine Mail (kein DB-Dedupe), jede mit Pflegekraft-Name.
    const shouldNotifyTeam =
      TEAM_NOTIFY_EVENTS.includes(event) &&
      (!isDeduped || isFirstOccurrence);

    if (shouldNotifyTeam) {
      const additionalData: Record<string, unknown> | undefined =
        TEAM_NOTIFY_CAREGIVER_EVENTS.has(event) && metadata && typeof metadata === 'object'
          ? { caregiverName: metadata.caregiver_name ?? metadata.caregiverName ?? '' }
          : (event === 'application_accepted_internal' && metadata && typeof metadata === 'object'
              ? {
                  caregiverName: metadata.caregiver_name ?? metadata.caregiverName ?? '',
                  caregiverId: metadata.caregiver_id ?? null,
                  applicationId: metadata.application_id ?? null,
                  contractPatient: metadata.contract_patient ?? null,
                  contractContact: metadata.contract_contact ?? null,
                }
              : undefined);
      const teamTemplate = getTeamNotificationTemplate(lead as any, event, additionalData as any);
      sendEmail(TEAM_NOTIFY_RECIPIENT, teamTemplate).catch((e) =>
        console.error('team notify send threw:', e instanceof Error ? e.message : String(e)),
      );
    }

    // Customer-facing mail (Mail A / Mail B). Fire-and-forget — Mamamia-Hooks
    // (oder spätere Trigger) sollen niemals durch eine Mail-Latenz blockiert
    // werden. Bei fehlenden Pflegekraft-Daten loggen wir und überspringen die
    // Mail — der lead_event wird trotzdem aufgezeichnet.
    if (CUSTOMER_MAIL_EVENTS.has(event)) {
      const caregiver = extractCaregiverDisplay(metadata);
      if (!caregiver) {
        console.warn(`lead-event ${event}: caregiver display data missing in metadata — mail skipped (lead ${lead.id})`);
      } else if (!lead.email) {
        console.warn(`lead-event ${event}: lead has no email — mail skipped (lead ${lead.id})`);
      } else {
        const portalUrl = buildPortalUrl(lead as any);
        const customerTemplate = event === 'caregiver_interest_shown'
          ? getCaregiverInterestEmailTemplate(lead as any, caregiver, portalUrl)
          : getApplicationReceivedEmailTemplate(lead as any, caregiver, portalUrl);
        sendEmail((lead as any).email, customerTemplate).catch((e) =>
          console.error('customer mail send threw:', e instanceof Error ? e.message : String(e)),
        );
      }
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('lead-event error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: corsHeaders });
  }
}
