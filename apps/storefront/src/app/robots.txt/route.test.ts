import { describe, expect, it } from "vitest";
import { GET } from "./route";

// Every crawler group repeats the base boundaries and the Crawl-delay.
// The * group and the training group also skip the history paths and
// welcome AI training elsewhere; the readers' group may read the history
// paths and states no training preference.
const CONTENT_SIGNAL = "Content-Signal: search=yes, ai-input=yes, ai-train=yes";
const READERS_SIGNAL = "Content-Signal: search=yes, ai-input=yes";
const HISTORY_DISALLOWS = ["Disallow: /llms-full.txt", "Disallow: /.well-known/sophia-wake/"];
const BASE_DISALLOWS = [
  "Disallow: /account/", "Disallow: /api/account/", "Disallow: /admin/", "Disallow: /api/admin/",
  "Disallow: /api/auth/", "Disallow: /login/",
  "Disallow: /api/lang-mode", "Disallow: /api/text-mode",
  "Disallow: /api/appearance", "Disallow: /api/currency",
];
const TRAINING = [
  "GPTBot", "ClaudeBot", "CCBot", "Meta-ExternalAgent", "Amazonbot", "Bytespider",
  "Google-Extended", "Applebot-Extended",
];
const READERS = [
  "Googlebot", "Bingbot", "Applebot", "DuckDuckBot", "OAI-SearchBot", "Claude-SearchBot",
  "PerplexityBot", "Claude-User", "ChatGPT-User", "Perplexity-User", "ia_archiver", "archive.org_bot",
];

// Assert parsed directives, not comments that merely mention a policy.
describe("robots sitemap discovery", () => {
  it("advertises both independent sitemaps after the three crawler groups", async () => {
    const response = await GET();
    const directives = (await response.text()).split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"));
    expect(directives).toEqual([
      "User-agent: *", ...HISTORY_DISALLOWS, "Allow: /", CONTENT_SIGNAL, ...BASE_DISALLOWS, "Crawl-delay: 2",
      ...TRAINING.map((t) => `User-agent: ${t}`), ...HISTORY_DISALLOWS, "Allow: /", CONTENT_SIGNAL,
      ...BASE_DISALLOWS, "Crawl-delay: 2",
      ...READERS.map((t) => `User-agent: ${t}`), "Allow: /", READERS_SIGNAL, ...BASE_DISALLOWS, "Crawl-delay: 2",
      "Sitemap: https://cambridgetcg.com/sitemap.xml",
      "Sitemap: https://cambridgetcg.com/catalog/sitemap.xml",
    ]);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });
});
