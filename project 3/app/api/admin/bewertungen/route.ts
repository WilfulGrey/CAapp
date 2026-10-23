import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SPALTEN, MAX_ADMIN_LISTE, pruefeManuell } from '@/lib/bewertungen-admin';
import { fehlerText, supabaseDienst } from '@/lib/bewertungen-server';

/**
 * Admin → Bewertungen (Martin, 17.09.2026).
 *   GET  alle Bewertungen, neueste Eingänge zuerst (Filter macht die Seite)
 *   POST Bewertung eintragen, die per Mail, Telefon, Brief oder bei Google kam:
 *        sofort veröffentlicht, ohne E-Mail, es gehen keine Mails raus.
 *
 * Schutz wie die übrigen Admin-Routen: middleware.ts lässt /api/admin nur mit
 * gültigem admin_auth-Cookie durch, hier wird es zusätzlich geprüft.
 * Service-Key, weil die Tabelle RLS ohne Policy hat.
 */

export const dynamic = 'force-dynamic';

function angemeldet(request: NextRequest): boolean {
  return (request.cookies.get('admin_auth')?.value ?? '') === (process.env.ADMIN_PASSWORD || 'primundus2026');
}

export async function GET(request: NextRequest) {
  if (!angemeldet(request)) return NextResponse.json({ fehler: 'Nicht angemeldet.' }, { status: 401 });
  try {
    const { data, error } = await supabaseDienst()
      .from('bewertungen')
      .select(ADMIN_SPALTEN)
      .order('erstellt_am', { ascending: false })
      .limit(MAX_ADMIN_LISTE);
    if (error) throw new Error(error.message);
    return NextResponse.json({ bewertungen: data ?? [], grenze: MAX_ADMIN_LISTE }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[admin/bewertungen] Liste:', fehlerText(e));
    return NextResponse.json({ fehler: `Bewertungen konnten nicht geladen werden: ${fehlerText(e)}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!angemeldet(request)) return NextResponse.json({ fehler: 'Nicht angemeldet.' }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ fehler: 'Ungültige Anfrage.' }, { status: 400 });
  }
  const pruefung = pruefeManuell(body, new Date());
  if (!pruefung.ok) return NextResponse.json({ fehler: 'Bitte die markierten Felder prüfen.', felder: pruefung.fehler }, { status: 400 });

  try {
    const { data, error } = await supabaseDienst().from('bewertungen').insert(pruefung.zeile).select(ADMIN_SPALTEN).single();
    if (error || !data) throw new Error(error?.message ?? 'Insert ohne Zeile');
    const neu = data as unknown as { id: string };
    console.log(`[admin/bewertungen] eingetragen id=${neu.id} herkunft=${pruefung.zeile.herkunft}`);
    return NextResponse.json({ ok: true, bewertung: data });
  } catch (e) {
    console.error('[admin/bewertungen] Eintragen:', fehlerText(e));
    return NextResponse.json({ fehler: `Speichern fehlgeschlagen: ${fehlerText(e)}` }, { status: 500 });
  }
}
