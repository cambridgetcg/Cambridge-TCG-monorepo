/**
 * Pricing — wholesale-side shim.
 *
 * As of Phase 1 of the pricing-backend consolidation
 * (docs/pricing-current-state.md, kingdom-049), the platform's pricing
 * computation lives in the shared package `@cambridge-tcg/pricing`.
 * This file re-exports the entire surface so existing wholesale call
 * sites keep working unchanged.
 *
 * New code should import from `@cambridge-tcg/pricing` directly.
 */

export {
  type ChannelConfig,
  type PriceBreakdown,
  DEFAULTS,
  MARGIN_PCT,
  PER_CARD_FEE,
  SEALED_MARGIN_PCT,
  SEALED_FLAT_FEE,
  VAT_MULTIPLIER,
  computePrice,
  computePriceForChannel,
  calculatePrice,
  calculateSealedPrice,
  calculatePriceByCategory,
} from "@cambridge-tcg/pricing";
