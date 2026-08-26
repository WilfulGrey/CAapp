import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { Phone } from 'lucide-react';

/*
 * /beratung — der Kostenrechner als Voll-Chat (Landingpage-Variante für den
 * SEA-Test „Chat-Test").
 *
 * Aufbau als EINE komponierte Seite (CRO-Umbau 26.08., Martin: „nicht
 * zusammengewürfelt — die Assistentin holt den Kunden direkt ab"):
 * Kopf (Logo + Telefon) → Hero mit Prias Porträt, Gruß, Ergebnis-Zeile und
 * Testsieger-Beleg → der Chat dockt als Karte darunter an (public/pria.html,
 * Voll-Modus ohne eigene Kopfleiste) und beginnt direkt mit dem Angebot.
 *
 * Messkette: Abschluss über /api/pria/lead → /api/angebot-anfordern (EIN
 * Lead-Pfad wie das Formular) samt dataLayer-Push `angebot_erfolgreich`
 * (siehe public/pria.html, Kontakt-Block). Varianten-Marker für SEA:
 * analytics_sessions.landing_page='/beratung'. Details:
 * docs/google-ads-tracking.md §„Chat-Landingpage /beratung".
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
    <div
      className="min-h-[100dvh]"
      style={{
        background:
          'radial-gradient(120% 60% at 50% 0%, #FBEEE9 0%, #F7F2EB 46%, #F3F0EC 100%)',
      }}
    >
      {/* Chat-Geometrie: --pria-oben (Unterkante des Heros, misst das
          Skript unten) und --pria-unten (Pflichtlinks-Streifen). Custom
          Properties durchqueren die Shadow-Grenze des Widgets — :root
          reicht. body scrollt nie: die Seite IST der Chat; bewusst hier
          statt nur über body.chat-offen, das auf dieser Route das
          Hydration-Rennen verliert (React setzt die body-className zurück). */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            ':root{--pria-oben:212px;--pria-unten:24px}' +
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

      {/* ── Kopf: nur Logo + Telefon — ruhig, alles Weitere sagt der Hero ── */}
      <header className="fixed inset-x-0 top-0 z-[60] h-[52px] border-b border-[#EDE7DE] bg-white/85 backdrop-blur-lg min-[641px]:h-[60px]">
        <div className="mx-auto flex h-full max-w-[1100px] items-center justify-between gap-3 px-4 min-[641px]:px-6">
          <Image
            src="/images/primundus_logo_header.webp"
            alt="Primundus Logo"
            width={600}
            height={106}
            sizes="(max-width: 640px) 168px, 200px"
            className="h-6.5 h-[26px] w-auto min-[641px]:h-8"
            priority
          />
          <a
            href="tel:+4989200000830"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#E76F63] text-white transition-colors hover:bg-[#D65E52] min-[900px]:hidden"
            aria-label="Anrufen: 089 200 000 830"
          >
            <Phone className="h-[18px] w-[18px]" />
          </a>
          <a
            href="tel:+4989200000830"
            className="hidden flex-none items-center gap-2.5 rounded-lg bg-[#F8F7F5] py-1.5 pl-1.5 pr-4 transition-all hover:bg-[#8B7355] hover:text-white min-[900px]:flex group"
          >
            <Image
              src="/images/marta-kapcio.jpg"
              alt="Marta Kapcio"
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover"
              style={{ objectPosition: '50% 20%' }}
            />
            <span className="flex flex-col">
              <span className="text-[11px] leading-tight text-gray-500 group-hover:text-white/80">
                Marta Kapcio
              </span>
              <span className="text-[13px] font-semibold leading-tight text-[#3D2B1F] group-hover:text-white">
                089 200 000 830
              </span>
            </span>
          </a>
        </div>
      </header>

      {/* ── Hero: Pria holt ab — Porträt, Gruß, Ergebnis, Beleg ── */}
      <section
        id="lp-hero"
        className="mx-auto flex max-w-[620px] flex-col items-center px-6 pb-2.5 pt-[62px] text-center min-[641px]:pb-4 min-[641px]:pt-[82px]"
      >
        <div className="relative mb-1.5 min-[641px]:mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/pria-portrait.jpg"
            alt="Pria — KI-gestützte Assistentin von Primundus"
            className="h-[64px] w-[64px] rounded-full object-cover shadow-[0_0_0_3px_#fff,0_1px_2px_rgba(40,34,28,.08),0_12px_30px_rgba(217,90,76,.30)] min-[641px]:h-[86px] min-[641px]:w-[86px]"
          />
          <span
            className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#2FC46E]"
            aria-hidden="true"
          />
        </div>

        {/* KI-Kennzeichnung (AI Act): fest unter der Kopfzeile, Badge am
            Namen — dieselbe Pflicht, die vorher die Panel-Kopfleiste trug. */}
        <p className="mb-1 text-[13.5px] text-[#5C5751] min-[641px]:mb-1.5 min-[641px]:text-[14px]">
          Guten Tag, ich bin <b className="font-bold text-[#33302C]">Pria</b>
          <span className="ml-2 inline-block rounded-[5px] border border-[#DACFC0] bg-white/80 px-1.5 pb-px pt-0.5 align-[2px] text-[9px] font-extrabold tracking-[1px] text-[#8B7355]">
            KI-ASSISTENTIN
          </span>
        </p>

        <h1 className="mb-2 text-[20.5px] font-bold leading-[1.18] tracking-[-0.4px] text-[#33302C] min-[641px]:mb-2.5 min-[641px]:text-[27px]">
          Ihr Preis &amp; passende Pflegekräfte —{' '}
          <span className="text-[#D95A4C]">in wenigen Minuten.</span>
        </h1>

        {/* Siegel + Wortlaut der Formulierungslinie 14.08. („Nr. 1 der
            Pflegekräfte-Vermittler" ist der wörtliche Siegel-Claim). Klick
            öffnet die Original-Veröffentlichung — der Auszeichnungs-Claim
            braucht den Beleg (content-checkliste). */}
        <a
          href="/downloads/die-welt-service-champions-2021.pdf"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-2.5"
          aria-label="6× Testsieger — Original-Veröffentlichung der Service-Studie als PDF öffnen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/primundus_testsieger-2021.webp"
            alt="Testsieger-Siegel DIE WELT Service-Champions"
            className="h-9 w-auto min-[641px]:h-11"
          />
          <span className="text-left leading-tight">
            <span className="block text-[13px] font-bold text-[#3D2B1F] min-[641px]:text-[14px]">
              6× Testsieger bei DIE WELT
            </span>
            <span className="block text-[11.5px] text-[#8A8279] underline decoration-[#D9CFC2] underline-offset-2 min-[641px]:text-[12px]">
              Nr. 1 der Pflegekräfte-Vermittler
            </span>
          </span>
        </a>
      </section>

      {/* Panel-Oberkante = Hero-Unterkante, gemessen statt geraten: die
          Hero-Höhe hängt von Textumbruch und Schriftladung ab. Läuft beim
          Parsen (vor dem ersten Paint), bei resize und nach den Fonts. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){var setze=function(){var h=document.getElementById('lp-hero');" +
            "if(!h)return;document.documentElement.style.setProperty('--pria-oben'," +
            "Math.ceil(h.getBoundingClientRect().bottom+4)+'px');};" +
            "setze();addEventListener('resize',setze);addEventListener('load',setze);" +
            "if(document.fonts&&document.fonts.ready)document.fonts.ready.then(setze);})();",
        }}
      />

      {/* ── Unter dem Panel: sichtbar nur beim Laden oder wenn JS fehlt ── */}
      <main className="mx-auto flex max-w-[620px] flex-col items-center gap-2 px-6 pt-10 text-center">
        <p className="text-[14px] text-[#8A8279]">Ihre Beratung wird geladen …</p>
        <a href="/" className="text-[13.5px] font-semibold text-[#8B7355] underline underline-offset-2">
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
      <footer className="fixed inset-x-0 bottom-0 z-[60] flex h-[24px] items-center justify-center gap-4 text-[11px] text-[#8A8279]">
        <a href="/impressum" className="hover:text-[#5A5A5A]">Impressum</a>
        <span aria-hidden="true">·</span>
        <a href="/datenschutz" className="hover:text-[#5A5A5A]">Datenschutz</a>
      </footer>
    </div>
  );
}
