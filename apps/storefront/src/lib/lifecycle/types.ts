/**
 * Lifecycle types — re-exported from `@cambridge-tcg/lifecycle`.
 *
 * The substrate-shape types live in the shared workspace package now
 * (extracted 2026-05-11) so admin can compose the same shape over its
 * cross-RDS slots without re-declaring the contract. This shim keeps
 * existing storefront imports (`import { LifecycleEntry } from "./types"`,
 * etc.) working without changes.
 *
 * The full design docstrings + intent live at
 * `packages/lifecycle/src/types.ts`. See also
 * `docs/connections/the-scribe.md` and
 * `docs/connections/the-agent-surface.md`.
 */

export type {
  ActorKind,
  LifecycleDomain,
  LifecycleEntry,
  LifecycleSlot,
  ReadOptions,
} from "@cambridge-tcg/lifecycle";
