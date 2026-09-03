import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { CalculatorProvider } from '@/lib/calculator-context';
import { AnalyticsProvider } from '@/components/AnalyticsProvider';
import { CookieConsent } from '@/components/CookieConsent';
import Script from 'next/script';
import { organizationGraph, jsonLdString } from '@/lib/seo-schema';

const inter = Inter({ subsets: ['latin'] });

// OG/Twitter-Texte spiegeln bewusst Title/Description 1:1 — vorher fehlten
// og:title/og:description/og:url komplett (WhatsApp-/Facebook-Previews ohne
// Text, SEO-Audit 2026-08-14). Fallback-Domain war primundus.de (Apex) —
// korrigiert auf die eigene Subdomain.
/* Soll die Tastatur das Layout-Fenster verkleinern? Vorerst nur ausserhalb
   von Prod.

   Ohne `interactive-widget=resizes-content` steht Safari auf `resizes-visual`:
   bei offener Tastatur bleibt das Layout-Fenster gross (auf Martins iPhone
   714 px), sichtbar sind aber nur 377 — und in den 337 px Differenz laesst
   iOS den Nutzer herumschieben. Alles `position:fixed` lebt in den 714 px,
   wandert beim Schieben mit und hinkt jeder JS-Nachfuehrung hinterher. Genau
   das sah nach kaputtem Chat aus, unabhaengig davon, wie gut nachgefuehrt
   wird.

   Warum die Entscheidung HIER faellt und nicht im Hostname-Gatter unten:
   Safari liest das Attribut beim PARSEN der Seite. Ein spaeteres Umschreiben
   bleibt wirkungslos — am 22.08. gemessen (Attribut sagte `resizes-content`,
   waehrend iH 714 und die sichtbare Hoehe 377 war) und wieder verworfen, auch
   ueber `next/script` mit `beforeInteractive`, das trotzdem im Body landet.

   Und warum es trotzdem ohne Prod geht: Staging und Prod sind zwei Render-
   Dienste mit je eigener Umgebung, die denselben Commit SEPARAT bauen. Was
   hier zur Bauzeit gelesen wird, darf sich also unterscheiden — die
   Canonical-URLs der beiden Seiten zeigen das. Kein dynamisches Rendern,
   keine neue Variable: die Seiten bleiben statisch.

   Auf Prod einschalten heisst: diese Bedingung durch `true` ersetzen.
   Sichtbare Folge dort waeren die `fixed bottom-0`-Leisten in Step-2, Result
   und Kalkulation, die beim Tippen ueber der Tastatur staenden statt
   dahinter. */
const SEITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://kostenrechner.primundus.de';
// Bewusst gegen die Prod-Domain gepruft, nicht auf „staging" im Namen: eine
// neue Testumgebung soll die Verbesserung automatisch bekommen, und nur die
// eine bekannte Adresse bleibt aussen vor.
const IST_PROD = SEITE.includes('kostenrechner.primundus.de');

