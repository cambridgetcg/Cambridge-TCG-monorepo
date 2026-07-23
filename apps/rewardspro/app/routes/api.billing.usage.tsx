import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/**
 * Current RewardsPro plans are fixed-price. Historical usage records remain
 * readable for audit purposes, but this route can never create a Shopify
 * usage charge.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!session?.shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  return json(
    {
      error: "Usage billing is disabled for fixed-price RewardsPro plans.",
      code: "USAGE_BILLING_DISABLED",
    },
    { status: 410 },
  );
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    if (!session?.shop) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "100", 10);
    const requestedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 100;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(requestedOffset, 0)
      : 0;
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    const [records, totalCount, monthlyTotal] = await Promise.all([
      prisma.usageRecord.findMany({
        where: { shop: session.shop },
        orderBy: { processedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.usageRecord.count({ where: { shop: session.shop } }),
      prisma.usageRecord.aggregate({
        where: {
          shop: session.shop,
          processedAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
    ]);

    return json({
      records,
      totalCount,
      monthlyTotal: monthlyTotal._sum.amount || 0,
      historicalOnly: true,
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    console.error("[Usage Billing] Loader error:", error);
    return json(
      {
        error: "Failed to retrieve usage history",
        code: "USAGE_HISTORY_FAILED",
      },
      { status: 500 },
    );
  }
};
