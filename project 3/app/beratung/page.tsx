import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { Phone } from 'lucide-react';

/*
 * /beratung — der Kostenrechner als Voll-Chat (Landingpage-Variante für den
 * SEA-Test „Chat-Test").
 *
 * Die Seite präsentiert nur die Kern-USP — 6× Testsieger mit dem Siegel und
 * das Sofortangebot — alles Weitere macht der Chat: Pria stellt die acht
 * Fragen, der Abschluss läuft über /api/pria/lead → /api/angebot-anfordern
 * (EIN Lead-Pfad, wie beim Formular), samt demselben dataLayer-Push
 * `angebot_erfolgreich` (siehe public/pria.html, Abschnitt Kontakt).
 *
 * Varianten-Marker für die Auswertung: analytics_sessions.landing_page
 * ist hier `/beratung` — mehr braucht die SEA-Session nicht (Schnittstellen-
 * Vertrag vom 26.08.: Klick→Lead, Profil-Quote, Kosten/Profil je Variante).
 *
 * Die Hauptseite bleibt unberührt; ihr Wizard ist die Kontrollvariante.
 */

// Erst Staging, dann Prod (Schnittstellen-Vertrag mit SEA, 26.08.):
// dieselbe Doktrin wie der Pria-Lader in app/layout.tsx — die Seite sieht
// selbst, wo sie läuft, kein Schalter im Dashboard. Auf Prod schalten =
// 'kostenrechner.primundus.de' ergänzen, ein PR. Bis dahin gibt es die
// Route auf Prod schlicht nicht (404), damit vor der Messketten-Abnahme
// und dem SEA-Startsignal kein Ad-Klick hier landen kann.
const ERLAUBTE_HOSTS = new Set([
  'kostenrechner-staging.onrender.com',
  'localhost',
  '127.0.0.1',
]);

export const metadata: Metadata = {
  title: 'Ihr Sofortangebot im Chat — PRIMUNDUS 24-Stunden-Pflege',
  description:
    'Im Chat zum Sofortpreis: acht kurze Fragen, dann sehen Sie Ihren Monatspreis und passende Pflegekräfte — vom 6× Testsieger.',
  // Testvariante: nie in den Index, auch nicht nach dem Prod-Schalter —
  // die Seite existiert nur für die Kampagne (noindex laut Vertrag).
  robots: { index: false, follow: false },
  alternates: { canonical: '/beratung' },
};

// headers() macht die Route ohnehin dynamisch; explizit, damit niemand
// später über einen Static-Export-Fehler stolpert.
export const dynamic = 'force-dynamic';

