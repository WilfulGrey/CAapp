export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kostenrechner.primundus.de';

  // Nur real existierende, indexierbare Seiten. Die frühere Liste enthielt
  // 40+ geplante Ratgeber-/Städte-URLs, die alle 404 lieferten — Google
  // wertet eine Sitemap voller 404s als Vertrauensverlust (SEO-Audit
  // 2026-08-14). Neue Seite live nehmen = hier eintragen.
  const staticPages = [
    '',
    '/24h-pflege-kostenrechner',
    '/impressum',
    '/datenschutz',
  ];

  // lastmod = Build-Zeitpunkt (aus next.config.js), nicht Abrufzeitpunkt:
  // ein bei jedem Request frisches lastmod entwertet das Signal komplett.
  const lastmod = process.env.NEXT_PUBLIC_BUILT_AT || new Date().toISOString();

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map((page) => {
    return `  <url>
    <loc>${baseUrl}${page}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page === '' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${page === '' ? '1.0' : '0.5'}</priority>
  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
