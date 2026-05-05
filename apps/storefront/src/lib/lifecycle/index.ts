/**
 * Lifecycle — the Scribe's bookshelf.
 *
 *   import { readUserLifecycle, type LifecycleEntry } from "@/lib/lifecycle";
 *
 * See docs/connections/the-scribe.md for the architectural story; see
 * registry.ts for adding a slot when a new lifecycle log lands.
 */

export {
  readUserLifecycle,
  registeredDomains,
  type ReadUserOptions,
} from "./reader";
export type {
  LifecycleEntry,
  LifecycleDomain,
  LifecycleSlot,
  ReadOptions,
} from "./types";
export { REGISTRY } from "./registry";
