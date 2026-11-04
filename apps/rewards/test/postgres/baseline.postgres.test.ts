import { Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { databaseSchema } from "~/db.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

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
    },
  });
  const customer = await prisma.customer.create({
    data: {
      merchantId: merchant.id,
      connectionId: connection.id,
      externalCustomerId: `gid://shopify/Customer/${domain.length}`,
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
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("applied the init migration and nothing is rolled back", async () => {
    const migrations = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >(`SELECT migration_name, finished_at, rolled_back_at FROM "${databaseSchema}"._prisma_migrations`);

    expect(migrations).toHaveLength(1);
    expect(migrations[0].migration_name).toBe("20261105000000_init");
    expect(migrations[0].finished_at).not.toBeNull();
    expect(migrations[0].rolled_back_at).toBeNull();
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

  it("grants nothing on schema rewards to PUBLIC", async () => {
    const [privileges] = await prisma.$queryRaw<Array<{ usage: boolean; create: boolean }>>`
      SELECT has_schema_privilege('public', ${databaseSchema}, 'USAGE') AS usage,
             has_schema_privilege('public', ${databaseSchema}, 'CREATE') AS create`;

    expect(privileges).toEqual({ usage: false, create: false });
  });
});
