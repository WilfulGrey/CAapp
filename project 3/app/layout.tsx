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
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://kostenrechner.primundus.de'),
  title: 'PRIMUNDUS - 24-Stunden-Pflege Kostenrechner',
  description: 'Berechnen Sie in nur 2 Minuten die Kosten für 24-Stunden-Pflege. Vom Testsieger mit Preisgarantie.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    url: '/',
    siteName: 'PRIMUNDUS',
    title: 'PRIMUNDUS - 24-Stunden-Pflege Kostenrechner',
    description: 'Berechnen Sie in nur 2 Minuten die Kosten für 24-Stunden-Pflege. Vom Testsieger mit Preisgarantie.',
    images: [
      {
        url: '/images/primundus_logo_header.webp',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PRIMUNDUS - 24-Stunden-Pflege Kostenrechner',
    description: 'Berechnen Sie in nur 2 Minuten die Kosten für 24-Stunden-Pflege. Vom Testsieger mit Preisgarantie.',
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
            data-pria am <html> ist da, bevor der WhatsApp-Knopf sich
            entscheidet (er blendet sich dann aus, siehe WhatsAppFloat).

            Wenn Pria auf Prod soll: diese Liste um kostenrechner.primundus.de
            erweitern — bewusst eine Code-Aenderung mit PR, kein stiller
            Schalter irgendwo im Dashboard. */}
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
