import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { databaseSchema } from "~/db.server";
import { failNextCall, hasTestDatabase, resetDatabase, restoreFailedCalls } from "./helpers/database";

/** One merchant with one store, one buyer and one cashback entry. */
async function seedMerchant(domain: string) {
  const merchant = await prisma.merchant.create({
    data: { name: domain, currency: "GBP", timezone: "Europe/London" },
  });
  const connection = await prisma.connection.create({
    data: {
      merchantId: merchant.id,
      platform: "shopify",
      externalAccountId: domain,
      status: "active",
      installedAt: new Date("2026-11-01T00:00:00Z"),
      activatedAt: new Date("2026-11-01T00:00:00Z"),
    },
  });
  const customer = await prisma.customer.create({
    data: {
      merchantId: merchant.id,
      connectionId: connection.id,
      // The numeric id, the form OrderFacts and the app proxy use (A3)
      externalCustomerId: String(7000 + domain.length),
    },
  });
  const entry = await prisma.ledgerEntry.create({
    data: {
      merchantId: merchant.id,
      connectionId: connection.id,
      customerId: customer.id,
      kind: "cashback",
      amount: new Prisma.Decimal("2.5000"),
      currency: "GBP",
      shopAmount: new Prisma.Decimal("2.5000"),
      idempotencyKey: `cashback:${domain}`,
    },
  });
  return { merchant, connection, customer, entry };
}

/** A pending credit payout of one ledger entry; `overrides` changes any field. */
function payoutData(
  { merchant, customer, entry }: Awaited<ReturnType<typeof seedMerchant>>,
  overrides: Partial<Prisma.PayoutUncheckedCreateInput> = {},
): Prisma.PayoutUncheckedCreateInput {
  return {
    merchantId: merchant.id,
    ledgerEntryId: entry.id,
    customerId: customer.id,
    rail: "shopify_store_credit",
    direction: "credit",
    amount: new Prisma.Decimal("2.5000"),
    currency: "GBP",
    state: "pending",
    nextAttemptAt: new Date("2026-11-01T00:00:00Z"),
    ...overrides,
  };
}

/**
 * The client logs each refused query (log: ["error"]) through console.log.
 * Tests that expect a refusal keep that out of the output and check it.
 */
function captureQueryErrorLogs() {
  return vi.spyOn(console, "log").mockImplementation(() => {});
}

