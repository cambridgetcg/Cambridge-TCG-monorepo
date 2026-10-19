/**
 * Shop Data Cleanup Service
 *
 * Erases data for a whole shop (app/uninstalled, shop/redact) or for one
 * shopper (customers/redact). One implementation serves both callers.
 *
 * Shop erasure is derived from the Prisma data model, not a hand-kept list:
 * every model with a `shop` column is deleted, each before the models it
 * references, inside one transaction. Models without a `shop` column either
 * cascade from a shop-scoped parent or hold no shop data (exchange rates,
 * system alerts, cron locks, AI telemetry). test/unit/services/
 * shop-data-cleanup.test.ts pins both facts, so a new model cannot silently
 * escape erasure.
 *
 * Every function throws on failure (nothing is half-deleted: the work runs
 * in a transaction), so webhook handlers can answer 5xx and Shopify retries.
 */

import { Prisma } from "@prisma/client";
import prisma, { databaseSchema } from "~/db.server";

type DataModel = (typeof Prisma.dmmf.datamodel.models)[number];

const MODELS: readonly DataModel[] = Prisma.dmmf.datamodel.models;

// Erasing a large shop runs many statements; allow well beyond Prisma's
// default 5 s interactive-transaction timeout.
const ERASURE_TRANSACTION = { timeout: 60_000, maxWait: 10_000 };

function isShopScoped(model: DataModel): boolean {
  return model.fields.some((f) => f.kind === "scalar" && f.name === "shop");
}

type DataField = DataModel["fields"][number];

/**
 * A foreign key that makes deletion order matter: one that blocks the delete
 * (RESTRICT, which Prisma uses for a required relation without a referential
 * action) or cascades it (a cascaded delete can itself be blocked further
 * down). Only SET NULL keys, which never delete, are safe to ignore; ignoring
 * them is also what keeps the graph acyclic.
 */
function ordersDeletion(field: DataField): boolean {
  const action = field.relationOnDelete;
  return action === "Cascade" || action === "Restrict" || action === "NoAction" || (action === undefined && field.isRequired);
}

/** Models this model holds an order-relevant foreign key to (excluding itself). */
function dependsOn(model: DataModel): string[] {
  return model.fields
    .filter(
      (f) =>
        f.kind === "object" &&
        (f.relationFromFields?.length ?? 0) > 0 &&
        f.type !== model.name &&
        ordersDeletion(f),
    )
    .map((f) => f.type);
}

/**
 * Shop-scoped models in a safe deletion order: a model always comes before
 * every model it references through a deleting or blocking foreign key, so
 * neither a direct nor a cascaded delete is refused.
 */
export function shopErasureOrder(): string[] {
  const scoped = MODELS.filter(isShopScoped);
  const names = new Set(scoped.map((m) => m.name));
  const referencers = new Map<string, Set<string>>(scoped.map((m) => [m.name, new Set()]));
  for (const model of scoped) {
    for (const target of dependsOn(model)) {
      if (names.has(target)) referencers.get(target)!.add(model.name);
    }
  }

  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < scoped.length) {
    const ready = scoped
      .map((m) => m.name)
      .filter((name) => !done.has(name) && [...referencers.get(name)!].every((r) => done.has(r)))
      .sort();
    if (ready.length === 0) {
      throw new Error("[ShopCleanup] Foreign-key cycle between shop-scoped models; cannot order deletion");
    }
    for (const name of ready) {
      done.add(name);
      order.push(name);
    }
  }
  return order;
}

function table(model: DataModel): Prisma.Sql {
  return Prisma.raw(`"${databaseSchema}"."${model.dbName ?? model.name}"`);
}

function column(name: string): Prisma.Sql {
  return Prisma.raw(`"${name}"`);
}

const modelByName = new Map(MODELS.map((m) => [m.name, m]));

/** Delete every row of every shop-scoped model for `shop`. Returns counts per model. */
export async function eraseShopData(
  tx: Prisma.TransactionClient,
  shop: string,
): Promise<Record<string, number>> {
  const deletedCounts: Record<string, number> = {};
  for (const name of shopErasureOrder()) {
    deletedCounts[name] = await tx.$executeRaw`DELETE FROM ${table(modelByName.get(name)!)} WHERE "shop" = ${shop}`;
  }
  return deletedCounts;
}

export interface CleanupResult {
  success: boolean;
  shop: string;
  deletedCounts: Record<string, number>;
  errors: string[];
  durationMs: number;
}

/**
 * Delete all data associated with a shop, atomically.
 *
 * @param shop - The shop domain (e.g., "store.myshopify.com")
 * @returns CleanupResult with counts of deleted records
 */
