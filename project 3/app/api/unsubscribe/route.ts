import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Ein-Klick-Abmeldung vom E-Mail-Versand (Art. 21 DSGVO Widerspruch / §7 UWG).
// Vom Abmelde-Link im Mail-Footer aufgerufen (Seite /abmelden → POST hierher).
// Schreibt ein append-only lead_event 'email_unsubscribed' und cancelt offene
// geplante Mails. send-scheduled-emails + /api/lead-event prüfen dieses Event
// und versenden danach keine automatisierten Kundenmails mehr.

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = (serviceKey && serviceKey.length > 10 ? serviceKey : null)
    || (anonKey && anonKey.length > 10 ? anonKey : null);
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function unsubscribeByToken(token: unknown): Promise<{ ok: boolean; status: number }> {
  if (!token || typeof token !== 'string' || token.length < 8) {
    return { ok: false, status: 400 };
  }

  const supabase = getSupabaseClient();

  // Lead per Token finden — BEWUSST ohne Ablauf-/used-Check: Abmelden muss
  // immer möglich sein, auch wenn der Magic-Link längst abgelaufen ist.
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('token', token)
    .maybeSingle();

  // Unbekannter Token → trotzdem 200 (kein Enumeration-Signal), aber nichts tun.
  if (!lead) return { ok: true, status: 200 };

  // Idempotent — nur einmal protokollieren.
  const { data: existing } = await supabase
    .from('lead_events')
    .select('id')
    .eq('lead_id', lead.id)
    .eq('event_type', 'email_unsubscribed')
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      event_type: 'email_unsubscribed',
      metadata: { at: new Date().toISOString(), source: 'unsubscribe-link' },
    });
  }

  // Offene geplante Mails sofort canceln (zusätzlich zum send-time-Guard).
  await supabase
    .from('scheduled_emails')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('lead_id', lead.id)
    .eq('status', 'pending');

  return { ok: true, status: 200 };
}

async function handlePost(request: NextRequest) {
  try {
    const { token } = await request.json();
    const r = await unsubscribeByToken(token);
    return NextResponse.json(r.ok ? { ok: true } : { error: 'Token fehlt' }, { status: r.status });
  } catch (e) {
    console.error('unsubscribe error:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}

// One-Click-Unsubscribe (RFC 8058 / List-Unsubscribe-Post) + direkter
// Link-Aufruf. Liefert ok auch bei unbekanntem Token (kein Enumeration-Hinweis).
async function handleGet(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    const r = await unsubscribeByToken(token);
    return NextResponse.json(r.ok ? { ok: true } : { error: 'Token fehlt' }, { status: r.status });
  } catch (e) {
    console.error('unsubscribe error:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}

// ─── Telemetria RAM (diagnoza OOM — plan 2026-08-09; format: [req] …) ───
import { withMem } from '@/lib/memlog';
export const POST = withMem('unsubscribe POST', handlePost);
export const GET = withMem('unsubscribe GET', handleGet);
