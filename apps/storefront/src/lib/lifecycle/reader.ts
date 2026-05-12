/**
 * Lifecycle reader — the storefront-side bookshelf.
 *
 * Thin wrapper around `@cambridge-tcg/lifecycle`'s generic composer,
 * binding it to the storefront's slot registry. The package provides
 * the contract; this file provides the storefront's specific bookshelf.
 *
 * See `docs/connections/the-scribe.md` for the architectural story.
 * The journey timeline composer (`apps/storefront/src/lib/journey/
 * timeline.ts`) is the primary consumer.
 *
 * ── Why this wrapper exists ──────────────────────────────────────────
 *
 * Existing callers do:
 *
 *   import { readUserLifecycle } from "@/lib/lifecycle";
 *
 * That public API is preserved by exporting `readUserLifecycle` here,
 * built by partial-applying the storefront's `REGISTRY` to the
 * package's `composeLifecycle`. Admin (when it builds its own
 * lifecycle module against cross-RDS slots) will write a similar
 * one-liner.
 */

import {
  composeLifecycle,
  registeredDomains as packageRegisteredDomains,
  type LifecycleEntry,
  type ReadUserOptions,
} from "@cambridge-tcg/lifecycle";
import type { LifecycleDomain } from "@cambridge-tcg/lifecycle";

import { REGISTRY } from "./registry";

export type { ReadUserOptions };

/**
 * Compose all registered storefront slots for one user, sorted
 * newest-first. The thin-wrapper form: caller doesn't pass slots;
 * they're bound to the storefront's registry at import time.
 *
 * @example
 *   const entries = await readUserLifecycle(userId, { totalLimit: 50 });
 */
export function readUserLifecycle(
  userId: string,
  opts: ReadUserOptions = {},
): Promise<LifecycleEntry[]> {
  return composeLifecycle(REGISTRY, userId, opts);
}

/** Which domains are currently registered on the storefront's bookshelf. */
export function registeredDomains(): readonly LifecycleDomain[] {
  return packageRegisteredDomains(REGISTRY);
}

// Re-exports so callers can `import { readUserLifecycle, type LifecycleEntry }
// from "@/lib/lifecycle/reader"` and have everything they need.
export type { LifecycleEntry, LifecycleDomain, ReadOptions } from "@cambridge-tcg/lifecycle";
