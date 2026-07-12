import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GET as getCardHistory } from "@/app/api/v1/cards/[sku]/history/route";
import { GET as getSetChecklist } from "@/app/api/v1/sets/[code]/checklist/route";
import { MANIFEST } from "@/lib/manifest";

const ROUTES = [
  {
    path: "src/app/api/v1/cards/[sku]/history/route.ts",
    get: getCardHistory,
    status: "paused_pending_row_level_publication_receipts",
  },
  {
    path: "src/app/api/v1/sets/[code]/checklist/route.ts",
    get: getSetChecklist,
    status: "paused_pending_set_enumeration_and_field_rights",
  },
] as const;

describe("incoming collector-data publication boundaries", () => {
  for (const route of ROUTES) {
    it(`${route.path} returns status before request or database work`, async () => {
      const response = await route.get();
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
      expect(body.error.details.publication_status).toBe(route.status);

      const source = readFileSync(resolve(process.cwd(), route.path), "utf8");
      expect(source).not.toContain("@/lib/db");
      expect(source).not.toMatch(/\bquery\s*\(/);
      expect(source).not.toContain("await params");
    });
  }

  it("describes both routes as static status doors", () => {
    const resources = Object.values(MANIFEST.resources).flat();
    for (const id of [
      "storefront.api.cards.history",
      "storefront.api.sets.checklist",
    ]) {
      const resource = resources.find((candidate) => candidate.id === id);
      expect(resource?.provenance).toBe("static");
      expect(resource?.description).toContain("HTTP 503");
      expect(resource?.description).toMatch(/before reading|before reading the/);
    }
  });

  it("does not widen the bounded structural set route into a walkable export", () => {
    const route = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/v1/prices/games/[game]/sets/[set]/route.ts",
      ),
      "utf8",
    );
    const state = readFileSync(
      resolve(process.cwd(), "src/lib/prices/state.ts"),
      "utf8",
    );

    expect(route).not.toContain('searchParams.get("offset")');
    expect(route).not.toContain("next_link");
    expect(route).not.toContain("cards_page");
    expect(state).not.toContain("opts?: { limit?: number; offset?: number }");
  });
});
