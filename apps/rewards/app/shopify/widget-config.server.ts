/**
 * What the storefront widget knows without asking the server (plan
 * Decision 8): whether cashback is on and the base rate, held in an
 * app-data metafield that Liquid reads as `app.metafields.rewards.config.value`,
 * so guests never call the server.
 *
 * Shopify's app-data metafields live on the app's installation: read
 * `currentAppInstallation { id }`, then `metafieldsSet` with that id as
 * `ownerId`. The installation owner keeps the metafield the app's own, so a
 * plain namespace (`rewards`) is enough; `$app` is not needed (shopify.dev,
 * custom data ownership, "App-data metafields"). It is rewritten whenever
 * the switch or the tiers change, and every night (housekeeping).
 */
import prisma from "~/db.server";
import type { ConnectionContext } from "~/lib/merchant.server";
import { fromDb } from "~/lib/money";
import { askShopify } from "./ask.server";
import { type GraphqlClient, RewardsAppInstallation, RewardsWidgetConfig } from "./graphql";

export const WIDGET_CONFIG_NAMESPACE = "rewards";
export const WIDGET_CONFIG_KEY = "config";

/** The longest one call waits: an admin action waits on it. */
const CALL_TIMEOUT_MS = 5000;

/** The metafield's value: `basePercent` is the lowest tier's rate (5, 2.5), null with no tiers. */
export interface WidgetConfig {
  running: boolean;
  basePercent: number | null;
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : null;
}

async function ask(admin: GraphqlClient, query: string, variables: Record<string, unknown> = {}): Promise<Rec> {
  const body = asRecord(await askShopify(admin, query, variables, CALL_TIMEOUT_MS));
  if (body?.errors) {
    const first = Array.isArray(body.errors) ? asRecord(body.errors[0])?.message : undefined;
    throw new Error(`Shopify answered with errors: ${typeof first === "string" ? first : "unknown error"}`);
  }
  const data = asRecord(body?.data);
  if (!data) throw new Error("Shopify answered with no data");
  return data;
}

/** The store's widget settings as the database holds them now. */
export async function widgetConfig(merchantId: string): Promise<WidgetConfig> {
  const [merchant, lowest] = await Promise.all([
    prisma.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { running: true } }),
    // The lowest tier as the tier engine picks it (tiers.server.ts byMinimum)
    prisma.tier.findFirst({
      where: { merchantId },
      orderBy: [{ minSpend: "asc" }, { position: "asc" }, { id: "asc" }],
      select: { cashbackPercent: true },
    }),
  ]);
  // A display percent (numeric(5,2)), never used in arithmetic
  return { running: merchant.running, basePercent: lowest ? fromDb(lowest.cashbackPercent).toNumber() : null };
}

/**
 * Write the store's current widget settings to its app-data metafield.
 * Reads them fresh from the database right before the write, after the
 * installation read, so a caller that just changed the switch or a tier
 * writes the new state, and of two writes close together the later one
 * carries the newest state (A19-F5). Throws when Shopify can't be asked in
 * time, answers with errors, or refuses the write (its userErrors).
 */
export async function syncWidgetConfig(admin: GraphqlClient, conn: ConnectionContext): Promise<void> {
  const installation = asRecord((await ask(admin, RewardsAppInstallation)).currentAppInstallation);
  const ownerId = installation?.id;
  if (typeof ownerId !== "string" || ownerId === "") throw new Error("RewardsAppInstallation answered without the installation's id");
  const config = await widgetConfig(conn.merchantId);

  const payload = asRecord(
    (
      await ask(admin, RewardsWidgetConfig, {
        metafields: [{ ownerId, namespace: WIDGET_CONFIG_NAMESPACE, key: WIDGET_CONFIG_KEY, type: "json", value: JSON.stringify(config) }],
      })
    ).metafieldsSet,
  );
  if (!payload) throw new Error("RewardsWidgetConfig answered without metafieldsSet");
  const refusal = Array.isArray(payload.userErrors) ? asRecord(payload.userErrors[0]) : null;
  if (refusal) throw new Error(`Shopify refused the widget config: ${String(refusal.code ?? "no code")}: ${String(refusal.message ?? "")}`);
}
