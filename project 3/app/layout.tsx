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
        {/* Pria — Beratungs-Chat, ein Schalter je Umgebung.

            Staging und Prod bauen DENSELBEN Commit (siehe CLAUDE.md), sie
            unterscheiden sich nur in der Umgebung. Genau da sitzt der
            Schalter: `PRIA_SICHTBAR=1` im jeweiligen Render-Service. Fehlt
            er, wird das Widget nicht einmal geladen.

            ACHTUNG — die Seiten hier sind statisch vorgerendert, `process.env`
            wird also beim BUILD gelesen, nicht bei der Anfrage. Render stellt
            die Variablen des Dienstes im Build bereit, das passt; aber ein
            Umlegen des Schalters wirkt erst nach einem Redeploy (den Render
            beim Ändern einer Variable ohnehin auslöst).

            NEXT_PUBLIC_, weil derselbe Schalter auch in `app/page.tsx`
            gebraucht wird — und das ist eine Client-Komponente, die einen
            serverseitigen Wert nicht sehen kann. Dort entscheidet er, ob der
            WhatsApp-Knopf noch erscheint: Pria ERSETZT ihn, zwei schwebende
            Knöpfe in derselben Ecke will niemand. Ein Feature-Schalter ist
            kein Geheimnis, im Browser-Bundle richtet er keinen Schaden an. */}
        {/* Bewusst ein schlichtes <script defer> statt next/script: bei
            lazyOnload haengt Next das Tag erst im Browser ein, im
            ausgelieferten HTML steht dann nichts — nicht pruefbar und nicht
            vorhersagbar. So steht es in der Seite, laedt nach dem Parsen und
            blockiert nichts. */}
        {process.env.NEXT_PUBLIC_PRIA_SICHTBAR === '1' && (
          <script src="/pria-widget.js" defer />
        )}
      </body>
    </html>
  );
}
