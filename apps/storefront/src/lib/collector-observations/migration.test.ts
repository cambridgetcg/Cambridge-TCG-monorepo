import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL("../../../drizzle/0121_collector_publication_pause.sql", import.meta.url),
  ),
  "utf8",
);

describe("Collector Witness publication-pause migration", () => {
  it("makes v2 current without rewriting earlier consent records", () => {
    expect(migration).toContain("SET DEFAULT 'collector-witness-v2'");
    expect(migration).not.toMatch(/UPDATE\s+collector_observations/i);
  });

  it("keeps CC0 choice and its active receipt equivalent", () => {
    expect(migration).toContain(
      "(sharing_mode = 'cc0') = (cc0_acknowledged_at IS NOT NULL)",
    );
  });

  it("names the old live-query index and table contract as future-only", () => {
    expect(migration).toContain(
      "RENAME TO collector_observations_future_projection_idx",
    );
    expect(migration).toContain("public projection is paused");
    expect(migration).toContain("authorizes no public read");
  });
});
