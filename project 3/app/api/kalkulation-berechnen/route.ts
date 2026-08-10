import { NextRequest, NextResponse } from 'next/server';
import { berechnePreis, FormularDaten } from '@/lib/calculation';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();
    const formularDaten: FormularDaten = body.formularDaten;
    const sessionId = body.sessionId;

    if (!formularDaten) {
      return NextResponse.json(
        { error: 'Formulardaten fehlen' },
        { status: 400 }
      );
    }

    const kalkulation = await berechnePreis(formularDaten);

    if (sessionId) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await supabase.from('analytics_conversions').insert({
        session_id: sessionId,
        conversion_type: 'kalkulation_requested',
        conversion_value: kalkulation.eigenanteil,
        form_data: {
          pflegegrad: formularDaten.pflegegrad,
          betreuung_fuer: formularDaten.betreuung_fuer,
          weitere_personen: formularDaten.weitere_personen,
        },
      });
    }

    return NextResponse.json(kalkulation);
  } catch (error) {
    console.error('Fehler bei Preisberechnung:', error);
    return NextResponse.json(
      { error: 'Fehler bei der Berechnung' },
      { status: 500 }
    );
  }
}

// ─── Telemetria RAM (diagnoza OOM — plan 2026-08-09; format: [req] …) ───
import { withMem } from '@/lib/memlog';
export const POST = withMem('kalkulation-berechnen', handlePost);
