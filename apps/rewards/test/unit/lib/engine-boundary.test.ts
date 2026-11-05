import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The engine (app/lib) is shop-neutral (plan file structure): it never
 * imports the Shopify layer, React Router or the admin's display modules,
 * which word what the engine decides (M3a-F6). The set of payout states on
 * their way is defined once, so Home and Orders can't drift apart (M3a-F7).
 */

const app = fileURLToPath(new URL("../../../app/", import.meta.url));
const sources = (readdirSync(app, { recursive: true }) as string[]).filter((file) => /\.tsx?$/.test(file));
const read = (file: string) => readFileSync(`${app}${file}`, "utf8");

describe("the engine", () => {
  it("imports nothing from the admin, the Shopify layer, the routes or React Router", () => {
    const outside = sources
      .filter((file) => file.startsWith("lib/"))
      .flatMap((file) =>
        // `from "x"`, a side-effect `import "x"` and a dynamic `import("x")` (M3f-F4)
        [...read(file).matchAll(/(?:\bfrom|\bimport)\s*\(?\s*"([^"]+)"/g)]
          .map((match) => match[1])
          .filter((path) => /^(~\/(admin|shopify|routes)\b|\.\.\/|react-router|@shopify\/)/.test(path))
          .map((path) => `${file}: ${path}`),
      );
    expect(outside).toEqual([]);
  });

  it("defines the payout states on their way once", () => {
    expect(sources.filter((file) => /const ON_ITS_WAY\b/.test(read(file)))).toEqual(["lib/status.ts"]);
  });
});
