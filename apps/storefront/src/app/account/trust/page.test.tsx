// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The engine is imported only for getTrustTier — the exact function the
// route uses to build the `tier` field — so its database never loads.
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/social/db", () => ({ awardAchievement: vi.fn(), postActivity: vi.fn() }));
vi.mock("@/lib/notifications/db", () => ({ notify: vi.fn() }));
// One router for every render: the page's load effect depends on it, so a
// fresh object per render would re-run the effect forever.
const router = vi.hoisted(() => ({ push: () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// Money reads a currency context the root layout provides; render the raw
// GBP figure so the assertions are about which tier's limits reached it.
vi.mock("@/lib/ui", () => ({
  Audience: () => null,
  WhyLink: () => null,
  Money: ({ value }: { value: number }) => <span>£{value}</span>,
}));

import { getTrustTier, computeTrustBreakdown } from "@/lib/escrow/trust-engine";
import type { TrustScoreBreakdown } from "@/lib/escrow/types";
import TrustProfilePage from "./page";

const HISTORY = [
  { snapshot_date: "2026-10-01", trust_score: 10 },
  { snapshot_date: "2026-10-02", trust_score: 12 },
];

function profileFor(score: number, breakdown?: TrustScoreBreakdown) {
  return {
    user_id: "u1",
    trust_score: score,
    total_reviews: 0,
    avg_rating: "0.00",
    completed_trades: 0,
    cancelled_trades: 0,
    disputed_trades: 0,
    disputes_won: 0,
    disputes_lost: 0,
    is_suspended: false,
    suspended_reason: null,
    ...(breakdown ? { breakdown } : {}),
  };
}

let container: HTMLDivElement;
let root: Root;

function serve(trust: Record<string, unknown>) {
  const bodies: Record<string, unknown> = {
    "/api/auth/session": { user: { email: "collector@example.test" } },
    "/api/escrow/trust": trust,
    "/api/escrow/external-rep": { accounts: [] },
    "/api/account/trust/history": { history: HISTORY },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url in bodies
        ? { ok: true, json: async () => bodies[url] }
        : { ok: false, json: async () => ({}) },
    ),
  );
}

async function render(node: ReactNode) {
  await act(async () => root.render(node));
  // Let the session → trust/external-rep → history fetch chains settle.
  for (let i = 0; i < 5; i++) {
    await act(async () => new Promise((r) => setTimeout(r, 0)));
  }
}

function card(heading: string): HTMLElement {
  const h = [...container.querySelectorAll("h3")].find((e) => e.textContent?.startsWith(heading));
  expect(h, `card "${heading}"`).toBeDefined();
  return h!.parentElement as HTMLElement;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("/account/trust shows the tier the score earns", () => {
  // GET /api/escrow/trust sends `tier: getTrustTier(score)` — an object. The
  // page compared it to each tier's name, never matched, and rendered every
  // account as New with New-tier limits.
  // The hold column is the trust-tier FLOOR: settlement takes the longer of
  // it and the escrow route's own hold (reconcileHold), and auctions hold a
  // flat 3 days, so the page must never state it as the hold itself.
  const boundaries: [number, string, number, number, string, boolean][] = [
    [0, "New", 50, 100, "held for at least 7 days;", true],
    [19, "New", 50, 100, "held for at least 7 days;", true],
    [20, "Starter", 150, 500, "held for at least 5 days;", true],
    [49, "Starter", 150, 500, "held for at least 5 days;", true],
    [50, "Trusted", 500, 2000, "held for at least 3 days;", false],
    [79, "Trusted", 500, 2000, "held for at least 3 days;", false],
    [80, "Veteran", 2000, 10000, "held for at least 1 day;", false],
    [94, "Veteran", 2000, 10000, "held for at least 1 day;", false],
    [95, "Elite", 10000, 50000, "No trust-tier hold.", false],
    [100, "Elite", 10000, 50000, "No trust-tier hold.", false],
  ];

  it.each(boundaries)(
    "score %i renders %s with £%i per trade and £%i daily",
    async (score, name, trade, daily, hold, inspection) => {
      serve({
        profile: profileFor(score),
        reviews: [],
        tier: JSON.parse(JSON.stringify(getTrustTier(score))),
        tradeCheck: { allowed: true, warnings: [] },
      });
      await render(<TrustProfilePage />);

      expect(container.querySelector("h2")?.textContent).toBe(`${name} Tier`);
      const limits = card("Trade Limits").textContent;
      expect(limits).toContain(`Per-trade limit£${trade}`);
      expect(limits).toContain(`Daily limit£${daily}`);
      const payout = card("Payout Hold").textContent!;
      expect(payout).toContain(hold);
      expect(payout).toMatch(/auctions/i);
      // No tier is promised a hold shorter than the one settlement applies.
      expect(payout).not.toMatch(/instant/i);
      expect(payout.includes("Escrow inspection required")).toBe(inspection);
    },
  );

  it.each([
    [10, "Starter", "Payout hold: at least 5 days on market trades"],
    [60, "Veteran", "Payout hold: at least 1 day on market trades"],
    [90, "Elite", "No trust-tier payout hold (the escrow route can still hold up to 3 days"],
  ])("score %i states the %s hold as a floor in the Next Tier card", async (score, next, line) => {
    serve({ profile: profileFor(score), reviews: [], tier: getTrustTier(score) });
    await render(<TrustProfilePage />);

    const text = card(`Next Tier: ${next}`).textContent!;
    expect(text).toContain(line);
    expect(text).not.toMatch(/instant/i);
  });

  it("still resolves a bare tier name", async () => {
    serve({ profile: profileFor(60), reviews: [], tier: "Trusted" });
    await render(<TrustProfilePage />);
    expect(container.querySelector("h2")?.textContent).toBe("Trusted Tier");
  });
});

describe("/account/trust score breakdown card", () => {
  it("says the breakdown is unavailable when it is absent, and keeps the history sparkline", async () => {
    serve({ profile: profileFor(42), reviews: [], tier: getTrustTier(42) });
    await render(<TrustProfilePage />);

    const breakdownCard = card("Score Breakdown");
    expect(breakdownCard.textContent).toContain("Score breakdown unavailable");
    expect(breakdownCard.textContent).toContain("score of 42");
    // No bars invented in its place.
    expect(breakdownCard.textContent).not.toContain("Completion rate");
    expect(breakdownCard.textContent).toContain("Last 90 days");
  });

  it("renders the engine's components and the sparkline when the breakdown is present", async () => {
    const breakdown = computeTrustBreakdown({
      totalTrades: 5,
      completedTrades: 4,
      avgRating: 3,
      totalVolume: 100,
      monthsActive: 2,
      externalRepCount: 1,
      openDisputes: 1,
      disputesLost: 0,
      disputesSplit: 0,
      fraudSignals: 0,
    });
    serve({ profile: profileFor(breakdown.score, breakdown), reviews: [], tier: getTrustTier(breakdown.score) });
    await render(<TrustProfilePage />);

    const text = card("Score Breakdown").textContent;
    expect(text).not.toContain("Score breakdown unavailable");
    expect(text).toContain("65 earned − 10 in penalties = 55.");
    expect(text).toContain("Completion rate28/35");
    expect(text).toContain("1 open dispute (−10 each)");
    expect(text).toContain("Last 90 days");
  });
});