export const metadata: Metadata = {
  viewport: {
    width: 'device-width',
    initialScale: 1,
    ...(IST_PROD ? {} : { interactiveWidget: 'resizes-content' as const }),
  },
  metadataBase: new URL(SEITE),
  title: '24-Stunden-Pflege Kostenrechner — Kosten in 2 Minuten',
  description: '24-Stunden-Pflege Kosten in 2 Minuten berechnen — Eigenanteil nach Pflegegrad inklusive aller Zuschüsse. Vom 6× in Folge ausgezeichneten Testsieger.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    url: '/',
    siteName: 'PRIMUNDUS',
    title: '24-Stunden-Pflege Kostenrechner — Kosten in 2 Minuten',
    description: '24-Stunden-Pflege Kosten in 2 Minuten berechnen — Eigenanteil nach Pflegegrad inklusive aller Zuschüsse. Vom 6× in Folge ausgezeichneten Testsieger.',
    images: [
      {
        url: '/images/primundus_logo_header.webp',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '24-Stunden-Pflege Kostenrechner — Kosten in 2 Minuten',
    description: '24-Stunden-Pflege Kosten in 2 Minuten berechnen — Eigenanteil nach Pflegegrad inklusive aller Zuschüsse. Vom 6× in Folge ausgezeichneten Testsieger.',
    images: [
      {
        url: '/images/primundus_logo_header.webp',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className={inter.className}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(organizationGraph()) }}
        />
        <Script
          id="gtm"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-59V6N7RC');`,
          }}
        />
        <Script
          id="ga-consent"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  function loadGoogleAnalytics() {
    if (window.gaLoaded) return;
    window.gaLoaded = true;

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-W2QEQ18EE7';
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-W2QEQ18EE7');
  }

  try {
    // Bugfix CRO 15.08.: Der Consent-Manager speichert unter
    // 'primundus_cookie_consent' als {version, consent:{analytics,...}} —
    // hier stand 'cookie-consent' (flach), daher lud GA4 nie.
    var stored = localStorage.getItem('primundus_cookie_consent');
    if (stored) {
      var data = JSON.parse(stored);
      if (data && data.consent && data.consent.analytics) {
        loadGoogleAnalytics();
      }
    }
  } catch(e) {}

  window.addEventListener('cookie-consent-changed', function(e) {
    if (e.detail && e.detail.analytics) {
      loadGoogleAnalytics();
    }
  });
})();
            `,
          }}
        />
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-59V6N7RC"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <AnalyticsProvider>
          <CalculatorProvider>
            {children}
          </CalculatorProvider>
        </AnalyticsProvider>
        <CookieConsent />
        {/* Pria — Beratungs-Chat, vorerst nur auf Staging.

            KEINE Umgebungsvariable: Staging und Prod bauen denselben Commit,
            und eine Variable haette jemand in Render pflegen muessen. Die
            Seite kann selbst sehen, wo sie laeuft — das ist ehrlicher und
            kostet niemanden einen Handgriff.

            Der Lader ist absichtlich winzig und laeuft VOR dem Zeichnen: auf
            Prod wird die 240-KB-Datei so gar nicht erst geladen, und das
            data-pria am <html> ist da, bevor gezeichnet wird.
            (Der WhatsApp-Knopf, der sich hier frueher ausblendete, ist am
            29.08. ganz entfallen — er blitzte beim Laden kurz auf, weil er
            VOR der Hydration gezeichnet wurde. WhatsApp bleibt als Link in
            den Kontaktbloecken und im Chat.)

            Wenn Pria auf Prod soll: diese Liste um kostenrechner.primundus.de
            erweitern — bewusst eine Code-Aenderung mit PR, kein stiller
            Schalter irgendwo im Dashboard.

            Hier stand am 22.08. kurzzeitig ein Eingriff, der dem Viewport
            `interactive-widget=resizes-content` nachtragen sollte — nur fuer
            Staging. Er war WIRKUNGSLOS und ist wieder raus: Safari liest
            `interactive-widget` beim Parsen der Seite; ein spaeteres
            Umschreiben des Attributs schaut niemand mehr an. Auch
            `next/script` mit `beforeInteractive` half nicht, das Skript
            landet trotzdem im Body (im erzeugten HTML nachgemessen:
            Position 100279, </head> endet bei 4579).

            Wirksam waere nur der `viewport`-Export von Next — und der gilt
            fuer JEDE Seite und JEDEN Host, also auch fuer den Rechner auf
            Prod. Das ist eine Entscheidung, keine Reparatur, und sie liegt
            bei Martin. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var h=location.hostname;" +
              "if(h!=='kostenrechner-staging.onrender.com'&&h!=='localhost'&&h!=='127.0.0.1')return;" +
              "document.documentElement.setAttribute('data-pria','1');" +
              "var s=document.createElement('script');s.src='/pria-widget.js';s.defer=true;" +
              "document.head.appendChild(s);})();",
          }}
        />
      </body>
    </html>
  );
}
