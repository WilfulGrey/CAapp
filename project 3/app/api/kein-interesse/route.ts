import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { darfStatusSetzen, grundAus, teamMailKeinInteresse } from '@/lib/kein-interesse';

// Kunde klickt in der Abschiedsmail (nachfass_3) „Aktuell nicht" oder „Doch
// nicht relevant" und bestätigt auf /kein-interesse (Registry #72). Wirkt wie
// der Admin-Knopf „Nicht interessiert": status = nicht_interessiert + alle
// geplanten Mails canceln. Damit lässt auch detect-caregiver-events den Lead
// aus, es gehen keine Bewerbungsmails mehr raus. Gebuchte Kunden bleiben
// unangetastet (darfStatusSetzen), das Team bekommt dann nur die Info.
//
// Bewusst POST aus einem Klick auf der Seite, nie beim blossen Aufruf: Mail-
// Scanner (Outlook Safe Links, Gmail) öffnen Links automatisch und würden
// sonst interessierten Kunden die Mails abstellen.

const TEAM_EMPFAENGER = 'info@primundus.de';
const SITE_BASIS = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kostenrechner.primundus.de').replace(/\/$/, '');

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Missing Supabase configuration');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function handlePost(request: NextRequest) {
  let body: { token?: unknown; grund?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  const token = typeof body.token === 'string' ? body.token : '';
  if (token.length < 8) return NextResponse.json({ error: 'Token fehlt' }, { status: 400 });
  const grund = grundAus(body.grund);

  try {
    const supabase = getSupabaseClient();
    // Ohne Ablauf-Check wie beim Abmelden: der Wunsch gilt auch mit altem Link.
    const { data: lead } = await supabase
      .from('leads')
      .select('id, status, vorname, nachname, email, telefon, source')
      .eq('token', token)
      .maybeSingle();
    // Unbekannter Token: trotzdem ok, kein Hinweis, ob es den Token gibt.
    if (!lead) return NextResponse.json({ ok: true });

    // Idempotent: zweiter Klick ändert nichts und schickt keine zweite Team-Mail.
    const { data: schon } = await supabase
      .from('lead_events')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('event_type', 'kunde_kein_interesse')
      .limit(1);
    if (schon && schon.length > 0) return NextResponse.json({ ok: true });

    const statusVorher = String(lead.status ?? '');
    const statusGesetzt = darfStatusSetzen(statusVorher);
    let mailsGestoppt = 0;
    if (statusGesetzt) {
      const { error: statusFehler } = await supabase
        .from('leads')
        .update({ status: 'nicht_interessiert' })
        .eq('id', lead.id);
      if (statusFehler) throw new Error(`Status-Update: ${statusFehler.message}`);
      const { data: gestoppt, error: mailFehler } = await supabase
        .from('scheduled_emails')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('lead_id', lead.id)
        .eq('status', 'pending')
        .select('id');
      if (mailFehler) throw new Error(`Mails canceln: ${mailFehler.message}`);
      mailsGestoppt = gestoppt?.length ?? 0;
    }

    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      event_type: 'kunde_kein_interesse',
      metadata: { grund, quelle: 'nachfass_3', status_vorher: statusVorher, status_gesetzt: statusGesetzt, mails_gestoppt: mailsGestoppt },
    });

    const kunde = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || lead.id;
    const mail = await sendEmail(
      TEAM_EMPFAENGER,
      teamMailKeinInteresse({
        kunde: String(kunde),
        email: String(lead.email ?? ''),
        telefon: String(lead.telefon ?? ''),
        quelle: String(lead.source ?? ''),
        leadId: lead.id,
        grund,
        statusVorher,
        statusGesetzt,
        mailsGestoppt,
        adminUrl: `${SITE_BASIS}/admin/leads/${lead.id}`,
      }),
      undefined,
      { skipBcc: true },
    );
    if (!mail.success) console.error(`[kein-interesse] Team-Mail fehlgeschlagen (lead=${lead.id}):`, mail.error);
    console.log(`[kein-interesse] lead=${lead.id} grund=${grund ?? '-'} status_gesetzt=${statusGesetzt} mails_gestoppt=${mailsGestoppt}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[kein-interesse] Fehler:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}

// ─── Telemetria RAM (diagnoza OOM — plan 2026-08-09; format: [req] …) ───
import { withMem } from '@/lib/memlog';
export const POST = withMem('kein-interesse POST', handlePost);
