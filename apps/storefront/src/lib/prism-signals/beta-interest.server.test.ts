import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import {
  deletePrismSignalsBetaInterest,
  getPrismSignalsBetaInterest,
  prismSignalsBetaIntakeEnabled,
  purgeInactiveProductBetaInterests,
  upsertPrismSignalsBetaInterest,
} from "./beta-interest.server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const originalMode = process.env.PRISM_SIGNALS_BETA_MODE;

function row() {
  return {
    product_id: "prism-signals",
    channel_preferences: ["web", "telegram"],
    consent_version: "prism-signals-beta-contact-2026-09-02",
    requested_at: new Date("2026-09-02T10:00:00.000Z"),
    updated_at: "2026-09-02T11:00:00.000Z",
    expires_at: "2027-03-01T11:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRISM_SIGNALS_BETA_MODE = "closed-beta-v1";
});

afterEach(() => {
  if (originalMode === undefined) delete process.env.PRISM_SIGNALS_BETA_MODE;
  else process.env.PRISM_SIGNALS_BETA_MODE = originalMode;
});

describe("PRISM Signals beta-interest DAL", () => {
  it("performs no storage query when new intake is disabled", async () => {
    delete process.env.PRISM_SIGNALS_BETA_MODE;
    await expect(
      upsertPrismSignalsBetaInterest("user-a", {
        channel_preferences: ["web"],
        contact_consent: true,
      }),
    ).rejects.toThrow("intake is not enabled");
    expect(query).not.toHaveBeenCalled();
  });

  it("enables only the exact trimmed closed-beta posture", () => {
    for (const value of [undefined, "", "closed-beta", "CLOSED-BETA-V1"]) {
      if (value === undefined) delete process.env.PRISM_SIGNALS_BETA_MODE;
      else process.env.PRISM_SIGNALS_BETA_MODE = value;
      expect(prismSignalsBetaIntakeEnabled()).toBe(false);
    }
    process.env.PRISM_SIGNALS_BETA_MODE = "  closed-beta-v1  ";
    expect(prismSignalsBetaIntakeEnabled()).toBe(true);
  });

  it("keeps owner reads, deletion, and retention available when intake is disabled", async () => {
    delete process.env.PRISM_SIGNALS_BETA_MODE;
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 });

    await expect(getPrismSignalsBetaInterest("user-a")).resolves.toBeNull();
    await expect(deletePrismSignalsBetaInterest("user-a")).resolves.toBe(true);
    await expect(purgeInactiveProductBetaInterests()).resolves.toBe(2);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("purges only expired or superseded PRISM rows and returns an aggregate", async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 3 });
    await expect(purgeInactiveProductBetaInterests()).resolves.toBe(3);
    expect(vi.mocked(query).mock.calls[0]?.[0]).toMatch(
      /product_id = \$1[\s\S]*expires_at <= NOW\(\)[\s\S]*consent_version <> \$2/,
    );
    expect(vi.mocked(query).mock.calls[0]?.[1]).toEqual([
      "prism-signals",
      "prism-signals-beta-contact-2026-09-02",
    ]);
  });

  it("returns an owner DTO through one read-only current-consent SELECT", async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [row()], rowCount: 1 });

    await expect(getPrismSignalsBetaInterest("user-a")).resolves.toEqual({
      schema: "cambridgetcg.prism-signals-beta-interest/1",
      product_id: "prism-signals",
      channel_preferences: ["web", "telegram"],
      consent_version: "prism-signals-beta-contact-2026-09-02",
      requested_at: "2026-09-02T10:00:00.000Z",
      updated_at: "2026-09-02T11:00:00.000Z",
      expires_at: "2027-03-01T11:00:00.000Z",
    });
    expect(query).toHaveBeenCalledOnce();
    expect(vi.mocked(query).mock.calls[0]?.[0]).toMatch(
      /WHERE user_id = \$1[\s\S]*product_id = \$2[\s\S]*consent_version = \$3[\s\S]*expires_at > NOW\(\)/,
    );
    expect(vi.mocked(query).mock.calls[0]?.[0].trim()).toMatch(/^SELECT /);
    expect(vi.mocked(query).mock.calls[0]?.[0]).not.toMatch(/DELETE|UPDATE|INSERT/);
    expect(vi.mocked(query).mock.calls[0]?.[1]).toEqual([
      "user-a",
      "prism-signals",
      "prism-signals-beta-contact-2026-09-02",
    ]);
  });

  it("returns null when the owner SELECT excludes stale state", async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(getPrismSignalsBetaInterest("user-a")).resolves.toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it("stores canonical preferences and refreshes a fixed 180-day expiry only on POST", async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [row()], rowCount: 1 });
    await upsertPrismSignalsBetaInterest("user-a", {
      channel_preferences: ["telegram", "web"],
      contact_consent: true,
    });

    const [sql, params] = vi.mocked(query).mock.calls[0]!;
    expect(sql).toMatch(/ON CONFLICT \(user_id, product_id\)/);
    expect(sql).toMatch(/expires_at = NOW\(\) \+ \(\$5 \* INTERVAL '1 day'\)/);
    expect(sql).toMatch(/requested_at = CASE/);
    expect(params).toEqual([
      "user-a",
      "prism-signals",
      ["web", "telegram"],
      "prism-signals-beta-contact-2026-09-02",
      180,
    ]);
  });

  it("fully removes only the signed-in owner's product row", async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(deletePrismSignalsBetaInterest("user-a")).resolves.toBe(true);
    const [sql, params] = vi.mocked(query).mock.calls[0]!;
    expect(sql.trim()).toMatch(/^DELETE FROM product_beta_interests/);
    expect(sql).toMatch(/WHERE user_id = \$1 AND product_id = \$2/);
    expect(params).toEqual(["user-a", "prism-signals"]);
  });
});
