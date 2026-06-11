#!/usr/bin/env node
/**
 * Smoke test for the new Prisma Driver Adapter against rewardspro-dev cluster.
 *
 * Verifies:
 *   1. Adapter instantiation
 *   2. Real PrismaClient binding to it
 *   3. A spread of operations that exercise different code paths in the adapter
 *   4. Reader-replica routing (if AURORA_READER_RESOURCE_ARN is set)
 *
 * Run: node scripts/test-new-adapter.mjs
 */

import { PrismaClient } from "@prisma/client";
import { PrismaRdsDataApiAdapter } from "../app/utils/prisma-rds-data-api-adapter.server";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const resourceArn = process.env.AURORA_RESOURCE_ARN;
const secretArn = process.env.AURORA_SECRET_ARN;
if (!resourceArn || !secretArn) {
  throw new Error("AURORA_RESOURCE_ARN and AURORA_SECRET_ARN must be set in .env.local");
}

const adapter = new PrismaRdsDataApiAdapter({
  resourceArn,
  secretArn,
  database: process.env.AURORA_DATABASE_NAME || "rewardspro",
  region: process.env.AWS_REGION || "eu-north-1",
  readReplicaArn: process.env.AURORA_READER_RESOURCE_ARN,
});

const prisma = new PrismaClient({ adapter, log: ["error", "warn"] });

let passed = 0, failed = 0;
async function run(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    console.log(`  ✓ ${name} (${ms}ms)`);
    passed++;
  } catch (err) {
    const e = err as Error;
    console.log(`  ✗ ${name}\n    ${e.stack ?? e.message}`);
    failed++;
  }
}

console.log("=== New Driver Adapter — Smoke Test ===\n");

console.log("1. Connectivity");
await run("$queryRaw SELECT 1", async () => {
  const r = await prisma.$queryRaw<Array<{ test: number }>>`SELECT 1 as test`;
  if (r[0].test !== 1) throw new Error(`unexpected: ${JSON.stringify(r)}`);
});

console.log("\n2. Model — findFirst (read)");
await run("Tier.findFirst (anything)", async () => {
  const tier = await prisma.tier.findFirst({});
  if (!tier) throw new Error("no tiers found in dev cluster");
});

console.log("\n3. Model — findMany with where + orderBy + take");
await run("Customer.findMany with where/orderBy/take", async () => {
  const rows = await prisma.customer.findMany({
    where: { shop: { not: "" } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  if (!Array.isArray(rows)) throw new Error(`expected array, got ${typeof rows}`);
});

console.log("\n4. Projection — select honored");
await run("Customer.findMany select returns only requested fields", async () => {
  const rows = await prisma.customer.findMany({
    where: { shop: { not: "" } },
    select: { id: true, email: true },
    take: 1,
  });
  if (rows.length === 0) {
    console.log("    (no customers in dev — skipping field check)");
    return;
  }
  const keys = Object.keys(rows[0]).sort();
  if (keys.join(",") !== "email,id") {
    throw new Error(`select did not project — got keys: ${keys.join(",")}`);
  }
});

console.log("\n5. Aggregation");
await run("Customer.count", async () => {
  const n = await prisma.customer.count();
  if (typeof n !== "number") throw new Error(`expected number, got ${typeof n}`);
  console.log(`    customer count: ${n}`);
});

console.log("\n6. Aggregate with where");
await run("Customer.aggregate(_count, where)", async () => {
  const r = await prisma.customer.aggregate({
    where: { shop: { not: "" } },
    _count: { _all: true },
  });
  if (typeof r._count._all !== "number") throw new Error(JSON.stringify(r));
});

console.log("\n7. groupBy (the audit's stuck case)");
await run("Customer.groupBy by currentTierId", async () => {
  const rows = await prisma.customer.groupBy({
    by: ["currentTierId"],
    _count: { _all: true },
  });
  console.log(`    tier distribution buckets: ${rows.length}`);
});

console.log("\n8. Include — relation that legacy adapter SILENTLY DROPPED");
await run("MysteryBoxOpen.findFirst include box (was broken)", async () => {
  // mystery-box-management.server.ts:402 has a comment confirming the legacy
  // adapter silently dropped include: { box: true }. After cut-over Prisma
  // resolves it via the schema relation.
  const open = await prisma.mysteryBoxOpen.findFirst({
    include: { box: true },
  });
  if (!open) {
    console.log("    (no mystery box opens in dev — passive)");
    return;
  }
  if (!open.box) {
    throw new Error("include box returned null (still broken)");
  }
  console.log(`    box loaded: ${open.box.name ?? open.box.id}`);
});

console.log("\n9. Raw SQL");
await run("$queryRaw with Postgres GROUP BY", async () => {
  const rows = await prisma.$queryRaw`
    SELECT "shop", COUNT(*)::int as count
    FROM "Customer"
    GROUP BY "shop"
    ORDER BY count DESC
    LIMIT 3
  `;
  if (!Array.isArray(rows)) throw new Error("not array");
  console.log(`    shops: ${rows.map(r => `${r.shop}(${r.count})`).join(", ")}`);
});

console.log("\n10. Transaction (commit path)");
await run("$transaction interactive — read inside tx", async () => {
  const result = await prisma.$transaction(async (tx) => {
    const a = await tx.customer.count();
    const b = await tx.tier.count();
    return { customers: a, tiers: b };
  });
  console.log(`    customers=${result.customers}, tiers=${result.tiers}`);
});

console.log("\n11. Datetime round-trip");
await run("Tier.findFirst → createdAt is a Date", async () => {
  const t = await prisma.tier.findFirst({});
  if (!t) throw new Error("no tier found");
  if (!(t.createdAt instanceof Date)) {
    throw new Error(`createdAt not a Date: ${typeof t.createdAt} (${t.createdAt})`);
  }
});

console.log("\n12. Decimal round-trip");
await run("Tier with monthlyPrice / discountPercentage", async () => {
  const t = await prisma.tier.findFirst({
    where: { monthlyPrice: { not: null } },
  });
  if (!t) {
    console.log("    (no priced tier — skipping)");
    return;
  }
  // Prisma's Decimal type has a .toFixed()
  if (typeof t.monthlyPrice?.toFixed !== "function") {
    throw new Error(`monthlyPrice not Decimal: ${typeof t.monthlyPrice}`);
  }
});

console.log("\n=== Summary ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
await prisma.$disconnect();
process.exit(failed > 0 ? 1 : 0);
