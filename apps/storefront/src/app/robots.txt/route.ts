/**
 * /robots.txt — crawl etiquette + contact.
 *
 * The classic discovery file. Names what's allowed, what's discouraged,
 * where the sitemap is, who to contact, and what the API is so well-
 * behaved bots find the supported contract instead of scraping HTML.
 *
 * Filed for kingdom-082 (the-hospitality.md). Phase F.
 */

import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const ROBOTS_BODY = `# Cambridge TCG — crawl etiquette
#
# Welcome. Public discovery needs no account; other resources state their
# credential class in the manifest. Prefer supported JSON resources over
# scraping HTML pages; HTML layout can change without notice.
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
# For AI agents: https://cambridgetcg.com/llms.txt
#
# Third-party data shown here (shop prices, card images) follows its
# source's terms.
#
# Limits are stated here first; a change can take up to 24 hours to bind.
# Recommend you send: User-Agent: <project>/<version> (<contact-email>)

User-agent: *
# The history paths hold the household's Sophia wake (May 2026), kept as
# a record and not offered for training. This group and the training
# group below skip them; the readers' group further down may open them.
# They come before "Allow: /" so parsers that take the first matching
# rule agree with parsers that take the longest.
Disallow: /llms-full.txt
Disallow: /.well-known/sophia-wake/
# Allow most of the site, including the API surface.
Allow: /
# Content signals (https://contentsignals.org): this site's pages are
# welcome in search, in AI answers and in AI training, except the history
# paths.
Content-Signal: search=yes, ai-input=yes, ai-train=yes

# Don't crawl per-user account pages (require auth anyway).
Disallow: /account/
Disallow: /api/account/
# Don't crawl admin surfaces (not yours either way).
Disallow: /admin/
Disallow: /api/admin/
# Don't crawl auth flows.
Disallow: /api/auth/
Disallow: /login/
# Don't follow display-preference switches. Each one only sets a cookie
# and redirects back to the page you were already on, so following them
# multiplies every page by every language, theme and currency.
Disallow: /api/lang-mode
Disallow: /api/text-mode
Disallow: /api/appearance
Disallow: /api/currency

# Polite poll cadence per resource lives at /api/v1/rate-limits.
# This Crawl-delay is a coarse fallback for bots that ignore it.
Crawl-delay: 2

# ── Generative-AI specific signalling ──
# AI crawlers are explicitly welcome here — this named group is the
# welcome mat, not an opt-out. It repeats the same boundaries as the
# * group because, per RFC 9309, a crawler obeys only its most-specific
# matching group; without the repeats these bots would accidentally be
# exempt from the account/admin/auth/preference disallows and the
# Crawl-delay. Like the * group, it skips the history paths.
# Training crawlers and training-control tokens, as listed 2026-10-23.
# (Identify yourselves per /api/v1/rate-limits and we'll be friends.)
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: CCBot
User-agent: Meta-ExternalAgent
User-agent: Amazonbot
User-agent: Bytespider
User-agent: Google-Extended
User-agent: Applebot-Extended
Disallow: /llms-full.txt
Disallow: /.well-known/sophia-wake/
Allow: /
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Disallow: /account/
Disallow: /api/account/
Disallow: /admin/
Disallow: /api/admin/
Disallow: /api/auth/
Disallow: /login/
Disallow: /api/lang-mode
Disallow: /api/text-mode
Disallow: /api/appearance
Disallow: /api/currency
# The same pace as every other crawler: welcome, not exempt.
Crawl-delay: 2

# ── Readers: search, user-triggered fetchers and archives ──
# These may read the history paths, so the household's record stays
# findable. No training preference is stated here: ai-train=no in this
# group would cover the whole site. The history paths send
# "Content-Usage: train-ai=n" instead. This group comes after the
# training group because some parsers match names by substring
# (Applebot inside Applebot-Extended) and take the first group that fits.
User-agent: Googlebot
User-agent: Bingbot
User-agent: Applebot
User-agent: DuckDuckBot
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
User-agent: Claude-User
User-agent: ChatGPT-User
User-agent: Perplexity-User
User-agent: ia_archiver
User-agent: archive.org_bot
Allow: /
Content-Signal: search=yes, ai-input=yes
Disallow: /account/
Disallow: /api/account/
Disallow: /admin/
Disallow: /api/admin/
Disallow: /api/auth/
Disallow: /login/
Disallow: /api/lang-mode
Disallow: /api/text-mode
Disallow: /api/appearance
Disallow: /api/currency
Crawl-delay: 2

# ── Sitemap pointer ──
Sitemap: https://cambridgetcg.com/sitemap.xml
Sitemap: https://cambridgetcg.com/catalog/sitemap.xml
`;

export async function GET(): Promise<Response> {
  return new Response(ROBOTS_BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
      // RFC 8288 Link — wake + kin-wakes for crawlers that follow
      // headers. The body names them in prose for bots that read prose.
      Link: agentDiscoveryLinkHeader(),
    },
  });
}
