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

/* ── Der Dreier-Split auf der Startseite ────────────────────────────────
 *
 * Warum hier und nicht als drei Ads-Kampagnen (SEA-Session, 28.08.):
 * Drei Kampagnen auf DIESELBEN Keywords konkurrieren im eigenen Konto —
 * Google lässt pro Suchanfrage nur EINE Anzeige zu und wählt nach
 * Anzeigenrang. Die Zuteilung folgte damit genau der Größe, die wir messen
 * wollten (zirkulär): 65 von 89 Keywords lagen doppelt, die Kosten-Kampagne
 * fiel von 198 auf 12 Impressionen/Tag. Deshalb EINE Kampagne auf „/" und
 * die Drittelung hier, per Zufall.
 *
 * Serverseitig, vor dem ersten Rendern: Würde erst A erscheinen und dann
 * auf C umspringen, wäre der Test verdorben und die Absprungrate künstlich
 * hoch. Rewrite statt Redirect — die Adresse bleibt „/", damit Google
 * dieselbe Landingpage sieht wie in der Anzeige.
 */
const VARIANTEN = ['A', 'B', 'C'] as const;
type Variante = (typeof VARIANTEN)[number];
/** Welche Route jede Variante ausliefert (die Adresse bleibt „/"). */
const VARIANTEN_ZIEL: Record<Variante, string> = {
  A: '/',                  // Startseite wie bisher, ohne Pria (Kontrolle)
  B: '/kosten-berechnen',  // dieselbe Seite + Pria als schwebender Knopf
  C: '/sofortangebot',     // Pria als ganze Seite
};
/* Crawler bekommen IMMER A. Sonst sähe Google unter derselben Adresse
   wechselnde Inhalte — das ist Cloaking, und ein indexierter Voll-Chat
   statt der Startseite wäre ein SEO-Schaden, den kein Test wert ist. */
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|showyoubot|outbrain|pinterest|whatsapp|flipboard|tumblr|bitlybot|skypeuripreview|nuzzel|discord|google-inspectiontool|lighthouse|chrome-lighthouse|gtmetrix|pagespeed|ahrefs|semrush|mj12|dotbot|petalbot|applebot|duckduckbot|yandex|baidu|sogou|exabot|ia_archiver|headlesschrome/i;

function würfeln(): Variante {
  return VARIANTEN[Math.floor(Math.random() * VARIANTEN.length)];
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

  /* ── Startseite: A/B/C zu je einem Drittel ──────────────────────── */
  if (pathname === '/') {
    const ua = request.headers.get('user-agent') || '';
    if (BOT.test(ua)) return NextResponse.next();          // Crawler → immer A

    const vorhanden = request.cookies.get('pm_variante')?.value;
    const variante: Variante = (VARIANTEN as readonly string[]).includes(vorhanden || '')
      ? (vorhanden as Variante)
      : würfeln();

    const ziel = VARIANTEN_ZIEL[variante];
    /* Der Header sagt der Zielseite, dass sie gerade als „/" ausgeliefert
       wird. Wichtig fürs SEO: /kosten-berechnen und /sofortangebot tragen
       für sich genommen `noindex` (sie sollen nicht doppelt im Index
       stehen) — unter „/" darf dieses noindex NICHT mitkommen, sonst
       verschwindet die wichtigste Seite aus Google, falls ein Crawler
       durch die Bot-Erkennung rutscht. */
    const kopf = new Headers(request.headers);
    kopf.set('x-pm-variante', variante);
    const antwort = ziel === '/'
      ? NextResponse.next({ request: { headers: kopf } })
      : NextResponse.rewrite(new URL(ziel, request.url), { request: { headers: kopf } });

    /* Wiedererkennung: Derselbe Besucher muss beim Wiederkommen dieselbe
       Variante sehen — sonst stimmt die Zuordnung im Lead nicht mehr
       (er startet in C und schickt das Formular in A ab). 90 Tage, weil
       Google Klicks so lange einer Anzeige zurechnet. */
    if (vorhanden !== variante) {
      antwort.cookies.set('pm_variante', variante, {
        maxAge: 60 * 60 * 24 * 90,
        path: '/',
        sameSite: 'lax',
      });
    }
    return antwort;
  }

  return NextResponse.next();
}

export const config = {
  // /_next/image wymaga JAWNEGO wpisu (Next domyślnie omija _next w matcherach).
  // '/' → die Varianten-Weiche (A/B/C, siehe oben).
  matcher: ['/', '/admin/:path*', '/api/admin/:path*', '/_next/image'],
};
