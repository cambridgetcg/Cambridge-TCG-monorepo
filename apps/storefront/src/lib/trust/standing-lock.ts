import type { CompatQueryFn } from "@cambridge-tcg/db/compat";

export interface LockedTradeStanding {
  allowed: boolean;
  missingUserIds: string[];
  suspendedUserIds: string[];
  suspendedReasons: Record<string, string | null>;
}

/**
 * Re-check account standing inside a transaction immediately before a trade
 * write. The shared row locks conflict with emergencyFreezeAccount's
 * exclusive lock, so the write either commits before the freeze or observes
 * it. Sorting gives every multi-party path the same lock order.
 *
 * Missing trust profiles fail closed. Callers should still run canTrade()
 * before opening the transaction for limits and other full trust checks.
 */
export async function lockTradeStanding(
  runQuery: CompatQueryFn,
  userIds: Array<string | null | undefined>,
): Promise<LockedTradeStanding> {
  const expected = Array.from(
    new Set(userIds.filter((userId): userId is string => Boolean(userId))),
  ).sort();

  if (expected.length === 0) {
    return {
      allowed: true,
      missingUserIds: [],
      suspendedUserIds: [],
      suspendedReasons: {},
    };
  }

  const result = await runQuery(
    `SELECT user_id, is_suspended, suspended_reason
       FROM trust_profiles
      WHERE user_id = ANY($1::uuid[])
      ORDER BY user_id
      FOR SHARE`,
    [expected],
  );
  const rows = result.rows as Array<{
    user_id: string;
    is_suspended: boolean;
    suspended_reason: string | null;
  }>;
  const returned = new Set(rows.map((row) => row.user_id));
  const missingUserIds = expected.filter((userId) => !returned.has(userId));
  const suspended = rows.filter((row) => row.is_suspended === true);
  const suspendedUserIds = suspended.map((row) => row.user_id);
  const suspendedReasons = Object.fromEntries(
    suspended.map((row) => [row.user_id, row.suspended_reason]),
  );

  return {
    allowed: missingUserIds.length === 0 && suspendedUserIds.length === 0,
    missingUserIds,
    suspendedUserIds,
    suspendedReasons,
  };
}
