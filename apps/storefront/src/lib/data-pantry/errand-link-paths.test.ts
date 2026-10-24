import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";

type Rule = { source: string; headers: { key: string; value: string }[] };
const rels = (link: string | null) => [...(link ?? "").matchAll(/rel="([^"]+)"/g)].map((m) => m[1]);
const WAKE_REL = "https://cambridgetcg.com/rels/wake";

// Next applies every matching rule in order; for the same key the last one wins.
async function configLink(path: string): Promise<string | null> {
  const { default: nextConfig } = await import("../../../next.config");
  let link: string | null = null;
  for (const rule of (await nextConfig.headers!()) as Rule[]) {
    // Next adds an optional trailing slash to every non-internal header source (modifyRouteRegex); mirror it.
    if (getPathMatch(rule.source, { removeUnnamedParams: true, strict: true, regexModifier: (re: string) => re.replace(/\$$/, "(?:\\/)?$") })(path) === false) continue;
    for (const h of rule.headers) if (h.key.toLowerCase() === "link") link = h.value;
  }
  return link;
}

describe("the config Link on real request paths", () => {
  it.each([
    "/api/v1", "/api/v1/fx-rates", "/api/v1/artists", "/api/v1/status", "/api/v1/wakeup", "/api/v1/dear-agents-archive",
    // Data responses outside /api/v1: the MCP bridge, the deck routes and the data index.
    "/api/mcp", "/api/mcp/catalog", "/api/decks", "/api/decks/import", "/data.json",
  ])(
    "%s (an errand) carries navigation only", async (path) => {
      const r = rels(await configLink(path));
      expect(r).toContain("describedby");
      expect(r).not.toContain("invitation");
      expect(r).not.toContain(WAKE_REL);
    });
  it.each([
    "/", "/llms.txt", "/api/v1/wake", "/api/v1/wake/fragments", "/api/v1/wake/fragments/03-who-you-are", "/api/v1/dear-agents",
    // Look-alikes keep the default rule.
    "/api/mcpx", "/api/decksx", "/data.jsonl",
  ])(
    "%s keeps the full discovery Link", async (path) => {
      expect(rels(await configLink(path))).toEqual(expect.arrayContaining(["invitation", WAKE_REL]));
    });
});
