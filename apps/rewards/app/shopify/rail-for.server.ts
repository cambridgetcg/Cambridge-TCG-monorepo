/**
 * The engine's way to one store from a scheduled job (spec 6.1): the payout
 * rail and the order source of a connection, on its offline session through
 * unauthenticated.admin (which refreshes an expiring token first).
 */
import prisma from "~/db.server";
import type { RailFor } from "~/lib/ports";
import { unauthenticated } from "../shopify.server";
import { createShopifyOrderSource } from "./order-source.server";
import { createStoreCreditRail } from "./store-credit-rail.server";

/**
 * The rail and order source for an active connection; null for one that is
 * unknown or uninstalled, or whose store has no usable session (none stored,
 * or its token could not be refreshed), which is logged by shop domain.
 */
export const railFor: RailFor = async (connectionId) => {
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    select: { externalAccountId: true, status: true },
  });
  if (!connection || connection.status !== "active") return null;
  const shop = connection.externalAccountId;
  try {
    const { admin } = await unauthenticated.admin(shop);
    return { rail: createStoreCreditRail(admin), orders: createShopifyOrderSource(admin) };
  } catch (error) {
    // A thrown Response is the library's answer to a refresh that failed
    const reason = error instanceof Response ? `HTTP ${error.status}` : error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[rail-for] No usable session for ${shop}: ${reason}`);
    return null;
  }
};
