import { NextRequest, NextResponse } from 'next/server';
import { sozialBereinigen } from '@/lib/sozial-zuordnung';
import { anContentLoopMelden } from '@/lib/sozial-zuordnung-server';

// Besuch aus einem Social-Beitrag (Registry #112): nimmt {ereignis: 'besuch',
// variante, beitrag, plattform} an und meldet ihn an den Content-Loop. Wie der
// anonyme Zähler (Registry #63) wird über den Absender NICHTS gespeichert,
// geloggt oder weitergegeben — keine IP, kein User-Agent, kein Cookie.
// Anfragen meldet nur der Server selbst (angebot-anfordern), nie der Browser.
// Antwort immer 204: der Rechner darf davon nie abhängen.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const herkunft = body?.ereignis === 'besuch' ? sozialBereinigen(body) : null;
    if (herkunft) await anContentLoopMelden({ ereignis: 'besuch', herkunft });
  } catch {
    // bewusst still
  }
  return new NextResponse(null, { status: 204 });
}
