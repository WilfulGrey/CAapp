import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { 'Cache-Control': 'no-store' };

/* Daten der persönlichen Angebotsseite /kalkulation/<leadId> (+ /print) — Links
   in älteren Mails und der Knopf im Admin. Die Seite las früher mit dem
   Anon-Schlüssel direkt aus leads; das ist per RLS zu. Hier nur die Felder der
   Seite, mit dem Service-Key.

   Offenes, bewusst belassenes Risiko (Entscheidung Michał 29.09.2026): die
   Lead-UUID wirkt wie ein Link aus der Mail und liefert auch den Portal-Token
   für den Knopf „Zum Portal“. */
export async function GET(_request: NextRequest, { params }: { params: { leadId: string } }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Serverschlüssel fehlt' }, { status: 500, headers: NO_STORE });
  }
  if (!UUID_RE.test(params.leadId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from('leads')
    .select('id, token, kalkulation, anrede, anrede_text, vorname, nachname, email')
    .eq('id', params.leadId)
    .maybeSingle();

  if (error) {
    console.error('[kalkulation] Lead lesen fehlgeschlagen:', error.message);
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500, headers: NO_STORE });
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  return NextResponse.json(data, { headers: NO_STORE });
}
