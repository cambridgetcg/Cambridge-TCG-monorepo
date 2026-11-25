// @vitest-environment jsdom
// What three pages say about a completed trade, by whether the buyer's payment
// is recorded: the seller's trade page, the admin's market row, and the line on
// the admin's payouts page for the trades its list leaves out.
import { act, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "t1" }),
  usePathname: () => "/",
  useRouter: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

import TradePage from "@/app/account/trades/[id]/page";
import AdminMarketPage from "@/app/admin/market/page";
import AdminPayoutsPage from "@/app/admin/payouts/page";

let container: HTMLDivElement;
let root: Root;

/** Answers by URL; anything else is a 404. */
function serve(bodies: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    url in bodies ? Response.json(bodies[url]) : Response.json({}, { status: 404 })));
}
/** Mounts the page afresh and reads its text. */
async function show(Page: ComponentType) {
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<Page />));
  // Let the chained requests settle.
  for (let i = 0; i < 8; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
  return text();
}
const text = () => container.textContent!.replace(/\s+/g, " ");

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

const PAID_AT = "2026-10-02 00:00:00+00";
const trade = (over: Record<string, unknown> = {}) => ({
  id: "t1", sku: "X", card_name: "Card", price: "10.00", quantity: 1,
  commission_rate: "0.0800", commission_amount: "0.80", seller_payout: "9.20",
  escrow_status: "completed", escrow_tier: "full_escrow", seller_ships_to: "ctcg",
  requires_photos: false, requires_inspection: false, dispute_window_hours: 168, payout_hold_days: 5,
  created_at: "2026-10-01 00:00:00+00", buyer_paid_at: null, completed_at: "2026-11-01 00:00:00+00", seller_paid_at: null,
  stripe_payment_intent: "pi_1", buyer_id: "b", seller_id: "s", ...over,
});

describe("the trade page", () => {
  const as = (viewer: "b" | "s", over: Record<string, unknown>) => {
    serve({
      "/api/auth/session": { user: { id: viewer, email: `${viewer}@example.test` } },
      "/api/market/trades/t1": { trade: trade(over) },
      "/api/trust/disputes?trade_id=t1": { disputes: [] },
    });
    return show(TradePage);
  };

  it("tells the seller that no payout is due when no payment is recorded", async () => {
    const seen = await as("s", { buyer_paid_at: null });
    expect(seen).toContain("No buyer payment is recorded for this trade, so no payout is due. If the buyer has paid, contact support.");
    expect(seen).not.toContain("Your payout of");
  });
  it("tells the seller of the payout when the buyer paid, held or not", async () => {
    const held = await as("s", { buyer_paid_at: PAID_AT });
    expect(held).toContain("Your payout of £9.20 is released 5 days after completion.");
    expect(held).not.toContain("No buyer payment is recorded");
    expect(await as("s", { buyer_paid_at: PAID_AT, payout_hold_days: 0 })).toContain("Your payout of £9.20 is eligible for release.");
  });
  it("tells the buyer nothing about it", async () => {
    const seen = await as("b", { buyer_paid_at: null });
    expect(seen).toContain("This trade is complete.");
    expect(seen).not.toContain("No buyer payment is recorded");
  });
});

describe("the admin's market row", () => {
  async function open(over: Record<string, unknown>) {
    serve({ "/api/admin/overview": {}, "/api/market/trades?admin=true": { trades: [trade(over)] } });
    await show(AdminMarketPage);
    const row = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("£0.80 fee"));
    await act(async () => row!.click());
    return text();
  }

  it("offers no payout on a trade with no recorded payment, and does not call it paid", async () => {
    const seen = await open({ buyer_paid_at: null });
    expect(seen).toContain("No payment recorded: £10.00");
    expect(seen).not.toContain("Paid: £10.00");
    expect(seen).toContain("No buyer payment is recorded, so no payout is owed.");
    expect(seen).not.toContain("Record Payout");
  });
  it("offers the payout on a paid trade", async () => {
    const seen = await open({ buyer_paid_at: PAID_AT });
    expect(seen).toContain("Paid: £10.00");
    expect(seen).toContain("Record Payout (£9.20)");
    expect(seen).not.toContain("No buyer payment is recorded");
    expect(await open({ buyer_paid_at: PAID_AT, escrow_status: "shipped_to_buyer" })).not.toContain("Record Payout");
  });
  it("records the payout of the trade it is on", async () => {
    vi.stubGlobal("prompt", () => "bank_transfer");
    vi.stubGlobal("alert", () => {});
    await open({ buyer_paid_at: PAID_AT });
    await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Record Payout"))!.click());
    expect(vi.mocked(fetch).mock.lastCall).toEqual(["/api/market/trades/t1/payout", expect.objectContaining({ method: "POST" })]);
  });
  it("shows a payout already recorded, whatever the buyer's payment", async () => {
    for (const buyer_paid_at of [PAID_AT, null]) {
      const seen = await open({ buyer_paid_at, seller_paid_at: "2026-11-03 00:00:00+00", payout_method: "bank_transfer" });
      expect(seen).toContain("via bank_transfer");
      expect(seen).not.toContain("Record Payout");
    }
  });
});

describe("the admin's payouts page", () => {
  const list = (over: Record<string, unknown>) => {
    serve({ "/api/admin/overview": {}, "/api/admin/payouts/outstanding": { rows: [], totalOwedGbp: 0, overdueCount: 0, ...over } });
    return show(AdminPayoutsPage);
  };

  it("counts the completed trades its list leaves out", async () => {
    expect(await list({ completedNotOwedCount: 1 })).toContain(
      "1 completed trade is not listed and not owed: no buyer payment (or no completion time) is recorded. Find it in Market under All Tiers, Completed.",
    );
    expect(await list({ completedNotOwedCount: 71 })).toContain(
      "71 completed trades are not listed and not owed: no buyer payment (or no completion time) is recorded. Find them in Market under All Tiers, Completed.",
    );
  });
  it("says nothing when there are none", async () => {
    const seen = await list({ completedNotOwedCount: 0 });
    expect(seen).toContain("No outstanding payouts.");
    expect(seen).not.toContain("not owed");
  });
});
