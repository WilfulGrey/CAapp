import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import {
  anlassAus,
  istOffen,
  knopfAus,
  PREIS_ANLAESSE,
  teamMail,
  WANN,
  wannAus,
  wiedervorlageTermin,
  type TeamInfo,
} from '@/lib/rueckmeldung';

// Rückmeldung aus der Abschiedsmail (nachfass_3, Registry #72). Vier Aktionen:
//   pausieren — Kunde wählt „in 2 Wochen / 1 Monat / 3 Monaten": alle geplanten
//               Mails canceln, eine persönliche Nachfrage („wiedervorlage") zum
//               Termin einplanen, Status bleibt offen. Den Rest der Pause hält
//               send-scheduled-emails (Ereignis kunde_pausiert, bis).
//   stoppen   — wie der Admin-Knopf „Nicht interessiert": Status
//               nicht_interessiert + alle geplanten Mails canceln. Damit lässt
//               auch detect-caregiver-events den Lead aus (keine Bewerbungsmails).
//   rueckruf  — Team-Mail „Rückruf erbeten". Die Mail ist der verlässliche Teil:
//               schlägt sie fehl, sagt die Seite dem Kunden die Wahrheit.
//   grund     — Preis-Einwand („zu teuer" / „anderer Anbieter"): Ereignis +
//               Team-Mail, damit jemand anruft, solange noch nicht unterschrieben ist.
// Gebuchte Kunden bleiben unangetastet (istOffen), das Team bekommt dann nur die Info.
// Alles nur per POST aus einem Klick auf der Seite, nie beim blossen Aufruf:
// Mail-Scanner (Outlook Safe Links, Gmail) öffnen Links von selbst.

const TEAM_EMPFAENGER = 'info@primundus.de';
const SITE_BASIS = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kostenrechner.primundus.de').replace(/\/$/, '');
const TAG_MS = 24 * 60 * 60 * 1000;

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Missing Supabase configuration');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Supa = ReturnType<typeof getSupabaseClient>;

