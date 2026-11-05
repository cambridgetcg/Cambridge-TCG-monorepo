/**
 * Writing past orders read at install (spec 6.5, rule 11).
 *
 * Each kept order goes through recordOrder with source `import`, so it is
 * written exactly as a live order is, earns nothing (reason `import`, no
 * ledger entry, no payout) and counts toward its buyer's tier spend. The
 * order's natural key makes it idempotent: an order the import meets again
 * (a resumed chunk) or that a webhook or the sweep recorded first is skipped,
 * leaving one row.
 */
import type { ConnectionContext } from "./merchant.server";
import type { OrderFacts } from "./order-facts";
import { recordOrder } from "./record-order.server";

/** The financial statuses of orders the import keeps: paid, in full or with part refunded. */
const KEPT_STATUSES = new Set(["PAID", "PARTIALLY_REFUNDED"]);

/** Whether a past order counts: paid or partly refunded, not a test (Decision 7) and not cancelled. */
function kept(facts: OrderFacts): boolean {
  return KEPT_STATUSES.has(facts.financialStatus) && !facts.test && facts.cancelledAt === null;
}

/**
 * Record one chunk of past orders. `written` counts the rows this call wrote;
 * `skipped` the orders not kept, a guest's, and those already recorded. A
 * failed write throws, so the caller keeps its cursor and the chunk is
 * written again (what was written is then skipped).
 */
export async function ingestImportedOrders(conn: ConnectionContext, facts: OrderFacts[]): Promise<{ written: number; skipped: number }> {
  let written = 0;
  let skipped = 0;
  for (const order of facts) {
    if (!kept(order)) {
      skipped++;
      continue;
    }
    const result = await recordOrder(conn, order, "import");
    if (result.status === "recorded") written++;
    else skipped++;
  }
  return { written, skipped };
}