export default function BeratungPage() {
  const host = (headers().get('host') || '').split(':')[0].toLowerCase();
  if (!ERLAUBTE_HOSTS.has(host)) notFound();

  return (
    <div className="min-h-[100dvh] bg-[#F3F0EC]">
      {/* Kopfhöhe als Variable: der Chat (public/pria.html, .panel.voll)
          hängt sein Panel exakt darunter und lässt unten den Streifen für
          Impressum/Datenschutz frei. Custom Properties durchqueren die
          Shadow-Grenze des Widgets — deshalb reicht :root. */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            ':root{--pria-oben:60px;--pria-unten:24px}' +
            '@media(min-width:641px){:root{--pria-oben:76px}}' +
            // Die Seite IST der Chat — sie scrollt nie. Bewusst hier statt
            // nur über body.chat-offen: die Klasse verliert auf dieser Route
            // das Hydration-Rennen (React setzt className des body zurück).
            'body{overflow:hidden}' +
            // Cookie-Banner über den Voll-Chat (Panel z-50): sonst ist er
            // auf dem Handy verdeckt und die Einwilligung — und damit jedes
            // Analytics-Event der Variante — kann nie erteilt werden.
            '#cookie-consent{z-index:70}',
        }}
      />
      {/* Voll-Modus anschalten, BEVOR das (deferred) Widget ausgeführt wird:
          das Attribut entscheidet, ob pria-widget.js als Blase oder als
          ganze Seite startet. Der Lader ist bewusst eigenständig — auf
          Hostnames, wo der Staging-Lader aus layout.tsx nichts tut, lädt
          diese Seite das Widget selbst (window.__pria macht Doppel-Laden
          harmlos). interactive-widget wie im Layout-Lader: die Tastatur
          soll das Layout-Fenster verkleinern, sonst treibt das Panel auf
          iOS über der Seite (Details am Lader in app/layout.tsx). */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){var d=document.documentElement;" +
            "d.setAttribute('data-pria','1');d.setAttribute('data-pria-voll','1');" +
            "var v=document.querySelector('meta[name=viewport]');" +
            "if(v&&v.content.indexOf('interactive-widget')<0)" +
            "v.content+=',interactive-widget=resizes-content';" +
            "if(!document.querySelector('script[src=\"/pria-widget.js\"]')){" +
            "var s=document.createElement('script');s.src='/pria-widget.js';s.defer=true;" +
            "document.head.appendChild(s);}})();",
        }}
      />

      {/* ── Kopf: Logo · Siegel · Telefon — die Kern-USP, sonst nichts ── */}
      <header className="fixed inset-x-0 top-0 z-[60] h-[60px] border-b border-[#E5E3DF] bg-white/95 backdrop-blur-lg shadow-sm min-[641px]:h-[76px]">
        <div className="mx-auto flex h-full max-w-[1100px] items-center justify-between gap-3 px-4 min-[641px]:px-6">
          <Image
            src="/images/primundus_logo_header.webp"
            alt="Primundus Logo"
            width={600}
            height={106}
            sizes="(max-width: 640px) 148px, 210px"
            className="h-6 w-auto min-[641px]:h-9"
            priority
          />

          {/* Siegel + Wortlaut wie in TestsiegerSection (Formulierungslinie
              14.08.: „Nr. 1 der Pflegekräfte-Vermittler" ist der wörtliche
              Siegel-Claim — nur deshalb darf „Vermittler" hier stehen).
              Klick öffnet die Original-Veröffentlichung, wie überall. */}
          <a
            href="/downloads/die-welt-service-champions-2021.pdf"
            target="_blank"
            rel="noopener"
            className="flex min-w-0 items-center gap-2.5 min-[641px]:gap-3"
            aria-label="6× Testsieger — Original-Veröffentlichung der Service-Studie als PDF öffnen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/primundus_testsieger-2021.webp"
              alt="Testsieger-Siegel DIE WELT Service-Champions"
              className="h-11 w-auto min-[641px]:h-14"
            />
            <span className="min-w-0 leading-tight">
              <span className="block text-[13px] font-bold text-[#3D2B1F] min-[641px]:text-[15px]">
                6× Testsieger bei DIE WELT
              </span>
              <span className="block truncate text-[11px] text-[#8A8279] min-[641px]:text-[12.5px]">
                Nr. 1 der Pflegekräfte-Vermittler
                <span className="hidden min-[900px]:inline">
                  {' '}
                  — Service-Studie von DIE WELT und ServiceValue
                </span>
              </span>
            </span>
          </a>

          {/* Telefon wie im Haupt-Header: mobil nur das Icon, ab 900px mit
              Marta und Nummer — wer lieber anruft, soll nicht suchen. */}
          <a
            href="tel:+4989200000830"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#E76F63] text-white transition-colors hover:bg-[#D65E52] min-[900px]:hidden"
            aria-label="Anrufen: 089 200 000 830"
          >
            <Phone className="h-5 w-5" />
          </a>
          <a
            href="tel:+4989200000830"
            className="hidden flex-none items-center gap-2.5 rounded-lg bg-[#F8F7F5] py-1.5 pl-1.5 pr-4 transition-all hover:bg-[#8B7355] hover:text-white min-[900px]:flex group"
          >
            <Image
              src="/images/marta-kapcio.jpg"
              alt="Marta Kapcio"
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
              style={{ objectPosition: '50% 20%' }}
            />
            <span className="flex flex-col">
              <span className="text-xs leading-tight text-gray-500 group-hover:text-white/80">
                Marta Kapcio
              </span>
              <span className="text-sm font-semibold leading-tight text-[#3D2B1F] group-hover:text-white">
                089 200 000 830
              </span>
            </span>
          </a>
        </div>
      </header>

      {/* ── Bühne: der Chat legt sich als .panel.voll hierüber ── */}
      <main
        className="flex flex-col items-center justify-center gap-3 px-6 text-center"
        style={{
          paddingTop: 'calc(var(--pria-oben) + 48px)',
          minHeight: 'calc(100dvh - var(--pria-unten))',
        }}
      >
        {/* Sichtbar nur, solange das Widget lädt — oder wenn es scheitert.
            Kein stiller Ausfall: der Weg zum klassischen Rechner steht da. */}
        <p className="text-[15px] text-[#8A8279]">Ihre Beratung wird geladen …</p>
        <a href="/" className="text-[14px] font-semibold text-[#8B7355] underline underline-offset-2">
          Zum klassischen Kostenrechner
        </a>
        <noscript>
          <p className="mt-2 max-w-[36em] text-[14px] text-[#5A5A5A]">
            Für die Chat-Beratung wird JavaScript benötigt. Ihr Angebot erhalten
            Sie genauso im <a href="/" className="underline">Kostenrechner</a>{' '}
            oder telefonisch unter <a href="tel:+4989200000830" className="whitespace-nowrap underline">089 200 000 830</a>.
          </p>
        </noscript>
      </main>

      {/* ── Streifen unter dem Chat: Pflichtlinks, immer erreichbar ── */}
      <footer className="fixed inset-x-0 bottom-0 z-[60] flex h-[24px] items-center justify-center gap-4 bg-[#F3F0EC] text-[11px] text-[#8A8279]">
        <a href="/impressum" className="hover:text-[#5A5A5A]">Impressum</a>
        <span aria-hidden="true">·</span>
        <a href="/datenschutz" className="hover:text-[#5A5A5A]">Datenschutz</a>
      </footer>
    </div>
  );
}
