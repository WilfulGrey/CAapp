// Server-Helfer der Bewertungs-Routen (/api/bewertungen/...). Nicht pure:
// Supabase-Service-Client und Antwort-Bausteine. Logik: lib/bewertungen.ts.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export function supabaseDienst() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Missing Supabase configuration');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type Supa = ReturnType<typeof supabaseDienst>;

/** HTML-Seite für Team-Links: nie cachen, nie indexieren, Token nicht weiterreichen. */
export function htmlAntwort(html: string, status = 200): NextResponse {
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
