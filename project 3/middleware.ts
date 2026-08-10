import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'primundus2026';

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

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin-login')) {
    const authCookie = request.cookies.get('admin_auth');
    const isAuthenticated = authCookie?.value === ADMIN_PASSWORD;

    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/admin-login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // /_next/image wymaga JAWNEGO wpisu (Next domyślnie omija _next w matcherach).
  matcher: ['/admin/:path*', '/_next/image'],
};
