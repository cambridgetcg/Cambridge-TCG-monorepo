import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  throw new Error("@cambridge-tcg/db: DATABASE_URL environment variable is required");
});

import {
  deriveCollectorHealth, deriveHostHealth, readCollectorHostStates, readLatestCollectorBatch, withHostHealth,
  type CollectorBatchRead, type CollectorHostsRead,
} from "./collector-health";
import type { CollectorHostRow } from "@/lib/datafeed/collector-hosts";

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

describe("collector health per host", () => {
  const SIX_HOURS = 6 * 3600;
  const row = (host: string, fields: Partial<CollectorHostRow>): CollectorHostRow => ({
    host, consecutiveRefusals: 0, lastSuccessAt: null, lastRefusalAt: null, lastRefusalReason: null, notBefore: null, suspendedAt: null, suspendedReason: null, ...fields,
  });
  const read = (source: string, rows: CollectorHostRow[]): CollectorHostsRead => ({ available: true, rows: new Map([[source, new Map(rows.map((entry) => [entry.host, entry]))]]) });
  const healthy = { health: "healthy" as const, reason: "latest batch with observations within freshness budget" };

  it("lists every host the collector reads, each in its own state", () => {
    const hosts = deriveHostHealth("cardrush", read("cardrush", [
      row("www.cardrush-op.jp", { lastSuccessAt: ago(2) }),
      row("www.cardrush-pokemon.jp", { consecutiveRefusals: 1, lastSuccessAt: ago(14), lastRefusalAt: ago(2), lastRefusalReason: "challenge-challenge", notBefore: ago(-4) }),
      row("www.cardrush-db.jp", { consecutiveRefusals: 3, lastRefusalAt: ago(1), lastRefusalReason: "http-403", notBefore: ago(-5), suspendedAt: ago(1), suspendedReason: "http-403" }),
      row("www.cardrush-digimon.jp", { consecutiveRefusals: 1, lastSuccessAt: ago(3), lastRefusalAt: ago(1), lastRefusalReason: "http-429", notBefore: ago(-5) }),
    ]), SIX_HOURS, NOW);
    expect(hosts.hosts_available).toBe(true);
    expect(hosts.hosts.map((host) => [host.host, host.state])).toEqual([
      ["www.cardrush-op.jp", "ok"], ["www.cardrush-pokemon.jp", "failing"], ["www.cardrush-db.jp", "suspended"],
      ["www.cardrush-digimon.jp", "refused"], ["www.cardrush-vanguard.jp", "never_run"], ["www.cardrush-bs.jp", "never_run"],
    ]);
    expect(hosts.hosts[2]).toEqual({
      host: "www.cardrush-db.jp", state: "suspended", consecutive_refusals: 3, last_success_at: null, last_refusal_at: ago(1), last_refusal_reason: "http-403",
      not_before: ago(-5), suspended_at: ago(1), suspended_reason: "http-403",
    });
  });

  it("reads failing, not healthy, when one host is refused on every recent run while another collects", () => {
    const hosts = deriveHostHealth("cardrush", read("cardrush", [
      row("www.cardrush-op.jp", { lastSuccessAt: ago(1) }),
      row("www.cardrush-pokemon.jp", { consecutiveRefusals: 2, lastSuccessAt: ago(30), lastRefusalAt: ago(3), lastRefusalReason: "challenge-challenge", notBefore: ago(-3) }),
    ]), SIX_HOURS, NOW);
    expect(withHostHealth(healthy, hosts.hosts, SIX_HOURS)).toEqual({
      health: "failing",
      reason: "www.cardrush-pokemon.jp refused on its last 2 runs (challenge-challenge) and not served within the freshness budget 6.0h; batches: latest batch with observations within freshness budget",
    });
  });

  it("reads repeated TCGplayer refusals as failing, not stale, and a suspension as failing whatever the batches say", () => {
    const refused = deriveHostHealth("tcgplayer", read("tcgplayer", [
      row("infinite-api.tcgplayer.com", { consecutiveRefusals: 2, lastSuccessAt: ago(9), lastRefusalAt: ago(1), lastRefusalReason: "http-429", notBefore: ago(-5) }),
    ]), SIX_HOURS, NOW);
    // A refused run writes no batch, so the batches alone read stale.
    const stale = deriveCollectorHealth(at(9), SIX_HOURS, NOW);
    expect(stale.health).toBe("stale");
    expect(withHostHealth(stale, refused.hosts, SIX_HOURS)).toMatchObject({ health: "failing", reason: expect.stringMatching(/^infinite-api\.tcgplayer\.com refused on its last 2 runs \(http-429\).*; batches: latest batch with observations written 9\.0h ago/) });
    const suspended = deriveHostHealth("tcgplayer", read("tcgplayer", [
      row("www.tcgplayer.com", { consecutiveRefusals: 3, lastSuccessAt: ago(2), lastRefusalAt: ago(1), lastRefusalReason: "robots-disallows-collector", suspendedAt: ago(1), suspendedReason: "robots-disallows-collector" }),
    ]), SIX_HOURS, NOW);
    expect(withHostHealth(healthy, suspended.hosts, SIX_HOURS)).toEqual({
      health: "failing", reason: "www.tcgplayer.com suspended after 3 refused runs in a row (robots-disallows-collector); batches: latest batch with observations within freshness budget",
    });
    expect(withHostHealth({ health: "never_run", reason: "no batch" }, suspended.hosts, SIX_HOURS).health).toBe("failing");
  });

  it("leaves the batches' health alone when no host is failing or suspended", () => {
    const hosts = deriveHostHealth("tcgplayer", read("tcgplayer", [
      row("infinite-api.tcgplayer.com", { consecutiveRefusals: 1, lastSuccessAt: ago(1), lastRefusalAt: ago(0.5), lastRefusalReason: "http-429", notBefore: ago(-1) }),
    ]), SIX_HOURS, NOW);
    expect(hosts.hosts.map((host) => host.state)).toEqual(["never_run", "never_run", "refused"]);
    expect(withHostHealth(healthy, hosts.hosts, SIX_HOURS)).toBe(healthy);
    const unavailable = deriveHostHealth("cardmarket", { available: false, reason: "price_collector_hosts is not provisioned (migration 0146)" }, 26 * 3600, NOW);
    expect(unavailable).toEqual({ hosts_available: false, hosts_reason: "price_collector_hosts is not provisioned (migration 0146)", hosts: [expect.objectContaining({ host: "downloads.s3.cardmarket.com", state: "unknown" })] });
    expect(withHostHealth(healthy, unavailable.hosts, 26 * 3600)).toBe(healthy);
  });

  it("reads every source's rows in one query, and returns available:false, never throwing", async () => {
    const runQuery = vi.fn(async (sql: string) => sql.includes("to_regclass") ? { rows: [{ provisioned: true }] } : { rows: [
      { source: "cardrush", host: "www.cardrush-op.jp", consecutive_refusals: 0, last_success_at: new Date(ago(1)), last_refusal_at: null, last_refusal_reason: null, not_before: null, suspended_at: null, suspended_reason: null },
      { source: "tcgplayer", host: "mpapi.tcgplayer.com", consecutive_refusals: 1, last_success_at: null, last_refusal_at: new Date(ago(1)), last_refusal_reason: "http-403", not_before: new Date(ago(-5)), suspended_at: null, suspended_reason: null },
    ] });
    const states = await readCollectorHostStates(runQuery);
    expect(runQuery).toHaveBeenCalledTimes(2);
    if (!states.available) throw new Error("expected rows");
    expect([...states.rows.keys()]).toEqual(["cardrush", "tcgplayer"]);
    expect(states.rows.get("tcgplayer")!.get("mpapi.tcgplayer.com")).toMatchObject({ consecutiveRefusals: 1, lastRefusalReason: "http-403" });
    await expect(readCollectorHostStates(async () => ({ rows: [{ provisioned: false }] }))).resolves.toEqual({ available: false, reason: "price_collector_hosts is not provisioned (migration 0146)" });
    await expect(readCollectorHostStates(async () => { throw new Error("connection refused: private host detail"); })).resolves.toEqual({ available: false, reason: "price_collector_hosts could not be read" });
    await expect(readCollectorHostStates()).resolves.toEqual({ available: false, reason: "the storefront database is not configured here" });
  });
});
