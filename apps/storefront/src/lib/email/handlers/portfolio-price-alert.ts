/** Queued legacy price alerts are cancelled while source rights are unresolved. */

import { registerQueueHandler, type QueueHandlerResult } from "../queue";

async function handle(): Promise<QueueHandlerResult> {
  return { kind: "cancelled", reason: "legacy price publication is paused" };
}

registerQueueHandler("portfolio_price_alert", handle);
