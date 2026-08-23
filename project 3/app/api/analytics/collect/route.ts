/*
 * Analytics-Schreibzugriffe — serverseitig, auf unserer eigenen Domain.
 *
 * WARUM ES DIESE ROUTE GIBT (23.08.2026)
 *
 * lib/analytics.ts hat bis heute an neun Stellen direkt aus dem Browser in
 * Supabase geschrieben: Session, Pageview, Event, Formular-Interaktion,
 * Conversion. Das ist eine Anfrage an eine FREMDE Herkunft
 * (…supabase.co) — und die kam bei Safari-Nutzern nie an:
 *
 *   Fetch API cannot load https://<ref>.supabase.co/rest/v1/analytics_sessions
 *   ?select=id due to access control checks.
 *
 * Vor Supabase haengt Cloudflare und setzt zur Bot-Erkennung einen Cookie
 * auf supabase.co. Safari blockiert Cross-Site-Cookies standardmaessig,
 * Cloudflare weist die Anfrage daraufhin ab, und die Absage traegt keine
 * CORS-Kopfzeilen — der Browser meldet es als „access control checks".
 * Der Server selbst ist in Ordnung: die OPTIONS-Vorabfrage antwortet mit
 * 200 und `access-control-allow-origin: *`. In Chrome tritt der Fehler
 * nicht auf, in Safari immer.
 *
 * Folge: Fuer JEDEN Safari-Besucher — alle iPhones und iPads — wurde
 * bereits die Session nicht angelegt. Damit blieb `sessionDbId` leer, und
 * jedes Event landete in einer Warteschlange, die nie geleert wurde. Diese
 * Besucher fehlten vollstaendig in der Statistik: kein Besucher, kein
 * Pageview, kein step_view.
 *
 * Dieselbe Domain kennt das Projekt schon von woanders: Cloudflare hat vor
 * dem mamamia-Backend PUT/DELETE mit 405 abgewiesen, weshalb Schreibzugriffe
 * dort als POST mit X-HTTP-Method-Override laufen. Gleiches Muster.
 *
 * Deshalb geht jetzt alles ueber /api/analytics/collect — gleiche Herkunft,
 * kein CORS, kein fremder Cookie, keine Bot-Pruefung dazwischen.
 *
 * Bewusst mit dem ANON-Key, nicht mit dem Service-Role-Key: es aendert sich
 * nur der Weg, nicht die Berechtigung. RLS gilt unveraendert weiter.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withMem } from '@/lib/memlog';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 512;
const MAX_JSON = 4000;

/* Die Klick-IDs, die als Spalten auf analytics_sessions existieren. Eine
   feste Liste, damit ueber diese Route nichts anderes gesetzt werden kann. */
const AD_PARAM_SPALTEN = new Set([
  'gclid', 'wbraid', 'gbraid', 'utm_term', 'utm_content',
]);

const text = (v: unknown, max = MAX_TEXT): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;

