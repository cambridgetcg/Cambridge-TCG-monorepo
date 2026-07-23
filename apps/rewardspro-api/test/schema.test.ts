import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("initial schema invariants", () => {
  it("keeps idempotency connection-scoped and provider ownership on connections", async () => {
    const sql = await readFile(
      new URL("../migrations/0001_commerce_event_foundation.sql", import.meta.url),
      "utf8",
    );

    expect(sql).toContain("UNIQUE (commerce_connection_id, external_event_id)");
    expect(sql).not.toMatch(
      /CREATE TABLE rp_commerce_event[\s\S]*?\n\s+provider text/,
    );
    expect(sql).toContain("payload_retention_until");
    expect(sql).toContain("capabilities jsonb");
    expect(sql).toContain("sync_cursor jsonb");
    expect(sql).toContain("credential_reference text");
  });
});
