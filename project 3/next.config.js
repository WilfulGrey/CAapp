/** @type {import('next').NextConfig} */
const BUILD_ID = process.env.COMMIT_REF || process.env.CF_PAGES_COMMIT_SHA || `build-${Date.now()}`;
const BUILT_AT = new Date().toISOString();

// Routen, die nie in Suchmaschinen auftauchen sollen (SEO-Audit 2026-08-14):
// Wizard-Zwischenschritte, persönliche Angebotsseiten (/kalkulation/<leadId>),
// Admin-Bereich, Abmelde-Seite. Bewusst X-Robots-Tag statt robots.txt-Disallow:
// nur so sieht Googlebot das noindex und wirft bereits indexierte URLs raus.
const NOINDEX_PATHS = [
  '/admin',
  '/admin/:path*',
  '/admin-login',
  '/kalkulation/:path*',
  '/result',
  '/step-2',
  '/abmelden',
  '/feedback',
];

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        // Basis-Security-Header für alle Routen. Bewusst ohne CSP
        // (GTM/Inline-Scripts würden brechen) — Apex primundus.de dient
        // als Vorbild (HSTS, nosniff, Referrer-Policy).
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      ...NOINDEX_PATHS.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
    ];
  },
  // Image optimization stays on (was disabled when this app shipped on
  // Cloudflare Pages — Render runs Next as a real Node server, so the
  // built-in optimizer works and serves responsive WebP/AVIF at the right
  // size per breakpoint). Drops the hero from 348 KB on mobile.
  generateBuildId: async () => {
    return BUILD_ID;
  },
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
    NEXT_PUBLIC_BUILT_AT: BUILT_AT,
    NEXT_PUBLIC_ENV_NAME: process.env.CONTEXT || process.env.NODE_ENV || 'unknown',
  },
  // pdfkit (renderer umowy) NIE może być bundlowany — czyta pliki .afm/.ttf
  // przez fs względem node_modules; webpack by je zgubił. External = Node
  // ładuje z node_modules w runtime (Render: npm install && next start).
  // puppeteer-core + @sparticuz/chromium: wpisy zostają do PR3 (rollback-
  // ready — git revert PR2 przywraca renderer chromium bez zmian configu).
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium', 'pdfkit'],
    // Telemetria pamięci (diagnoza OOM 512MB): instrumentation.ts rejestruje
    // sampler RSS/heap/ext + crash-monitor przy starcie procesu Node.
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          commons: {
            name: 'commons',
            chunks: 'all',
            minChunks: 2,
          },
        },
      };
    } else {
      // Backup-Mechanismus: falls serverComponentsExternalPackages mal
      // entfernt wird, externalize hier hart.
      config.externals = [
        ...(config.externals || []),
        'puppeteer-core',
        '@sparticuz/chromium',
        'pdfkit',
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
