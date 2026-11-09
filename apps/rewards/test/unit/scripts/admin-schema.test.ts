import { buildSchema, introspectionFromSchema } from "graphql";
import { describe, expect, it } from "vitest";
import { ADMIN_SCHEMA_PROXY, adminSchemaFile, fetchAdminSchemaSdl } from "../../../scripts/lib/admin-schema";

/**
 * scripts/lib/admin-schema.ts, the half of `pnpm schema:admin` that asks
 * Shopify's public docs proxy for the Admin schema and prints it as the SDL
 * fixture test/unit/shopify/graphql-schema.test.ts checks documents against
 * (RP-25). A stub stands in for fetch: nothing here reaches the network.
 */

// A tiny schema with the two things the fixture must keep: a @oneOf input
// and a deprecated argument.
const TINY = buildSchema(`
  input Pick @oneOf {
    a: String
    b: Int
  }
  type Query {
    pick(p: Pick, old: Int @deprecated(reason: "Use p.")): String
  }
`);
const ANSWER = { data: introspectionFromSchema(TINY, { oneOf: true, inputValueDeprecation: true }) };

type Call = { url: string; init: RequestInit };

function stub(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("fetchAdminSchemaSdl", () => {
  it("prints the SDL the introspection describes, asking for @oneOf and deprecated arguments", async () => {
    const { calls, fetchImpl } = stub(200, ANSWER);

    const sdl = await fetchAdminSchemaSdl("2026-10", fetchImpl);

    expect(sdl).toContain("input Pick @oneOf {");
    expect(sdl).toContain('pick(p: Pick, old: Int @deprecated(reason: "Use p.")): String');
    expect(sdl.endsWith("}\n")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ADMIN_SCHEMA_PROXY}/2026-10`);
    expect(calls[0].init.method).toBe("POST");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("x-shopify-access-token")).toBe(false);
    const { query } = JSON.parse(String(calls[0].init.body)) as { query: string };
    expect(query).toContain("isOneOf");
    expect(query).toContain("args(includeDeprecated: true)");
    expect(query).not.toContain("description");
  });

  it.each([
    ["a non-200 answer", 502, ANSWER, /HTTP 502/],
    ["an answer with errors", 200, { errors: [{ message: "Throttled" }] }, /Throttled/],
    ["an answer with no __schema", 200, { data: {} }, /no __schema/],
  ])("refuses %s, so the fixture is never overwritten with junk", async (_label, status, body, message) => {
    const { fetchImpl } = stub(status, body);

    await expect(fetchAdminSchemaSdl("2026-10", fetchImpl)).rejects.toThrow(message);
  });

  it("refuses a version that isn't YYYY-MM before asking anything", async () => {
    const { calls, fetchImpl } = stub(200, ANSWER);

    await expect(fetchAdminSchemaSdl("2026-10/../graphql", fetchImpl)).rejects.toThrow(/not an Admin API version/);
    expect(calls).toHaveLength(0);
  });
});

describe("adminSchemaFile", () => {
  it("names the fixture after the version", () => {
    expect(adminSchemaFile("2026-10")).toBe("test/fixtures/shopify/admin-2026-10.graphql");
  });
});
