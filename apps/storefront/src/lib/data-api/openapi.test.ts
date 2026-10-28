import { describe, expect, it } from "vitest";
import { DATA_API_OPENAPI_TAGS, withDataApiOperations } from "./openapi";

const spec = { tags: [] as { name: string; description: string }[], paths: {}, components: { schemas: {} } };
const tag = (env: Record<string, string | undefined>) => withDataApiOperations(spec, env as NodeJS.ProcessEnv).tags.find((entry) => entry.name === "market-data");

// The plan catalogue can be published before the reads (DATA_API_PLANS_PUBLISHED
// without DATA_API_READS); its tag must not offer keyed reads that answer 404.
describe("market-data tag", () => {
  it("describes keyed derived reads only while they are published", () => {
    expect(tag({})).toBeUndefined();
    expect(tag({ DATA_API_PLANS_PUBLISHED: "on" })).toEqual(DATA_API_OPENAPI_TAGS.catalogue);
    expect(tag({ DATA_API_PLANS_PUBLISHED: "on" })!.description).not.toMatch(/member data key|reference prices|indices|premiums/);
    for (const env of [{ DATA_API_READS: "on" }, { DATA_API_READS: "on", DATA_API_PLANS_PUBLISHED: "on" }]) {
      expect(tag(env)).toEqual(DATA_API_OPENAPI_TAGS.reads);
      expect(tag(env)!.description).toContain("read with a member data key");
    }
  });
});
