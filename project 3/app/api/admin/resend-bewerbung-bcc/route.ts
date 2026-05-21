// Admin: re-sendet die letzten N application_received-Mails NUR an die BCC-
// Adressen (info@primundus.de + info@mamamia.app). Hintergrund: vor PR #138
// war der Default-BCC fälschlich nur auf info@mamamia.app — die Primundus-
// Seite hat die "Bewerbung erhalten"-Mails nie gesehen. Dieses Endpoint
// rekonstruiert die letzten N Mails 1:1 aus den lead_events-Metadaten und
// schickt sie an die BCC-Liste, damit das Archiv vollständig ist.
//
// Auth: Bearer SUPABASE_SERVICE_ROLE_KEY (gleicher Key wie für Server-Side
// Supabase-Zugriff). Wird per supabase-ops GitHub Action getriggert, der den
// Key zur Laufzeit aus der Management API zieht.
//
// POST /api/admin/resend-bewerbung-bcc
//   Body: { "limit": 2 }   (optional, default 2, max 10)
//   Response: { results: [{ event_id, lead_email, caregiver, sent, error? }, ...] }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendEmail,
  getApplicationReceivedEmailTemplate,
  type CaregiverDisplay,
} from '@/lib/email';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const BCC_RECIPIENTS = ['info@primundus.de', 'info@mamamia.app'];

// Test-Lead-Filter (gleicher Set wie daily-analytics-report/queries.ts).
function isRealLead(lead: { vorname?: string | null; nachname?: string | null; email?: string | null } | null | undefined): boolean {
  if (!lead) return false;
  const v = (lead.vorname ?? '').toLowerCase();
  const n = (lead.nachname ?? '').toLowerCase();
  const e = (lead.email ?? '').toLowerCase();
  if (v.includes('test')) return false;
  if (n.includes('test')) return false;
  if (e.includes('test')) return false;
  if (e.includes('mailinator')) return false;
  if (e.includes('example.com')) return false;
  if (e.includes('wyzzi')) return false;
  if (e.includes('mamamia')) return false;
  return true;
}

// Dupliziert aus app/api/lead-event/route.ts:73 — bewusst inline, um die
// Lead-Event-Route nicht für einen Admin-Pfad zu öffnen.
function extractCaregiverDisplay(metadata: any): CaregiverDisplay | null {
  if (!metadata || typeof metadata !== 'object') return null;
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

export async function POST(request: NextRequest) {
  // Auth: Bearer must match service role key.
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== supabaseServiceKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let limit = 2;
  try {
    const body = await request.json();
    if (typeof body?.limit === 'number' && body.limit > 0) {
      limit = Math.min(Math.floor(body.limit), 10);
    }
  } catch {
    // Body parse fail → default 2.
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Letzte N application_received-Events, neueste zuerst.
  const { data: events, error: eErr } = await supabase
    .from('lead_events')
    .select('id, lead_id, event_type, data, created_at')
    .eq('event_type', 'application_received')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (eErr) {
    return NextResponse.json({ error: `lead_events query failed: ${eErr.message}` }, { status: 500 });
  }
  if (!events || events.length === 0) {
    return NextResponse.json({ results: [], note: 'no application_received events found' });
  }

  const results: Array<{
    event_id: string;
    lead_email?: string;
    caregiver?: string;
    created_at: string;
    sent: boolean;
    skipped?: string;
    error?: string;
  }> = [];

  for (const event of events) {
    const { data: lead, error: lErr } = await supabase
      .from('leads')
      .select('id, email, vorname, nachname, anrede_text, token')
      .eq('id', event.lead_id)
      .maybeSingle();

    if (lErr || !lead) {
      results.push({ event_id: event.id, created_at: event.created_at, sent: false, skipped: 'lead missing' });
      continue;
    }
    if (!isRealLead(lead)) {
      results.push({ event_id: event.id, lead_email: lead.email, created_at: event.created_at, sent: false, skipped: 'test lead' });
      continue;
    }

    const metadata = (event.data && typeof event.data === 'object' && 'metadata' in event.data)
      ? (event.data as any).metadata
      : event.data;
    const caregiver = extractCaregiverDisplay(metadata);
    if (!caregiver) {
      results.push({ event_id: event.id, lead_email: lead.email, created_at: event.created_at, sent: false, skipped: 'caregiver metadata missing' });
      continue;
    }

    const portalUrl = buildPortalUrl(lead);
    const template = getApplicationReceivedEmailTemplate(lead as any, caregiver, portalUrl);

    const r = await sendEmail(BCC_RECIPIENTS, template, undefined, { skipBcc: true });
    results.push({
      event_id: event.id,
      lead_email: lead.email,
      caregiver: caregiver.name,
      created_at: event.created_at,
      sent: r.success,
      error: r.error,
    });
  }

  return NextResponse.json({ results });
}
