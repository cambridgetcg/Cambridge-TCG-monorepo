import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UUID } from "~/lib/uuid";

// A21-F8: one UUID check, shared by every module that guards an id from a URL or form
describe("UUID", () => {
  it("accepts a UUID in either case and nothing else", () => {
    expect(UUID.test("0b9d6f2e-8c1a-4e3b-9f7d-2a5c6e8b1d40")).toBe(true);
    expect(UUID.test("0B9D6F2E-8C1A-4E3B-9F7D-2A5C6E8B1D40")).toBe(true);
    expect(UUID.test("0b9d6f2e-8c1a-4e3b-9f7d-2a5c6e8b1d4")).toBe(false);
    expect(UUID.test(" 0b9d6f2e-8c1a-4e3b-9f7d-2a5c6e8b1d40")).toBe(false);
    expect(UUID.test("gold")).toBe(false);
    expect(UUID.test("")).toBe(false);
  });

  it("is written once in the app", () => {
    const app = fileURLToPath(new URL("../../../app/", import.meta.url));
    const copies = (readdirSync(app, { recursive: true }) as string[])
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => readFileSync(`${app}${file}`, "utf8").includes("[0-9a-f]{8}-"));
    expect(copies).toEqual(["lib/uuid.ts"]);
  });
});
