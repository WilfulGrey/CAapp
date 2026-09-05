import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Lead als Test kennzeichnen — oder die Kennzeichnung zuruecknehmen.
 *
 * Martin, 05.09.2026: „koennen wir beim kostenrechner leads auch loeschen, wenn
 * das zb testleads waren". Entscheidung: NICHT loeschen, sondern kennzeichnen
 * und ausblenden. Der Lead bleibt in der Datenbank, verschwindet aber aus der
 * Admin-Liste, aus der Statistik und aus den Berichten — und laesst sich mit
 * einem Klick zurueckholen.
 *
 * Bewusst server-seitig mit dem Service-Key: der oeffentliche Anon-Key liegt im
 * Browser-Bundle: Schreibrechte gehoeren nicht dorthin, wo jeder sie liest.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const cookie = request.cookies.get('admin_auth')?.value ?? '';
  const erwartet = process.env.ADMIN_PASSWORD || 'primundus2026';
  if (cookie !== erwartet) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let ist_test = true;
  try {
    const body = await request.json();
    if (typeof body?.ist_test === 'boolean') ist_test = body.ist_test;
  } catch { /* ohne Rumpf: als Test kennzeichnen */ }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Serverschlüssel fehlt' }, { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await supabase
    .from('leads')
    .update({ ist_test })
    .eq('id', params.id)
    .select('id, ist_test')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: data.id, ist_test: data.ist_test });
}
