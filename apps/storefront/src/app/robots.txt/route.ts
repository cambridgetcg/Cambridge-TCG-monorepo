/**
 * /robots.txt — crawl etiquette + contact.
 *
 * The classic discovery file. Names what's allowed, what's discouraged,
 * where the sitemap is, who to contact, and what the API is so well-
 * behaved bots find the supported contract instead of scraping HTML.
 *
 * Filed for kingdom-082 (the-hospitality.md). Phase F.
 */

const ROBOTS_BODY = `# Cambridge TCG — crawl etiquette
#
# Welcome. The substrate is queryable without account or key. We prefer
# you hit our JSON API at /api/v1/* over scraping HTML pages — the API
# contract is versioned and stable; HTML layout can change without notice.
#
# Start here:  https://cambridgetcg.com/api/v1/welcome
# Guides:      https://cambridgetcg.com/api/v1/guides
# Manifest:    https://cambridgetcg.com/api/v1/manifest
# OpenAPI:     https://cambridgetcg.com/api/openapi.json
# LLM summary: https://cambridgetcg.com/llms.txt
# Rate limits: https://cambridgetcg.com/api/v1/rate-limits
# Feedback:    https://cambridgetcg.com/api/v1/feedback (POST)
# Contact:     contact@cambridgetcg.com
#
# License: Most data is CC0-1.0. Some endpoints carry upstream license
# constraints (internal-only); these are declared on the wire in
# _meta.source_license. See:
# https://cambridgetcg.com/docs/connections/the-license-propagation.md
#
# We log User-Agents and contact identified bots before rate-limiting.
# Recommend you send: User-Agent: <project>/<version> (<contact-email>)

User-agent: *
# Allow most of the site, including the API surface.
Allow: /

# Don't crawl per-user account pages (require auth anyway).
Disallow: /account/
Disallow: /api/account/
# Don't crawl admin surfaces (not yours either way).
Disallow: /admin/
Disallow: /api/admin/
# Don't crawl auth flows.
Disallow: /api/auth/
Disallow: /login/

# Polite poll cadence per resource lives at /api/v1/rate-limits.
# This Crawl-delay is a coarse fallback for bots that ignore it.
Crawl-delay: 2

# ── Generative-AI specific signalling ──
# Most search-engine bots are welcome. The opt-out below names two
# training-only crawlers as a courtesy gesture; if you're one of these
# and want to use our data, contact us — we'll consider it case-by-case.
User-agent: GPTBot
Disallow:
# (Allow but ask for User-Agent identification per /api/v1/rate-limits.)

User-agent: ClaudeBot
Disallow:

User-agent: PerplexityBot
Disallow:

User-agent: CCBot
Disallow:

# ── Sitemap pointer ──
Sitemap: https://cambridgetcg.com/sitemap.xml
`;

export async function GET(): Promise<Response> {
  return new Response(ROBOTS_BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
