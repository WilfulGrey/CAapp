import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Nimmt die letzten Analytics-Events VOR einer harten Navigation entgegen
// (sendBeacon aus lib/analytics.ts trackCriticalSubmit). Hintergrund
// Bug #33: der Sofort-Redirect ins Portal (window.location.assign nach
// Angebot-Submit) hat die direkt aus dem Browser laufenden Supabase-Inserts
// abgebrochen — ~die Hälfte der step_complete(contact_form) + conversions
// fehlte. sendBeacon überlebt die Navigation garantiert; der eigentliche
// Insert passiert hier server-seitig.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 4;
const MAX_NAME_LEN = 64;
const MAX_DATA_JSON = 2000;

function cleanName(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_NAME_LEN ? v : null;
}

function cleanData(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  try {
    return JSON.stringify(v).length <= MAX_DATA_JSON ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, pagePath, events, conversion } = body ?? {};

    if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }
    const path = typeof pagePath === 'string' && pagePath.length <= 200 ? pagePath : null;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (Array.isArray(events) && events.length > 0) {
      const rows = events.slice(0, MAX_EVENTS).flatMap((e: unknown) => {
        const ev = (e ?? {}) as Record<string, unknown>;
        const eventType = cleanName(ev.event_type);
        const eventName = cleanName(ev.event_name);
        if (!eventType || !eventName) return [];
        return [{
          session_id: sessionId,
          event_type: eventType,
          event_name: eventName,
          event_data: cleanData(ev.event_data),
          page_path: path,
        }];
      });
      if (rows.length > 0) {
        const { error } = await supabase.from('analytics_events').insert(rows);
        if (error) console.error('critical-event: events insert failed:', error.message);
      }
    }

    if (conversion && typeof conversion === 'object') {
      const conv = conversion as Record<string, unknown>;
      const conversionType = cleanName(conv.conversion_type);
      if (conversionType) {
        const leadId = typeof conv.lead_id === 'string' && UUID_RE.test(conv.lead_id)
          ? conv.lead_id
          : null;
        const value = typeof conv.conversion_value === 'number' && Number.isFinite(conv.conversion_value)
          ? conv.conversion_value
          : null;
        const { error } = await supabase.from('analytics_conversions').insert({
          session_id: sessionId,
          lead_id: leadId,
          conversion_type: conversionType,
          conversion_value: value,
          form_data: cleanData(conv.form_data),
        });
        if (error) console.error('critical-event: conversion insert failed:', error.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Analytics critical-event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// RAM-Telemetrie wie die übrigen Analytics-Routen (Plan 2026-08-09).
// Kein Sampling — die Route wird nur einmal pro Angebot-Submit getroffen.
import { withMem } from '@/lib/memlog';
export const POST = withMem('analytics-critical-event', handlePost);
