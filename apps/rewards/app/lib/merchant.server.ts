/**
 * Merchants and their store connections.
 *
 * A merchant is the business (its settings live on the merchant row); a
 * connection is one installed store, keyed by platform and the store's
 * canonical `*.myshopify.com` domain. Uninstalling marks the connection and
 * keeps every row: shop/redact (A14) does the erasure, and a reinstall before
 * it brings the same merchant back with its payouts and tiers (rule 12).
 *
 * `activatedAt` is when the current install began (the first install, then
 * each reactivation) and `uninstalledAt` the last uninstall, kept on
 * reactivation: orders created in [uninstalledAt, activatedAt) fell while the
 * app was away (Ruling 13).
 */
import prisma from "~/db.server";
import { currencyDecimals } from "./money";

export interface ConnectionContext {
  connectionId: string;
  merchantId: string;
  shop: string;
  running: boolean;
  currency: string;
  timezone: string;
  notifyBuyers: boolean;
  tierWindow: "rolling_12_months" | "lifetime";
  installedAt: Date;
  activatedAt: Date;
  uninstalledAt: Date | null;
}

const PLATFORM = "shopify" as const;
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function canonicalShop(shop: string): string {
  if (!SHOP_DOMAIN.test(shop)) {
    throw new Error(`Not a canonical *.myshopify.com shop domain: ${JSON.stringify(shop)}`);
  }
  return shop;
}

function connectionKey(shop: string) {
  return { platform_externalAccountId: { platform: PLATFORM, externalAccountId: shop } };
}

/**
 * Create or refresh the merchant behind a store, on every app open.
 * One transaction, keyed by (platform, external account id). A later open
 * updates the shop's name, currency and time zone; an uninstalled connection
 * becomes active again (`reactivated`) with `activatedAt = now`, and keeps
 * its first `installedAt` (the boundary the past-orders import used) and its
 * `uninstalledAt`.
 */
export async function ensureMerchant(i: {
  shop: string;
  name: string;
  currency: string;
  timezone: string;
  now?: Date;
}): Promise<{ merchantId: string; connectionId: string; created: boolean; reactivated: boolean }> {
  const shop = canonicalShop(i.shop);
  // A real ISO code from Shopify, never a default (throws UnknownCurrencyError).
  currencyDecimals(i.currency);
  const now = i.now ?? new Date();
  const details = { name: i.name, currency: i.currency, timezone: i.timezone };

  return prisma.$transaction(async (tx) => {
    let existing = await tx.connection.findUnique({ where: connectionKey(shop) });
    if (!existing) {
      const merchant = await tx.merchant.create({ data: details });
      // ON CONFLICT DO NOTHING: of two first opens at once, the loser waits
      // for the winner's insert to commit and then inserts nothing, without
      // raising (and logging) a unique violation.
      const { count } = await tx.connection.createMany({
        data: [
          {
            merchantId: merchant.id,
            platform: PLATFORM,
            externalAccountId: shop,
            status: "active",
            installedAt: now,
            activatedAt: now,
          },
        ],
        skipDuplicates: true,
      });
      const connection = await tx.connection.findUniqueOrThrow({ where: connectionKey(shop) });
      if (count === 1) {
        return { merchantId: merchant.id, connectionId: connection.id, created: true, reactivated: false };
      }
      // Lost the race: drop this open's merchant, which nothing points at,
      // and carry on with the winner's rows.
      await tx.merchant.delete({ where: { id: merchant.id } });
      existing = connection;
    }
    await tx.merchant.update({ where: { id: existing.merchantId }, data: details });
    // Conditional, so of two opens racing after a reinstall only one says it reactivated.
    const { count } = await tx.connection.updateMany({
      where: { id: existing.id, status: "uninstalled" },
      data: { status: "active", activatedAt: now },
    });
    return { merchantId: existing.merchantId, connectionId: existing.id, created: false, reactivated: count === 1 };
  });
}

/** The active connection for a store, or null (unknown or uninstalled). */
export async function findConnection(shop: string): Promise<ConnectionContext | null> {
  const connection = await prisma.connection.findFirst({
    where: { platform: PLATFORM, externalAccountId: shop, status: "active" },
    include: { merchant: true },
  });
  if (!connection) return null;
  const { merchant } = connection;
  return {
    connectionId: connection.id,
    merchantId: merchant.id,
    shop: connection.externalAccountId,
    running: merchant.running,
    currency: merchant.currency,
    timezone: merchant.timezone,
    notifyBuyers: merchant.notifyBuyers,
    tierWindow: merchant.tierWindow,
    installedAt: connection.installedAt,
    activatedAt: connection.activatedAt,
    uninstalledAt: connection.uninstalledAt,
  };
}

/**
 * The on switch (rule 6). Switching on needs at least one tier, checked in
 * the same statement that sets it; switching off always succeeds.
 */
export async function setRunning(
  merchantId: string,
  running: boolean,
): Promise<{ ok: true } | { ok: false; reason: "no_tiers" }> {
  const { count } = await prisma.merchant.updateMany({
    where: running ? { id: merchantId, tiers: { some: {} } } : { id: merchantId },
    data: { running },
  });
  if (count === 1) return { ok: true };
  if (running && (await prisma.merchant.count({ where: { id: merchantId } })) === 1) {
    return { ok: false, reason: "no_tiers" };
  }
  throw new Error(`No merchant ${merchantId}`);
}

/**
 * Mark a store's connection uninstalled (app/uninstalled). Every row stays.
 * `now` is when the uninstall happened (A14 passes the webhook's
 * X-Shopify-Triggered-At). It applies only to an active connection activated
 * before `now`: a repeated delivery keeps the first `uninstalledAt`, and a
 * late retry of an uninstall that a reinstall has since overtaken leaves the
 * live store active (Ruling 13). True whenever the store has a connection,
 * changed or not; false for a store never seen.
 */
export async function markUninstalled(shop: string, now: Date = new Date()): Promise<boolean> {
  const { count } = await prisma.connection.updateMany({
    where: { platform: PLATFORM, externalAccountId: shop, status: "active", activatedAt: { lt: now } },
    data: { status: "uninstalled", uninstalledAt: now },
  });
  if (count === 1) return true;
  return (await prisma.connection.count({ where: { platform: PLATFORM, externalAccountId: shop } })) === 1;
}
