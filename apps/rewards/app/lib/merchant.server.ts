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
 * app was away (Ruling 13). `lastAuthAt` is the last open (every token
 * exchange): an uninstall from before it, or before `activatedAt`, is stale.
 */
import type { ImportState } from "@prisma/client";
import prisma from "~/db.server";
import { currencyDecimals } from "./money";
import { isCanonicalShop } from "./shop-domain";

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

function canonicalShop(shop: string): string {
  if (!isCanonicalShop(shop)) {
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
 * `uninstalledAt`. Every open records `lastAuthAt = now`, so an
 * app/uninstalled from before it can't switch the store off (markUninstalled).
 * It returns the connection's import state and `installedAt` too, so the open
 * can start the past-orders import without reading the row again (A17-F7).
 */
export async function ensureMerchant(i: {
  shop: string;
  name: string;
  currency: string;
  timezone: string;
  now?: Date;
}): Promise<{
  merchantId: string;
  connectionId: string;
  created: boolean;
  reactivated: boolean;
  importState: ImportState;
  installedAt: Date;
}> {
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
            lastAuthAt: now,
          },
        ],
        skipDuplicates: true,
      });
      const connection = await tx.connection.findUniqueOrThrow({ where: connectionKey(shop) });
      if (count === 1) {
        const { importState, installedAt } = connection;
        return { merchantId: merchant.id, connectionId: connection.id, created: true, reactivated: false, importState, installedAt };
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
    await tx.connection.update({ where: { id: existing.id }, data: { lastAuthAt: now } });
    const { importState, installedAt } = existing;
    return { merchantId: existing.merchantId, connectionId: existing.id, created: false, reactivated: count === 1, importState, installedAt };
  });
}

/**
 * The active connection for a store, or null (unknown or uninstalled).
 * With `evenUninstalled`, an uninstalled one too: its rows are kept until
 * shop/redact, and the privacy topics still apply to them.
 */
export async function findConnection(shop: string, o: { evenUninstalled?: boolean } = {}): Promise<ConnectionContext | null> {
  const connection = await prisma.connection.findFirst({
    where: { platform: PLATFORM, externalAccountId: shop, ...(o.evenUninstalled ? {} : { status: "active" as const }) },
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
 * What an app/uninstalled did:
 * - `uninstalled`: the active store is now uninstalled;
 * - `already_uninstalled`: a repeated delivery; the first time is kept;
 * - `stale`: it happened before the store's last open (`lastAuthAt`) or
 *   reactivation (`activatedAt`), so a reinstall has overtaken it and the
 *   live store stays active (Ruling 13);
 * - `unknown`: a store never seen.
 */
export type UninstallOutcome = "uninstalled" | "already_uninstalled" | "stale" | "unknown";

/**
 * Mark a store's connection uninstalled (app/uninstalled). Every row stays.
 * `now` is when the uninstall happened (the route passes the webhook's
 * X-Shopify-Triggered-At). It applies only to an active connection whose
 * activation and last open both came before `now`: a repeated delivery keeps
 * the first `uninstalledAt`, and a late retry of an uninstall that a
 * reinstall has since overtaken leaves the live store active, whether the
 * first delivery was recorded (the reinstall then reactivated the store) or
 * failed before it committed (the reinstall's open then only moved
 * `lastAuthAt`). The server's clock against Shopify's is accepted.
 */
export async function markUninstalled(shop: string, now: Date = new Date()): Promise<UninstallOutcome> {
  const { count } = await prisma.connection.updateMany({
    where: {
      platform: PLATFORM,
      externalAccountId: shop,
      status: "active",
      activatedAt: { lt: now },
      OR: [{ lastAuthAt: null }, { lastAuthAt: { lt: now } }],
    },
    data: { status: "uninstalled", uninstalledAt: now },
  });
  if (count === 1) return "uninstalled";
  const connection = await prisma.connection.findUnique({
    where: connectionKey(shop),
    select: { status: true, activatedAt: true, lastAuthAt: true },
  });
  if (!connection) return "unknown";
  const lastOpen = Math.max(connection.activatedAt.getTime(), connection.lastAuthAt?.getTime() ?? 0);
  // Not stale yet not marked: an active store can only be one an open has
  // just overtaken, so it is left as it is.
  return connection.status === "uninstalled" && now.getTime() > lastOpen ? "already_uninstalled" : "stale";
}
