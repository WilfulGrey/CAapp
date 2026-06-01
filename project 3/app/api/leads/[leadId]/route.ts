import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = (serviceKey && serviceKey.length > 10 ? serviceKey : null)
    || (anonKey && anonKey.length > 10 ? anonKey : null);

  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { leadId: string } }
) {
  try {
    const supabase = getSupabaseClient();
    const { leadId } = params;

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (error) {
      console.error('[API Leads] Database error:', error);
      return NextResponse.json(
        { error: 'Datenbankfehler', details: error.message },
        { status: 500 }
      );
    }

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead nicht gefunden' },
        { status: 404 }
      );
    }

    return NextResponse.json(lead);
  } catch (error) {
    console.error('[API Leads] Error:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Daten', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { leadId: string } }
) {
  try {
    const supabase = getSupabaseClient();
    const { leadId } = params;
    const body = await request.json();

    const { data, error } = await supabase
      .from('leads')
      .update(body)
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      console.error('[API Leads] Update error:', error);
      return NextResponse.json(
        { error: 'Aktualisierungsfehler', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Leads] Error:', error);
    return NextResponse.json(
      { error: 'Fehler beim Aktualisieren', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
