/**
 * Shopify Gift Card API Adapter
 *
 * Handles all Shopify Gift Card API operations:
 * - Create gift cards (with optional tier branding via templateSuffix)
 * - Query gift card details and balance
 * - Send notifications to recipients
 * - Deactivate gift cards
 *
 * This adapter provides a clean interface over Shopify's GraphQL API
 * for gift card operations, enabling the tier-integrated gift card system.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { createLogger } from "~/services/logger.server";

const logger = createLogger("GiftCardAdapter");

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreateGiftCardInput {
  /** Initial monetary value of the gift card */
  initialValue: number;
  /** Currency code (e.g., "USD", "CAD") */
  currency: string;
  /** Optional custom code (8-20 alphanumeric chars). Auto-generated if not provided */
  code?: string;
  /** Shopify customer ID to assign the gift card to */
  customerId?: string;
  /** Expiration date (null = never expires) */
  expiresOn?: Date;
  /** Internal note (not visible to customer) */
  note?: string;
  /** Template suffix for branding (e.g., "gold" → gift_card.gold.liquid) */
  templateSuffix?: string;
  /** Recipient details for sending gift card notification */
  recipient?: {
    /** Shopify customer ID of recipient */
    customerId: string;
    /** Personalized message to include */
    message?: string;
    /** Display name for recipient */
    preferredName?: string;
    /** Schedule notification for future delivery */
    sendNotificationAt?: Date;
  };
}

export interface GiftCardResult {
  success: boolean;
  giftCardId?: string;
  /** Last 4 characters of the code */
  lastFourDigits?: string;
  /** Full masked code (e.g., "************ABCD") */
  maskedCode?: string;
  initialValue?: number;
  balance?: number;
  currency?: string;
  error?: string;
  userErrors?: Array<{ field: string[]; message: string }>;
}

export interface GiftCardDetails {
  id: string;
  enabled: boolean;
  balance: number;
  initialValue: number;
  currency: string;
  lastFourDigits: string;
  maskedCode: string;
  expiresOn?: string;
  deactivatedAt?: string;
  createdAt: string;
  note?: string;
  templateSuffix?: string;
  customer?: {
    id: string;
    email: string;
  };
  order?: {
    id: string;
    name: string;
  };
}

// ============================================================================
// GRAPHQL MUTATIONS & QUERIES
// ============================================================================

const CREATE_GIFT_CARD_MUTATION = `#graphql
  mutation GiftCardCreate($input: GiftCardCreateInput!) {
    giftCardCreate(input: $input) {
      giftCard {
        id
        lastCharacters
        maskedCode
        initialValue {
          amount
          currencyCode
        }
        balance {
          amount
          currencyCode
        }
        enabled
        expiresOn
        createdAt
        templateSuffix
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_GIFT_CARD_QUERY = `#graphql
  query GetGiftCard($id: ID!) {
    giftCard(id: $id) {
      id
      enabled
      balance {
        amount
        currencyCode
      }
      initialValue {
        amount
        currencyCode
      }
      lastCharacters
      maskedCode
      expiresOn
      deactivatedAt
      createdAt
      note
      templateSuffix
      customer {
        id
        email
      }
      order {
        id
        name
      }
    }
  }
