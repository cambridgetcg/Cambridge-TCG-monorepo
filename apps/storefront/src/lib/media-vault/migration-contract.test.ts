import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0121_collector_media_vault.sql"),
  "utf8",
);

describe("collector media vault migration contract", () => {
  it("stores opaque keys but no URL or public-read shape", () => {
    const table = migration.slice(
      migration.indexOf("CREATE TABLE collector_media_vault"),
      migration.indexOf("CREATE INDEX collector_media_vault_owner_created_idx"),
    );

    expect(table).toContain("object_key");
    expect(table).not.toMatch(/\burl\b/i);
    expect(table).not.toMatch(/public[_ -]?read/i);
    expect(table).not.toMatch(/acl/i);
  });

  it("enforces type, byte, pixel, dimension, status, and key constraints", () => {
    expect(migration).toContain("source_mime_type IN ('image/jpeg', 'image/png', 'image/webp')");
    expect(migration).toContain("source_bytes BETWEEN 1 AND 3145728");
    expect(migration).toContain("stored_bytes BETWEEN 1 AND 3145728");
    expect(migration).toContain("<= 40000000");
    expect(migration).toContain("width BETWEEN 1 AND 4096");
    expect(migration).toContain("status IN ('pending', 'ready', 'deleting')");
    expect(migration).toContain("cleanup_claimed_at");
    expect(migration).toContain("collector_media_vault_cleanup_claim_idx");
    expect(migration).toContain("[0-9a-f]{64}[.]webp");
  });

  it("serializes and reserves the 20-object and 100-MiB owner quotas", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("current_objects >= 20");
    expect(migration).toContain("current_bytes + p_stored_bytes > 104857600");
    expect(migration).toContain("'pending'");
    expect(migration).toContain("INTERVAL '24 hours'");
  });

  it("blocks owner deletion instead of silently orphaning S3 objects", () => {
    expect(migration).toContain("REFERENCES users(id) ON DELETE RESTRICT");
    expect(migration).not.toContain("REFERENCES users(id) ON DELETE CASCADE");
  });
});
