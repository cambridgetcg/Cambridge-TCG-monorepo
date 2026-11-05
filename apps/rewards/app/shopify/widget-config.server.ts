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
 * the switch or the tiers change, whenever the app is opened, and every
 * night (housekeeping).
 *
 * Each write that Shopify took is recorded on the connection: the value as
 * sent and when (widgetConfigSyncedAt). The nightly step reads that record
 * to visit the stores written longest ago first and to skip a store still
 * holding today's value (OPERATIONS-4). The record only ever errs towards a
 * rewrite: a failed write clears the time (Shopify may hold either value),
 * and so does a write that finished while another write of the same store
 * was in flight, since the two may have reached Shopify in either order.
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

/** The nightly step rewrites a store whose value is unchanged once its last write is this old. */
export const WIDGET_CONFIG_REWRITE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

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

/** The metafield's value as it is sent, and as the connection records it. */
export function widgetConfigJson(config: WidgetConfig): string {
  return JSON.stringify({ running: config.running, basePercent: config.basePercent });
}

/** What the connection records of the store's last widget write. */
export type WidgetConfigRecord = { widgetConfigSyncedAt: Date | null; widgetConfigValue: string | null };

/**
 * Whether the nightly step can leave the store alone: its last write is
 * under WIDGET_CONFIG_REWRITE_AFTER_MS old and carried the value the
 * database holds now.
 */
export async function widgetConfigCurrent(merchantId: string, record: WidgetConfigRecord, now: Date): Promise<boolean> {
  if (!record.widgetConfigSyncedAt || record.widgetConfigValue === null) return false;
  if (now.getTime() - record.widgetConfigSyncedAt.getTime() >= WIDGET_CONFIG_REWRITE_AFTER_MS) return false;
  return record.widgetConfigValue === widgetConfigJson(await widgetConfig(merchantId));
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Record a write Shopify took: only over a record older than the write's
 * start. A newer one means another write finished while this one was in
 * flight, and either may have landed last, so the time is cleared instead.
 * A failure here is logged, never thrown: the write itself was made, and the
 * record left behind is the older one, which can only cause a rewrite.
 */
async function recordWidgetWrite(connectionId: string, value: string, startedAt: Date): Promise<void> {
  try {
    const { count } = await prisma.connection.updateMany({
      where: { id: connectionId, OR: [{ widgetConfigSyncedAt: null }, { widgetConfigSyncedAt: { lt: startedAt } }] },
      data: { widgetConfigSyncedAt: new Date(), widgetConfigValue: value },
    });
    if (count === 0) await prisma.connection.updateMany({ where: { id: connectionId }, data: { widgetConfigSyncedAt: null } });
  } catch (error) {
    console.error(`[widget] Could not record a widget write: ${messageOf(error)}`);
  }
}

/** Forget when the store was last written, so the next night visits it first; logged, never thrown. */
async function forgetWidgetWrite(connectionId: string): Promise<void> {
  try {
    await prisma.connection.updateMany({ where: { id: connectionId }, data: { widgetConfigSyncedAt: null } });
  } catch (error) {
    console.error(`[widget] Could not clear the record of a failed widget write: ${messageOf(error)}`);
  }
}

/**
 * Write the store's current widget settings to its app-data metafield, and
 * record what was written (the header). Reads them fresh from the database
 * right before the write, after the installation read, so a caller that
 * just changed the switch or a tier writes the new state, and of two writes
 * close together the later one carries the newest state (A19-F5). Throws
 * when Shopify can't be asked in time, answers with errors, or refuses the
 * write (its userErrors); the record's time is cleared then.
 */
export async function syncWidgetConfig(admin: GraphqlClient, conn: Pick<ConnectionContext, "merchantId" | "connectionId">): Promise<void> {
  const startedAt = new Date();
  let value: string;
  try {
    const installation = asRecord((await ask(admin, RewardsAppInstallation)).currentAppInstallation);
    const ownerId = installation?.id;
    if (typeof ownerId !== "string" || ownerId === "") throw new Error("RewardsAppInstallation answered without the installation's id");
    value = widgetConfigJson(await widgetConfig(conn.merchantId));

    const payload = asRecord(
      (
        await ask(admin, RewardsWidgetConfig, {
          metafields: [{ ownerId, namespace: WIDGET_CONFIG_NAMESPACE, key: WIDGET_CONFIG_KEY, type: "json", value }],
        })
      ).metafieldsSet,
    );
    if (!payload) throw new Error("RewardsWidgetConfig answered without metafieldsSet");
    const refusal = Array.isArray(payload.userErrors) ? asRecord(payload.userErrors[0]) : null;
    if (refusal) throw new Error(`Shopify refused the widget config: ${String(refusal.code ?? "no code")}: ${String(refusal.message ?? "")}`);
  } catch (error) {
    await forgetWidgetWrite(conn.connectionId);
    throw error;
  }
  await recordWidgetWrite(conn.connectionId, value, startedAt);
}
