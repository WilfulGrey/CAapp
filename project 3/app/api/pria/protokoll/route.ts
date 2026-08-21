/*
 * Mitschrift der Pria-Chats.
 *
 * Das Widget sammelt Sprechblasen und schickt sie gebündelt hierher — nicht
 * eine Anfrage je Blase. Geschrieben wird nur; gelesen wird im Admin unter
 * „Gespräche".
 *
 * Bewusst fail-soft: wenn hier etwas schiefgeht, darf der Chat davon nichts
 * merken. Ein verlorenes Protokoll ist ärgerlich, ein hängender Chat ist
 * schlimmer. Deshalb 204 auch dann, wenn die Tabelle noch fehlt.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLLEN = new Set(['kunde', 'pria', 'modell', 'system']);
const MAX_ZEILEN = 60;

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Zeile = {
  zeit?: string; rolle?: string; text?: string; ereignis?: string;
  typ?: string; feld?: string; werte?: string[]; modell?: string;
  tokens?: Record<string, number>; antworten?: Record<string, string>;
};

export async function POST(request: Request) {
  try {
    const db = supabase();
    if (!db) return new NextResponse(null, { status: 204 });

    const body = await request.json();
    const sid = String(body?.sid || '').replace(/[^\w-]/g, '').slice(0, 40);
    const zeilen: Zeile[] = Array.isArray(body?.zeilen) ? body.zeilen.slice(0, MAX_ZEILEN) : [];
    if (!sid || !zeilen.length) return new NextResponse(null, { status: 204 });

    const reihen = zeilen
      .filter((z) => z && ROLLEN.has(String(z.rolle)))
      .map((z) => {
        // Alles, was nicht Rolle/Text/Ereignis ist, wandert nach meta —
        // das Werkzeug des Modells wird sich noch ändern.
        const { zeit, rolle, text, ereignis, ...rest } = z;
        const meta = Object.keys(rest).length ? rest : null;
        return {
          sid,
          rolle: String(rolle),
          text: String(text ?? '').slice(0, 4000),
          ereignis: ereignis ? String(ereignis).slice(0, 40) : null,
          meta,
          zeit: zeit && !Number.isNaN(Date.parse(zeit)) ? zeit : new Date().toISOString(),
        };
      });

    if (reihen.length) {
      const { error } = await db.from('pria_gespraeche').insert(reihen);
      // Fehlende Tabelle (Migration noch nicht gelaufen) ist kein Grund,
      // den Chat zu stören — aber es gehört ins Log.
      if (error) console.warn('[pria] Protokoll nicht gespeichert:', error.message);
    }
    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    console.warn('[pria] Protokoll-Route:', e?.message);
    return new NextResponse(null, { status: 204 });
  }
}
