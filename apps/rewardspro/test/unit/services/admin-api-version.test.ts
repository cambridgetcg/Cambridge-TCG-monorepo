// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Session } from "@shopify/shopify-api";
import { setAbstractFetchFunc } from "@shopify/shopify-api/runtime";
import { graphql, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { apiVersion, unauthenticated } from "~/shopify.server";
import { server } from "../../mocks/server";

/**
 * Shopify retired Admin API 2025-01 and answers a retired version with the
 * oldest one it still supports, so a stale pin moves to a new version every
 * quarter without anyone testing it. The app names 2026-10 (supported until
 * 2027-10-16). The real Admin client runs here; only the session is stubbed.
 */

const SHOP = "api-version.myshopify.com";

// The offline session unauthenticated.admin loads, without Postgres
const loadSession = vi.hoisted(() => vi.fn());
vi.mock("~/utils/session-storage.server", () => ({
  EncryptedPrismaSessionStorage: class {
    loadSession = loadSession;
  },
}));

// The Shopify runtime captured the global fetch before MSW patched it (see
// test/integration/postgres/shopify.ts)
setAbstractFetchFunc((input, init) => globalThis.fetch(input, init));

describe("Admin API version", () => {
  it("sends Admin GraphQL to 2026-10", async () => {
    loadSession.mockResolvedValue(
      new Session({ id: `offline_${SHOP}`, shop: SHOP, state: "state", isOnline: false, accessToken: "shpat_unit" }),
    );
    const elsewhere: string[] = [];
    server.use(
      graphql.link(`https://${SHOP}/admin/api/2026-10/graphql.json`).query("ShopName", () =>
        HttpResponse.json({ data: { shop: { name: "Version test" } } }),
      ),
      // MSW sends an unhandled request whose path ends in .json, as Admin
      // GraphQL's does, to the real network whatever onUnhandledRequest says.
      // Anything else stops here.
      http.all("*", ({ request }) => {
        elsewhere.push(request.url);
        return HttpResponse.error();
      }),
    );

    const { admin } = await unauthenticated.admin(SHOP);
    const answer = await admin
      .graphql(`#graphql
      query ShopName { shop { name } }`)
      .then((response) => response.json(), (error: Error) => error.message);

    expect(elsewhere).toEqual([]);
    expect(answer).toMatchObject({ data: { shop: { name: "Version test" } } });
  });

  it("exports the version the Admin mocks are built from", () => {
    expect(apiVersion).toBe("2026-10");
  });

  it("has codegen check the documents against the same version", () => {
    const config = readFileSync(resolve(process.cwd(), ".graphqlrc.ts"), "utf8");
    expect(config).toContain(`apiVersion: "${apiVersion}"`);
  });
});
