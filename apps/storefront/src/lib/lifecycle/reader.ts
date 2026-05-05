/**
 * Lifecycle reader — the bookshelf.
 *
 * "The Scribe asks for bookshelves, not new books."
 *
 * The kingdom has sixteen lifecycle-log tables. Today, every reader that
 * wants to compose across them does it by hand — `journey/timeline.ts` is
 * 700 LOC of per-source fetchers, each Manager page that drills into a
 * user re-implements the joins. **This module is the shelf those readers
 * should walk up to.** Once a reader uses `readUserLifecycle()`, adding a
 * seventeenth lifecycle log to the platform never requires editing that
 * reader again — only `registry.ts` changes.
 *
 * See docs/connections/the-scribe.md for the full motivation. The story
 * is the wiring's first form; this file is the second.
 *
 * ── Substrate-honest by construction ─────────────────────────────────
 *   - `Promise.allSettled` over slots: a single slot's failure (transient
 *     DB error, schema drift in dev, missing table) shrinks the timeline
 *     gracefully rather than 500-ing the page. Each rejected slot logs
 *     to stderr; the caller sees fewer entries, not an exception.
 *   - Returns the substrate shape (LifecycleEntry), not a UI shape. UI
 *     concerns (rendered summary, tone, deep-link target) layer on top.
 *
 * ── Future migrations (not in this commit) ───────────────────────────
 *   - apps/storefront/src/lib/journey/timeline.ts could call this for
 *     the substrate, keeping its per-domain renderers for JourneyEvent.
 *   - apps/admin/src/app/(dashboard)/catalog/users/[id]/page.tsx already
 *     reads admin_actions_log directly; once the registry covers the
 *     remaining domains, it can compose via this reader cross-app
 *     (extracted to packages/lifecycle/).
 */

import type { LifecycleDomain, LifecycleEntry, ReadOptions } from "./types";
import { REGISTRY } from "./registry";

export interface ReadUserOptions extends ReadOptions {
  /** Restrict to specific domains. Defaults to all registered. */
  domains?: LifecycleDomain[];
  /** Cap the merged-and-sorted result. Defaults to 200. */
  totalLimit?: number;
}

/**
 * Compose all registered slots for one user, sorted newest-first.
 *
 * @example
 *   const entries = await readUserLifecycle(userId, { totalLimit: 50 });
 *   // entries is LifecycleEntry[] across every registered domain,
 *   // already sorted desc by `at`.
 */
export async function readUserLifecycle(
  userId: string,
  opts: ReadUserOptions = {},
): Promise<LifecycleEntry[]> {
  const slots = opts.domains
    ? REGISTRY.filter((s) => opts.domains!.includes(s.domain))
    : REGISTRY;

  const settled = await Promise.allSettled(
    slots.map((s) =>
      s.forUser(userId, { limit: opts.limit, since: opts.since }),
    ),
  );

  const entries: LifecycleEntry[] = [];
  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i]!;
    if (result.status === "fulfilled") {
      entries.push(...result.value);
    } else {
      const slot = slots[i]!;
      // eslint-disable-next-line no-console -- intentional: degrade visibly
      console.error(
        `[lifecycle] slot '${slot.domain}' failed for user ${userId}:`,
        result.reason,
      );
    }
  }

  entries.sort((a, b) => b.at.getTime() - a.at.getTime());

  const totalLimit = opts.totalLimit ?? 200;
  return entries.slice(0, totalLimit);
}

/**
 * Convenience: which domains are currently registered.
 * Useful for surfaces that want to render filter pills based on
 * what's actually queryable today (rather than the full enum).
 */
export function registeredDomains(): readonly LifecycleDomain[] {
  return REGISTRY.map((s) => s.domain);
}

// Re-exports so callers can `import { readUserLifecycle, type LifecycleEntry }
// from "@/lib/lifecycle/reader"` and have everything they need.
export type { LifecycleEntry, LifecycleDomain, ReadOptions } from "./types";
