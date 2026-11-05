import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BulkFileError, parseBulkLines, streamBulkOrders } from "~/shopify/bulk-file";
import { factsFromOrderNode } from "~/shopify/order-source.server";

/**
 * The bulk file reader (Ruling 48, A17-F6): pure, so no database mock. The
 * file is read line by line from a web stream, and each order is given once
 * its line items (which Shopify writes right after it) are read.
 */

const fixture = readFileSync(new URL("../../fixtures/bulk/orders.jsonl", import.meta.url), "utf8");
const lines = fixture.split("\n");

type Node = { id: string; lineItems: { nodes: Array<Record<string, unknown>> } };

/** A body that delivers `text` as UTF-8 in pieces of `size` bytes, counting the pieces read. */
function body(text: string, size: number): { stream: ReadableStream<Uint8Array>; read: { pieces: number; cancelled: boolean } } {
  const bytes = new TextEncoder().encode(text);
  const read = { pieces: 0, cancelled: false };
  let at = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) return controller.close();
      read.pieces++;
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
    cancel() {
      read.cancelled = true;
    },
  });
  return { stream, read };
}

async function all(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const orders: unknown[] = [];
  for await (const order of streamBulkOrders(stream)) orders.push(order);
  return orders;
}

describe("parseBulkLines", () => {
  it("puts each line item under its order, in the file's order, without __parentId", () => {
    const nodes = parseBulkLines(lines) as Node[];

    expect(nodes.map((n) => n.id)).toEqual([9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008].map((n) => `gid://shopify/Order/${n}`));
    expect(nodes[0].lineItems.nodes.map((l) => l.id)).toEqual(["gid://shopify/LineItem/9101", "gid://shopify/LineItem/9102"]);
    expect(nodes[0].lineItems.nodes[0]).not.toHaveProperty("__parentId");
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
    // The order's refund list stays on its own line's node (Ruling 54)
    expect((refunded as { refunds: unknown }).refunds).toEqual([{ id: "gid://shopify/Refund/9021" }]);
    expect(partly.importRefundIds).toEqual(["gid://shopify/Refund/9021"]);
    expect(facts.importRefundIds).toEqual([]);
  });

  it("refuses a line that isn't a JSON object, naming its line number and not its text", () => {
    const order = JSON.stringify({ id: "gid://shopify/Order/1" });
    expect(() => parseBulkLines([order, "{not json"])).toThrow(BulkFileError);
    expect(() => parseBulkLines([order, "{not json"])).toThrow(/line 2\b/);
    expect(() => parseBulkLines([order, "{not json"])).not.toThrow(/not json/);
    expect(() => parseBulkLines(["[1, 2]"])).toThrow(/line 1\b/);
    expect(() => parseBulkLines([JSON.stringify({ name: "#1" })])).toThrow(/line 1\b/);
  });

  it("refuses a line item whose order isn't just above it, or a child that isn't a line item", () => {
    const item = JSON.stringify({ id: "gid://shopify/LineItem/5", __parentId: "gid://shopify/Order/404" });
    expect(() => parseBulkLines([item])).toThrow(BulkFileError);

    const order = JSON.stringify({ id: "gid://shopify/Order/1" });
    const refund = JSON.stringify({ id: "gid://shopify/Refund/2", __parentId: "gid://shopify/Order/1" });
    expect(() => parseBulkLines([order, refund])).toThrow(/line 2\b/);

    // Order 1's line after order 2 started: placing it would mean holding every order
    const second = JSON.stringify({ id: "gid://shopify/Order/2" });
    const late = JSON.stringify({ id: "gid://shopify/LineItem/3", __parentId: "gid://shopify/Order/1" });
    expect(() => parseBulkLines([order, second, late])).toThrow(/line 3 belongs to an order that isn't just above it/);
    // The import's error then names the likely cause (M2c-F9)
    expect(() => parseBulkLines([order, second, late])).toThrow(/Shopify's file put a line item away from its order/);
  });
});

describe("streamBulkOrders", () => {
  it("gives the same orders as the whole file, however the body is cut into chunks", async () => {
    const whole = parseBulkLines(lines);
    for (const size of [1, 7, 64, 1000, fixture.length]) {
      await expect(all(body(fixture, size).stream)).resolves.toEqual(whole);
    }
  });

  it("decodes a character cut across two chunks, and a last line with no newline", async () => {
    const text = `${JSON.stringify({ id: "gid://shopify/Order/1", name: "Café £5" })}\n${JSON.stringify({ id: "gid://shopify/Order/2" })}`;
    // 3 bytes a chunk cuts both two-byte characters somewhere
    await expect(all(body(text, 3).stream)).resolves.toEqual([
      { id: "gid://shopify/Order/1", name: "Café £5", lineItems: { nodes: [] } },
      { id: "gid://shopify/Order/2", lineItems: { nodes: [] } },
    ]);
  });

  it("stops reading the body when the caller stops", async () => {
    const { stream, read } = body(fixture, 64);

    for await (const order of streamBulkOrders(stream)) {
      expect((order as Node).id).toBe("gid://shopify/Order/9001");
      break;
    }

    expect(read.cancelled).toBe(true);
    expect(read.pieces).toBeLessThan(Math.ceil(fixture.length / 64));
  });

  it("throws BulkFileError at a line that can't be read", async () => {
    const text = `${JSON.stringify({ id: "gid://shopify/Order/1" })}\n{not json\n`;
    await expect(all(body(text, 5).stream)).rejects.toThrow(BulkFileError);
  });
});
