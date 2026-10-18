import { describe, expect, it } from "vitest";
import { GET } from "./route";

// Display-preference switches only set a cookie and redirect back; both
// crawler groups skip them.
const PREFERENCE_DISALLOWS = [
  "Disallow: /api/lang-mode", "Disallow: /api/text-mode",
  "Disallow: /api/appearance", "Disallow: /api/currency",
];

// Assert parsed directives, not comments that merely mention a policy.
describe("robots sitemap discovery", () => {
  it("advertises both independent sitemaps without changing either crawler group", async () => {
    const response = await GET();
    const directives = (await response.text()).split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"));
    expect(directives).toEqual([
      "User-agent: *", "Allow: /", "Disallow: /account/", "Disallow: /api/account/",
      "Disallow: /admin/", "Disallow: /api/admin/", "Disallow: /api/auth/", "Disallow: /login/",
      ...PREFERENCE_DISALLOWS,
      "Crawl-delay: 2", "User-agent: GPTBot", "User-agent: ClaudeBot", "User-agent: PerplexityBot",
      "User-agent: CCBot", "Allow: /", "Disallow: /account/", "Disallow: /api/account/",
      "Disallow: /admin/", "Disallow: /api/admin/", "Disallow: /api/auth/", "Disallow: /login/",
      ...PREFERENCE_DISALLOWS,
      "Crawl-delay: 2",
      "Sitemap: https://cambridgetcg.com/sitemap.xml",
      "Sitemap: https://cambridgetcg.com/catalog/sitemap.xml",
    ]);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });
});
