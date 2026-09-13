import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import HomePage from '../page';

/*
 * /kosten-berechnen — war Variante B des SEA-Tests „Chat" (27.08.–13.09.2026).
 *
 * Dieselbe Startseite wie „/" (derselbe Wizard, dieselben Inhalte), nur mit
 * Pria als schwebender Beraterin unten rechts. Damit vergleicht der Test
 * drei Wege bei sonst gleicher Seite:
 *   A  /                 Wizard, kein Chat            (Kontrolle, läuft)
 *   B  /kosten-berechnen Wizard + Pria als Float      (diese Seite)
 *   C  /sofortangebot    Pria als ganze Seite         (Voll-Chat)
 *
 * Eigene Route statt Schalter auf „/": So trennt `analytics_sessions
 * .landing_page` die Varianten von selbst, ohne dass irgendwo ein Zustand
 * mitgeführt werden muss — dieselbe Mechanik wie bei /sofortangebot.
 *
 * Die Seite ist `noindex` und unverlinkt: Besucher kommen ausschließlich
 * über die Anzeige dieser Variante.
 */

const ERLAUBTE_HOSTS = new Set([
  'kostenrechner.primundus.de',
  'kostenrechner-staging.onrender.com',
  'localhost',
  '127.0.0.1',
]);

/* Als „/" ausgeliefert (Varianten-Weiche in middleware.ts) verhält sich
   die Seite wie die Startseite: indexierbar, canonical „/". Direkt
   aufgerufen bleibt sie `noindex` — sonst stünde derselbe Inhalt doppelt
   im Index. Deshalb generateMetadata statt statischer metadata. */
export async function generateMetadata(): Promise<Metadata> {
  const alsStartseite = headers().get('x-pm-variante') !== null;
  return {
    title: 'PRIMUNDUS - 24-Stunden-Pflege Kostenrechner',
    description:
      'Berechnen Sie in nur 2 Minuten die Kosten für 24-Stunden-Pflege. Vom 6× Testsieger mit Preisgarantie.',
    robots: alsStartseite ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: '/' },
  };
}

export const dynamic = 'force-dynamic';

export default function KostenBerechnenSeite() {
  const host = (headers().get('host') || '').split(':')[0].toLowerCase();
  if (!ERLAUBTE_HOSTS.has(host)) notFound();

  return (
    <>
      {/* Seit 13.09.2026 ohne Pria (Test beendet, Registry #67) — die Route
          bleibt nur als stabile Adresse bestehen, noindex, Inhalt = Startseite. */}
      <HomePage />
    </>
  );
}
