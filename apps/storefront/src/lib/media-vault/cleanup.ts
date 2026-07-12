/** Bounded, idempotent cleanup for expired pending vault reservations. */

import {
  collectorMediaVaultOperationAllowed,
  resolveCollectorMediaVaultConfig,
} from "./config";
import {
  claimExpiredPendingCollectorMedia,
  deleteClaimedCollectorMediaRow,
  resetCollectorMediaCleanupClaim,
} from "./db";
import { createCollectorMediaVaultStorage } from "./storage";

export interface CollectorMediaCleanupResult {
  skipped: boolean;
  reason?: "storage-not-configured";
  examined: number;
  deleted: number;
  failed: number;
  moreMayRemain: boolean;
}

const BATCH_SIZE = 25;

export async function runCollectorMediaVaultCleanup(): Promise<CollectorMediaCleanupResult> {
  const resolved = resolveCollectorMediaVaultConfig();
  if (!collectorMediaVaultOperationAllowed(resolved, "delete")) {
    return {
      skipped: true,
      reason: "storage-not-configured",
      examined: 0,
      deleted: 0,
      failed: 0,
      moreMayRemain: false,
    };
  }

  // Claiming changes pending -> deleting atomically. mark-ready accepts only
  // pending rows, so cleanup can never delete an object that became ready.
  const due = await claimExpiredPendingCollectorMedia(BATCH_SIZE);
  const storage = createCollectorMediaVaultStorage(resolved.config);
  let deleted = 0;
  let failed = 0;
  for (const item of due) {
    try {
      // S3 first. DeleteObject is idempotent when the write never happened.
      await storage.delete(item.objectKey);
      const rowDeleted = await deleteClaimedCollectorMediaRow(item.id, item.ownerUserId);
      if (rowDeleted) deleted += 1;
      else {
        failed += 1;
        await resetCollectorMediaCleanupClaim(item.id, item.ownerUserId).catch(() => false);
      }
    } catch {
      // Keep the pointer for retry. Never turn an unconfirmed S3 deletion into
      // a hidden orphan by deleting the database row.
      failed += 1;
      await resetCollectorMediaCleanupClaim(item.id, item.ownerUserId).catch(() => false);
    }
  }

  return {
    skipped: false,
    examined: due.length,
    deleted,
    failed,
    moreMayRemain: due.length === BATCH_SIZE,
  };
}