describe.skipIf(!hasTestDatabase)("database baseline", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    restoreFailedCalls();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("applied every migration, the init first, and nothing is rolled back", async () => {
    const migrations = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >(`SELECT migration_name, finished_at, rolled_back_at FROM "${databaseSchema}"._prisma_migrations ORDER BY migration_name`);
    const onDisk = readdirSync(fileURLToPath(new URL("../../prisma/migrations/", import.meta.url)), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(migrations.map((m) => m.migration_name)).toEqual(onDisk);
    expect(onDisk[0]).toBe("20261105000000_init");
    for (const migration of migrations) {
      expect(migration.finished_at, migration.migration_name).not.toBeNull();
      expect(migration.rolled_back_at, migration.migration_name).toBeNull();
    }
  });

  it("has a table in schema rewards for every Prisma model", async () => {
    expect(databaseSchema).toBe("rewards");
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name::text AS table_name FROM information_schema.tables
      WHERE table_schema = ${databaseSchema} AND table_type = 'BASE TABLE'`;
    const tables = rows.map((row) => row.table_name);

    const models = Prisma.dmmf.datamodel.models.map((model) => model.dbName ?? model.name);
    expect(models).toHaveLength(12);
    for (const table of models) expect(tables).toContain(table);
  });

  it("refuses UPDATE and DELETE on ledger_entry", async () => {
    // The trigger is FOR EACH ROW: it fires only when there is a row to change.
    await seedMerchant("ledger.myshopify.com");
    const logs = captureQueryErrorLogs();

    await expect(prisma.$executeRawUnsafe(`UPDATE "${databaseSchema}".ledger_entry SET amount = 0`)).rejects.toThrow(
      /append-only/,
    );
    await expect(prisma.ledgerEntry.deleteMany({})).rejects.toThrow(/append-only/);
    expect(await prisma.ledgerEntry.count()).toBe(1);
    expect(logs).toHaveBeenCalledWith(expect.stringContaining("prisma:error"), expect.stringMatching(/append-only/));
  });

  it("refuses TRUNCATE on ledger_entry", async () => {
    // A statement trigger: it fires on an empty table too.
    captureQueryErrorLogs();

    await expect(prisma.$executeRawUnsafe(`TRUNCATE "${databaseSchema}".ledger_entry CASCADE`)).rejects.toThrow(
      /append-only/,
    );
    // Through a table that cascades to it, as well.
    await expect(prisma.$executeRawUnsafe(`TRUNCATE "${databaseSchema}".merchant CASCADE`)).rejects.toThrow(
      /append-only/,
    );
  });

  it("allows DELETE on ledger_entry inside an erasure transaction", async () => {
    const { merchant } = await seedMerchant("erased.myshopify.com");

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL rewards.erasing = 'on'`);
      return tx.ledgerEntry.deleteMany({ where: { merchantId: merchant.id } });
    });

    expect(deleted.count).toBe(1);
    expect(await prisma.ledgerEntry.count()).toBe(0);
    // SET LOCAL ends with its transaction: the next delete is refused again.
    await seedMerchant("after.myshopify.com");
    captureQueryErrorLogs();
    await expect(prisma.ledgerEntry.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it("refuses a ledger entry whose customer belongs to another merchant", async () => {
    const own = await seedMerchant("own.myshopify.com");
    const other = await seedMerchant("other.myshopify.com");
    captureQueryErrorLogs();

    await expect(
      prisma.ledgerEntry.create({
        data: {
          merchantId: own.merchant.id,
          connectionId: own.connection.id,
          customerId: other.customer.id,
          kind: "cashback",
          amount: new Prisma.Decimal("1.0000"),
          currency: "GBP",
          shopAmount: new Prisma.Decimal("1.0000"),
          idempotencyKey: "cashback:cross-merchant",
        },
      }),
    ).rejects.toThrow(/ledger_entry_merchant_id_customer_id_fkey/);
    expect(await prisma.ledgerEntry.count({ where: { merchantId: own.merchant.id } })).toBe(1);
  });

  it("refuses a payout of zero (unless nothing_to_send) and a needs_look payout without a reason", async () => {
    const seeded = await seedMerchant("payout.myshopify.com");
    captureQueryErrorLogs();

    await expect(
      prisma.payout.create({ data: payoutData(seeded, { amount: new Prisma.Decimal("0.0000") }) }),
    ).rejects.toThrow(/payout_amount_positive/);
    await expect(
      prisma.payout.create({
        data: payoutData(seeded, { amount: new Prisma.Decimal("-1.0000"), state: "nothing_to_send" }),
      }),
    ).rejects.toThrow(/payout_amount_positive/);
    await expect(prisma.payout.create({ data: payoutData(seeded, { state: "needs_look" }) })).rejects.toThrow(
      /payout_needs_look_has_reason/,
    );
    expect(await prisma.payout.count()).toBe(0);

    // The same payout with a positive amount and a reason is accepted, and is
    // the entry's one payout.
    await prisma.payout.create({ data: payoutData(seeded, { state: "needs_look", lookReason: "refused" }) });
    const entry = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: seeded.entry.id },
      include: { payout: true },
    });
    expect(entry.payout?.state).toBe("needs_look");
  });

  it("accepts a payout of zero when there is nothing to send (Ruling 22)", async () => {
    const seeded = await seedMerchant("nothing.myshopify.com");

    const payout = await prisma.payout.create({
      data: payoutData(seeded, { amount: new Prisma.Decimal("0.0000"), state: "nothing_to_send" }),
    });

    expect(payout.amount.toFixed(4)).toBe("0.0000");
    expect(payout.state).toBe("nothing_to_send");
  });

  it("opens one privacy request per Shopify request id, and keeps requests with none apart", async () => {
    const { merchant, connection } = await seedMerchant("privacy.myshopify.com");
    const request = (shopifyRequestId: string | null) => ({
      merchantId: merchant.id,
      connectionId: connection.id,
      externalCustomerId: "7021",
      shopifyRequestId,
      ordersRequested: [],
      status: "open" as const,
      receivedAt: new Date("2026-11-05T00:00:00Z"),
      dueAt: new Date("2026-12-05T00:00:00Z"),
      expiresAt: new Date("2026-12-05T00:00:00Z"),
    });
    captureQueryErrorLogs();

    await prisma.privacyRequest.create({ data: request("9001") });
    await expect(prisma.privacyRequest.create({ data: request("9001") })).rejects.toThrow(
      /Unique constraint failed on the fields: \(`connection_id`,`shopify_request_id`\)/,
    );
    await prisma.privacyRequest.create({ data: request(null) });
    await prisma.privacyRequest.create({ data: request(null) });

    expect(await prisma.privacyRequest.count()).toBe(3);
  });

  it("indexes the foreign keys the ledger, refunds, payouts and buyers are found by", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname::text AS indexname FROM pg_indexes WHERE schemaname = ${databaseSchema}`;
    const names = rows.map((row) => row.indexname);

    for (const name of [
      "ledger_entry_merchant_id_order_id_idx",
      "ledger_entry_merchant_id_customer_id_idx",
      "ledger_entry_merchant_id_refund_id_idx",
      "refund_merchant_id_order_id_idx",
      "payout_merchant_id_customer_id_idx",
      "customer_merchant_id_tier_id_idx",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("fails the next call of a model method once, then calls through", async () => {
    const error = new Error("connection dropped");
    failNextCall("merchant", "create", error);
    const data = { name: "flaky.myshopify.com", currency: "GBP", timezone: "Europe/London" };

    await expect(prisma.merchant.create({ data })).rejects.toBe(error);
    expect(await prisma.merchant.count()).toBe(0);
    const merchant = await prisma.merchant.create({ data });
    expect(merchant.name).toBe("flaky.myshopify.com");

    restoreFailedCalls();
    expect(await prisma.merchant.count()).toBe(1);
  });

  it("grants nothing on schema rewards to PUBLIC", async () => {
    const [privileges] = await prisma.$queryRaw<Array<{ usage: boolean; create: boolean }>>`
      SELECT has_schema_privilege('public', ${databaseSchema}, 'USAGE') AS usage,
             has_schema_privilege('public', ${databaseSchema}, 'CREATE') AS create`;

    expect(privileges).toEqual({ usage: false, create: false });
  });
});
