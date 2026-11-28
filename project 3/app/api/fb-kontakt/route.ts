import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FB_TOKEN_MUSTER, kontaktAusZeile } from '@/lib/fb-kontakt';

/**
 * POST /api/fb-kontakt  { token }  →  { gefunden: true, name, email, telefon, kanal } | 404 { gefunden: false }
 *
 * Liefert dem Kostenrechner die Kontaktdaten eines Facebook-/Instagram-Formular-Leads, damit der
 * letzte Schritt vorausgefüllt ist (Registry #172, lib/fb-kontakt.ts). Der Schlüssel kommt aus dem
 * Knopf der Bestätigungsmail (24 Zufallsbytes, nicht zu erraten). POST statt GET, damit der
 * Schlüssel in keiner Zugriffs-URL steht. fb_leads ist per RLS zu ⇒ Service-Key.
 */
export const dynamic = 'force-dynamic';

const ohneCache = { 'Cache-Control': 'no-store' };
const nichtGefunden = () => NextResponse.json({ gefunden: false }, { status: 404, headers: ohneCache });

export async function POST(request: Request) {
  let token: unknown;
  try {
    token = (await request.json())?.token;
  } catch {
    return nichtGefunden();
  }
  if (typeof token !== 'string' || !FB_TOKEN_MUSTER.test(token)) return nichtGefunden();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[fb-kontakt] SUPABASE_SERVICE_ROLE_KEY fehlt');
    return NextResponse.json({ gefunden: false }, { status: 500, headers: ohneCache });
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db
    .from('fb_leads')
    .select('name, email, phone, platform, created_time')
    .eq('rechner_token', token)
    .maybeSingle();
  if (error) {
    console.error('[fb-kontakt]', error.message);
    return NextResponse.json({ gefunden: false }, { status: 500, headers: ohneCache });
  }
  const kontakt = kontaktAusZeile(data);
  if (!kontakt) return nichtGefunden();
  return NextResponse.json({ gefunden: true, ...kontakt }, { headers: ohneCache });
}
