import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import HomePage from '../page';

/*
 * /kosten-berechnen — Variante B des SEA-Tests „Chat" (Martin, 27.08.).
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

export const metadata: Metadata = {
  title: 'PRIMUNDUS - 24-Stunden-Pflege Kostenrechner',
  description:
    'Berechnen Sie in nur 2 Minuten die Kosten für 24-Stunden-Pflege. Vom 6× Testsieger mit Preisgarantie.',
  // Test-Variante: gehört nie in den Index (sonst doppelter Inhalt zu „/").
  robots: { index: false, follow: false },
  alternates: { canonical: '/' },
};

export const dynamic = 'force-dynamic';

export default function KostenBerechnenSeite() {
  const host = (headers().get('host') || '').split(':')[0].toLowerCase();
  if (!ERLAUBTE_HOSTS.has(host)) notFound();

  return (
    <>
      {/* Pria als schwebende Beraterin — derselbe Lader wie auf Staging,
          nur ohne data-pria-voll: Blase unten rechts, Ansprache erst nach
          dem Scrollen, nie über einer Rechner-Karte (Regel im Widget).
          Läuft inline vor dem Zeichnen, damit der WhatsApp-Knopf sich
          rechtzeitig ausblendet (er liest data-pria). */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){var d=document.documentElement;" +
            "d.setAttribute('data-pria','1');" +
            "var v=document.querySelector('meta[name=viewport]');" +
            "if(v&&v.content.indexOf('interactive-widget')<0)" +
            "v.content+=',interactive-widget=resizes-content';" +
            "if(!document.querySelector('script[src=\"/pria-widget.js\"]')){" +
            "var s=document.createElement('script');s.src='/pria-widget.js';s.defer=true;" +
            "document.head.appendChild(s);}})();",
        }}
      />
      <HomePage />
    </>
  );
}
