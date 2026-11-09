import { describe, expect, it, vi } from "vitest";

// payouts.server imports the app's Prisma client, which needs a database
// URL; nextAttemptAt never touches it.
vi.mock("~/db.server", () => ({ default: {} }));

import { KEEP_TRYING_MS, nextAttemptAt } from "~/lib/payouts.server";

const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
const t0 = new Date("2026-11-05T10:30:00Z");

describe("nextAttemptAt (plan Decision 3)", () => {
  it("waits min(2^(attempts - 1), 8) hours after a failed send", () => {
    expect(nextAttemptAt(1, t0)).toEqual(addHours(t0, 1));
    expect(nextAttemptAt(2, t0)).toEqual(addHours(t0, 2));
    expect(nextAttemptAt(3, t0)).toEqual(addHours(t0, 4));
    expect(nextAttemptAt(4, t0)).toEqual(addHours(t0, 8));
    expect(nextAttemptAt(9, t0)).toEqual(addHours(t0, 8));
    expect(nextAttemptAt(2000, t0)).toEqual(addHours(t0, 8));
  });

  it("retries at about 1, 3, 7, 15 and 23 hours, then the next failure is past the 24 h of trying", () => {
    let at = t0;
    const offsets: number[] = [];
    for (let attempts = 1; attempts <= 6; attempts++) {
      at = nextAttemptAt(attempts, at);
      offsets.push((at.getTime() - t0.getTime()) / 3_600_000);
    }
    expect(offsets).toEqual([1, 3, 7, 15, 23, 31]);
    expect(addHours(t0, 31).getTime() - t0.getTime()).toBeGreaterThanOrEqual(KEEP_TRYING_MS);
  });

  it("treats a count below one as the first attempt", () => {
    expect(nextAttemptAt(0, t0)).toEqual(addHours(t0, 1));
    expect(nextAttemptAt(Number.NaN, t0)).toEqual(addHours(t0, 1));
  });
});
