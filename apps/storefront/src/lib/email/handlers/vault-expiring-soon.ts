/**
 * Vault expiry notices are paused with automatic legacy-price credit. Sending
 * the old template would disclose withheld prices and promise a disabled action.
 */

import { registerQueueHandler, type QueueHandlerResult } from "../queue";

async function handle(): Promise<QueueHandlerResult> {
  return {
    kind: "cancelled",
    reason: "vault price and automatic credit are paused for source-rights review",
  };
}

registerQueueHandler("vault_expiring_soon", handle);
