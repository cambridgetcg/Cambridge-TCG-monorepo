import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** The Orders list offers only bulk actions that do something. */
describe("Orders bulk actions", () => {
  const source = read("app/routes/app.orders.tsx");
  const bulkActions = source.slice(source.indexOf("const bulkActions = useMemo("), source.indexOf("// Handle clear filters"));

  it("still offers cashback processing for the selected orders", () => {
    expect(bulkActions).toContain("Process cashback (");
  });

  it("does not offer an export that only says it is coming soon", () => {
    expect(bulkActions).not.toContain("Export");
    expect(source).not.toMatch(/coming soon/i);
  });
});
