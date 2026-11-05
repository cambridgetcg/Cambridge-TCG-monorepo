import { beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_WINDOW_MS, rateLimiterForTests } from "~/shopify/proxy.server";

/**
 * The app proxy's in-memory rate limit (plan Decision 18): its map of recent
 * requests is swept of quiet keys once it is full, and at most once a window
 * (A16-F3), so a map whose keys are all still active isn't walked on every
 * request.
 */

// The limiter never reaches the library; ~/shopify.server would build the app (and check the database) as it loads
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

const { waitFor, keys, reset, SWEEP_AT } = rateLimiterForTests;

describe("the proxy's rate limit map", () => {
  beforeEach(() => reset());

  it("sweeps a full map at most once a window (M2b-F6)", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < SWEEP_AT; i++) expect(waitFor(`shop:${i}`, t0)).toBe(0);
    expect(keys()).toBe(SWEEP_AT);

    // Half a window on, the full map is swept; every key is still active, so none goes
    waitFor("shop:a", t0 + RATE_WINDOW_MS / 2);
    expect(keys()).toBe(SWEEP_AT + 1);

    // The first keys are now out of the window, but the last sweep was less than a window ago: no sweep
    waitFor("shop:b", t0 + RATE_WINDOW_MS + 1);
    expect(keys()).toBe(SWEEP_AT + 2);

    // A window after the sweep, the next request sweeps every quiet key away
    waitFor("shop:c", t0 + RATE_WINDOW_MS * 1.5);
    expect(keys()).toBe(2);
  });
});