async function letztesEreignis(supabase: Supa, leadId: string, typ: string) {
  const { data } = await supabase
    .from('lead_events')
    .select('created_at, metadata')
    .eq('lead_id', leadId)
    .eq('event_type', typ)
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function allesGeplanteCanceln(supabase: Supa, leadId: string): Promise<number> {
  const { data, error } = await supabase
    .from('scheduled_emails')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('status', 'pending')
    .select('id');
  if (error) throw new Error(`Mails canceln: ${error.message}`);
  return data?.length ?? 0;
}

async function handlePost(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  const token = typeof body.token === 'string' ? body.token : '';
  const aktion = body.aktion;
  if (token.length < 8) return NextResponse.json({ error: 'Token fehlt' }, { status: 400 });
  if (aktion !== 'pausieren' && aktion !== 'stoppen' && aktion !== 'rueckruf' && aktion !== 'grund') {
    return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
  }
  const knopf = knopfAus(body.knopf);
  const anlass = anlassAus(body.anlass);
  const wann = wannAus(body.wann);
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
  if (aktion === 'pausieren' && !wann) return NextResponse.json({ error: 'Termin fehlt' }, { status: 400 });
  if (aktion === 'grund' && !(anlass && PREIS_ANLAESSE.has(anlass))) {
    return NextResponse.json({ error: 'Grund fehlt' }, { status: 400 });
  }

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

    const statusVorher = String(lead.status ?? '');
    const offen = istOffen(statusVorher);
    const info: TeamInfo = {
      aktion,
      kunde: String([lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || lead.id),
      email: String(lead.email ?? ''),
      telefon: String(lead.telefon ?? ''),
      quelle: String(lead.source ?? ''),
      adminUrl: `${SITE_BASIS}/admin/leads/${lead.id}`,
      knopf,
      anlass,
      text,
      wann,
      statusVorher,
      offen,
    };
    const teamSenden = async () => {
      const r = await sendEmail(TEAM_EMPFAENGER, teamMail(info), undefined, { skipBcc: true });
      if (!r.success) console.error(`[rueckmeldung] Team-Mail ${aktion} fehlgeschlagen (lead=${lead.id}):`, r.error);
      return r.success;
    };
    const jetzt = new Date();

    if (aktion === 'rueckruf') {
      const letzter = await letztesEreignis(supabase, lead.id, 'rueckruf_erbeten_mail');
      if (letzter && jetzt.getTime() - new Date(letzter.created_at).getTime() < TAG_MS) return NextResponse.json({ ok: true });
      if (!(await teamSenden())) return NextResponse.json({ error: 'Mail fehlgeschlagen' }, { status: 502 });
      await supabase.from('lead_events').insert({ lead_id: lead.id, event_type: 'rueckruf_erbeten_mail', metadata: { knopf, quelle: 'nachfass_3' } });
      return NextResponse.json({ ok: true });
    }

    if (aktion === 'grund') {
      const letzter = await letztesEreignis(supabase, lead.id, 'kunde_rueckmeldung');
      const gleich = letzter && (letzter.metadata as { anlass?: string } | null)?.anlass === anlass;
      if (!(gleich && jetzt.getTime() - new Date(letzter.created_at).getTime() < TAG_MS)) {
        await supabase.from('lead_events').insert({ lead_id: lead.id, event_type: 'kunde_rueckmeldung', metadata: { knopf, anlass, quelle: 'nachfass_3' } });
        await teamSenden();
      }
      return NextResponse.json({ ok: true });
    }

    if (aktion === 'pausieren' && wann) {
      const termin = wiedervorlageTermin(jetzt, wann);
      info.datumText = termin.text;
      // Doppelklick: dieselbe Pause binnen einer Minute nicht zweimal anlegen.
      const letzte = await letztesEreignis(supabase, lead.id, 'kunde_pausiert');
      if (letzte && jetzt.getTime() - new Date(letzte.created_at).getTime() < 60_000) {
        const m = (letzte.metadata ?? {}) as { datumText?: string };
        return NextResponse.json({ ok: true, datumText: m.datumText ?? termin.text });
      }
      if (!offen) {
        await supabase.from('lead_events').insert({ lead_id: lead.id, event_type: 'kunde_pausiert', metadata: { wann, knopf, anlass, status_vorher: statusVorher, eingeplant: false } });
        await teamSenden();
        return NextResponse.json({ ok: true });
      }
      info.mailsGestoppt = await allesGeplanteCanceln(supabase, lead.id);
      const { error: planFehler } = await supabase.from('scheduled_emails').insert({
        lead_id: lead.id,
        email_type: 'wiedervorlage',
        recipient_email: lead.email,
        scheduled_for: termin.iso,
        status: 'pending',
        metadata: { wann, knopf, anlass, seit: WANN[wann].seit },
      });
      if (planFehler) throw new Error(`Wiedervorlage einplanen: ${planFehler.message}`);
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: 'kunde_pausiert',
        metadata: { bis: termin.iso, datum: termin.datum, datumText: termin.text, wann, knopf, anlass, text: text || undefined, mails_gestoppt: info.mailsGestoppt, eingeplant: true },
      });
      await teamSenden();
      return NextResponse.json({ ok: true, datumText: termin.text });
    }

    // stoppen — idempotent: zweiter Klick ändert nichts und schickt keine zweite Team-Mail.
    if (await letztesEreignis(supabase, lead.id, 'kunde_kein_interesse')) return NextResponse.json({ ok: true });
    if (offen) {
      const { error: statusFehler } = await supabase.from('leads').update({ status: 'nicht_interessiert' }).eq('id', lead.id);
      if (statusFehler) throw new Error(`Status-Update: ${statusFehler.message}`);
      info.mailsGestoppt = await allesGeplanteCanceln(supabase, lead.id);
    }
    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      event_type: 'kunde_kein_interesse',
      metadata: { knopf, anlass, text: text || undefined, quelle: 'nachfass_3', status_vorher: statusVorher, status_gesetzt: offen, mails_gestoppt: info.mailsGestoppt ?? 0 },
    });
    await teamSenden();
    console.log(`[rueckmeldung] stoppen lead=${lead.id} anlass=${anlass ?? '-'} status_gesetzt=${offen}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[rueckmeldung] Fehler:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}

// ─── Telemetria RAM (diagnoza OOM — plan 2026-08-09; format: [req] …) ───
import { withMem } from '@/lib/memlog';
export const POST = withMem('rueckmeldung POST', handlePost);
