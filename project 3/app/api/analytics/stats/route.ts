import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: sessions, error: sessionsError } = await supabase
      .from('analytics_sessions')
      .select('*')
      .gte('created_at', startDate.toISOString());

    console.log('[Analytics API] Sessions fetched:', sessions?.length || 0, 'Error:', sessionsError);

    // Surface query failures instead of silently returning all-zero stats.
    // A wrong/expired SUPABASE_SERVICE_ROLE_KEY makes every query 401 — the
    // dashboard then showed plausible-looking zeros instead of an error.
    if (sessionsError) {
      return NextResponse.json(
        { error: `analytics_sessions query failed: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    const sessionIds = sessions?.map(s => s.id) || [];
    console.log('[Analytics API] Session IDs:', sessionIds.length);

    let pageViews: any[] = [];
    let conversions: any[] = [];
    let formInteractions: any[] = [];
    let events: any[] = [];
    let pageViewsError = null;
    let conversionsError = null;
    let formInteractionsError = null;
    let eventsError = null;

    if (sessionIds.length > 0) {
      const results = await Promise.all([
        supabase
          .from('analytics_page_views')
          .select('*')
          .in('session_id', sessionIds),
        supabase
          .from('analytics_conversions')
          .select('*')
          .in('session_id', sessionIds),
        supabase
          .from('analytics_form_interactions')
          .select('*')
          .in('session_id', sessionIds),
        supabase
          .from('analytics_events')
          .select('session_id, event_type, event_name, event_data')
          .eq('event_type', 'wizard')
          .in('session_id', sessionIds)
      ]);

      pageViews = results[0].data || [];
      pageViewsError = results[0].error;
      conversions = results[1].data || [];
      conversionsError = results[1].error;
      formInteractions = results[2].data || [];
      formInteractionsError = results[2].error;
      events = results[3].data || [];
      eventsError = results[3].error;
    }

    console.log('[Analytics API] Page views:', pageViews.length, 'Error:', pageViewsError);
    console.log('[Analytics API] Conversions:', conversions.length, 'Error:', conversionsError);
    console.log('[Analytics API] Form interactions:', formInteractions.length, 'Error:', formInteractionsError);
    console.log('[Analytics API] Wizard events:', events.length, 'Error:', eventsError);

    const detailError = pageViewsError || conversionsError || formInteractionsError || eventsError;
    if (detailError) {
      return NextResponse.json(
        { error: `analytics detail query failed: ${detailError.message}` },
        { status: 500 }
      );
    }

    const uniqueVisitors = new Set(sessions?.map(s => s.fingerprint)).size;
    const totalSessions = sessions?.length || 0;
    const totalPageViews = pageViews.length;
    const totalConversions = conversions.length;

    const kalkulationConversions = conversions.filter(c => c.conversion_type === 'kalkulation_requested').length;
    // The wizard tracks 'angebot_angefordert'; older/result-page code used
    // 'angebot_requested'. Count both so the dashboard reflects reality.
    const angebotConversions = conversions.filter(
      c => c.conversion_type === 'angebot_angefordert' || c.conversion_type === 'angebot_requested'
    ).length;

    const conversionRate = totalSessions > 0 ? ((totalConversions / totalSessions) * 100).toFixed(2) : '0.00';

    // ── Wizard step funnel — unique sessions per step, from analytics_events ──
    // step_view / step_complete are emitted by MultiStepForm. This is the
    // real "where do users drop off, at which step" answer.
    const STEP_NAMES: Record<number, string> = {
      1: 'Betreuungsbeginn', 2: 'Anzahl Patienten', 3: 'Weitere Person im Haushalt',
      4: 'Pflegegrad', 5: 'Mobilität', 6: 'Nachteinsätze', 7: 'Deutschkenntnisse',
      8: 'Führerschein', 9: 'Geschlecht', 10: 'Kontaktformular',
    };
    const viewedSessions: Record<number, Set<string>> = {};
    const completedSessions: Record<number, Set<string>> = {};
    for (const e of events) {
      const step = e.event_data?.step;
      if (typeof step !== 'number') continue;
      if (e.event_name === 'step_view') (viewedSessions[step] ??= new Set()).add(e.session_id);
      if (e.event_name === 'step_complete') (completedSessions[step] ??= new Set()).add(e.session_id);
    }
    const wizardFunnel = Array.from({ length: 10 }, (_, i) => {
      const step = i + 1;
      const viewed = viewedSessions[step]?.size || 0;
      const completed = completedSessions[step]?.size || 0;
      const dropoff = Math.max(0, viewed - completed);
      return {
        step,
        stepName: STEP_NAMES[step],
        viewed,
        completed,
        dropoff,
        dropoffRate: viewed > 0 ? Number(((dropoff / viewed) * 100).toFixed(1)) : 0,
      };
    });
    const formStarted = wizardFunnel[0]?.viewed || 0;

    const pageViewsByPath = pageViews.reduce((acc: any, pv: any) => {
      acc[pv.page_path] = (acc[pv.page_path] || 0) + 1;
      return acc;
    }, {});

    const deviceTypes = sessions?.reduce((acc: any, s: any) => {
      acc[s.device_type] = (acc[s.device_type] || 0) + 1;
      return acc;
    }, {}) || {};

    const trafficSources = sessions?.reduce((acc: any, s: any) => {
      const source = s.utm_source || (s.referrer === 'direct' ? 'direct' : 'referral');
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {}) || {};

    const formDropoffs = formInteractions.reduce((acc: any, fi: any) => {
      if (fi.interaction_type === 'abandon') {
        const key = `${fi.form_name}_${fi.field_name}`;
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    }, {});

    const sessionsOverTime = sessions?.reduce((acc: any, s: any) => {
      const date = new Date(s.created_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {}) || {};

    const conversionsOverTime = conversions.reduce((acc: any, c: any) => {
      const date = new Date(c.created_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    const result = {
      summary: {
        uniqueVisitors,
        totalSessions,
        totalPageViews,
        totalConversions,
        kalkulationConversions,
        angebotConversions,
        formStarted,
        conversionRate: parseFloat(conversionRate),
        avgPagesPerSession: totalSessions > 0 ? (totalPageViews / totalSessions).toFixed(2) : '0.00',
      },
      pageViewsByPath,
      deviceTypes,
      trafficSources,
      formDropoffs,
      wizardFunnel,
      sessionsOverTime,
      conversionsOverTime,
    };

    console.log('[Analytics API] Result summary:', result.summary);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Analytics stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
