// Dynamische robots.txt (ersetzt public/robots.txt): Die Sitemap-Zeile
// zeigte vorher hardcoded auf https://primundus.de/sitemap.xml (Apex-Domain)
// statt auf die eigene Subdomain-Sitemap. Mit NEXT_PUBLIC_SITE_URL stimmt
// die URL pro Environment (Prod-Domain vs. Render-Staging).
// AI-Crawler-Block spiegelt die robots.txt der Apex-Domain primundus.de
// (dokumentierendes Signal, dort seit 2026 etabliert).
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kostenrechner.primundus.de';

  const body = `# AI-Crawler explizit erlaubt (dokumentierendes Signal)
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

# Alle übrigen Crawler
User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
