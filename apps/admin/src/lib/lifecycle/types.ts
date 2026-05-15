/**
 * Lifecycle types — re-exported from `@cambridge-tcg/lifecycle`.
 *
 * Same shim as the storefront's; the contract lives in the shared
 * package so admin and storefront compose the same shape. See
 * `packages/lifecycle/src/types.ts` for the design.
 */

export type {
  ActorKind,
  LifecycleDomain,
  LifecycleEntry,
  LifecycleSlot,
  ReadOptions,
} from "@cambridge-tcg/lifecycle";
