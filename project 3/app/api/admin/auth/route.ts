import { NextRequest, NextResponse } from 'next/server';
import { FehlversuchZaehler, passwortStimmt } from '@/lib/admin-anmeldung';
import { ALTES_COOKIE, neueSitzung, SITZUNG_COOKIE, SITZUNG_DAUER_S, sitzungsKonfig } from '@/lib/admin-sitzung';
import { clientIp } from '@/lib/bewertungen';

/* Login des Admin-Panels. Das Cookie trägt seit Registry #135 ein signiertes,
   ablaufendes Token statt des Passworts (lib/admin-sitzung.ts), und nach
   5 Fehlversuchen in 15 Minuten je IP ist 15 Minuten zu (lib/admin-anmeldung.ts,
   dort auch die Grenzen dieses Zählers). Kein Ersatzwert für Passwort oder
   Geheimnis (öffentliches Repo) — ohne beide Variablen gibt es keinen Login. */

const fehlversuche = new FehlversuchZaehler();

export async function POST(request: NextRequest) {
  const ip = clientIp((name) => request.headers.get(name)) ?? 'unbekannt';

  const warten = fehlversuche.wartezeit(ip);
  if (warten > 0) {
    const sekunden = Math.ceil(warten / 1000);
    return NextResponse.json(
      { error: 'Zu viele Fehlversuche', retryAfter: sekunden },
      { status: 429, headers: { 'Retry-After': String(sekunden) } },
    );
  }

  const konfig = sitzungsKonfig();
  if (!konfig) {
    console.error('[admin-auth] ADMIN_PASSWORD oder ADMIN_SESSION_SECRET (mind. 32 Zeichen) fehlt — Login gesperrt');
    return NextResponse.json({ error: 'Login nicht eingerichtet' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const password: unknown = body && typeof body === 'object' ? (body as { password?: unknown }).password : undefined;
  if (!passwortStimmt(password, konfig.passwort)) {
    fehlversuche.fehlversuch(ip);
    return NextResponse.json({ error: 'Ungültiges Passwort' }, { status: 401 });
  }
  fehlversuche.erfolg(ip);

  const response = NextResponse.json({ success: true });
  response.cookies.set(SITZUNG_COOKIE, await neueSitzung(konfig), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SITZUNG_DAUER_S,
    path: '/',
  });
  response.cookies.delete(ALTES_COOKIE);

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SITZUNG_COOKIE);
  response.cookies.delete(ALTES_COOKIE);
  return response;
}
