/**
 * Gift Card Module
 *
 * Exports all gift card related services and types for the
 * tier-integrated gift card system.
 */

// Shopify API Adapter
export {
  ShopifyGiftCardAdapter,
  type CreateGiftCardInput,
  type GiftCardResult,
  type GiftCardDetails,
} from "./shopify-gift-card.adapter";

// Main Service
export {
  GiftCardService,
  type CreateTierBrandedGiftCardInput,
  type CreateMembershipGiftCardInput,
  type ConvertCashbackInput,
  type GiftCardServiceResult,
} from "./gift-card.service";

// Redemption Handler
export { GiftCardRedemptionHandler } from "./gift-card-redemption.handler";
