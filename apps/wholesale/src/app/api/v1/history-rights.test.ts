import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routes = [
  "tcgplayer/history/[sku]/route.ts",
  "cardrush/history/[sku]/route.ts",
];

describe("restricted wholesale history routes", () => {
  for (const route of routes) {
    it(`${route} is a value-free rights gap`, () => {
      const source = readFileSync(resolve(__dirname, route), "utf8");

      expect(source).toContain('source_license: "internal-only"');
      expect(source).toContain("unavailable_source_rights");
      expect(source).not.toContain('from "@/lib/db"');
      expect(source).not.toContain("priceArchive");
      expect(source).not.toContain("partner-redistributable");
    });
  }
});
