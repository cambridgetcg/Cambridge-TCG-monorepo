import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  throw new Error("@cambridge-tcg/db: DATABASE_URL environment variable is required");
});

import { deriveCollectorHealth, readLatestCollectorBatch, type CollectorBatchRead } from "./collector-health";

const DAY = 86_400;
const NOW = Date.parse("2026-10-29T12:00:00.000Z");
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
/** The newest batch `hoursAgo`, holding `observations`; the newest batch that recorded any at `observedHoursAgo`. */
const at = (hoursAgo: number, observations = 300, observedHoursAgo: number | null = observations > 0 ? hoursAgo : null): CollectorBatchRead => ({
  available: true,
  latest: { inserted_at: ago(hoursAgo), source_rows: 300, missing_prices: 2, quarantined: 4, observed: observations > 0 },
  latest_observed_at: observedHoursAgo === null ? null : ago(observedHoursAgo),
});

describe("page collector health from member_price_batches", () => {
  it("is healthy within the budget, stale past it and very stale past twice it", () => {
    expect(deriveCollectorHealth(at(2), DAY, NOW)).toEqual({ health: "healthy", reason: "latest batch with observations within freshness budget" });
    expect(deriveCollectorHealth(at(30), DAY, NOW)).toEqual({ health: "stale", reason: "latest batch with observations written 30.0h ago; freshness budget 24.0h" });
    expect(deriveCollectorHealth(at(49), DAY, NOW)).toEqual({ health: "very_stale", reason: "latest batch with observations written 49.0h ago; freshness budget 24.0h (2x exceeded)" });
  });

  it("is failing, not healthy, when the batches written within the budget hold quarantine only", () => {
    // The run that read every price guide without a result array: one empty batch per set, minutes ago.
    expect(deriveCollectorHealth(at(0.2, 0), DAY, NOW)).toEqual({
      health: "failing", reason: "batches written within the freshness budget 24.0h recorded no observations; no batch has recorded an observation",
    });
    expect(deriveCollectorHealth(at(0.2, 0, 30), DAY, NOW)).toEqual({
      health: "failing", reason: "batches written within the freshness budget 24.0h recorded no observations; latest batch with observations written 30.0h ago",
    });
    // Within the budget something was observed: the empty newest batch (one refused host, one failed set) does not decide.
    expect(deriveCollectorHealth(at(0.2, 0, 3), DAY, NOW).health).toBe("healthy");
  });

  it("goes stale by the newest batch that recorded observations once nothing is written", () => {
    expect(deriveCollectorHealth(at(30, 0, 40), DAY, NOW)).toEqual({ health: "stale", reason: "latest batch with observations written 40.0h ago; freshness budget 24.0h" });
    expect(deriveCollectorHealth(at(30, 0, 50), DAY, NOW).health).toBe("very_stale");
    expect(deriveCollectorHealth(at(30, 0), DAY, NOW)).toEqual({
      health: "stale", reason: "latest batch written 30.0h ago and no batch has recorded an observation; freshness budget 24.0h",
    });
  });

  it("says never_run when the collector has written nothing, and unknown with the reason when it cannot tell", () => {
    expect(deriveCollectorHealth({ available: true, latest: null, latest_observed_at: null }, DAY, NOW).health).toBe("never_run");
    expect(deriveCollectorHealth({ available: false, reason: "member_price_batches could not be read" }, DAY, NOW))
      .toEqual({ health: "unknown", reason: "member_price_batches could not be read" });
  });

  it("reads the newest batch's time and counts only, and whether it recorded observations without counting them", async () => {
    const runQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("to_regclass")) return { rows: [{ provisioned: true }] };
      expect(params).toEqual(["cardrush"]);
      expect(sql).toContain("ORDER BY b.id DESC LIMIT 1");
      expect(sql).not.toMatch(/quarantine\s*(,|FROM)/);
      expect(sql).toContain("EXISTS (SELECT 1 FROM member_price_observations o WHERE o.batch_id = b.id) AS observed");
      expect(sql).not.toMatch(/count\(\*\) FROM member_price_observations/);
      return { rows: [{ id: "41", inserted_at: new Date("2026-10-29T10:15:00.000Z"), source_rows: "320", missing_prices: 0, quarantined: 3, observed: true }] };
    });
    await expect(readLatestCollectorBatch("cardrush", runQuery)).resolves.toEqual({
      available: true,
      latest: { inserted_at: "2026-10-29T10:15:00.000Z", source_rows: 320, missing_prices: 0, quarantined: 3, observed: true },
      latest_observed_at: "2026-10-29T10:15:00.000Z",
    });
    expect(runQuery).toHaveBeenCalledTimes(2);
  });

  it("looks further back for the newest batch that recorded observations when the newest recorded none", async () => {
    const runQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("to_regclass")) return { rows: [{ provisioned: true }] };
      if (sql.includes("b.id < $2")) {
        expect(params).toEqual(["tcgplayer", "41"]);
        expect(sql).toMatch(/b\.id < \$2::bigint[\s\S]*ORDER BY b\.id DESC LIMIT 1/);
        return { rows: [{ inserted_at: new Date("2026-10-29T04:45:00.000Z") }] };
      }
      return { rows: [{ id: "41", inserted_at: new Date("2026-10-29T10:45:00.000Z"), source_rows: "0", missing_prices: 0, quarantined: 1, observed: false }] };
    });
    await expect(readLatestCollectorBatch("tcgplayer", runQuery)).resolves.toEqual({
      available: true,
      latest: { inserted_at: "2026-10-29T10:45:00.000Z", source_rows: 0, missing_prices: 0, quarantined: 1, observed: false },
      latest_observed_at: "2026-10-29T04:45:00.000Z",
    });
  });

  it("returns available:false, never throwing, when the table or the database is missing", async () => {
    await expect(readLatestCollectorBatch("tcgplayer", async () => ({ rows: [{ provisioned: false }] })))
      .resolves.toEqual({ available: false, reason: "member_price_batches is not provisioned (migration 0137)" });
    await expect(readLatestCollectorBatch("tcgplayer", async () => { throw new Error("connection refused: private host detail"); }))
      .resolves.toEqual({ available: false, reason: "member_price_batches could not be read" });
    await expect(readLatestCollectorBatch("tcgplayer"))
      .resolves.toEqual({ available: false, reason: "the storefront database is not configured here" });
  });
});
