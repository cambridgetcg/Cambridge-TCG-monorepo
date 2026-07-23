import { createHash } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";

import {
  CommerceConnectionNotFoundError,
  CommerceEventConflictError,
  type CommerceEventInbox,
} from "../repositories/commerce-event-inbox.js";
import {
  InvalidShopifyWebhookError,
  parseShopifyPayload,
  parseShopifyWebhookHeaders,
  verifyShopifyHmac,
} from "../webhooks/shopify.js";

interface ShopifyWebhookRouteOptions {
  bodyLimitBytes: number;
  dispatchToQueue: boolean;
  inbox: Pick<CommerceEventInbox, "ingest">;
  shopifyApiSecret: string;
}

export const shopifyWebhookRoutes: FastifyPluginAsync<
  ShopifyWebhookRouteOptions
> = async (app, options) => {
  app.addContentTypeParser(
    "application/json",
    {
      bodyLimit: options.bodyLimitBytes,
      parseAs: "buffer",
    },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.post("/", async (request, reply) => {
    try {
      const headers = parseShopifyWebhookHeaders(request.headers);
      if (!Buffer.isBuffer(request.body)) {
        throw new InvalidShopifyWebhookError("Raw body is required");
      }
      if (
        !verifyShopifyHmac(
          request.body,
          headers.hmac,
          options.shopifyApiSecret,
        )
      ) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      parseShopifyPayload(request.body);
      await options.inbox.ingest({
        dispatch: options.dispatchToQueue,
        externalEventId: headers.webhookId,
        externalEventType: headers.topic,
        occurredAt: headers.triggeredAt,
        payloadJson: request.body.toString("utf8"),
        payloadSha256: createHash("sha256").update(request.body).digest("hex"),
        provider: "shopify",
        sourceAccountId: headers.shopDomain,
      });

      // The request path ends at the durable commit. A worker flushes pending
      // outbox rows without spending Shopify's response window on SQS I/O.
      return reply.code(202).send({ status: "accepted" });
    } catch (error) {
      if (error instanceof InvalidShopifyWebhookError) {
        return reply.code(400).send({ error: "bad_request" });
      }
      if (error instanceof CommerceConnectionNotFoundError) {
        return reply.code(404).send({ error: "not_found" });
      }
      if (error instanceof CommerceEventConflictError) {
        return reply.code(409).send({ error: "conflict" });
      }
      throw error;
    }
  });
};
