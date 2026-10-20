import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Site chrome never prefetches. Every page renders dynamically (the root
// layout reads cookies, headers and the session), so a viewport prefetch is
// an uncached RSC render on Vercel. Crawlers that run JavaScript fire one per
// visible chrome link per page view: on 2026-10-18 Cloudflare saw 49% of the
// requests reaching Vercel as RSC payloads (one 10h sample: 1.8k HTML pages
// vs 46k RSC fetches from meta-externalagent). Navigation still works on click.

const here = dirname(fileURLToPath(import.meta.url));

function linkOpeningTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(/<Link\b/g)) {
    let depth = 0;
    let end = match.index;
    for (; end < source.length; end++) {
      const c = source[end];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}

describe("site chrome links", () => {
  const files = readdirSync(here).filter((f) => f.endsWith(".tsx") && !f.includes(".test."));

  it("covers the chrome components rendered on every page", () => {
    for (const f of ["Nav.tsx", "MoreMenu.tsx", "Footer.tsx", "FooterToggles.tsx", "Breadcrumbs.tsx"]) {
      expect(files).toContain(f);
    }
  });

  it("opt out of prefetch on every next/link", () => {
    const missing = files.flatMap((f) =>
      linkOpeningTags(readFileSync(join(here, f), "utf8"))
        .filter((tag) => !/\sprefetch=\{false\}/.test(tag))
        .map((tag) => `${f}: ${tag.split("\n")[0].trim()}`),
    );
    expect(missing).toEqual([]);
  });
});
