/**
 * Judge.me Integration Adapter
 *
 * Handles integration with Judge.me for product reviews and ratings.
 * Awards points for writing reviews, adding photos, and video reviews.
 *
 * @see https://judge.me/api/v1/docs
 */

import { ApiKeyIntegrationAdapter } from "../base-adapter.server";
import { registerAdapter } from "../integration-manager.server";
import type { Integration } from "@prisma/client";
import type {
  IntegrationConfig,
  WebhookProcessingResult,
  EventDeliveryResult,
  ConnectionTestResult,
  LoyaltyEvent,
} from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const JUDGEME_CONFIG: IntegrationConfig = {
  provider: "JUDGE_ME",
  name: "Judge.me",
  description: "Product reviews and ratings platform",
  icon: "judgeme",
  docsUrl: "https://judge.me/api/v1/docs",

  authType: "api_key",

  api: {
    baseUrl: "https://judge.me/api/v1",
    rateLimit: {
      requests: 100,
      windowMs: 60000, // 100 requests per minute
    },
  },

  webhooks: {
    supportedTopics: [
      "review/created",
      "review/updated",
      "review/published",
      "review/replied",
      "question/created",
      "question/answered",
    ],
    signatureHeader: "X-Judgeme-Hmac-Sha256",
    signatureAlgorithm: "hmac-sha256",
  },

  features: [
    {
      id: "sync_reviews",
      name: "Review Sync",
      description: "Receive webhook notifications for new reviews",
      category: "sync",
      requiresWebhook: true,
    },
    {
      id: "points_for_reviews",
      name: "Points for Reviews",
      description: "Award points when customers write reviews",
      category: "points",
      requiresWebhook: true,
    },
    {
      id: "bonus_photo_reviews",
      name: "Photo Review Bonus",
      description: "Extra points for reviews with photos",
      category: "points",
      requiresWebhook: true,
    },
    {
      id: "bonus_video_reviews",
      name: "Video Review Bonus",
      description: "Extra points for video reviews",
      category: "points",
      requiresWebhook: true,
    },
    {
      id: "verified_bonus",
      name: "Verified Purchase Bonus",
      description: "Extra points for verified purchase reviews",
      category: "points",
      requiresWebhook: true,
    },
  ],

  defaultPointsRules: [
    {
      triggerEvent: "review/created",
      name: "Write a Review",
      description: "Points for writing a product review",
      defaultPoints: 50,
    },
    {
      triggerEvent: "review/created_with_photo",
      name: "Photo Review Bonus",
      description: "Bonus points for adding photos to review",
      defaultPoints: 25,
      conditions: { hasPhoto: true },
    },
    {
      triggerEvent: "review/created_with_video",
      name: "Video Review Bonus",
      description: "Bonus points for video reviews",
      defaultPoints: 50,
      conditions: { hasVideo: true },
    },
    {
      triggerEvent: "review/created_verified",
      name: "Verified Purchase Bonus",
      description: "Bonus points for verified purchase reviews",
      defaultPoints: 10,
      conditions: { verifiedPurchase: true },
    },
    {
      triggerEvent: "question/created",
      name: "Ask a Question",
      description: "Points for asking a product question",
      defaultPoints: 10,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// JUDGE.ME API TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface JudgemeReview {
  id: number;
  title: string;
  body: string;
  rating: number;
  reviewer: {
    id: number;
    email: string;
    name: string;
    external_id?: string;
  };
  product: {
    id: number;
    handle: string;
    title: string;
  };
  pictures?: Array<{
    id: number;
    urls: {
      original: string;
      thumbnail: string;
    };
  }>;
  video_url?: string;
  verified: "verified-buyer" | "buyer" | "";
  hidden: boolean;
  created_at: string;
  curated?: string;
  published?: boolean;
  source?: string;
  ip_address?: string;
}

interface JudgemeQuestion {
  id: number;
  body: string;
  asker: {
    id: number;
    email: string;
    name: string;
  };
  product: {
    id: number;
    handle: string;
    title: string;
  };
  created_at: string;
  answer?: {
    body: string;
    answered_at: string;
  };
}

interface JudgemeWebhookPayload {
  review?: JudgemeReview;
  question?: JudgemeQuestion;
  shop_domain: string;
  event: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class JudgemeAdapter extends ApiKeyIntegrationAdapter {
  constructor() {
    super(JUDGEME_CONFIG);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Webhook Methods
  // ─────────────────────────────────────────────────────────────────────────

  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    return this.verifyHmacSha256(payload, signature, secret);
  }

  async processWebhook(
    topic: string,
    payload: Record<string, unknown>
  ): Promise<WebhookProcessingResult> {
    this.logger.debug("Processing Judge.me webhook", { topic });

    const webhookData = payload as unknown as JudgemeWebhookPayload;

    switch (topic) {
      case "review/created":
      case "review/published":
        return this.processReviewWebhook(topic, webhookData);

      case "question/created":
        return this.processQuestionWebhook(topic, webhookData);

      case "question/answered":
        return {
          customerEmail: webhookData.question?.asker.email,
          action: topic,
          data: (webhookData.question || {}) as Record<string, unknown>,
          shouldAwardPoints: false,
        };

      default:
        return {
          action: topic,
          data: payload,
          shouldAwardPoints: false,
        };
    }
  }

  /**
   * Process review webhooks
   */
  private processReviewWebhook(
    topic: string,
    payload: JudgemeWebhookPayload
  ): WebhookProcessingResult {
    const review = payload.review;
    if (!review) {
      return {
        action: topic,
        data: {},
        shouldAwardPoints: false,
      };
    }

    const hasPhoto = !!(review.pictures && review.pictures.length > 0);
    const hasVideo = !!review.video_url;
    const verifiedPurchase = review.verified === "verified-buyer";

    // Calculate base points
    const basePoints = 50; // Base points for writing a review

    // Build bonus conditions
    const bonusConditions: Record<string, boolean> = {
      hasPhoto,
      hasVideo,
      verifiedPurchase,
      highRating: review.rating >= 4,
      detailedReview: (review.body?.length || 0) > 100,
    };

    return {
      customerEmail: review.reviewer.email,
      shopifyCustomerId: review.reviewer.external_id,
      action: topic,
      data: {
        reviewId: review.id,
        productId: review.product.id,
        productHandle: review.product.handle,
        productTitle: review.product.title,
        rating: review.rating,
        title: review.title,
        bodyLength: review.body?.length || 0,
        hasPhoto,
        photoCount: review.pictures?.length || 0,
        hasVideo,
        verifiedPurchase,
        reviewerName: review.reviewer.name,
        createdAt: review.created_at,
      },
      shouldAwardPoints: true,
      pointsContext: {
        basePoints,
        bonusConditions,
      },
    };
  }

  /**
   * Process question webhooks
   */
  private processQuestionWebhook(
    topic: string,
    payload: JudgemeWebhookPayload
  ): WebhookProcessingResult {
    const question = payload.question;
    if (!question) {
      return {
        action: topic,
        data: {},
        shouldAwardPoints: false,
      };
    }

    return {
      customerEmail: question.asker.email,
      action: topic,
      data: {
        questionId: question.id,
        productId: question.product.id,
        productHandle: question.product.handle,
        productTitle: question.product.title,
        body: question.body,
        askerName: question.asker.name,
        createdAt: question.created_at,
      },
      shouldAwardPoints: true,
      pointsContext: {
        basePoints: 10,
        bonusConditions: {},
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event Delivery Methods
  // ─────────────────────────────────────────────────────────────────────────

  async sendEvent(
    integration: Integration,
    event: LoyaltyEvent
  ): Promise<EventDeliveryResult> {
    // Judge.me doesn't have an outbound event API
    // We only receive webhooks from them
    // This method would be used if we wanted to create reviews programmatically
    this.logger.debug("Judge.me sendEvent called (no-op)", { eventType: event.type });

    return {
      success: true,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Test
  // ─────────────────────────────────────────────────────────────────────────

  async testConnection(integration: Integration): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    const apiKey = this.getApiKey(integration);
    if (!apiKey) {
      return {
        success: false,
        message: "API key not configured",
      };
    }

    try {
      // Test by fetching shop info
      const shopDomain = integration.shop;
      const response = await fetch(
        `${this.config.api!.baseUrl}/shops/-1?api_token=${apiKey}&shop_domain=${shopDomain}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            message: "Invalid API key",
            latencyMs,
          };
        }
        return {
          success: false,
          message: `API returned status ${response.status}`,
          latencyMs,
        };
      }

      const data = await response.json();

      return {
        success: true,
        message: `Connected to Judge.me for ${data.shop?.domain || shopDomain}`,
        details: {
          shopId: data.shop?.id,
          shopDomain: data.shop?.domain,
          reviewCount: data.shop?.reviews_count,
        },
        latencyMs,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Custom Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fetch reviews for a shop
   */
  async fetchReviews(
    integration: Integration,
    options?: {
      page?: number;
      perPage?: number;
      productId?: number;
      rating?: number;
    }
  ): Promise<{
    success: boolean;
    reviews?: JudgemeReview[];
    pagination?: { current_page: number; total_pages: number };
    error?: string;
  }> {
    const apiKey = this.getApiKey(integration);
    if (!apiKey) {
      return { success: false, error: "API key not configured" };
    }

    try {
      const params = new URLSearchParams({
        api_token: apiKey,
        shop_domain: integration.shop,
        page: String(options?.page || 1),
        per_page: String(options?.perPage || 20),
      });

      if (options?.productId) {
        params.set("product_id", String(options.productId));
      }
      if (options?.rating) {
        params.set("rating", String(options.rating));
      }

      const response = await fetch(
        `${this.config.api!.baseUrl}/reviews?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `API returned status ${response.status}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        reviews: data.reviews,
        pagination: {
          current_page: data.current_page,
          total_pages: data.total_pages,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get review statistics for a shop
   */
  async getReviewStats(
    integration: Integration
  ): Promise<{
    success: boolean;
    stats?: {
      totalReviews: number;
      averageRating: number;
      ratingDistribution: Record<number, number>;
      photoReviews: number;
      videoReviews: number;
    };
    error?: string;
  }> {
    const apiKey = this.getApiKey(integration);
    if (!apiKey) {
      return { success: false, error: "API key not configured" };
    }

    try {
      const response = await fetch(
        `${this.config.api!.baseUrl}/widgets/product_review?api_token=${apiKey}&shop_domain=${integration.shop}&handle=all`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `API returned status ${response.status}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        stats: {
          totalReviews: data.reviews_count || 0,
          averageRating: data.average_rating || 0,
          ratingDistribution: {
            5: data.reviews_per_rating?.["5"] || 0,
            4: data.reviews_per_rating?.["4"] || 0,
            3: data.reviews_per_rating?.["3"] || 0,
            2: data.reviews_per_rating?.["2"] || 0,
            1: data.reviews_per_rating?.["1"] || 0,
          },
          photoReviews: data.with_pictures_count || 0,
          videoReviews: data.with_videos_count || 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check if a customer has already reviewed a product
   */
  async hasCustomerReviewedProduct(
    integration: Integration,
    email: string,
    productId: number
  ): Promise<{ hasReviewed: boolean; reviewId?: number; error?: string }> {
    const apiKey = this.getApiKey(integration);
    if (!apiKey) {
      return { hasReviewed: false, error: "API key not configured" };
    }

    try {
      const params = new URLSearchParams({
        api_token: apiKey,
        shop_domain: integration.shop,
        product_id: String(productId),
        reviewer_email: email,
      });

      const response = await fetch(
        `${this.config.api!.baseUrl}/reviews?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        return { hasReviewed: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();
      const reviews = data.reviews || [];

      if (reviews.length > 0) {
        return {
          hasReviewed: true,
          reviewId: reviews[0].id,
        };
      }

      return { hasReviewed: false };
    } catch (error) {
      return {
        hasReviewed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

// Register the adapter when this module is imported
registerAdapter("JUDGE_ME", () => new JudgemeAdapter());

// Export for direct use
export const judgemeAdapter = new JudgemeAdapter();
