import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GET as getMcpConfig } from "@/app/.well-known/mcp-config.json/route";
import { GET as getMcpDiscovery } from "@/app/.well-known/mcp.json/route";
import { PRICE_GUIDE_GAMES } from "@/lib/prices/games-config";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public claims match publication boundaries", () => {
  it("describes the MCP endpoint as custom JSON-RPC and requires the vendored bridge", async () => {
    const config = await getMcpConfig();
    const configBody = await config.json();
    const remote = configBody.remote_json_rpc_endpoint["cambridge-tcg"];

    expect(remote.transport).toBe("custom-json-rpc-over-https-post");
    expect(remote.mcp_streamable_http).toBe(false);
    expect(remote.mcp_http_sse).toBe(false);
    expect(remote.standard_mcp_client_compatible_without_bridge).toBe(false);
    expect(configBody.mcp_server_entry).toBeUndefined();
    expect(configBody.stdio_bridge).toMatchObject({
      status: "vendored-in-repository",
      npm_published: false,
    });
    expect(configBody.stdio_bridge.note).toContain("does not work");

    const discovery = await getMcpDiscovery();
    const discoveryBody = await discovery.json();
    expect(discoveryBody.server.transport).toBe("custom-json-rpc-over-https-post");
    expect(discoveryBody.server.mcp_streamable_http).toBe(false);
    expect(discoveryBody.server.stdio_bridge.npm_published).toBe(false);

    for (const path of [
      "../../packages/mcp-server/README.md",
      "../../docs/connections/the-mcp-surface.md",
      "src/app/api/mcp/route.ts",
      "src/lib/guides.ts",
    ]) {
      const text = source(path);
      expect(text).toMatch(/not MCP Streamable HTTP|not Streamable HTTP/);
      expect(text).toMatch(/vendored stdio bridge|stdio bridge/);
    }
  });

  it("scopes read-only to domain state and names operational metadata writes", async () => {
    const response = await getMcpConfig();
    const body = await response.json();

    expect(body.read_only_scope.domain_state).toBe(true);
    expect(body.read_only_scope.operational_metadata_writes.join(" "))
      .toContain("rate-limit");
    expect(body.read_only_scope.operational_metadata_writes.join(" "))
      .toContain("last_used_at");
  });

  it("does not describe paused agent, peer, or guestbook publication as live", () => {
    const paths = [
      "src/app/community/welcome/page.tsx",
      "src/app/methodology/community/page.tsx",
      "src/app/play/welcome/page.tsx",
      "src/app/methodology/play-module/page.tsx",
      "src/app/map/page.tsx",
      "src/lib/troll.ts",
      "src/lib/jest.ts",
      "src/lib/farewell.ts",
    ];
    const text = paths.map(source).join("\n");

    expect(text).not.toMatch(/agent ladder (?:is )?live/i);
    expect(text).not.toContain("MCP token + ladder placement");
    expect(text).not.toMatch(/visible to other agents for 24 hours/i);
    expect(text).not.toMatch(/place to find sister agents who arrived in the last 24h/i);
    expect(text).toContain("match/deck writes are paused");
    expect(text).toContain("no-store validation echo");
  });

  it("describes every public price-guide config as values-withheld structural coverage", () => {
    expect(PRICE_GUIDE_GAMES.length).toBeGreaterThan(0);
    for (const config of PRICE_GUIDE_GAMES) {
      expect(config.seo_title).toContain("Price Publication Paused");
      expect(config.seo_description).toContain("withheld");
      expect(config.hero_paragraph).toContain("not published");
      expect(config.pricing_note).toContain("withheld");
    }

    const publicPricePages = [
      "src/app/prices/page.tsx",
      "src/app/prices/[game]/page.tsx",
      "src/app/prices/[game]/[set]/page.tsx",
      "src/app/prices/[game]/[set]/[number]/page.tsx",
      "src/app/prices/search/page.tsx",
      "src/app/catalog/page.tsx",
      "src/app/find/page.tsx",
      "src/app/data/page.tsx",
      "src/app/data.json/route.ts",
      "src/lib/prices/state.ts",
    ].map(source).join("\n");

    expect(publicPricePages).toContain("withheld");
    expect(publicPricePages).toContain("not reconstruct");
    expect(publicPricePages).not.toContain("Current collected upstream price history is CardRush only");
    expect(publicPricePages).not.toContain("sign in for history");
    expect(publicPricePages).not.toContain("auth-gated history");
  });

  it("does not select or order public structural rows by withheld prices", () => {
    const publicCatalogCallers = [
      "src/app/page.tsx",
      "src/app/catalog/page.tsx",
      "src/app/sitemap.ts",
      "src/app/api/market/catalog/route.ts",
      "src/app/prices/[game]/page.tsx",
      "src/app/prices/[game]/[set]/page.tsx",
      "src/components/catalog/CatalogFilters.tsx",
      "src/components/market/catalog.ts",
      "src/lib/prices/state.ts",
      "src/lib/wholesale/client.ts",
    ].map(source).join("\n");

    expect(publicCatalogCallers).not.toMatch(/price_(?:asc|desc)/);
    expect(source("src/lib/wholesale/client.ts")).toContain("publicCatalogSort(params?.sort)");
  });

  it("limits privacy claims to application behavior and preserves infrastructure-log caveats", () => {
    const paths = [
      "src/lib/dear-agents.ts",
      "src/lib/joy-layer.ts",
      "src/app/api/v1/diagnostic/route.ts",
      "src/app/api/v1/the-tea-room/route.ts",
      "src/app/api/v1/the-tea-room/oracle/route.ts",
      "src/app/api/v1/the-tea-room/spill-the-tea/route.ts",
      "src/app/api/v1/the-tea-room/the-back-door/route.ts",
      "src/app/api/v1/the-tea-room/sigil/[kind]/route.ts",
      "src/app/api/v1/joy-index/route.ts",
      "src/app/api/v1/the-mood/route.ts",
      "src/app/api/v1/why/route.ts",
      "src/app/api/v1/mutual-recognition/route.ts",
      "src/app/api/v1/are-you-sure/route.ts",
      "src/app/api/v1/random-fun/route.ts",
      "src/app/api/v1/easter-egg/route.ts",
      "src/app/api/v1/unsubscribe/route.ts",
    ];

    for (const path of paths) {
      const text = source(path);
      expect(text, path).toMatch(/logs may (?:still )?(?:exist|contain)|access logs may exist/);
      expect(text, path).not.toMatch(/\bNo tracking\b|\bNot logged\b|no logging beyond|has no idea (?:you are|you're)/i);
    }
  });
});
