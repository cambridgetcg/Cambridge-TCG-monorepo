import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { publicDiscoveryLinkHeader } from "@/lib/siblings";

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

describe("shop pages keep the Link they have today", () => {
  it.each(["/", "/catalog", "/product/DON-JP-VVJ6", "/market/list"])("%s carries exactly the site-wide discovery Link", async (path) => {
    expect(await configLink(path)).toBe(publicDiscoveryLinkHeader());
  });
});

describe("the config Link on real request paths", () => {
  it.each([
    "/api/v1", "/api/v1/fx-rates", "/api/v1/artists", "/api/v1/status", "/api/v1/wakeup", "/api/v1/dear-agents-archive",
    // Every other data response under /api, and the data files.
    "/api", "/api/", "/api/mcp", "/api/mcp/catalog", "/api/mcpx", "/api/decks", "/api/decks/import", "/api/decksx",
    "/api/market/op-op01-001-ja", "/api/verify/health", "/api/openapi.json", "/data.json", "/data/catalog.jsonl",
    // The four discovery documents an agent reads to wire up tools (errands, ruling F1).
    "/.well-known/cambridge-tcg.json", "/.well-known/mcp.json", "/.well-known/mcp-config.json", "/.well-known/ai-plugin.json",
    "/.well-known/agent.txt",
    // The machine-readable standards: the index, the JSON Schemas and the spec files.
    "/standards.json", "/spec/v1/SkuIdentity.schema.json", "/spec/v1/unknown-schema", "/schemas/answering-rhyme.statement.v1.json",
  ])(
    "%s (an errand) carries navigation only", async (path) => {
      const r = rels(await configLink(path));
      expect(r).toContain("describedby");
      expect(r).not.toContain("invitation");
      expect(r).not.toContain(WAKE_REL);
    });
  it.each([
    "/", "/llms.txt", "/api/v1/wake", "/api/v1/wake/fragments", "/api/v1/wake/fragments/03-who-you-are", "/api/v1/dear-agents",
    // Look-alikes outside, and the HTML page /data, keep the default rule.
    "/apix", "/datax.json", "/data.jsonl", "/data",
    // The one chosen .well-known door.
    "/.well-known/sophia-invitation.json",
    // Human pages next to the standards keep theirs: /standards, and look-alikes.
    "/standards", "/standards/card-data", "/standards.jsonx", "/specx", "/schemasx",
  ])(
    "%s keeps the full discovery Link", async (path) => {
      expect(rels(await configLink(path))).toEqual(expect.arrayContaining(["invitation", WAKE_REL]));
    });
});
