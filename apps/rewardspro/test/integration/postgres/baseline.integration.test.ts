import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import prisma, { databaseSchema } from "~/db.server";
import { hasTestDatabase } from "./database";

// CI also runs `prisma migrate diff --exit-code` against this database, which
// proves the applied migrations match prisma/schema.prisma exactly.
describe.skipIf(!hasTestDatabase)("baseline migration", () => {
  it("applied the baseline first and every migration finished", async () => {
    const migrations = await prisma.$queryRaw<
      Array<{ migration_name: string; finished: boolean; rolled_back: boolean }>
    >`SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
      FROM ${Prisma.raw(`"${databaseSchema}"."_prisma_migrations"`)} ORDER BY migration_name`;

    expect(migrations[0]?.migration_name).toBe("20261018000000_baseline");
    expect(migrations.every((m) => m.finished && !m.rolled_back)).toBe(true);
  });

  it("created a table for every model, in the app schema", async () => {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname = ${databaseSchema}`;
    const present = new Set(tables.map((t) => t.tablename));
    const missing = Prisma.dmmf.datamodel.models
      .map((model) => model.dbName ?? model.name)
      .filter((table) => !present.has(table));

    expect(missing).toEqual([]);
  });

  it("includes the models the crons and email gating need", async () => {
    await expect(prisma.cronLock.count()).resolves.toBeTypeOf("number");
    await expect(prisma.monthlyEmailUsage.count()).resolves.toBeTypeOf("number");
    await expect(prisma.subscriptionProcessingLock.count()).resolves.toBeTypeOf("number");
  });
});
