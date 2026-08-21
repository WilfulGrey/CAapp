/*
 * Aus dem Chat wird ein Lead.
 *
 * Bewusst KEIN zweiter Lead-Pfad: die Route rechnet nur den Preis und reicht
 * dann an `/api/angebot-anfordern` weiter — dieselbe Stelle, die auch das
 * Formular benutzt. Lead-Anlage, Eingangsbestaetigung, Magiclink und die
 * lead_events haengen dort; sie hier zu wiederholen hiesse, sie beim naechsten
 * Mal an einer Stelle zu aendern und an der anderen zu vergessen.
 *
 * Danach wird die `lead_id` in alle Zeilen des Gespraechs nachgetragen —
 * damit haengt der Lead am Gespraech und das Gespraech am Lead.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { berechnePreis } from '@/lib/calculation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Prias sechs Angaben → die Sprache des Kostenrechners.
   Fuenf Werte sind wortgleich, drei Begriffe weichen ab — die stehen hier
   und NUR hier, damit die Uebersetzung an einer Stelle nachlesbar ist. */
const PERSONEN: Record<string, string> = { '1': '1-person', '2': 'ehepaar' };
const MOBIL: Record<string, string> = {
  mobil: 'mobil', rollator: 'rollator', rollstuhl: 'rollstuhl', bett: 'bettlaegerig',
};
const DEUTSCH: Record<string, string> = {
  grundlegend: 'grundlegend', kommunikativ: 'kommunikativ', gut: 'sehr-gut',
};
const NACHT = new Set(['nein', 'gelegentlich', 'taeglich', 'mehrmals']);

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ fehler: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const name = String(body?.name || '').trim().slice(0, 120);
  const email = String(body?.email || '').trim().slice(0, 200);
  const telefon = String(body?.telefon || '').trim().slice(0, 60);
  const sid = String(body?.sid || '').replace(/[^\w-]/g, '').slice(0, 40);
  const a = body?.antworten || {};

  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) {
    return NextResponse.json({ fehler: 'Name oder E-Mail fehlt.' }, { status: 400 });
  }
  // Die sechs Angaben muessen vollstaendig sein — sonst rechnet der Rechner
  // mit Standardwerten, und der Kunde bekaeme einen Preis, den niemand
  // beantwortet hat.
  if (!PERSONEN[a.personen] || !MOBIL[a.mobil] || !DEUTSCH[a.deutsch] || !NACHT.has(a.nacht)) {
    return NextResponse.json({ fehler: 'Angaben unvollständig.' }, { status: 400 });
  }

  // „Weiß ich nicht" beim Pflegegrad heißt: ohne rechnen. Genau das sagt Pria
  // im Gespräch auch zu — der Grad wird später im Portal nachgetragen.
  const pflegegrad = /^[1-5]$/.test(String(a.pflegegrad)) ? parseInt(a.pflegegrad, 10) : 0;

  const formularDaten = {
    betreuung_fuer: PERSONEN[a.personen],
    pflegegrad,
    weitere_personen: a.haushalt === 'ja' ? 'ja' : 'nein',
    mobilitaet: MOBIL[a.mobil],
    nachteinsaetze: a.nacht,
    deutschkenntnisse: DEUTSCH[a.deutsch],
    // Diese drei fragt Pria NICHT (Martin, 21.08.): kein Aufschlag, größte
    // Auswahl — entschieden wird beim Aussuchen der Kraft im Portal. Lieber
    // offen lassen als etwas erfinden, das niemand gesagt hat.
    erfahrung: 'einsteiger',
    fuehrerschein: 'egal',
    geschlecht: 'egal',
  };

  try {
    const kalkulation = await berechnePreis(formularDaten as any);

    // Derselbe Endpunkt wie beim Formular — ein Lead-Pfad, nicht zwei.
    const eigen = new URL(request.url).origin;
    const res = await fetch(`${eigen}/api/angebot-anfordern`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vorname: name,
        email,
        telefon,
        kalkulation: { ...kalkulation, formularDaten },
        acceptPrivacy: true,
        quelle: 'pria-chat',
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const daten = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[pria] Lead fehlgeschlagen', res.status, JSON.stringify(daten).slice(0, 200));
      return NextResponse.json({ fehler: 'Angebot konnte nicht angelegt werden.' }, { status: 502 });
    }

    // Gespräch und Lead verknüpfen. Schlägt das fehl, ist der Lead trotzdem
    // da — deshalb nur eine Warnung, kein Fehler nach außen.
    const db = supabase();
    if (db && sid && daten.leadId) {
      const { error } = await db.from('pria_gespraeche')
        .update({ lead_id: daten.leadId }).eq('sid', sid);
      if (error) console.warn('[pria] lead_id nicht nachgetragen:', error.message);
    }

    console.log(`[pria] Lead ${daten.leadId} aus Gespräch ${sid}`);
    return NextResponse.json({ leadId: daten.leadId ?? null, portalUrl: daten.portalUrl ?? null });
  } catch (e: any) {
    console.warn('[pria] Lead-Route:', e?.message);
    return NextResponse.json({ fehler: 'Angebot konnte nicht angelegt werden.' }, { status: 502 });
  }
}
