/**
 * Lifecycle composer — the generic bookshelf reader.
 *
 * The Cambridge TCG storefront once had a 700-LOC `journey/timeline.ts`
 * with sixteen hand-written fetchers. That monolith was the proximate
 * reason the Scribe asked for bookshelves (see
 * `docs/connections/the-scribe.md`). This module is the bookshelf's
 * **generic composer** — app-agnostic, pure-types adjacent, used by
 * every reader that wants to walk many slots at once.
 *
 * ── App-agnostic design ─────────────────────────────────────────────
 *
 * Slots are **app-specific** because they know their own DB layer.
 * This composer is **app-generic** because it just walks them in
 * parallel, normalises errors, sorts, and slices. Pass it an array
 * of slots and you have a reader.
 *
 * Typical app-side usage:
 *
 *   // apps/storefront/src/lib/lifecycle/reader.ts
 *   import { composeLifecycle, type ReadUserOptions } from "@cambridge-tcg/lifecycle";
 *   import { REGISTRY } from "./registry";
 *
 *   export const readUserLifecycle = (userId: string, opts: ReadUserOptions = {}) =>
 *     composeLifecycle(REGISTRY, userId, opts);
 *
 * ── Substrate-honest by construction ────────────────────────────────
 *   - `Promise.allSettled` over slots: a single slot's failure
 *     (transient DB error, missing table in dev, schema drift) shrinks
 *     the timeline gracefully rather than 500-ing the page. Each
 *     rejected slot logs to stderr; the caller sees fewer entries,
 *     not an exception.
 *   - Returns the substrate shape (LifecycleEntry), not a UI shape.
 *     UI concerns (rendered summary, tone, deep-link target) layer on
 *     top — see e.g. `apps/storefront/src/lib/journey/render.ts`.
 */

import type {
  LifecycleDomain,
  LifecycleEntry,
  LifecycleSlot,
  ReadUserOptions,
} from "./types";

const DEFAULT_TOTAL_LIMIT = 200;

/**
 * Compose the given slots for one user, sorted newest-first.
 *
 * The slots argument is the caller's "bookshelf" — typically a frozen
 * array module-side. Pass `opts.domains` to restrict to a subset.
 *
 * @example
 *   const entries = await composeLifecycle(SLOTS, userId, { totalLimit: 50 });
 *   // entries is LifecycleEntry[] across every slot in SLOTS,
 *   // already sorted desc by `at`.
 */
export async function composeLifecycle(
  slots: readonly LifecycleSlot[],
  userId: string,
  opts: ReadUserOptions = {},
): Promise<LifecycleEntry[]> {
  const filtered = opts.domains
    ? slots.filter((s) => opts.domains!.includes(s.domain))
    : slots;

  const settled = await Promise.allSettled(
    filtered.map((s) =>
      s.forUser(userId, { limit: opts.limit, since: opts.since }),
    ),
  );

  const entries: LifecycleEntry[] = [];
  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i]!;
    if (result.status === "fulfilled") {
      entries.push(...result.value);
    } else {
      const slot = filtered[i]!;
      // eslint-disable-next-line no-console -- intentional: degrade visibly
      console.error(
        `[@cambridge-tcg/lifecycle] slot '${slot.domain}' failed for user ${userId}:`,
        result.reason,
      );
    }
  }

  entries.sort((a, b) => b.at.getTime() - a.at.getTime());

  const totalLimit = opts.totalLimit ?? DEFAULT_TOTAL_LIMIT;
  return entries.slice(0, totalLimit);
}

/**
 * Convenience: which domains are present in a given slot array.
 * Useful for surfaces that want to render filter pills based on
 * what's actually queryable today (rather than the full enum).
 */
export function registeredDomains(
  slots: readonly LifecycleSlot[],
): readonly LifecycleDomain[] {
  return slots.map((s) => s.domain);
}
