import { describe, expect, it, vi } from "vitest";

import { checkDatabase } from "../src/db.js";

function readyPool() {
  const query = vi.fn(async (_sql: string) => ({ rows: [{ ready: true }] }));
  return { pool: { query } as never, query };
}

describe("database readiness boundary", () => {
  it("requires the complete pinned YUTABASE and commerce projection shape", async () => {
    const { pool, query } = readyPool();

    await expect(checkDatabase(pool, "worker")).resolves.toBeUndefined();

    const relationSql = String(query.mock.calls[0]?.[0]);
    const boundarySql = String(query.mock.calls[1]?.[0]);
    for (const relation of [
      "lexicon_versions",
      "sever_log",
      "word_versions",
      "thread_ids",
    ]) {
      expect(relationSql).toContain(`'yu', '${relation}'`);
      expect(boundarySql).toContain(`'yu', '${relation}'`);
    }
    for (const column of [
      "external_customer_id",
      "total_amount",
      "paid_at",
      "position",
      "external_product_id",
      "external_variant_id",
      "quantity",
      "unit_price_amount",
      "unit_price_currency",
    ]) {
      expect(relationSql).toContain(`'${column}'`);
    }
  });

  it("rejects column grants, inbound memberships, and an inexact function", async () => {
    const { pool, query } = readyPool();

    await expect(checkDatabase(pool, "api")).resolves.toBeUndefined();

    const boundarySql = String(query.mock.calls[1]?.[0]);
    expect(boundarySql).toContain("forbidden_column_privilege");
    expect(boundarySql).toContain("has_any_column_privilege");
    expect(boundarySql).toContain("membership.roleid = runtime_oid");
    expect(boundarySql).toContain("language.lanname = 'plpgsql'");
    expect(boundarySql).toContain("routine.prokind = 'f'");
    expect(boundarySql).toContain("routine.provolatile = 'v'");
    expect(boundarySql).toContain("routine.proretset");
    expect(boundarySql).toContain("pg_catalog.cardinality(routine.proconfig) = 2");
    expect(boundarySql).toContain("pg_catalog.acldefault('f', routine.owner_oid)");
    expect(boundarySql).toContain("acl.grantee = roles.runtime_oid");
    expect(boundarySql).toContain("NOT acl.is_grantable");
    expect(boundarySql).toContain("acl.grantee <> routine.owner_oid");
  });

  it("requires the worker to lack the ingest capability", async () => {
    const { pool, query } = readyPool();

    await expect(checkDatabase(pool, "worker")).resolves.toBeUndefined();

    const boundarySql = String(query.mock.calls[1]?.[0]);
    expect(boundarySql).toContain(
      "NOT COALESCE(\n           pg_catalog.has_function_privilege(",
    );
    expect(boundarySql).toContain("SELECT count(*) = 1");
    expect(boundarySql).toContain("JOIN pg_catalog.pg_roles api_role");
    expect(boundarySql).toContain("api_role.rolcanlogin");
    expect(boundarySql).toContain("membership.member = api_role.oid");
    expect(boundarySql).toContain("membership.roleid = roles.reader_oid");
    expect(boundarySql).toContain("membership.roleid = api_role.oid");
  });
});