const zahl = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function objekt(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  try {
    return JSON.stringify(v).length <= MAX_JSON ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function db() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function handlePost(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const kind = text(body?.kind, 32);
  const supabase = db();

  try {
    /* ── Session: anlegen oder auffrischen, DB-Id zurueckgeben ──────────
       Die Id ist der Schluessel fuer alles Weitere. Genau dieser Aufruf
       scheiterte im Browser als erstes. */
    if (kind === 'session') {
      const d = body?.data ?? {};
      const sessionId = text(d.sessionId, 120);
      if (!sessionId) return NextResponse.json({ error: 'sessionId fehlt' }, { status: 400 });

      const { data: vorhanden } = await supabase
        .from('analytics_sessions').select('id').eq('session_id', sessionId).maybeSingle();

      if (vorhanden) {
        await supabase.from('analytics_sessions')
          .update({ last_activity: new Date().toISOString() })
          .eq('id', (vorhanden as any).id);
        return NextResponse.json({ id: (vorhanden as any).id });
      }

      const { data: neu, error } = await supabase.from('analytics_sessions').insert({
        session_id: sessionId,
        fingerprint: text(d.fingerprint, 128),
        user_agent: text(d.userAgent),
        referrer: text(d.referrer),
        landing_page: text(d.landingPage, 200),
        utm_source: text(d.utmSource, 200),
        utm_medium: text(d.utmMedium, 200),
        utm_campaign: text(d.utmCampaign, 200),
        device_type: text(d.deviceType, 32),
        browser: text(d.browser, 64),
        os: text(d.os, 64),
      }).select('id').single();

      if (error) {
        console.error('[analytics] Session-Insert:', error.message);
        return NextResponse.json({ id: null }, { status: 200 });
      }
      return NextResponse.json({ id: (neu as any)?.id ?? null });
    }

    /* Ab hier braucht alles die Session-Id aus dem Schritt oben. */
    const sid = text(body?.sessionId, 64);
    if (!sid || !UUID_RE.test(sid)) {
      return NextResponse.json({ error: 'sessionId ungültig' }, { status: 400 });
    }

    if (kind === 'page_view') {
      // Verweildauer der VORHERIGEN Seite nachtragen, dann die neue anlegen.
      const vorher = text(body?.previousPath, 200);
      const dauer = zahl(body?.timeOnPrevious);
      if (vorher && dauer !== null && dauer > 0) {
        await supabase.from('analytics_page_views')
          .update({ time_on_page: dauer })
          .eq('session_id', sid).eq('page_path', vorher)
          .order('created_at', { ascending: false }).limit(1);
      }
      const { error } = await supabase.from('analytics_page_views').insert({
        session_id: sid,
        page_path: text(body?.pagePath, 200),
        page_title: text(body?.pageTitle),
        referrer_path: vorher,
        viewed_at: new Date().toISOString(),
      });
      if (error) console.error('[analytics] Pageview:', error.message);
      return NextResponse.json({ ok: true });
    }

    if (kind === 'event') {
      const typ = text(body?.eventType, 64);
      const name = text(body?.eventName, 64);
      if (!typ || !name) return NextResponse.json({ error: 'Event unvollständig' }, { status: 400 });
      const { error } = await supabase.from('analytics_events').insert({
        session_id: sid,
        event_type: typ,
        event_name: name,
        event_data: objekt(body?.eventData),
        page_path: text(body?.pagePath, 200),
      });
      if (error) console.error('[analytics] Event:', error.message);
      return NextResponse.json({ ok: true });
    }

    if (kind === 'form_interaction') {
      const { error } = await supabase.from('analytics_form_interactions').insert({
        session_id: sid,
        form_name: text(body?.formName, 64),
        field_name: text(body?.fieldName, 64),
        interaction_type: text(body?.interactionType, 32),
        field_value: text(body?.fieldValue),
        time_spent: zahl(body?.timeSpent),
      });
      if (error) console.error('[analytics] Formular:', error.message);
      return NextResponse.json({ ok: true });
    }

    if (kind === 'conversion') {
      const typ = text(body?.conversionType, 64);
      if (!typ) return NextResponse.json({ error: 'conversionType fehlt' }, { status: 400 });
      const leadId = text(body?.leadId, 64);
      const { error } = await supabase.from('analytics_conversions').insert({
        session_id: sid,
        lead_id: leadId && UUID_RE.test(leadId) ? leadId : null,
        conversion_type: typ,
        conversion_value: zahl(body?.conversionValue),
        form_data: objekt(body?.formData),
      });
      if (error) console.error('[analytics] Conversion:', error.message);
      return NextResponse.json({ ok: true });
    }

    if (kind === 'ad_params') {
      // Nur bekannte Spalten, und weiter best-effort: fehlt die Migration,
      // fehlt die Attribution — nicht die Session.
      const roh = objekt(body?.params);
      const gefiltert: Record<string, string> = {};
      for (const [k, v] of Object.entries(roh)) {
        if (AD_PARAM_SPALTEN.has(k) && typeof v === 'string') gefiltert[k] = v.slice(0, 200);
      }
      if (Object.keys(gefiltert).length === 0) return NextResponse.json({ ok: true });
      const { error } = await supabase.from('analytics_sessions')
        .update(gefiltert).eq('id', sid);
      if (error) console.error('[analytics] Ad-Params:', error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unbekannte Art' }, { status: 400 });
  } catch (e: any) {
    // Analytics darf niemals etwas kaputtmachen — Fehler bleiben hier.
    console.error('[analytics] collect:', e?.message);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export const POST = withMem('analytics-collect', handlePost);
