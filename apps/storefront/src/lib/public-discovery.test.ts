import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GUIDES } from "./guides";
import { MANIFEST } from "./manifest";
import { META_SNAPSHOT } from "./play/meta-snapshot";
import { PULLS_SNAPSHOT } from "./pulls/pull-rates";
import { ACCESS_LABELS, agentDiscoveryRecords, buildAgentText, buildLlmsText, discoveryResources, EDITORIAL_DOORS, PUBLIC_ORIGIN } from "./public-discovery";
import { publicDiscoveryHtmlLinks, publicDiscoveryLinkHeader, kinWakeHtmlLinks, kinWakeLinkParts } from "./siblings";
import sitemap from "../app/sitemap";

// If a future static index imports runtime sources, fail before any access.
vi.mock("./db", () => { throw new Error("Root discovery must not import the database"); });
vi.mock("./wholesale/client", () => { throw new Error("Root discovery must not import upstream readers"); });

describe("public sitemap", () => {
  it("is synchronous and deterministic regardless of the request clock", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01"));
      const before = sitemap();
      expect(before).not.toBeInstanceOf(Promise);
      vi.setSystemTime(new Date("2030-01-01"));
      expect(sitemap()).toEqual(before);
      expect(new Set(before.map((page) => page.url)).size).toBe(before.length);
    } finally { vi.useRealTimers(); }
  });

  it("includes useful references and all guide dates but no private, login, PRISM beta or unlisted paths", () => {
    const pages = sitemap();
    const byPath = new Map(pages.map((page) => [page.url.replace(PUBLIC_ORIGIN, ""), page]));
    for (const path of ["/standards", "/glossary", "/play/deck-check", "/methodology/sku-standard", "/guides/condition/checklist", "/standards/validator"]) expect(byPath.has(path)).toBe(true);
    for (const path of byPath.keys()) expect(path).not.toMatch(/^\/(login|account|admin|nuke|prism-signals\/beta)(\/|$)|^\/api\//);
    for (const guide of GUIDES) expect(byPath.get(`/agents/guides/${guide.slug}`)?.lastModified).toBe(guide.last_verified);
    expect(byPath.get("/play/meta")?.lastModified).toBe(META_SNAPSHOT.asOf);
    expect(byPath.get("/pulls")?.lastModified).toBe(PULLS_SNAPSHOT.asOf);
    for (const game of PULLS_SNAPSHOT.games) expect(byPath.get(`/pulls/${game.slug}`)?.lastModified).toBe(PULLS_SNAPSHOT.asOf);
    for (const path of ["", "/catalog", "/standards/validator", "/guides/condition/checklist", "/play/banlist"]) expect(byPath.get(path)).not.toHaveProperty("lastModified");
  });
});

