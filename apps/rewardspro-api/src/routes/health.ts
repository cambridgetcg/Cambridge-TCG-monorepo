import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import type pg from "pg";

import { checkDatabase } from "../db.js";

interface HealthRouteOptions {
  operatorToken: string;
  pool: Pick<pg.Pool, "query">;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (
  app,
  options,
) => {
  app.get("/live", async (_request, reply) => {
    return reply.code(200).send({ status: "ok" });
  });

  app.get("/ready", async (request, reply) => {
    const supplied = request.headers.authorization;
    const expected = `Bearer ${options.operatorToken}`;
    if (typeof supplied !== "string" || !constantTimeTextEqual(supplied, expected)) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    try {
      await checkDatabase(options.pool, "api");
      return reply.code(200).send({ status: "ready" });
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });
};

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest) && left.length === right.length;
}