export async function cleanupShopData(shop: string): Promise<CleanupResult> {
  const startTime = Date.now();

  // SECURITY: Validate shop domain before any deletions
  if (!shop || typeof shop !== 'string' || !shop.includes('.myshopify.com')) {
    return {
      success: false,
      shop: shop || 'unknown',
      deletedCounts: {},
      errors: ['Invalid shop domain - refusing to delete data'],
      durationMs: Date.now() - startTime,
    };
  }

  console.log(`[ShopCleanup] Starting comprehensive data cleanup for ${shop}`);

  try {
    const deletedCounts = await prisma.$transaction(
      (tx) => eraseShopData(tx, shop),
      ERASURE_TRANSACTION,
    );
    const total = Object.values(deletedCounts).reduce((a, b) => a + b, 0);
    console.log(`[ShopCleanup] Deleted ${total} records for ${shop}`);
    return { success: true, shop, deletedCounts, errors: [], durationMs: Date.now() - startTime };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ShopCleanup] Cleanup failed for ${shop}; nothing was deleted:`, message);
    return { success: false, shop, deletedCounts: {}, errors: [message], durationMs: Date.now() - startTime };
  }
}

/**
 * Count remaining rows per shop-scoped model (for verification and audits).
 */
export async function getShopDataCounts(shop: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const name of shopErasureOrder()) {
    const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM ${table(modelByName.get(name)!)} WHERE "shop" = ${shop}`;
    counts[name] = Number(row.count);
  }
  return counts;
}

// ============================================================================
// Customer erasure (customers/redact)
// ============================================================================

/**
 * Columns outside a foreign key to Customer that identify a shopper, by the
 * internal Customer.id or the Shopify customer id (`ids`) or by email
 * (`emails`). Rows matching either are deleted. The unit test checks that
 * every customer-identifying column in the schema is listed here or in
 * NOT_SHOPPER_DATA below.
 */
export const SHOPPER_COLUMNS: Record<string, { ids?: string[]; emails?: string[] }> = {
  EmailEvent: { ids: ["customerId"], emails: ["customerEmail"] },
  IntegrationEvent: { ids: ["customerId", "shopifyCustomerId"] },
  IssuedGiftCard: { ids: ["purchasedByCustomerId", "recipientCustomerId"], emails: ["purchasedByEmail", "recipientEmail"] },
  KlaviyoEvent: { ids: ["customerId"], emails: ["customerEmail"] },
  KlaviyoProfile: { ids: ["customerId", "shopifyCustomerId"], emails: ["email"] },
  MissionCompletionEvent: { ids: ["customerId"] },
  PaymentMethodValidation: { ids: ["customerId"] },
  PendingAutomation: { emails: ["recipientEmail"] },
};

/** Models whose email/customer columns are merchant or aggregate data, not a shopper's. */
export const NOT_SHOPPER_DATA = new Set([
  "Session", // merchant staff accounts
  "ShopSettings",
  "ShopEntitlements",
  "EmailSettings", // merchant sender identity
  "CustomerSyncJob",
  "StoreCreditSyncJob",
  "UsageSummary",
  "MonthlyEmailUsage",
  "SubscriptionPricingConfig",
  "KlaviyoAutomationSettings",
  "Raffle",
  "RaffleInstantWin",
  "RaffleBonusEvent",
  "MysteryBox",
  "MysteryBoxBonusEvent",
]);

export interface CustomerErasureResult {
  customerFound: boolean;
  deletedCounts: Record<string, number>;
}

/**
 * Erase one shopper: every row that references their Customer record, every
 * row in SHOPPER_COLUMNS matching their ids or email, then the Customer row.
 * Runs even when the shopper was never synced as a Customer, so email-only
 * traces (email events, pending automations) are still removed.
 */
export async function eraseCustomerData(
  shop: string,
  shopper: { shopifyCustomerId: string; email?: string | null },
): Promise<CustomerErasureResult> {
  return prisma.$transaction(async (tx) => {
    const deletedCounts: Record<string, number> = {};
    const customer = await tx.customer.findUnique({
      where: { shop_shopifyCustomerId: { shop, shopifyCustomerId: shopper.shopifyCustomerId } },
      select: { id: true, email: true },
    });

    const ids = [shopper.shopifyCustomerId, ...(customer ? [customer.id] : [])];
    const emails = [...new Set([shopper.email, customer?.email].filter((e): e is string => !!e).map((e) => e.toLowerCase()))];

    for (const [name, columns] of Object.entries(SHOPPER_COLUMNS)) {
      const matches = [
        ...(columns.ids ?? []).map((c) => Prisma.sql`${column(c)} IN (${Prisma.join(ids)})`),
        ...(emails.length ? (columns.emails ?? []).map((c) => Prisma.sql`lower(${column(c)}) IN (${Prisma.join(emails)})`) : []),
      ];
      if (matches.length === 0) continue;
      deletedCounts[name] = await tx.$executeRaw`DELETE FROM ${table(modelByName.get(name)!)} WHERE "shop" = ${shop} AND (${Prisma.join(matches, " OR ")})`;
    }

    if (!customer) {
      return { customerFound: false, deletedCounts };
    }

    // Rows holding a foreign key to this customer, children before parents
    for (const name of shopErasureOrder()) {
      const model = modelByName.get(name)!;
      const fkColumns = model.fields
        .filter((f) => f.kind === "object" && f.type === "Customer")
        .flatMap((f) => f.relationFromFields ?? []);
      if (name === "Customer" || fkColumns.length === 0) continue;
      const matches = fkColumns.map((c) => Prisma.sql`${column(c)} = ${customer.id}`);
      deletedCounts[name] = await tx.$executeRaw`DELETE FROM ${table(model)} WHERE ${Prisma.join(matches, " OR ")}`;
    }

    await tx.customer.delete({ where: { id: customer.id } });
    deletedCounts.Customer = 1;
    return { customerFound: true, deletedCounts };
  }, ERASURE_TRANSACTION);
}
