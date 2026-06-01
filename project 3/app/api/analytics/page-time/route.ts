import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, pagePath, timeOnPage } = body;

    if (!sessionId || !pagePath || !timeOnPage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: pageViews } = await supabase
      .from('analytics_page_views')
      .select('id')
      .eq('session_id', sessionId)
      .eq('page_path', pagePath)
      .order('created_at', { ascending: false })
      .limit(1);

    if (pageViews && pageViews.length > 0) {
      await supabase
        .from('analytics_page_views')
        .update({ time_on_page: timeOnPage })
        .eq('id', pageViews[0].id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Analytics page-time error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
