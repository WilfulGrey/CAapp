import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/lead-management';
import { getTelefonNachgetragenTemplate, sendEmail } from '@/lib/email';

// Kontakt in drei Schritten (Registry #76, Martin 16.09.2026): Der Lead
// entsteht nach Name + E-Mail; hier trägt der Telefon-Schritt die Rückruf-
// nummer nach. Token-gebunden wie /api/lead-event (der Magic-Link-Token ist
// die gemeinsame Kennung), kein Re-Submit von /api/angebot-anfordern — der
// würde die Kalkulation neu schreiben und eine zweite Team-Mail auslösen.
// Nie /api/leads/[leadId] (ohne Auth und Whitelist, CLAUDE.md-Befund).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const token = body && typeof body.token === 'string' ? body.token : '';
    const telefon = body && typeof body.telefon === 'string' ? body.telefon.trim().slice(0, 40) : '';
    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 });
    }
    // Server bleibt mild (≥6 Ziffern) wie /api/angebot-anfordern; der Rechner
    // prüft strenger (8–15, lib/telefon.ts).
    const ziffern = telefon.replace(/\D/g, '');
    if (ziffern.length < 6 || ziffern.length > 15) {
      return NextResponse.json({ error: 'Telefonnummer ungültig' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: lead } = await supabase
      .from('leads')
      .select('id, telefon, vorname, nachname, anrede_text, email')
      .eq('token', token)
      .maybeSingle();
    if (!lead) {
      return NextResponse.json({ error: 'lead not found' }, { status: 404 });
    }
    if ((lead.telefon ?? '').trim() === telefon) {
      return NextResponse.json({ ok: true, unveraendert: true });
    }

    const vorher = (lead.telefon ?? '').trim();
    const { error } = await supabase.from('leads').update({ telefon }).eq('id', lead.id);
    if (error) {
      console.error('lead-telefon update fehlgeschlagen:', error.message);
      return NextResponse.json({ error: 'update failed' }, { status: 500 });
    }
    await logEvent(lead.id, 'telefon_nachgetragen', { vorher: vorher ? 'geaendert' : 'neu' });

    // Die erste Team-Mail ging ohne Nummer raus — jetzt nachliefern
    // (fire-and-forget wie die Team-Mail in angebot-anfordern).
    if (!vorher) {
      sendEmail('info@primundus.de', getTelefonNachgetragenTemplate(lead, telefon))
        .then(async (r) => {
          if (r.success) await logEvent(lead.id, 'team_notified', { status: 'telefon_nachgetragen' });
          else console.error('Team-Mail Telefon-Nachtrag fehlgeschlagen:', r.error);
        })
        .catch((e) => console.error('team send threw:', e instanceof Error ? e.message : String(e)));
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('lead-telefon error:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
