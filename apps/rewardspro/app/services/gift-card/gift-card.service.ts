/**
 * Gift Card Service
 *
 * Orchestrates gift card operations with tier integration:
 * - Create tier-branded gift cards
 * - Create membership gift cards (value + tier access)
 * - Convert store credit to gift cards
 * - Calculate tier-based bonuses
 * - Handle gift card redemption with tier activation
 *
 * This service coordinates between the Shopify adapter, database models,
 * and the tier resolution system to enable the emergent gift card + tier features.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "~/db.server";
import { createLogger } from "~/services/logger.server";
import {
  ShopifyGiftCardAdapter,
  type CreateGiftCardInput,
} from "./shopify-gift-card.adapter";
import type { GiftCardBundleType, GiftCardStatus } from "@prisma/client";
import {
  trackGiftCardPurchased,
  trackStoreCreditConverted,
} from "~/services/klaviyo-events.server";
import { isKlaviyoEnabled } from "~/services/klaviyo.server";

const logger = createLogger("GiftCardService");

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreateTierBrandedGiftCardInput {
  /** Shop domain */
  shop: string;
  /** Gift card value */
  value: number;
  /** Currency code */
  currency: string;
  /** Shopify customer ID of purchaser (for tier lookup) */
  purchaserCustomerId?: string;
  /** Internal customer ID of purchaser */
  purchaserInternalId?: string;
  /** Recipient details */
  recipient?: {
    customerId?: string;
    email?: string;
    name?: string;
    message?: string;
    sendAt?: Date;
  };
  /** Force specific template (overrides tier-based selection) */
  forceTemplateSuffix?: string;
  /** Expiration date */
  expiresOn?: Date;
  /** Internal note */
  note?: string;
}

export interface CreateMembershipGiftCardInput {
  /** Shop domain */
  shop: string;
  /** Gift card bundle ID (pre-configured bundle) */
  bundleId?: string;
  /** OR custom configuration */
  custom?: {
    /** Gift card monetary value */
    giftCardValue: number;
    /** Tier to grant on redemption */
    tierId: string;
    /** Duration of membership */
    duration: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "LIFETIME";
    /** Total price charged */
    price: number;
  };
  /** Currency code */
  currency: string;
  /** Purchaser info */
  purchaserCustomerId?: string;
  purchaserInternalId?: string;
  /** Recipient info */
  recipient?: {
    customerId?: string;
    email?: string;
    name?: string;
    message?: string;
    sendAt?: Date;
  };
}

export interface ConvertCashbackInput {
  /** Shop domain */
  shop: string;
  /** Internal customer ID */
  customerId: string;
  /** Amount to convert */
  amount: number;
  /** Currency code */
  currency: string;
  /** Recipient (if gifting to someone else) */
  recipient?: {
    customerId?: string;
    email?: string;
    name?: string;
    message?: string;
  };
}

