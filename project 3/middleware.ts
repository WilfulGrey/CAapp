import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'primundus2026';

/* Admin-API-Routen mit EIGENEM Zugangsschutz — sie duerfen nicht am
   Browser-Cookie haengen:
   - /api/admin/auth ist der Login selbst (setzt das Cookie ja erst).
   - /api/admin/resend-bewerbung-bcc prueft `Bearer SUPABASE_SERVICE_ROLE_KEY`
     und wird server-zu-server aus .github/workflows/supabase-ops.yml
     getriggert — ein Cookie hat dieser Aufrufer nie.
   Alles andere unter /api/admin ist per Default zu. Eine neue Ausnahme
   gehoert bewusst hierher, samt Begruendung, welchen Schutz sie stattdessen
   mitbringt. */
const API_OHNE_ADMIN_COOKIE = [
  '/api/admin/auth',
  '/api/admin/resend-bewerbung-bcc',
];

function istAngemeldet(request: NextRequest): boolean {
  return request.cookies.get('admin_auth')?.value === ADMIN_PASSWORD;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Telemetria optymalizatora obrazów (diagnoza OOM — plan 2026-08-09):
  // sharp NIE jest w deps ⇒ Next optymalizuje squoosh-WASM-em W PROCESIE
  // (podejrzany #1). Middleware nie ma process.memoryUsage (edge-runtime) —
  // logujemy CZĘSTOTLIWOŚĆ i szerokości; korelację z RAM daje sampler [mem]
  // z instrumentation.ts. Do zdjęcia po diagnozie.
  if (pathname === '/_next/image') {
    const sp = request.nextUrl.searchParams;
    console.log(`[img] w=${sp.get('w') ?? '?'} q=${sp.get('q') ?? '?'} url=${sp.get('url') ?? '?'}`);
    return NextResponse.next();
  }

  /* Die Admin-API war bis 27.08.2026 ohne Login abrufbar: der Matcher deckte
     nur '/admin/:path*' ab, und '/api/admin/...' faengt nicht mit '/admin'
     an. Ueber /api/admin/pria-gespraeche waren damit alle Pria-Gespraeche
     lesbar — mit `?sid=` samt Name, E-Mail, Telefon und dem Portal-Link
     inklusive gueltigem Token. Deshalb: gleicher Schutz wie die Seiten,
     aber mit JSON-401 statt Redirect, weil die Aufrufer JSON erwarten. */
  if (pathname.startsWith('/api/admin')) {
    const eigenerSchutz = API_OHNE_ADMIN_COOKIE.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (!eigenerSchutz && !istAngemeldet(request)) {
      return NextResponse.json({ fehler: 'Nicht angemeldet.' }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin-login')) {
    if (!istAngemeldet(request)) {
      return NextResponse.redirect(new URL('/admin-login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // /_next/image wymaga JAWNEGO wpisu (Next domyślnie omija _next w matcherach).
  matcher: ['/admin/:path*', '/api/admin/:path*', '/_next/image'],
};
