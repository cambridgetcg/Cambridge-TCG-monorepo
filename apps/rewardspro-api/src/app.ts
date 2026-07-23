import Fastify from "fastify";
import type { Logger } from "pino";
import type pg from "pg";

import type { ApiConfig } from "./config.js";
import { createLogger } from "./logger.js";
import type { CommerceEventInbox } from "./repositories/commerce-event-inbox.js";
import { healthRoutes } from "./routes/health.js";
import { shopifyWebhookRoutes } from "./routes/shopify-webhooks.js";

export interface BuildAppOptions {
  config: ApiConfig;
  inbox: Pick<CommerceEventInbox, "ingest">;
  logger?: Logger;
  pool: Pick<pg.Pool, "query">;
}

export function buildApp(options: BuildAppOptions) {
  const app = Fastify({
    bodyLimit: options.config.webhookBodyLimitBytes,
    loggerInstance: options.logger ?? createLogger(options.config.logLevel),
    routerOptions: {
      ignoreTrailingSlash: true,
    },
    trustProxy: false,
  });

  app.register(healthRoutes, {
    operatorToken: options.config.operatorToken,
    pool: options.pool,
    prefix: "/health",
  });
  app.register(shopifyWebhookRoutes, {
    bodyLimitBytes: options.config.webhookBodyLimitBytes,
    dispatchToQueue: options.config.sqsQueueUrl !== undefined,
    inbox: options.inbox,
    prefix: "/webhooks/shopify",
    shopifyApiSecret: options.config.shopifyApiSecret,
  });

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({ error: "not_found" });
  });
  app.setErrorHandler(async (error, request, reply) => {
    request.log.error(
      {
        err: error,
        method: request.method,
        route: request.routeOptions.url,
      },
      "request failed",
    );
    const errorStatus =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;
    const statusCode =
      errorStatus !== undefined && errorStatus >= 400 && errorStatus < 500
        ? errorStatus
        : 500;
    return reply
      .code(statusCode)
      .send({ error: statusCode === 500 ? "internal_error" : "bad_request" });
  });

  return app;
}
