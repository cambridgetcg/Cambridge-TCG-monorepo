import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// bulk-import.server imports the app's Prisma client, which needs a database
// URL; parseBulkLines never touches it.
vi.mock("~/db.server", () => ({ default: {} }));

import { BulkFileError, parseBulkLines, unreadableSummary } from "~/shopify/bulk-import.server";
import { factsFromOrderNode } from "~/shopify/order-source.server";

const fixture = readFileSync(new URL("../../fixtures/bulk/orders.jsonl", import.meta.url), "utf8");
const lines = fixture.split("\n");

type Node = { id: string; lineItems: { nodes: Array<Record<string, unknown>> } };

describe("parseBulkLines", () => {
  it("puts each line item under its order, in the file's order, without __parentId", () => {
    const nodes = parseBulkLines(lines) as Node[];

    expect(nodes.map((n) => n.id)).toEqual([9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008].map((n) => `gid://shopify/Order/${n}`));
    expect(nodes[0].lineItems.nodes.map((l) => l.id)).toEqual(["gid://shopify/LineItem/9101", "gid://shopify/LineItem/9102"]);
    expect(nodes[0].lineItems.nodes[0]).not.toHaveProperty("__parentId");
    // 9007's line comes after order 9008 in the file
    expect(nodes[6].lineItems.nodes.map((l) => l.id)).toEqual(["gid://shopify/LineItem/9701"]);
    expect(nodes[7].lineItems.nodes.map((l) => l.id)).toEqual(["gid://shopify/LineItem/9801"]);
  });

  it("gives an order with no lines an empty list, and skips blank lines", () => {
    const order = JSON.stringify({ id: "gid://shopify/Order/1", name: "#1" });
    expect(parseBulkLines(["", order, "  ", ""])).toEqual([{ id: "gid://shopify/Order/1", name: "#1", lineItems: { nodes: [] } }]);
    expect(parseBulkLines([])).toEqual([]);
  });

  it("gives nodes the order source reads as the bulk node (quantities)", () => {
    const [plain, refunded] = parseBulkLines(lines);

    const facts = factsFromOrderNode(plain, "GBP", "quantities");
    expect(facts.productValue.shopAmount.toFixed(2)).toBe("55.00");
    expect(facts.refundedProductValue.shopAmount.toFixed(2)).toBe("0.00");
    expect(facts.externalCustomerId).toBe("7001");

    const partly = factsFromOrderNode(refunded, "GBP", "quantities");
    expect(partly.productValue.shopAmount.toFixed(2)).toBe("30.00");
    expect(partly.refundedProductValue.shopAmount.toFixed(2)).toBe("20.00");
  });

  it("refuses a line that isn't a JSON object, naming its line number and not its text", () => {
    const order = JSON.stringify({ id: "gid://shopify/Order/1" });
    expect(() => parseBulkLines([order, "{not json"])).toThrow(BulkFileError);
    expect(() => parseBulkLines([order, "{not json"])).toThrow(/line 2\b/);
    expect(() => parseBulkLines([order, "{not json"])).not.toThrow(/not json/);
    expect(() => parseBulkLines(["[1, 2]"])).toThrow(/line 1\b/);
    expect(() => parseBulkLines([JSON.stringify({ name: "#1" })])).toThrow(/line 1\b/);
  });

  it("refuses a line item whose order isn't above it, or a child that isn't a line item", () => {
    const item = JSON.stringify({ id: "gid://shopify/LineItem/5", __parentId: "gid://shopify/Order/404" });
    expect(() => parseBulkLines([item])).toThrow(BulkFileError);

    const order = JSON.stringify({ id: "gid://shopify/Order/1" });
    const refund = JSON.stringify({ id: "gid://shopify/Refund/2", __parentId: "gid://shopify/Order/1" });
    expect(() => parseBulkLines([order, refund])).toThrow(/line 2\b/);
  });
});

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
