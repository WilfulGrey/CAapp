import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_AKTIONEN, ADMIN_SPALTEN, adminAktionAus, adminPlan, antwortUpdate } from '@/lib/bewertungen-admin';
import { istObjekt, type BewertungStatus } from '@/lib/bewertungen-basis';
import { fehlerText, supabaseDienst } from '@/lib/bewertungen-server';

/**
 * Admin → eine Bewertung ändern (Martin, 17.09.2026). Body:
 *   { aktion: 'freigeben' | 'freigeben_kunde' | 'ablehnen' | 'zurueckziehen' }
 *   { antwort: string }   leer ⇒ Antwort entfernen
 * Antwort: { ok: true, bewertung } mit der Zeile nach der Änderung.
 * Schutz wie die übrigen Admin-Routen (middleware.ts + Cookie-Prüfung hier).
 */

export const dynamic = 'force-dynamic';

function angemeldet(request: NextRequest): boolean {
  return (request.cookies.get('admin_auth')?.value ?? '') === (process.env.ADMIN_PASSWORD || 'primundus2026');
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!angemeldet(request)) return NextResponse.json({ fehler: 'Nicht angemeldet.' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ fehler: 'Bewertung nicht gefunden.' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ fehler: 'Ungültige Anfrage.' }, { status: 400 });
  }
  if (!istObjekt(body)) return NextResponse.json({ fehler: 'Ungültige Anfrage.' }, { status: 400 });

  try {
    const supabase = supabaseDienst();
    const { data: zeile, error } = await supabase
      .from('bewertungen')
      .select('id, status, kunde_bestaetigt')
      .eq('id', params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!zeile) return NextResponse.json({ fehler: 'Bewertung nicht gefunden.' }, { status: 404 });
    const jetztIso = new Date().toISOString();

    let update: Record<string, unknown>;
    let vonStatus: BewertungStatus | null = null;
    let was: string;

    if ('antwort' in body) {
      const r = antwortUpdate(body.antwort, jetztIso);
      if (!r.ok) return NextResponse.json({ fehler: r.fehler }, { status: 400 });
      update = r.update;
      was = r.update.antwort ? 'antwort' : 'antwort_entfernt';
    } else {
      const aktion = adminAktionAus(body.aktion);
      if (!aktion) return NextResponse.json({ fehler: 'Unbekannte Aktion.' }, { status: 400 });
      const plan = adminPlan({ status: zeile.status as BewertungStatus, kunde_bestaetigt: zeile.kunde_bestaetigt === true }, aktion, jetztIso);
      if (plan.art === 'nicht_moeglich') return NextResponse.json({ fehler: plan.grund }, { status: 409 });
      if (plan.art === 'erledigt') {
        const { data: aktuell } = await supabase.from('bewertungen').select(ADMIN_SPALTEN).eq('id', params.id).maybeSingle();
        return NextResponse.json({ ok: true, bewertung: aktuell, hinweis: `${ADMIN_AKTIONEN[aktion]}: war schon erledigt.` });
      }
      update = plan.update;
      vonStatus = plan.vonStatus;
      was = aktion;
    }

    let abfrage = supabase.from('bewertungen').update(update).eq('id', params.id);
    // Nur aus dem erwarteten Stand heraus ändern (Mail-Link und Admin gleichzeitig).
    if (vonStatus) abfrage = abfrage.eq('status', vonStatus);
    const { data: neu, error: updateFehler } = await abfrage.select(ADMIN_SPALTEN);
    if (updateFehler) throw new Error(updateFehler.message);
    if (!neu || neu.length === 0) {
      return NextResponse.json({ fehler: 'Die Bewertung wurde gerade anderswo geändert. Bitte die Seite neu laden.' }, { status: 409 });
    }
    console.log(`[admin/bewertungen] ${was} id=${params.id}`);
    return NextResponse.json({ ok: true, bewertung: neu[0] });
  } catch (e) {
    console.error('[admin/bewertungen] Ändern:', fehlerText(e));
    return NextResponse.json({ fehler: `Speichern fehlgeschlagen: ${fehlerText(e)}` }, { status: 500 });
  }
}
