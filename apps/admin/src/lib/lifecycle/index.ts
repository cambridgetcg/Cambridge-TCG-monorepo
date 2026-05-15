/**
 * Admin lifecycle — the Scribe's bookshelf, admin-side.
 *
 *   import { readUserLifecycle, type LifecycleEntry } from "@/lib/lifecycle";
 *
 * See docs/connections/the-scribe.md for the architectural story.
 * Slots live in `@cambridge-tcg/lifecycle` (shared with storefront);
 * this module binds them to admin's `sfQuery` and exposes the reader.
 */

export {
  readUserLifecycle,
  registeredDomains,
  type ReadUserOptions,
} from "./reader";
export type {
  LifecycleDomain,
  LifecycleEntry,
  LifecycleSlot,
  ReadOptions,
} from "@cambridge-tcg/lifecycle";
export { REGISTRY } from "./registry";
