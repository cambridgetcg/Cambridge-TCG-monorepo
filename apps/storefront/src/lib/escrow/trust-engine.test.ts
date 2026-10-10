import { beforeEach, describe, expect, it, vi } from "vitest";

// No database: every query the engine issues is answered by fakeDb below.
const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/social/db", () => ({
  awardAchievement: vi.fn(() => Promise.resolve()),
  postActivity: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/notifications/db", () => ({ notify: vi.fn(() => Promise.resolve()) }));

import {
  calculateTrustScore,
  canTrade,
  getTrustTier,
  recalculateTrustProfile,
} from "./trust-engine";
import { resolveTrustTier } from "./trust-tier";

const USER = "11111111-1111-4111-8111-111111111111";

// A trust_profiles row as Postgres returns it (NUMERIC columns as strings).
const storedRow = {
  user_id: USER,
  trust_score: 0,
  trade_limit: "50.00",
  daily_limit: "100.00",
  is_flagged: false,
  is_suspended: false,
  suspended_reason: null,
};

const flat = (sql: string) => sql.replace(/\s+/g, " ").trim();

/**
 * Answer the engine's queries. `row: null` models the trust_profiles row
 * being absent at the final read (it cascades with users).
 */
function fakeDb(opts: {
  row: Record<string, unknown> | null;
  dailyVolume?: string;
  // Override the raw rows of the final SELECT, to model a driver or mock
  // handing back [null] / [undefined] instead of an empty result.
  missingRows?: unknown[];
}) {
  mocks.query.mockImplementation(async (sql: string) => {
    const s = flat(sql);
    if (s.startsWith("SELECT * FROM trust_profiles")) {
      if (opts.missingRows) return { rows: opts.missingRows, rowCount: opts.missingRows.length };
      return opts.row ? { rows: [opts.row], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (s.includes("as vol FROM market_trades")) {
      return { rows: [{ vol: opts.dailyVolume ?? "0" }], rowCount: 1 };
    }
    // Upsert, scoring reads (no trades, reviews, signals, reps, disputes)
    // and the UPDATEs all come back empty.
    return { rows: [], rowCount: 0 };
  });
}

const dailyVolumeQueried = () =>
  mocks.query.mock.calls.some(([sql]) => flat(sql as string).includes("as vol FROM market_trades"));

beforeEach(() => {
  mocks.query.mockReset();
});

describe("a missing trust_profiles row fails closed", () => {
  // Before the breakdown was attached, the engine returned rows[0] — undefined
  // — and canTrade threw on profile.is_suspended, aborting every caller. The
  // first cut of the breakdown returned { ...undefined, breakdown }: no
  // is_suspended, and parseFloat(undefined) is NaN, against which every limit
  // check is false. canTrade said allowed: true.

  it("recalculateTrustProfile resolves undefined, not a profile built around the breakdown", async () => {
    fakeDb({ row: null });
    await expect(recalculateTrustProfile(USER)).resolves.toBeUndefined();
  });

  it("calculateTrustScore resolves undefined, exactly as it did before the breakdown", async () => {
    fakeDb({ row: null });
    const profile = await calculateTrustScore(USER);
    expect(profile).toBeUndefined();
  });

  it.each([0, 0.01, 10, 49.99, 1_000_000])(
    "canTrade refuses a £%s trade instead of allowing it",
    async (value) => {
      fakeDb({ row: null });
      const gate = await canTrade(USER, value);
      expect(gate.allowed).toBe(false);
      expect(gate.reason).toMatch(/trust profile could not be loaded/i);
      // Refused before any limit arithmetic, not by it.
      expect(dailyVolumeQueried()).toBe(false);
    },
  );

  it("canTrade never says allowed: true without a row, whatever the daily volume", async () => {
    for (const dailyVolume of ["0", "99999"]) {
      fakeDb({ row: null, dailyVolume });
      const gate = await canTrade(USER, 0);
      expect(gate).not.toMatchObject({ allowed: true });
    }
  });

  // The differential review found the looser cases came from all three shapes
  // of "no row" at the final read, not only an empty result.
  it.each([
    ["[]", []],
    ["[null]", [null]],
    ["[undefined]", [undefined]],
  ])("rows %s: no profile, and canTrade refuses any value at any daily volume", async (_label, missingRows) => {
    for (const dailyVolume of ["0", "99999"]) {
      for (const value of [0, 0.01, 16_554.43, 1_000_000]) {
        fakeDb({ row: null, dailyVolume, missingRows });
        await expect(recalculateTrustProfile(USER)).resolves.toBeUndefined();
        mocks.query.mockClear();
        const gate = await canTrade(USER, value);
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toMatch(/trust profile could not be loaded/i);
        expect(dailyVolumeQueried()).toBe(false);
      }
    }
  });
});

describe("a present row is gated exactly as before", () => {
  it("returns the stored row with the breakdown attached", async () => {
    fakeDb({ row: storedRow });
    const profile = await calculateTrustScore(USER);
    expect(profile).toMatchObject(storedRow);
    expect(profile.breakdown?.score).toBe(0);
  });

  it("allows a trade within both limits", async () => {
    fakeDb({ row: storedRow, dailyVolume: "40" });
    await expect(canTrade(USER, 10)).resolves.toEqual({ allowed: true, warnings: [] });
  });

  it("refuses a trade over the per-trade limit", async () => {
    fakeDb({ row: storedRow });
    const gate = await canTrade(USER, 50.01);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/exceeds your limit of £50\.00/);
  });

  it("refuses a trade that would cross the daily limit", async () => {
    fakeDb({ row: storedRow, dailyVolume: "95" });
    const gate = await canTrade(USER, 10);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/Daily trading limit/);
  });

  it("refuses a suspended account", async () => {
    fakeDb({ row: { ...storedRow, is_suspended: true, suspended_reason: "chargeback" } });
    const gate = await canTrade(USER, 1);
    expect(gate).toMatchObject({ allowed: false, reason: "Account suspended: chargeback" });
  });

  it("warns, but still gates, a flagged account", async () => {
    fakeDb({ row: { ...storedRow, is_flagged: true }, dailyVolume: "0" });
    const gate = await canTrade(USER, 1);
    expect(gate.allowed).toBe(true);
    expect(gate.warnings).toHaveLength(1);
  });
});

describe("the tier GET /api/escrow/trust sends resolves on /account/trust", () => {
  // The route sends getTrustTier(score) — an object. The page compared it to
  // each tier's name string, so every account rendered as New.
  const boundaries: [number, string, number, number][] = [
    [0, "New", 50, 100],
    [19, "New", 50, 100],
    [20, "Starter", 150, 500],
    [49, "Starter", 150, 500],
    [50, "Trusted", 500, 2000],
    [79, "Trusted", 500, 2000],
    [80, "Veteran", 2000, 10000],
    [94, "Veteran", 2000, 10000],
    [95, "Elite", 10000, 50000],
    [100, "Elite", 10000, 50000],
  ];

  it.each(boundaries)("score %i → %s (£%i per trade, £%i daily)", (score, name, trade, daily) => {
    const onTheWire = JSON.parse(JSON.stringify({ tier: getTrustTier(score) })).tier;
    const tier = resolveTrustTier(onTheWire);
    expect(tier).toMatchObject({ name, tradeLimit: trade, dailyLimit: daily });
  });
});