describe("current compact machine documents", () => {
  it("retains hospitality and math-language discovery in the served text, with honest cookie effects", async () => {
    const { GET: getLlms } = await import("../app/llms.txt/route");
    const response = await getLlms();
    const body = await response.text();
    for (const text of ["/api/v1/welcome", "/api/v1/guides", "Math language", "/api/lang-mode?mode=math", "/api/lang-mode?mode=default"]) {
      expect(body).toContain(text);
      expect(buildAgentText()).toContain(text);
    }
    expect(body).toContain("not a complete translation of every page");
    expect(body).toContain("sets a one-year lang-mode preference cookie");
    expect(body).toContain("Reading this index sets no preference cookie");
    expect(response.headers.get("set-cookie")).toBeNull();
    const { GET: toggle } = await import("../app/api/lang-mode/route");
    const enabled = await toggle(new Request(`${PUBLIC_ORIGIN}/api/lang-mode?mode=math`));
    expect(enabled.status).toBe(307);
    expect(enabled.headers.get("set-cookie")).toContain("lang-mode=math");
    expect(enabled.headers.get("set-cookie")).toContain("Max-Age=31536000");
    const cleared = await toggle(new Request(`${PUBLIC_ORIGIN}/api/lang-mode?mode=default`));
    expect(cleared.headers.get("set-cookie")).toContain("lang-mode=;");
  });

  it("uses every current guide and selected manifest methods, paths and auth classes", () => {
    const llms = buildLlmsText();
    const agent = buildAgentText();
    const records = agentDiscoveryRecords();
    for (const guide of GUIDES) {
      expect(llms).toContain(`/agents/guides/${guide.slug}`);
      expect(agent).toContain(`/api/v1/guides/${guide.slug}`);
      expect(records[`guide.${guide.slug}`]).toContain(guide.last_verified);
    }
    for (const resource of discoveryResources()) {
      expect(Object.values(MANIFEST.resources).flat()).toContain(resource);
      const line = records[`resource.${resource.id}`];
      expect(line).toContain(`${resource.methods.join(",")} ${PUBLIC_ORIGIN}${resource.path}`);
      expect(line).toContain(`access=${ACCESS_LABELS[resource.auth]}`);
    }
    expect(records["resource.storefront.member_prices.feed"]).toContain("access=member-key");
    expect(records["resource.storefront.member_prices.export"]).toContain("access=session");
    expect(records["resource.storefront.mcp"]).toContain("access=agent-key");
    expect(records["resource.storefront.api.identifiers.validate"]).toContain("POST,OPTIONS");
    expect(records["resource.storefront.api.identifiers.validate"]).toContain("access=public");
    expect(llms).not.toMatch(/nothing is gated|No account required\.|MIT|no general code license/);
    expect(llms).toContain("Repository code licensing follows the repository LICENSE");
    expect(llms).toContain("not MCP Streamable HTTP");
    expect(records).not.toHaveProperty("mcp-server");
  });

  it("uses unique single-line machine keys and preserves the editorial invitations", () => {
    const body = buildAgentText();
    const keys = body.split("\n").filter((line) => line && !line.startsWith("#")).map((line) => {
      expect(line).toMatch(/^[a-zA-Z0-9_.-]+: .+/);
      return line.split(": ")[0];
    });
    expect(new Set(keys).size).toBe(keys.length);
    for (const [key, value] of Object.entries(EDITORIAL_DOORS)) {
      expect(body).toContain(`${key}: ${value}`);
      expect(buildLlmsText()).toContain(value);
    }
    for (const path of ["/sophia-invitation.html", "/sophia-invitation.md", "/.well-known/sophia-invitation.json", "/.well-known/sophia-wake/manifest.json", "/.well-known/wake-recipe/manifest.json", "/api/v1/wake/fragments/{id}", "/api/v1/dear-agents", "/api/v1/the-nod", "/invitation.html", "/invitation.md", "/llms-full.txt"]) expect(body).toContain(path);
    expect(body).toContain("reading and exploring are not acceptance");
    expect(body).toContain("Reading is not permission to write state");
    expect(body).toContain("infrastructure logs may exist");
    expect(body).toContain("free is not anonymous access");
    expect(existsSync(join(process.cwd(), "public/.well-known/agent.txt"))).toBe(false);
  });

  it("serves generated documents with their real HTTP contract", async () => {
    const { GET: llms } = await import("../app/llms.txt/route");
    const { GET: agent } = await import("../app/.well-known/agent.txt/route");
    for (const [get, body] of [[llms, buildLlmsText()], [agent, buildAgentText()]] as const) {
      const response = await get();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("link")).toContain(publicDiscoveryLinkHeader());
      expect(await response.text()).toBe(body);
    }
  });
});

describe("real discovery links", () => {
  it("shares HTTP and HTML semantics without fake metadata or MCP endpoint claims", () => {
    const header = publicDiscoveryLinkHeader();
    for (const link of publicDiscoveryHtmlLinks()) expect(header).toContain(`<${link.href}>; rel="${link.rel}"; type="${link.type}"`);
    expect(header).toContain('</api/openapi.json>; rel="service-desc"');
    expect(header).toContain('</.well-known/cambridge-tcg.json>; rel="describedby"');
    expect(header).not.toContain('</api/mcp>');
    expect(publicDiscoveryHtmlLinks().some((link) => link.rel === "alternate")).toBe(false);
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("publicDiscoveryHtmlLinks().map");
    expect(layout).not.toContain('"link-describedby":');
    for (const link of kinWakeHtmlLinks()) expect(kinWakeLinkParts().join(", ")).toContain(`<${link.href}>; rel="${link.rel}"`);
  });
});
