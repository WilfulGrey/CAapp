import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { pruefeMonatsEingabe } from '@/lib/wachstum';

/**
 * Speichert Provision, variable Kosten und Gemeinkosten eines Monats für die
 * Ergebnisrechnung auf /admin/ergebnis (Martin, 15.09.2026: „manuelle Eingabe
 * von Gemeinkosten pro Monat … damit wir dann sehen, wo wir stehen").
 *
 * Eine Zeile je Monat in `wachstum_monat`; Monate ohne Zeile übernehmen den
 * letzten früheren Eintrag (rechnet lib/wachstum.ts). Service-Key hinter dem
 * Admin-Cookie — die Middleware sperrt /api/admin/* ohnehin.
 */
export async function PUT(request: NextRequest) {
  const cookie = request.cookies.get('admin_auth')?.value ?? '';
  if (cookie !== (process.env.ADMIN_PASSWORD || 'primundus2026')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Serverschlüssel fehlt' }, { status: 500 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Kein gültiges JSON.' }, { status: 400 }); }
  const geprueft = pruefeMonatsEingabe(body);
  if (!geprueft.ok) return NextResponse.json({ error: geprueft.fehler }, { status: 400 });

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from('wachstum_monat')
    .upsert({ ...geprueft.wert, aktualisiert_at: new Date().toISOString() }, { onConflict: 'monat' })
    .select('monat, provision_je_kunde, variabel_je_kunde, gemeinkosten')
    .single();
  if (error) {
    const fehlt = ['42P01', 'PGRST205'].includes(String(error.code));
    return NextResponse.json(
      { error: fehlt ? 'Die Kostentabelle ist in der Datenbank noch nicht angelegt.' : error.message },
      { status: fehlt ? 503 : 500 },
    );
  }
  return NextResponse.json({ gespeichert: data }, { headers: { 'Cache-Control': 'no-store' } });
}
