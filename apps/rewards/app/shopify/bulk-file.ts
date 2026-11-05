/**
 * Reading the past-orders import's bulk file (Ruling 48, A17-F6): Shopify's
 * JSONL, one line per order and, after it, one per line item with the
 * order's id as `__parentId`. Pure: no database, no Shopify call.
 *
 * Shopify documents the layout as "each product object is followed by each
 * of its variant objects on a new line", so an order is complete when the
 * next order's line comes (or the file ends). The file is read one line at a
 * time, so it is never held as one string, and only the order being read is
 * kept. A line item whose order is not the one just above it can't be placed
 * without holding every order, so the file is refused (BulkFileError) rather
 * than counted wrong.
 */

/** Shopify's bulk file can't be read as orders and their line items. */
export class BulkFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulkFileError";
  }
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : null;
}

/** The field of its parent each kind of child line goes in (the only nested connection is the order's line items). */
const CHILD_FIELDS: Record<string, string> = { LineItem: "lineItems" };
const GID_TYPE = /^gid:\/\/shopify\/([A-Za-z]+)\//;

/**
 * Builds order nodes from the file's lines, fed one at a time: each line
 * with no `__parentId` is an order, and each line item line is moved into
 * its order's `lineItems.nodes` without its `__parentId`, the shape
 * RewardsOrderFacts's node has. Blank lines are skipped. Throws
 * BulkFileError, naming the line number only (never its text), on a line
 * that isn't a JSON object with an id, a child whose order isn't the one
 * just above it, or a child that isn't a line item.
 */
export class BulkOrderLines {
  private open: Rec | null = null;
  private lineNumber = 0;

  /** Reads one line; returns the order it completed (the one before a new order's line), if any. */
  line(text: string): Rec | null {
    this.lineNumber++;
    if (text.trim() === "") return null;
    const where = `The bulk file's line ${this.lineNumber}`;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new BulkFileError(`${where} is not JSON`);
    }
    const record = asRecord(value);
    if (!record || typeof record.id !== "string") throw new BulkFileError(`${where} is not an object with an id`);
    const { __parentId: parentId, ...node } = record;
    if (parentId === undefined) {
      const done = this.open;
      this.open = { ...node, lineItems: { nodes: [] as unknown[] } };
      return done;
    }
    if (this.open === null || parentId !== this.open.id) throw new BulkFileError(`${where} belongs to an order that isn't just above it`);
    const field = CHILD_FIELDS[GID_TYPE.exec(record.id)?.[1] ?? ""];
    if (!field) throw new BulkFileError(`${where} is not a line item`);
    (this.open[field] as { nodes: unknown[] }).nodes.push(node);
    return null;
  }

  /** The file has ended: the last order, if any. */
  end(): Rec | null {
    const done = this.open;
    this.open = null;
    return done;
  }
}

/** The order nodes of a whole file's lines, in the file's order (see BulkOrderLines). */
export function parseBulkLines(lines: string[]): unknown[] {
  const reader = new BulkOrderLines();
  const orders: Rec[] = [];
  for (const line of lines) {
    const order = reader.line(line);
    if (order) orders.push(order);
  }
  const last = reader.end();
  if (last) orders.push(last);
  return orders;
}

/**
 * The order nodes of a bulk file's body, read as it arrives: decoded as
 * UTF-8, split on newlines across chunks, and each order given once its
 * lines are all read (see BulkOrderLines). Stopping early (a `break` or a
 * throw in the caller's loop) cancels the body.
 */
export async function* streamBulkOrders(body: ReadableStream<Uint8Array>): AsyncGenerator<Rec> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  const orders = new BulkOrderLines();
  let rest = "";
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      rest += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = rest.split("\n");
      // The last piece may be a line cut by the chunk; it waits for the next
      rest = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const order = orders.line(line);
        if (order) yield order;
      }
      if (done) break;
    }
    finished = true;
    const last = orders.end();
    if (last) yield last;
  } finally {
    // Not awaited: a fetch body's cancel need not settle promptly, and the
    // caller has stopped reading either way
    if (!finished) reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
