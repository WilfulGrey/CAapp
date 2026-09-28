import { NextRequest, NextResponse } from 'next/server';
import { pruefeZaehler } from '@/lib/zaehler';
import { istPruefAnfrage } from '@/lib/pruefbrowser';

// Anonyme Wizard-Zähler (Registry #63): nimmt {ereignis, variante, quelle, geraet}
// entgegen und erhöht per RPC einen Zähler je Tag/Stunde/Ereignis/Variante/
// Quelle (google | chatgpt | sonst seit 11.09.2026 — Registry #64; dazu website |
// direkt und die Geräteklasse mobil | desktop seit 28.09.2026 — Registry #103). Es wird
// NICHTS über den Absender gespeichert oder geloggt — keine IP, kein
// User-Agent, kein Cookie. Der Body wird nur gegen die Allowlist geprüft.
// Antwort immer 204, auch bei Fehlern: der Rechner darf davon nie abhängen.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Markierte Prüfläufe zählen nicht (Registry #104). Der User-Agent wird nur
  // geprüft, nicht gespeichert oder geloggt.
  if (istPruefAnfrage(request.headers.get('user-agent'))) return new NextResponse(null, { status: 204 });
  try {
    const body = await request.json().catch(() => null);
    const z = pruefeZaehler(body);
    if (!z) return new NextResponse(null, { status: 204 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return new NextResponse(null, { status: 204 });
    await fetch(`${url}/rest/v1/rpc/wizard_zaehler_erhoehen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_ereignis: z.ereignis, p_variante: z.variante, p_quelle: z.quelle, p_geraet: z.geraet }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
  } catch {
    // bewusst still
  }
  return new NextResponse(null, { status: 204 });
}
