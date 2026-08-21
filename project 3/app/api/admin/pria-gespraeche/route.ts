/*
 * Gespräche fürs Admin lesen.
 *
 * Ohne `sid`: die Liste — je Gespräch eine Zeile mit Beginn, Dauer, Anzahl
 * Nachrichten, der ersten Kundenfrage und der Marke, ob daraus ein Lead wurde.
 * Mit `sid`: der ganze Verlauf.
 *
 * Serviceseitig, weil die Tabelle RLS ohne anon-Policies hat. Die Admin-Seite
 * liegt hinter dem bestehenden Login (middleware), deshalb reicht das hier.
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const db = supabase();
  if (!db) return NextResponse.json({ fehler: 'Supabase nicht konfiguriert.' }, { status: 503 });

  const sid = request.nextUrl.searchParams.get('sid');
  const leadId = request.nextUrl.searchParams.get('leadId');

  /* Der Rueckweg: von einem Lead zu seinem Gespraech. Die Lead-Seite fragt
     hier nur, OB es eines gibt — und bekommt die sid zum Verlinken. */
  if (leadId) {
    const { data, error } = await db
      .from('pria_gespraeche')
      .select('sid, zeit')
      .eq('lead_id', leadId)
      .order('zeit', { ascending: true })
      .limit(1);
    if (error) return NextResponse.json({ fehler: error.message }, { status: 500 });
    const treffer = (data ?? [])[0];
    return NextResponse.json({ sid: treffer?.sid ?? null, beginn: treffer?.zeit ?? null });
  }

  // ── Ein Gespräch am Stück ────────────────────────────────────────
  if (sid) {
    const { data, error } = await db
      .from('pria_gespraeche')
      .select('*')
      .eq('sid', sid)
      .order('zeit', { ascending: true });
    if (error) return NextResponse.json({ fehler: error.message }, { status: 500 });

    /* Die Kontaktdaten stehen bewusst NICHT im Protokoll — sie gehoeren zum
       Lead, nicht in eine Mitschrift. Fuer die Ansicht werden sie dazugeholt,
       damit man nicht zwischen zwei Seiten springen muss. */
    const leadId = (data ?? []).find((z: any) => z.lead_id)?.lead_id ?? null;
    let lead: any = null;
    if (leadId) {
      // `any`, weil ohne generierte Datenbank-Typen sonst GenericStringError
      // herauskommt und jeder Feldzugriff ein Typfehler ist.
      const { data: l } = await (db as any)
        .from('leads')
        .select('id, anrede_text, vorname, nachname, email, telefon, created_at, ' +
                'mamamia_customer_id, mamamia_job_offer_id, kalkulation, token')
        .eq('id', leadId)
        .maybeSingle();
      if (l) {
        const k = (l as any).kalkulation || {};
        lead = {
          id: l.id,
          name: [l.anrede_text, l.vorname, l.nachname].filter(Boolean).join(' '),
          email: l.email, telefon: l.telefon, angelegt: l.created_at,
          mamamiaKunde: l.mamamia_customer_id, mamamiaJob: l.mamamia_job_offer_id,
          bruttopreis: k.bruttopreis ?? null, eigenanteil: k.eigenanteil ?? null,
          angaben: k.formularDaten ?? null,
          portalUrl: l.token && process.env.NEXT_PUBLIC_PORTAL_URL
            ? `${process.env.NEXT_PUBLIC_PORTAL_URL.replace(/\/$/, '')}/?token=${encodeURIComponent(l.token)}`
            : null,
        };
      }
    }
    return NextResponse.json({ sid, zeilen: data ?? [], lead });
  }

  // ── Die Liste ────────────────────────────────────────────────────
  // Bewusst ohne SQL-Aggregat: die Menge ist klein, und eine RPC waere eine
  // zusaetzliche Migration fuer einen Bericht, der sich noch aendert.
  const { data, error } = await db
    .from('pria_gespraeche')
    .select('sid, rolle, text, ereignis, lead_id, zeit')
    .order('zeit', { ascending: false })
    .limit(4000);
  if (error) return NextResponse.json({ fehler: error.message }, { status: 500 });

  const proSid = new Map<string, any>();
  for (const z of data ?? []) {
    let g = proSid.get(z.sid);
    if (!g) {
      g = { sid: z.sid, beginn: z.zeit, ende: z.zeit, nachrichten: 0,
            ersteFrage: null as string | null, lead: false, leadId: null as string | null };
      proSid.set(z.sid, g);
    }
    // Absteigend sortiert: das zuletzt Gesehene ist das Frueheste.
    g.beginn = z.zeit;
    if (z.zeit > g.ende) g.ende = z.zeit;
    if (z.rolle === 'kunde' || z.rolle === 'pria') g.nachrichten++;
    if (z.rolle === 'kunde' && z.text) g.ersteFrage = z.text.slice(0, 120);
    if (z.ereignis === 'lead') g.lead = true;
    if (z.lead_id) g.leadId = z.lead_id;
  }

  // Array.from statt Spread: das Projekt kompiliert auf ein Ziel ohne
  // downlevelIteration, dort ist der Spread eines Iterators ein Typfehler.
  const liste = Array.from(proSid.values()).sort((a, b) => (a.ende < b.ende ? 1 : -1));
  return NextResponse.json({ gespraeche: liste });
}
