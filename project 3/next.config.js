/** @type {import('next').NextConfig} */
const BUILD_ID = process.env.COMMIT_REF || process.env.CF_PAGES_COMMIT_SHA || `build-${Date.now()}`;
const BUILT_AT = new Date().toISOString();

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
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