`;

const DEACTIVATE_GIFT_CARD_MUTATION = `#graphql
  mutation GiftCardDeactivate($id: ID!) {
    giftCardDeactivate(id: $id) {
      giftCard {
        id
        enabled
        deactivatedAt
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SEND_NOTIFICATION_TO_CUSTOMER_MUTATION = `#graphql
  mutation GiftCardSendNotificationToCustomer($id: ID!) {
    giftCardSendNotificationToCustomer(id: $id) {
      giftCard {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SEND_NOTIFICATION_TO_RECIPIENT_MUTATION = `#graphql
  mutation GiftCardSendNotificationToRecipient($id: ID!) {
    giftCardSendNotificationToRecipient(id: $id) {
      giftCard {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREDIT_GIFT_CARD_MUTATION = `#graphql
  mutation GiftCardCredit($id: ID!, $creditInput: GiftCardCreditInput!) {
    giftCardCredit(id: $id, creditInput: $creditInput) {
      giftCardCreditTransaction {
        id
        amount {
          amount
          currencyCode
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================================================
// ADAPTER CLASS
// ============================================================================

export class ShopifyGiftCardAdapter {
  /**
   * Create a new gift card in Shopify
   *
   * @param admin - Shopify Admin API context
   * @param input - Gift card creation parameters
   * @returns Result with gift card ID and details
   */
  static async createGiftCard(
    admin: AdminApiContext,
    input: CreateGiftCardInput
  ): Promise<GiftCardResult> {
    const adapterLogger = logger.withContext({ operation: "createGiftCard" });

    try {
      adapterLogger.info("Creating gift card", {
        initialValue: input.initialValue,
        currency: input.currency,
        hasCustomer: !!input.customerId,
        hasRecipient: !!input.recipient,
        templateSuffix: input.templateSuffix,
      });

      // Build GraphQL input
      const graphqlInput: Record<string, unknown> = {
        initialValue: input.initialValue.toString(),
      };

      if (input.code) {
        graphqlInput.code = input.code;
      }

      if (input.customerId) {
        graphqlInput.customerId = input.customerId;
      }

      if (input.expiresOn) {
        graphqlInput.expiresOn = input.expiresOn.toISOString().split("T")[0]; // Date only
      }

      if (input.note) {
        graphqlInput.note = input.note;
      }

      if (input.templateSuffix) {
        graphqlInput.templateSuffix = input.templateSuffix;
      }

      // Add recipient attributes if provided
      if (input.recipient) {
        graphqlInput.recipientAttributes = {
          recipient: input.recipient.customerId,
          ...(input.recipient.message && { message: input.recipient.message }),
          ...(input.recipient.preferredName && {
            preferredName: input.recipient.preferredName,
          }),
          ...(input.recipient.sendNotificationAt && {
            sendNotificationAt: input.recipient.sendNotificationAt.toISOString(),
          }),
        };
      }

      const response = await admin.graphql(CREATE_GIFT_CARD_MUTATION, {
        variables: { input: graphqlInput },
      });

      const data = await response.json();
      const result = data.data?.giftCardCreate;

      if (result?.userErrors?.length > 0) {
        adapterLogger.warn("Gift card creation failed with user errors", {
          errors: result.userErrors,
        });
        return {
          success: false,
          error: result.userErrors.map((e: any) => e.message).join(", "),
          userErrors: result.userErrors,
        };
      }

      if (!result?.giftCard) {
        adapterLogger.error("Gift card creation failed - no gift card returned");
        return {
          success: false,
          error: "No gift card returned from Shopify",
        };
      }

      const giftCard = result.giftCard;
      adapterLogger.info("Gift card created successfully", {
        giftCardId: giftCard.id,
        lastFour: giftCard.lastCharacters,
      });

      return {
        success: true,
        giftCardId: giftCard.id,
        lastFourDigits: giftCard.lastCharacters,
        maskedCode: giftCard.maskedCode,
        initialValue: parseFloat(giftCard.initialValue.amount),
        balance: parseFloat(giftCard.balance.amount),
        currency: giftCard.initialValue.currencyCode,
      };
    } catch (error) {
      adapterLogger.error("Gift card creation failed with exception", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get gift card details from Shopify
   *
   * @param admin - Shopify Admin API context
   * @param giftCardId - Shopify gift card GID
   * @returns Gift card details or null if not found
   */
  static async getGiftCard(
    admin: AdminApiContext,
    giftCardId: string
  ): Promise<GiftCardDetails | null> {
    const adapterLogger = logger.withContext({
      operation: "getGiftCard",
      giftCardId,
    });

    try {
      const response = await admin.graphql(GET_GIFT_CARD_QUERY, {
        variables: { id: giftCardId },
      });

      const data = await response.json();
      const giftCard = data.data?.giftCard;

      if (!giftCard) {
        adapterLogger.warn("Gift card not found");
        return null;
      }

      return {
        id: giftCard.id,
        enabled: giftCard.enabled,
        balance: parseFloat(giftCard.balance.amount),
        initialValue: parseFloat(giftCard.initialValue.amount),
        currency: giftCard.balance.currencyCode,
        lastFourDigits: giftCard.lastCharacters,
        maskedCode: giftCard.maskedCode,
        expiresOn: giftCard.expiresOn,
        deactivatedAt: giftCard.deactivatedAt,
        createdAt: giftCard.createdAt,
        note: giftCard.note,
        templateSuffix: giftCard.templateSuffix,
        customer: giftCard.customer
          ? {
              id: giftCard.customer.id,
              email: giftCard.customer.email,
            }
          : undefined,
        order: giftCard.order
          ? {
              id: giftCard.order.id,
              name: giftCard.order.name,
            }
          : undefined,
      };
    } catch (error) {
      adapterLogger.error("Failed to get gift card", error);
      return null;
    }
  }

  /**
   * Deactivate a gift card (permanent - cannot be re-enabled)
   *
   * @param admin - Shopify Admin API context
   * @param giftCardId - Shopify gift card GID
   * @returns Success status
   */
  static async deactivateGiftCard(
    admin: AdminApiContext,
    giftCardId: string
  ): Promise<{ success: boolean; error?: string }> {
    const adapterLogger = logger.withContext({
      operation: "deactivateGiftCard",
      giftCardId,
    });

    try {
      const response = await admin.graphql(DEACTIVATE_GIFT_CARD_MUTATION, {
        variables: { id: giftCardId },
      });

      const data = await response.json();
      const result = data.data?.giftCardDeactivate;

      if (result?.userErrors?.length > 0) {
        adapterLogger.warn("Gift card deactivation failed", {
          errors: result.userErrors,
        });
        return {
          success: false,
          error: result.userErrors.map((e: any) => e.message).join(", "),
        };
      }

      adapterLogger.info("Gift card deactivated successfully");
      return { success: true };
    } catch (error) {
      adapterLogger.error("Gift card deactivation failed", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send gift card notification to the assigned customer
   *
   * @param admin - Shopify Admin API context
   * @param giftCardId - Shopify gift card GID
   * @returns Success status
   */
  static async sendNotificationToCustomer(
    admin: AdminApiContext,
    giftCardId: string
  ): Promise<{ success: boolean; error?: string }> {
    const adapterLogger = logger.withContext({
      operation: "sendNotificationToCustomer",
      giftCardId,
    });

    try {
      const response = await admin.graphql(
        SEND_NOTIFICATION_TO_CUSTOMER_MUTATION,
        {
          variables: { id: giftCardId },
        }
      );

      const data = await response.json();
      const result = data.data?.giftCardSendNotificationToCustomer;

      if (result?.userErrors?.length > 0) {
        adapterLogger.warn("Send notification failed", {
          errors: result.userErrors,
        });
        return {
          success: false,
          error: result.userErrors.map((e: any) => e.message).join(", "),
        };
      }

      adapterLogger.info("Notification sent to customer successfully");
      return { success: true };
    } catch (error) {
      adapterLogger.error("Send notification failed", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send gift card notification to the recipient
   *
   * @param admin - Shopify Admin API context
   * @param giftCardId - Shopify gift card GID
   * @returns Success status
   */
  static async sendNotificationToRecipient(
    admin: AdminApiContext,
    giftCardId: string
  ): Promise<{ success: boolean; error?: string }> {
    const adapterLogger = logger.withContext({
      operation: "sendNotificationToRecipient",
      giftCardId,
    });

    try {
      const response = await admin.graphql(
        SEND_NOTIFICATION_TO_RECIPIENT_MUTATION,
        {
          variables: { id: giftCardId },
        }
      );

      const data = await response.json();
      const result = data.data?.giftCardSendNotificationToRecipient;

      if (result?.userErrors?.length > 0) {
        adapterLogger.warn("Send notification to recipient failed", {
          errors: result.userErrors,
        });
        return {
          success: false,
          error: result.userErrors.map((e: any) => e.message).join(", "),
        };
      }

      adapterLogger.info("Notification sent to recipient successfully");
      return { success: true };
    } catch (error) {
      adapterLogger.error("Send notification to recipient failed", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Add credit to an existing gift card
   *
   * @param admin - Shopify Admin API context
   * @param giftCardId - Shopify gift card GID
   * @param amount - Amount to credit
   * @param currency - Currency code
   * @param note - Optional note for the credit
   * @returns Success status with transaction ID
   */
  static async creditGiftCard(
    admin: AdminApiContext,
    giftCardId: string,
    amount: number,
    currency: string,
    note?: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    const adapterLogger = logger.withContext({
      operation: "creditGiftCard",
      giftCardId,
      amount,
    });

    try {
      const creditInput: Record<string, unknown> = {
        creditAmount: {
          amount: amount.toString(),
          currencyCode: currency,
        },
      };

      if (note) {
        creditInput.note = note;
      }

      const response = await admin.graphql(CREDIT_GIFT_CARD_MUTATION, {
        variables: { id: giftCardId, creditInput },
      });

      const data = await response.json();
      const result = data.data?.giftCardCredit;

      if (result?.userErrors?.length > 0) {
        adapterLogger.warn("Gift card credit failed", {
          errors: result.userErrors,
        });
        return {
          success: false,
          error: result.userErrors.map((e: any) => e.message).join(", "),
        };
      }

      adapterLogger.info("Gift card credited successfully", {
        transactionId: result?.giftCardCreditTransaction?.id,
      });

      return {
        success: true,
        transactionId: result?.giftCardCreditTransaction?.id,
      };
    } catch (error) {
      adapterLogger.error("Gift card credit failed", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
