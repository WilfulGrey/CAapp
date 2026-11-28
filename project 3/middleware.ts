import { NextRequest, NextResponse } from 'next/server';
import { ALTES_COOKIE, istAdmin } from '@/lib/admin-sitzung';
import { istSeiteMitLinkToken, LINK_TOKEN_COOKIE, LINK_TOKEN_MAX_AGE_S } from './lib/link-token';

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

/* Angemeldet = gültiges, signiertes Cookie `admin_sitzung` (lib/admin-sitzung.ts,
   Registry #135). Kein Ersatzwert: fehlt ADMIN_PASSWORD oder
   ADMIN_SESSION_SECRET, ist das Panel zu. Das alte Cookie (ALTES_COOKIE) trug
   das Klartext-Passwort; es zählt nicht mehr und wird bei jedem Admin-Aufruf
   gelöscht — alle melden sich einmal neu an. */
function ohneAltesCookie(request: NextRequest, antwort: NextResponse): NextResponse {
  if (request.cookies.has(ALTES_COOKIE)) antwort.cookies.delete(ALTES_COOKIE);
  return antwort;
}

/* Der A/B-Test mit Pria (Float auf der B-Seite) ist seit 13.09.2026
   beendet — Registry #67: A 500 Sitzungen / 25 Leads, B 421 / 24, der Chat
   selbst 1 Lead in drei Wochen. Die Weiche würfelt nicht mehr. */

export async function middleware(request: NextRequest) {
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
    if (!eigenerSchutz && !(await istAdmin(request))) {
      return ohneAltesCookie(request, NextResponse.json({ fehler: 'Nicht angemeldet.' }, { status: 401 }));
    }
    return ohneAltesCookie(request, NextResponse.next());
  }

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin-login')) {
    if (!(await istAdmin(request))) {
      return ohneAltesCookie(request, NextResponse.redirect(new URL('/admin-login', request.url)));
    }
    return ohneAltesCookie(request, NextResponse.next());
  }

  /* Mail-Links mit Zugangsschlüssel (Abmelden, Rückmeldung, Feedback): der
     Schlüssel öffnet auch das Kundenportal, GTM meldet aber die volle Adresse
     an Google Analytics und Clarity. Deshalb hier heraus damit — Cookie nur
     für diese Seite, eine Stunde, dann dieselbe Adresse ohne `token`
     (Registry #134). Die Seite liest ihn über lib/link-token.ts. */
  if (istSeiteMitLinkToken(pathname)) {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.next();
    const rest = new URLSearchParams(request.nextUrl.searchParams);
    rest.delete('token');
    const suche = rest.toString();
    // Ziel wie bei /admin-login aus request.url gebaut (Next 13 verlangt in
    // der Middleware eine absolute Location).
    const antwort = NextResponse.redirect(new URL(`${pathname}${suche ? `?${suche}` : ''}`, request.url));
    antwort.cookies.set(LINK_TOKEN_COOKIE, token, {
      path: pathname,
      maxAge: LINK_TOKEN_MAX_AGE_S,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return antwort;
  }

  /* Startseite: kein Rewrite mehr. Ein altes `pm_variante`-Cookie wird
     gelöscht — sonst meldete variantenSeite() die Herkunft weiter als
     Variante B, obwohl alle dieselbe Seite sehen. */
  if (pathname === '/') {
    if (request.cookies.has('pm_variante')) {
      const antwort = NextResponse.next();
      antwort.cookies.delete('pm_variante');
      return antwort;
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // /_next/image wymaga JAWNEGO wpisu (Next domyślnie omija _next w matcherach).
  // '/' → löscht nur noch das alte Varianten-Cookie (Test beendet 13.09.2026).
  // '/abmelden', '/feedback', '/rueckmeldung' → Zugangsschlüssel aus der Adresse (Registry #134).
  matcher: ['/', '/admin/:path*', '/api/admin/:path*', '/_next/image', '/abmelden', '/feedback', '/rueckmeldung'],
};
