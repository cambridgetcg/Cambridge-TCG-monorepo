/**
 * Admin lifecycle reader — composes the admin-side bookshelf.
 *
 * Thin wrapper around `@cambridge-tcg/lifecycle`'s composer, binding it
 * to admin's slot registry. The public API mirrors storefront's:
 *
 *   const entries = await readUserLifecycle(userId, { totalLimit: 100 });
 *
 * Admin's view is unfiltered — no `hideAdminOnly` distinction (admin is
 * the audience for admin-only events). The renderer concept doesn't
 * apply here either: admin surfaces typically render raw lifecycle
 * entries in a forensic table (timestamp, domain, action, actor,
 * reason, metadata-as-JSON), not via per-domain templated summaries.
 *
 * See `docs/connections/the-scribe.md` for the architectural story.
 * Primary consumer (planned): `apps/admin/src/app/(dashboard)/catalog/
 * users/[id]/page.tsx`, which today re-implements per-domain SQL.
 */

import {
  composeLifecycle,
  registeredDomains as packageRegisteredDomains,
  type LifecycleDomain,
  type LifecycleEntry,
  type ReadUserOptions,
} from "@cambridge-tcg/lifecycle";

import { REGISTRY } from "./registry";

export type { ReadUserOptions };

/**
 * Compose all registered admin slots for one user, sorted newest-first.
 *
 * @example
 *   const entries = await readUserLifecycle(userId, { totalLimit: 100 });
 */
export function readUserLifecycle(
  userId: string,
  opts: ReadUserOptions = {},
): Promise<LifecycleEntry[]> {
  return composeLifecycle(REGISTRY, userId, opts);
}

/** Which domains are currently registered on the admin bookshelf. */
export function registeredDomains(): readonly LifecycleDomain[] {
  return packageRegisteredDomains(REGISTRY);
}

export type { LifecycleEntry, LifecycleDomain } from "@cambridge-tcg/lifecycle";
