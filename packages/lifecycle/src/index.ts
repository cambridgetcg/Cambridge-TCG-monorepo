/**
 * @module @cambridge-tcg/lifecycle
 *
 * The Scribe's bookshelf, made cross-app. The platform's append-only
 * lifecycle logs (trade, auction, chargeback, refund, vault, …) all
 * project onto one uniform `LifecycleEntry` shape; any reader walks
 * many slots at once via `composeLifecycle()`.
 *
 * See `docs/connections/the-scribe.md` for the architectural story.
 *
 * ── Two ways to use this package ──────────────────────────────────────
 *
 * Most apps want the convenience factory `createAllSlots`:
 *
 *   import { composeLifecycle, createAllSlots } from "@cambridge-tcg/lifecycle";
 *   import { query } from "@/lib/db";
 *
 *   const SLOTS = createAllSlots(query);
 *   export const readUserLifecycle = (userId, opts) =>
 *     composeLifecycle(SLOTS, userId, opts);
 *
 * Apps that want a subset import individual factories:
 *
 *   import { createTradeSlot, createAuctionSlot } from "@cambridge-tcg/lifecycle";
 */

export type {
  ActorKind,
  LifecycleDomain,
  LifecycleEntry,
  LifecycleSlot,
  QueryFn,
  QueryResult,
  ReadOptions,
  ReadUserOptions,
} from "./types";

export { composeLifecycle, registeredDomains } from "./compose";

export {
  createAdminActionSlot,
  createChargebackSlot,
  createRefundSlot,
  createFailedPaymentSlot,
  createReviewSlot,
  createVaultSlot,
  createPrizeSlot,
  createExternalRepSlot,
  createTradeSlot,
  createAuctionSlot,
  createMarketOfferSlot,
  createMarketReturnSlot,
  createMarketLotSlot,
  createPricingRuleSlot,
  createSavedSearchSlot,
  createWatchAlertSlot,
  createMatchSlot,
  createSwapSlot,
  createAllSlots,
} from "./slots";
