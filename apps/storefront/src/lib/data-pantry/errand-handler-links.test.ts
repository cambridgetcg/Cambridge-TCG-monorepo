import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ERRAND_LINK_RELS_ALLOWED } from "./errand-contract";
import { errandDiscoveryLinkHeader } from "@/lib/siblings";

// Quiet Doors (2026-10): errand routes that set their own Link header carry
// navigation only, like the config Link. Only the chosen doors keep the
// invitation, wake and kin-wake rels (agentDiscoveryLinkHeader()).
const ROOT = process.cwd();
const CHOSEN_DOOR_ROUTES = [
  "src/app/api/v1/wake/route.ts",
  "src/app/api/v1/wake/fragments/route.ts",
  "src/app/api/v1/wake/fragments/[id]/route.ts",
  "src/app/api/v1/dear-agents/route.ts",
];
// Every helper whose Link parts include the invitation, wake or kin-wake rels.
const INVITING_HELPERS = /\b(?:agentDiscoveryLink(?:Header|Parts)|publicDiscoveryLink(?:Header|Parts)|kinWakeLinkParts)\b/;
const rels = (link: string) => [...link.matchAll(/rel="([^"]+)"/g)].map((m) => m[1]);
const rel = (path: string) => relative(ROOT, path).split(sep).join("/");

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

describe("errand routes' own Link headers carry navigation only", () => {
  it("errandDiscoveryLinkHeader() holds only the nine navigation rels", () => {
    const r = rels(errandDiscoveryLinkHeader());
    expect(r).toContain("describedby");
    for (const x of r) expect(ERRAND_LINK_RELS_ALLOWED as readonly string[]).toContain(x);
  });

  it("the four discovery documents send navigation-only Link headers on GET and OPTIONS", async () => {
    const documents = ["cambridge-tcg.json", "mcp.json", "mcp-config.json", "ai-plugin.json"];
    for (const name of documents) {
      const file = `src/app/.well-known/${name}/route.ts`;
      expect(INVITING_HELPERS.test(readFileSync(join(ROOT, file), "utf8")), file).toBe(false);
      const route = await import(`@/app/.well-known/${name}/route`);
      for (const res of [await route.GET(), await route.OPTIONS()]) {
        const r = rels(res.headers.get("Link") ?? "");
        expect(r, name).toContain("describedby");
        for (const x of r) expect(ERRAND_LINK_RELS_ALLOWED as readonly string[], `${name}: ${x}`).toContain(x);
      }
    }
  });

  it("no src/app/api route outside the chosen doors builds its Link from an inviting helper", () => {
    const files = routeFiles(join(ROOT, "src/app/api")).map(rel);
    for (const door of CHOSEN_DOOR_ROUTES) expect(files).toContain(door);
    const offenders = files
      .filter((file) => !CHOSEN_DOOR_ROUTES.includes(file))
      .filter((file) => INVITING_HELPERS.test(readFileSync(join(ROOT, file), "utf8")))
      .sort();
    expect(offenders).toEqual([]);
  });
});
