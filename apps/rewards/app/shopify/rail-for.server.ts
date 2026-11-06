/**
 * The engine's way to one store from a scheduled job (spec 6.1): the payout
 * rail and the order source of a connection, on its offline session through
 * unauthenticated.admin (which refreshes an expiring token first).
 */
import prisma from "~/db.server";
import type { RailFor } from "~/lib/ports";
import { unauthenticated } from "../shopify.server";
import { createShopifyOrderSource } from "./order-source.server";
import { RenewalBusyError } from "./renewal-busy";
import { createStoreCreditRail } from "./store-credit-rail.server";

/**
 * The rail and order source for an active connection; null for one that is
 * unknown or uninstalled, whose store has no usable session (none stored,
 * or its token could not be refreshed), logged by shop domain; "busy" while
 * another renewal of its token runs (Ruling 85: the job reaches it next run).
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
    if (error instanceof RenewalBusyError) {
      console.warn(`[rail-for] Another renewal of ${shop}'s token is running; the store is reached next run`);
      return "busy";
    }
    // A thrown Response is the library's answer to a refresh that failed
    const reason = error instanceof Response ? `HTTP ${error.status}` : error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[rail-for] No usable session for ${shop}: ${reason}`);
    return null;
  }
};
