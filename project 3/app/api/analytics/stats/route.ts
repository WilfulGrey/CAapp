import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Why this file is structured around helpers ───────────────────────────
// The naive `select('*')` / `.in('session_id', sessionIds)` shape fails the
// moment the calculator collects nontrivial traffic:
//
//   1. Supabase REST caps a single response at 1000 rows by default. With
//      ~1.2k sessions/30d the dashboard silently lost the tail — totals,
//      funnel and over-time charts were all under-counted.
//
//   2. `.in('session_id', <N uuids>)` encodes every id into the URL. ~1.2k
//      uuids ≈ 50 KB of querystring, which the upstream (PostgREST behind
//      Cloudflare) rejects with `Bad Request` long before it reaches PG.
//
// Fix: paginate every list query with `.range()` until we see a short page,
// and chunk every `.in()` filter so each request stays well under the URL
// limit. Chunk size 200 → ~7.4 KB of UUIDs, comfortably inside common
// 8/16 KB caps.
const PAGE_SIZE = 1000;
const IN_CHUNK = 200;

type QueryResult<T> = { data: T[]; error: any };

// Supabase's PostgrestFilterBuilder is thenable but doesn't satisfy
// TS's strict PromiseLike shape, so callbacks return `any` — we only
// care about the awaited `{ data, error }` payload.
type SupabaseQuery<T> = { data: T[] | null; error: any } | PromiseLike<{ data: T[] | null; error: any }> | any;

// Pull every row out of a paginated query. The caller supplies a builder
// because the Supabase JS query builder isn't reusable across pages — each
// page needs a freshly-composed query with its own `.range()`.
async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => SupabaseQuery<T>
): Promise<QueryResult<T>> {
  const all: T[] = [];
  let from = 0;
  // Hard ceiling so a runaway query can't loop forever (e.g. 1M rows).
  // Bumping this is fine if real traffic ever needs more.
  const MAX_ROWS = 200_000;
  while (from < MAX_ROWS) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = (await buildQuery(from, to)) as { data: T[] | null; error: any };
    if (error) return { data: all, error };
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}

// Run the same query for many session ids without blowing the URL limit.
// Chunks are awaited sequentially per table to keep the connection pool
// honest (free-tier Supabase = 60 conns); the four tables themselves still
// run in parallel via Promise.all at the call site.
async function fetchByIdsInChunks<T>(
  ids: string[],
  buildQuery: (chunk: string[], from: number, to: number) => SupabaseQuery<T>
): Promise<QueryResult<T>> {
  const all: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const res = await fetchAllPages<T>((from, to) => buildQuery(chunk, from, to));
    if (res.error) return { data: all, error: res.error };
    all.push(...res.data);
  }
  return { data: all, error: null };
}

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
    // Analytics reset (2026-05-15): the pre-#85 data was inconsistent
    // (step-1 step_view dropped, label confusion). Floor every query at
    // this cutoff so the dashboard shows a clean slate from the relaunch.
    // Old rows stay in the DB — just hidden. Bumping or removing this
    // constant brings them back.
    const ANALYTICS_CUTOFF = new Date('2026-05-15T00:00:00Z');
    const effectiveStart = startDate > ANALYTICS_CUTOFF ? startDate : ANALYTICS_CUTOFF;

    const { data: sessions, error: sessionsError } = await fetchAllPages<any>(
      (from, to) => supabase
        .from('analytics_sessions')
        .select('*')
        .gte('created_at', effectiveStart.toISOString())
        .range(from, to)
    );

    console.log('[Analytics API] Sessions fetched:', sessions.length, 'Error:', sessionsError);

    // Surface query failures instead of silently returning all-zero stats.
    // A wrong/expired SUPABASE_SERVICE_ROLE_KEY makes every query 401 — the
    // dashboard then showed plausible-looking zeros instead of an error.
    if (sessionsError) {
      return NextResponse.json(
        { error: `analytics_sessions query failed: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    const sessionIds = sessions.map(s => s.id);
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
      const [pvRes, convRes, fiRes, evRes] = await Promise.all([
        fetchByIdsInChunks<any>(sessionIds, (chunk, from, to) =>
          supabase
            .from('analytics_page_views')
            .select('*')
            .in('session_id', chunk)
            .range(from, to)
        ),
        fetchByIdsInChunks<any>(sessionIds, (chunk, from, to) =>
          supabase
            .from('analytics_conversions')
            .select('*')
            .in('session_id', chunk)
            .range(from, to)
        ),
        fetchByIdsInChunks<any>(sessionIds, (chunk, from, to) =>
          supabase
            .from('analytics_form_interactions')
            .select('*')
            .in('session_id', chunk)
            .range(from, to)
        ),
        fetchByIdsInChunks<any>(sessionIds, (chunk, from, to) =>
          supabase
            .from('analytics_events')
            .select('session_id, event_type, event_name, event_data')
            .eq('event_type', 'wizard')
            .in('session_id', chunk)
            .range(from, to)
        ),
      ]);

      pageViews = pvRes.data;
      pageViewsError = pvRes.error;
      conversions = convRes.data;
      conversionsError = convRes.error;
      formInteractions = fiRes.data;
      formInteractionsError = fiRes.error;
      events = evRes.data;
      eventsError = evRes.error;
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

    const uniqueVisitors = new Set(sessions.map(s => s.fingerprint)).size;
    const totalSessions = sessions.length;
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
    // "Formular gestartet" = any wizard step was viewed. We can't key this on
    // step 1 alone: the step-1 step_view fires on mount, often before the
    // analytics session is initialised, so it's dropped. Step 2+ (fired after
    // user interaction) land fine — so a union over all step_view events is
    // the robust signal that a session entered the wizard.
    const startedSessions = new Set<string>();
    for (const e of events) {
      if (e.event_name === 'step_view') startedSessions.add(e.session_id);
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
    const formStarted = startedSessions.size;

    const pageViewsByPath = pageViews.reduce((acc: any, pv: any) => {
      acc[pv.page_path] = (acc[pv.page_path] || 0) + 1;
      return acc;
    }, {});

    const deviceTypes = sessions.reduce((acc: any, s: any) => {
      acc[s.device_type] = (acc[s.device_type] || 0) + 1;
      return acc;
    }, {});

    const trafficSources = sessions.reduce((acc: any, s: any) => {
      const source = s.utm_source || (s.referrer === 'direct' ? 'direct' : 'referral');
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    const formDropoffs = formInteractions.reduce((acc: any, fi: any) => {
      if (fi.interaction_type === 'abandon') {
        const key = `${fi.form_name}_${fi.field_name}`;
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    }, {});

    const sessionsOverTime = sessions.reduce((acc: any, s: any) => {
      const date = new Date(s.created_at).toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

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
