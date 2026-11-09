import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// bulk-import.server imports the app's Prisma client, which needs a database
// URL; unreadableSummary never touches it.
vi.mock("~/db.server", () => ({ default: {} }));

import { parseBulkLines } from "~/shopify/bulk-file";
import { unreadableSummary } from "~/shopify/bulk-import.server";

const fixture = readFileSync(new URL("../../fixtures/bulk/orders.jsonl", import.meta.url), "utf8");
const lines = fixture.split("\n");

type Node = { id: string; lineItems: { nodes: Array<Record<string, unknown>> } };

describe("unreadableSummary", () => {
  it("names the fixture's unreadable order 9008, out of all the file's orders", () => {
    expect(unreadableSummary(parseBulkLines(lines), "GBP")).toBe(
      "1 of 8 past orders could not be read, so their spend is not counted: 9008",
    );
  });

  it("is null when every order can be read", () => {
    const readable = parseBulkLines(lines).filter((n) => (n as Node).id !== "gid://shopify/Order/9008");
    expect(unreadableSummary(readable, "GBP")).toBeNull();
    expect(unreadableSummary([], "GBP")).toBeNull();
  });

  it("counts every unreadable order, names the first five, and groups thousands", () => {
    const [plain] = parseBulkLines(lines) as Node[];
    const bad = Array.from({ length: 12 }, (_, i) => ({ id: `gid://shopify/Order/${100 + i}` }));
    const good = Array.from({ length: 4298 }, () => plain);
    expect(unreadableSummary([...bad, ...good], "GBP")).toBe(
      "12 of 4,310 past orders could not be read, so their spend is not counted: 100, 101, 102, 103, 104 and 7 more",
    );
  });

  it("counts orders in a currency the shop no longer uses", () => {
    const nodes = parseBulkLines(lines).slice(0, 2);
    expect(unreadableSummary(nodes, "EUR")).toMatch(/^2 of 2 past orders could not be read/);
  });
});