export interface GiftCardServiceResult {
  success: boolean;
  giftCardId?: string;
  issuedGiftCardId?: string;
  lastFourDigits?: string;
  totalValue?: number;
  bonusValue?: number;
  error?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class GiftCardService {
  /**
   * Get gift card configuration for a shop
   */
  static async getConfig(shop: string) {
    return prisma.giftCardConfig.findUnique({
      where: { shop },
    });
  }

  /**
   * Create or update gift card configuration
   */
  static async upsertConfig(
    shop: string,
    config: {
      enableTierBranding?: boolean;
      enableTierBonuses?: boolean;
      enableMembershipGifts?: boolean;
      defaultTemplateSuffix?: string;
    }
  ) {
    return prisma.giftCardConfig.upsert({
      where: { shop },
      create: {
        id: uuidv4(),
        shop,
        ...config,
      },
      update: config,
    });
  }

  /**
   * Get tier-specific gift card settings
   */
  static async getTierSettings(shop: string, tierId: string) {
    return prisma.tierGiftCardSettings.findFirst({
      where: { shop, tierId },
    });
  }

  /**
   * Create a tier-branded gift card
   *
   * Selects template based on purchaser's tier (or forced template).
   * Calculates bonus value if tier bonuses are enabled.
   */
  static async createTierBrandedGiftCard(
    admin: AdminApiContext,
    input: CreateTierBrandedGiftCardInput
  ): Promise<GiftCardServiceResult> {
    const serviceLogger = logger.withContext({
      operation: "createTierBrandedGiftCard",
      shop: input.shop,
    });

    try {
      // Get shop config
      const config = await this.getConfig(input.shop);
      if (!config) {
        serviceLogger.info("No gift card config found, using defaults");
      }

      // Determine template suffix and bonus based on purchaser's tier
      let templateSuffix = input.forceTemplateSuffix || config?.defaultTemplateSuffix;
      let bonusPercent = 0;

      if (input.purchaserInternalId && config?.enableTierBranding) {
        // DATA API COMPATIBLE: Nested include not supported, use two-step query
        // Get purchaser's current tier
        const customer = await prisma.customer.findUnique({
          where: { id: input.purchaserInternalId },
          include: {
            currentTier: true, // Flat include, no nested giftCardSettings
          },
        });

        // Fetch giftCardSettings separately if customer has a tier
        const tierSettings = customer?.currentTier
          ? await prisma.tierGiftCardSettings.findUnique({
              where: { tierId: customer.currentTier.id },
            })
          : null;

        if (customer?.currentTier) {
          if (tierSettings?.templateSuffix) {
            templateSuffix = tierSettings.templateSuffix;
          }
          if (config?.enableTierBonuses && tierSettings?.bonusPercent) {
            bonusPercent = Number(tierSettings.bonusPercent);
          }

          serviceLogger.info("Using tier branding", {
            tierName: customer.currentTier.name,
            templateSuffix,
            bonusPercent,
          });
        }
      }

      // Calculate total value with bonus
      const bonusValue = (input.value * bonusPercent) / 100;
      const totalValue = input.value + bonusValue;

      // Build Shopify input
      const shopifyInput: CreateGiftCardInput = {
        initialValue: totalValue,
        currency: input.currency,
        templateSuffix,
        expiresOn: input.expiresOn,
        note: input.note || `Created via RewardsPro${bonusValue > 0 ? ` (+${bonusPercent}% tier bonus)` : ""}`,
      };

      // Add recipient if provided
      if (input.recipient?.customerId) {
        shopifyInput.recipient = {
          customerId: input.recipient.customerId,
          message: input.recipient.message,
          preferredName: input.recipient.name,
          sendNotificationAt: input.recipient.sendAt,
        };
      }

      // Create gift card in Shopify
      const result = await ShopifyGiftCardAdapter.createGiftCard(admin, shopifyInput);

      if (!result.success || !result.giftCardId) {
        return {
          success: false,
          error: result.error || "Failed to create gift card in Shopify",
        };
      }

      // Get purchaser tier info for record
      let purchaserTierId: string | undefined;
      let purchaserTierName: string | undefined;

      if (input.purchaserInternalId) {
        const customer = await prisma.customer.findUnique({
          where: { id: input.purchaserInternalId },
          include: { currentTier: true },
        });
        purchaserTierId = customer?.currentTierId || undefined;
        purchaserTierName = customer?.currentTier?.name;
      }

      // Record in our database
      const issuedGiftCard = await prisma.issuedGiftCard.create({
        data: {
          id: uuidv4(),
          shop: input.shop,
          shopifyGiftCardId: result.giftCardId,
          lastFourDigits: result.lastFourDigits,
          initialValue: input.value,
          bonusValue,
          totalValue,
          templateSuffix,
          purchaserTierId,
          purchaserTierName,
          bundleType: "VALUE_ONLY",
          purchasedByCustomerId: input.purchaserInternalId,
          purchasedByEmail: undefined, // Could be added
          recipientEmail: input.recipient?.email,
          recipientName: input.recipient?.name,
          personalMessage: input.recipient?.message,
          scheduledSendAt: input.recipient?.sendAt,
          status: "ACTIVE",
        },
      });

      serviceLogger.info("Gift card created successfully", {
        shopifyGiftCardId: result.giftCardId,
        issuedGiftCardId: issuedGiftCard.id,
        totalValue,
        bonusValue,
      });

      // Dispatch Klaviyo event for marketing automation (non-blocking)
      (async () => {
        try {
          if (await isKlaviyoEnabled(input.shop)) {
            if (input.purchaserInternalId) {
              const purchaser = await prisma.customer.findUnique({
                where: { id: input.purchaserInternalId },
                include: { currentTier: true },
              });

              if (purchaser?.email) {
                await trackGiftCardPurchased(input.shop, purchaser, {
                  id: issuedGiftCard.id,
                  code: `****${result.lastFourDigits || "****"}`,
                  initialAmount: totalValue,
                  recipientEmail: input.recipient?.email,
                  recipientName: input.recipient?.name,
                  message: input.recipient?.message,
                  tierBranded: !!templateSuffix,
                  tierName: purchaserTierName,
                });
              }
            }
          }
        } catch (klaviyoError) {
          serviceLogger.error("Failed to track Klaviyo gift card event (non-fatal)", klaviyoError);
        }
      })();

      return {
        success: true,
        giftCardId: result.giftCardId,
        issuedGiftCardId: issuedGiftCard.id,
        lastFourDigits: result.lastFourDigits,
        totalValue,
        bonusValue,
      };
    } catch (error) {
      serviceLogger.error("Failed to create tier-branded gift card", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create a membership gift card (value + tier access)
   *
   * Creates a gift card that grants tier membership when redeemed.
   */
  static async createMembershipGiftCard(
    admin: AdminApiContext,
    input: CreateMembershipGiftCardInput
  ): Promise<GiftCardServiceResult> {
    const serviceLogger = logger.withContext({
      operation: "createMembershipGiftCard",
      shop: input.shop,
    });

    try {
      let giftCardValue: number;
      let tierId: string;
      let tierName: string;
      let duration: string;
      let templateSuffix: string | undefined;

      // Get configuration from bundle or custom input
      if (input.bundleId) {
        const bundle = await prisma.giftCardBundle.findUnique({
          where: { id: input.bundleId },
          include: { tier: true },
        });

        if (!bundle) {
          return { success: false, error: "Bundle not found" };
        }

        if (!bundle.tier) {
          return { success: false, error: "Bundle has no associated tier" };
        }

        giftCardValue = Number(bundle.giftCardValue);
        tierId = bundle.tierId!;
        tierName = bundle.tier.name;
        duration = bundle.membershipDuration || "MONTHLY";

        // Get template from tier settings
        const tierSettings = await this.getTierSettings(input.shop, tierId);
        templateSuffix = tierSettings?.templateSuffix || undefined;
      } else if (input.custom) {
        giftCardValue = input.custom.giftCardValue;
        tierId = input.custom.tierId;
        duration = input.custom.duration;

        // Get tier details
        const tier = await prisma.tier.findUnique({
          where: { id: tierId },
          include: { giftCardSettings: true },
        });

        if (!tier) {
          return { success: false, error: "Tier not found" };
        }

        tierName = tier.name;
        templateSuffix = tier.giftCardSettings?.templateSuffix || undefined;
      } else {
        return { success: false, error: "Either bundleId or custom config required" };
      }

      // Create gift card in Shopify
      const shopifyInput: CreateGiftCardInput = {
        initialValue: giftCardValue,
        currency: input.currency,
        templateSuffix,
        note: `Membership Gift Card: ${tierName} (${duration})`,
      };

      if (input.recipient?.customerId) {
        shopifyInput.recipient = {
          customerId: input.recipient.customerId,
          message: input.recipient.message,
          preferredName: input.recipient.name,
          sendNotificationAt: input.recipient.sendAt,
        };
      }

      const result = await ShopifyGiftCardAdapter.createGiftCard(admin, shopifyInput);

      if (!result.success || !result.giftCardId) {
        return {
          success: false,
          error: result.error || "Failed to create gift card in Shopify",
        };
      }

      // Record in our database with membership bundle info
      const issuedGiftCard = await prisma.issuedGiftCard.create({
        data: {
          id: uuidv4(),
          shop: input.shop,
          shopifyGiftCardId: result.giftCardId,
          lastFourDigits: result.lastFourDigits,
          initialValue: giftCardValue,
          bonusValue: 0,
          totalValue: giftCardValue,
          templateSuffix,
          bundleType: giftCardValue > 0 ? "VALUE_PLUS_MEMBERSHIP" : "MEMBERSHIP_ONLY",
          bundledTierId: tierId,
          bundledTierName: tierName,
          bundledDuration: duration,
          purchasedByCustomerId: input.purchaserInternalId,
          recipientEmail: input.recipient?.email,
          recipientName: input.recipient?.name,
          personalMessage: input.recipient?.message,
          scheduledSendAt: input.recipient?.sendAt,
          status: "ACTIVE",
        },
      });

      serviceLogger.info("Membership gift card created", {
        shopifyGiftCardId: result.giftCardId,
        issuedGiftCardId: issuedGiftCard.id,
        tierName,
        duration,
      });

      return {
        success: true,
        giftCardId: result.giftCardId,
        issuedGiftCardId: issuedGiftCard.id,
        lastFourDigits: result.lastFourDigits,
        totalValue: giftCardValue,
        bonusValue: 0,
      };
    } catch (error) {
      serviceLogger.error("Failed to create membership gift card", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Convert store credit (cashback) to a gift card
   *
   * Debits the customer's store credit balance and creates a gift card.
   * The gift card can be for themselves or gifted to someone else.
   */
  static async convertCashbackToGiftCard(
    admin: AdminApiContext,
    input: ConvertCashbackInput
  ): Promise<GiftCardServiceResult> {
    const serviceLogger = logger.withContext({
      operation: "convertCashbackToGiftCard",
      shop: input.shop,
      customerId: input.customerId,
    });

    try {
      // Use transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        // DATA API COMPATIBLE: Nested include not supported, use two-step query
        // Get customer with current balance
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
          include: {
            currentTier: true, // Flat include, no nested giftCardSettings
          },
        });

        if (!customer) {
          throw new Error("Customer not found");
        }

        // Fetch giftCardSettings separately if customer has a tier
        const giftCardSettings = customer.currentTier
          ? await tx.tierGiftCardSettings.findUnique({
              where: { tierId: customer.currentTier.id },
            })
          : null;

        const currentBalance = Number(customer.storeCredit);
        if (currentBalance < input.amount) {
          throw new Error(
            `Insufficient balance. Available: ${currentBalance}, Requested: ${input.amount}`
          );
        }

        const newBalance = currentBalance - input.amount;

        // Create ledger entry for the conversion (debit)
        const ledgerEntry = await tx.storeCreditLedger.create({
          data: {
            id: uuidv4(),
            customerId: input.customerId,
            shop: input.shop,
            amount: -input.amount, // Negative for debit
            balance: newBalance,
            type: "CONVERTED_TO_GIFT_CARD",
            metadata: {
              convertedAmount: input.amount,
              recipientEmail: input.recipient?.email,
              recipientName: input.recipient?.name,
            },
            createdAt: new Date(),
          },
        });

        // Update customer balance
        await tx.customer.update({
          where: { id: input.customerId },
          data: {
            storeCredit: newBalance,
          },
        });

        return {
          ledgerEntryId: ledgerEntry.id,
          customer,
          templateSuffix: giftCardSettings?.templateSuffix,
        };
      });

      // Create gift card in Shopify (outside transaction since it's external)
      const shopifyInput: CreateGiftCardInput = {
        initialValue: input.amount,
        currency: input.currency,
        templateSuffix: result.templateSuffix || undefined,
        note: `Converted from store credit by ${result.customer.email}`,
      };

      if (input.recipient?.customerId) {
        shopifyInput.recipient = {
          customerId: input.recipient.customerId,
          message: input.recipient.message,
          preferredName: input.recipient.name,
        };
      }

      const giftCardResult = await ShopifyGiftCardAdapter.createGiftCard(
        admin,
        shopifyInput
      );

      if (!giftCardResult.success || !giftCardResult.giftCardId) {
        // ─────────────────────────────────────────────────────────────
        // MODE A: Shopify creation failed AFTER the ledger debit
        // committed. The customer was charged but got nothing.
        //
        // The previous behavior was to log "manual intervention may be
        // needed" and return — leaving the customer's balance wrong.
        // Now we issue a compensating credit: write a REVERSAL ledger
        // entry + increment the balance back, in a single transaction.
        // Any failure of the compensation itself is logged as CRITICAL
        // so ops can spot it in alerts.
        // ─────────────────────────────────────────────────────────────
        try {
          await prisma.$transaction(async (tx) => {
            await tx.storeCreditLedger.create({
              data: {
                id: uuidv4(),
                customerId: input.customerId,
                shop: input.shop,
                // Positive amount — refunds the debit above.
                amount: input.amount,
                type: "CONVERSION_REVERSAL",
                description: "Refund: gift-card creation failed in Shopify",
                metadata: {
                  reversedLedgerEntryId: result.ledgerEntryId,
                  shopifyError: giftCardResult.error ?? "unknown",
                },
                createdAt: new Date(),
              },
            });
            await tx.customer.update({
              where: { id: input.customerId },
              data: { storeCredit: { increment: input.amount } },
            });
          });
          serviceLogger.info(
            "Store credit refunded after gift card creation failed in Shopify",
            {
              ledgerEntryId: result.ledgerEntryId,
              amount: input.amount,
              shopifyError: giftCardResult.error,
            }
          );
        } catch (refundError) {
          // If BOTH the Shopify call AND the refund fail, we genuinely
          // need human attention. Log with full context so an operator
          // can reconcile the customer's balance manually.
          serviceLogger.error(
            "CRITICAL: Store credit refund failed after gift-card creation failure",
            {
              ledgerEntryId: result.ledgerEntryId,
              amount: input.amount,
              shopifyError: giftCardResult.error,
              refundError:
                refundError instanceof Error ? refundError.message : String(refundError),
            }
          );
        }
        return {
          success: false,
          error:
            giftCardResult.error ||
            "Gift card creation failed. Your store credit has been refunded.",
        };
      }

      // ──────────────────────────────────────────────────────────────
      // MODE B: Shopify created the card, but our DB insert below might
      // still fail. Wrap the insert in try/catch and log the Shopify ID
      // so manual reconciliation is possible (we cannot easily undo a
      // Shopify gift card from outside the admin API, so the right
      // recovery is human: either delete the Shopify card or insert the
      // IssuedGiftCard row manually).
      // ──────────────────────────────────────────────────────────────
      let issuedGiftCard;
      try {
        issuedGiftCard = await prisma.issuedGiftCard.create({
          data: {
            id: uuidv4(),
            shop: input.shop,
            shopifyGiftCardId: giftCardResult.giftCardId,
            lastFourDigits: giftCardResult.lastFourDigits,
            initialValue: input.amount,
            bonusValue: 0,
            totalValue: input.amount,
            templateSuffix: result.templateSuffix,
            purchasedByCustomerId: input.customerId,
            bundleType: "VALUE_ONLY",
            recipientEmail: input.recipient?.email,
            recipientName: input.recipient?.name,
            personalMessage: input.recipient?.message,
            convertedFromLedgerId: result.ledgerEntryId,
            status: "ACTIVE",
          },
        });
      } catch (dbError) {
        serviceLogger.error(
          "CRITICAL: Shopify gift card created but IssuedGiftCard insert failed — orphaned gift card",
          {
            shopifyGiftCardId: giftCardResult.giftCardId,
            lastFourDigits: giftCardResult.lastFourDigits,
            ledgerEntryId: result.ledgerEntryId,
            customerId: input.customerId,
            amount: input.amount,
            dbError: dbError instanceof Error ? dbError.message : String(dbError),
          }
        );
        // The customer has been debited AND Shopify has a valid gift
        // card. Surfacing an error here would confuse the customer
        // (their balance IS gone, the card DOES exist). Return success
        // with the Shopify ID so the storefront can surface the code,
        // and let the critical log trigger reconciliation.
        return {
          success: true,
          giftCardId: giftCardResult.giftCardId,
          lastFourDigits: giftCardResult.lastFourDigits,
          totalValue: input.amount,
          bonusValue: 0,
          error:
            "Gift card was created but not fully recorded — please contact support if it doesn't appear in your account.",
        };
      }

      serviceLogger.info("Cashback converted to gift card", {
        shopifyGiftCardId: giftCardResult.giftCardId,
        issuedGiftCardId: issuedGiftCard.id,
        amount: input.amount,
      });

      // Dispatch Klaviyo event for marketing automation (non-blocking)
      (async () => {
        try {
          if (await isKlaviyoEnabled(input.shop)) {
            const customer = await prisma.customer.findUnique({
              where: { id: input.customerId },
              include: { currentTier: true },
            });

            if (customer?.email) {
              const newCreditBalance = Number(customer.storeCredit) - input.amount;
              await trackStoreCreditConverted(input.shop, customer, {
                creditAmount: input.amount,
                giftCardCode: `****${giftCardResult.lastFourDigits || "****"}`,
                giftCardId: issuedGiftCard.id,
                bonusAmount: 0, // No bonus for conversion
                tierBonus: false,
                newCreditBalance: newCreditBalance < 0 ? 0 : newCreditBalance,
              });
            }
          }
        } catch (klaviyoError) {
          serviceLogger.error("Failed to track Klaviyo conversion event (non-fatal)", klaviyoError);
        }
      })();

      return {
        success: true,
        giftCardId: giftCardResult.giftCardId,
        issuedGiftCardId: issuedGiftCard.id,
        lastFourDigits: giftCardResult.lastFourDigits,
        totalValue: input.amount,
        bonusValue: 0,
      };
    } catch (error) {
      serviceLogger.error("Failed to convert cashback to gift card", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Calculate tier bonus for gift card purchase
   *
   * Returns the bonus percentage and amount for a given customer's tier.
   */
  static async calculateTierBonus(
    shop: string,
    customerId: string,
    baseValue: number
  ): Promise<{ bonusPercent: number; bonusAmount: number }> {
    const config = await this.getConfig(shop);

    if (!config?.enableTierBonuses) {
      return { bonusPercent: 0, bonusAmount: 0 };
    }

    // DATA API COMPATIBLE: Nested include not supported, use two-step query
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        currentTier: true, // Flat include, no nested giftCardSettings
      },
    });

    // Fetch giftCardSettings separately if customer has a tier
    const giftCardSettings = customer?.currentTier
      ? await prisma.tierGiftCardSettings.findUnique({
          where: { tierId: customer.currentTier.id },
        })
      : null;

    if (!giftCardSettings) {
      return { bonusPercent: 0, bonusAmount: 0 };
    }

    const bonusPercent = Number(giftCardSettings.bonusPercent);
    const bonusAmount = (baseValue * bonusPercent) / 100;

    return { bonusPercent, bonusAmount };
  }

  /**
   * Get all gift card bundles for a shop
   */
  static async getBundles(shop: string, activeOnly = true) {
    return prisma.giftCardBundle.findMany({
      where: {
        shop,
        ...(activeOnly && { isActive: true }),
      },
      include: { tier: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  /**
   * Create a gift card bundle
   */
  static async createBundle(
    shop: string,
    data: {
      name: string;
      description?: string;
      bundleType: GiftCardBundleType;
      giftCardValue: number;
      price: number;
      tierId?: string;
      membershipDuration?: string;
      isActive?: boolean;
      sortOrder?: number;
    }
  ) {
    return prisma.giftCardBundle.create({
      data: {
        id: uuidv4(),
        shop,
        ...data,
      },
      include: { tier: true },
    });
  }

  /**
   * Get issued gift cards for a shop with optional filters
   */
  static async getIssuedGiftCards(
    shop: string,
    filters?: {
      status?: GiftCardStatus;
      purchasedByCustomerId?: string;
      recipientCustomerId?: string;
      hasMembership?: boolean;
    },
    pagination?: { skip?: number; take?: number }
  ) {
    const where: any = { shop };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.purchasedByCustomerId) {
      where.purchasedByCustomerId = filters.purchasedByCustomerId;
    }
    if (filters?.recipientCustomerId) {
      where.recipientCustomerId = filters.recipientCustomerId;
    }
    if (filters?.hasMembership !== undefined) {
      where.bundledTierId = filters.hasMembership ? { not: null } : null;
    }

    return prisma.issuedGiftCard.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination?.skip,
      take: pagination?.take,
    });
  }
}
