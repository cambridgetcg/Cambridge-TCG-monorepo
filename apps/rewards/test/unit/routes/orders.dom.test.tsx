// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// The pages' loaders are replaced by the stub's hydration data; nothing here
// reaches Shopify or the database. The answers' submits are not clicked
// here (a fetcher submit builds a Node Request, which refuses jsdom's
// AbortSignal): what the loaders read and how the answers act are in the
// Postgres suite (orders-page).
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

const { default: Orders } = await import("~/routes/app.orders._index");
const { default: Order } = await import("~/routes/app.orders.$id");

const LIST = {
  page: 1,
  needsLookOnly: false,
  needsLook: 1,
  hasNext: false,
  hasPrevious: false,
  rows: [
    { id: "o2", name: "#1002", buyer: "Ann Smith", customerId: "c1", tierName: "Gold", ratePercent: "10", total: "£60.00", cashback: "£6.00", status: "Needs a look" as const, detail: "Shopify refused it." },
    { id: "o1", name: "#1001", buyer: "Erased buyer", customerId: null, tierName: null, ratePercent: null, total: "£30.00", cashback: null, status: "No cashback" as const, detail: "Cashback was off" },
  ],
};

/** Renders the list and waits for `ready` to show. */
async function renderList(data: typeof LIST, ready: string) {
  const Stub = createRoutesStub([{ id: "routes/app.orders._index", path: "/app/orders", Component: Orders }]);
  render(<Stub initialEntries={["/app/orders"]} hydrationData={{ loaderData: { "routes/app.orders._index": data } }} />);
  await screen.findByText(ready);
}

const PANEL = {
  id: "o2",
  name: "#1002",
  buyer: "Ann Smith",
  customerId: "c1",
  buyerAdminUrl: "shopify://admin/customers/8001",
  processed: "June 1, 2026",
  total: "£60.00",
  productValue: "£50.00",
  storeCreditUsed: "£10.00",
  giftCardUsed: "£0.00",
  cashbackBase: "£40.00",
  status: { label: "Needs a look" as const, detail: "RewardsPro couldn't confirm it arrived." },
  notes: [] as string[],
  entries: [
    {
      date: "June 6, 2026",
      orderId: "o2",
      orderName: "#1002",
      label: "Taken back for a refund",
      amount: "-£1.00",
      tierName: "Gold",
      ratePercent: "10",
      status: "Taken back",
      detail: "Took back £0.40 of £1.00; the buyer had spent the rest",
    },
  ],
  payouts: [
    {
      id: "p1",
      what: "Store credit" as const,
      amount: "£4.00",
      state: "Needs a look",
      sent: null,
      attempts: 1,
      look: {
        heading: "Cashback of £4.00 needs a look",
        text: "RewardsPro couldn't confirm it arrived.",
        hint: "Check the buyer's store credit in Shopify first. If you already added it by hand, choose It arrived.",
        answers: [
          { answer: "arrived" as const, label: "It arrived" },
          { answer: "not_arrived" as const, label: "It didn't arrive, send it" },
        ],
      },
    },
  ],
  refunds: [{ date: "June 6, 2026", productValue: "£20.00", takenBack: "£1.00", note: null }],
};

async function renderPanel() {
  const Stub = createRoutesStub([{ id: "routes/app.orders.$id", path: "/app/orders/:id", Component: Order }]);
  render(<Stub initialEntries={["/app/orders/o2"]} hydrationData={{ loaderData: { "routes/app.orders.$id": PANEL } }} />);
  await screen.findByText("It arrived");
}

const cells = (scope: ParentNode = document) =>
  [...scope.querySelectorAll("s-table-body s-table-row")].map((row) =>
    [...row.querySelectorAll("s-table-cell")].map((cell) => cell.textContent?.trim()),
  );

afterEach(() => {
  cleanup();
});

describe("Orders list", () => {
  it("shows each order's buyer, tier chip, total, cashback and status, and points to the ones that need a look", async () => {
    await renderList(LIST, "#1002");
    expect(cells()).toEqual([
      ["#1002", "Ann Smith", "Gold 10%", "£60.00", "£6.00", "Needs a lookShopify refused it."],
      ["#1001", "Erased buyer", "", "£30.00", "None", "No cashbackCashback was off"],
    ]);
    expect(document.querySelector('s-link[href="/app/orders/o2"]')).not.toBeNull();
    expect(document.querySelector("s-banner")?.textContent).toContain("1 order needs a look.");
    expect(document.querySelector('s-banner s-link[href="?look=1"]')?.textContent).toBe("Show them");
  });

  it("says when no order needs a look", async () => {
    await renderList({ ...LIST, needsLookOnly: true, needsLook: 0, rows: [] }, "No orders need a look.");
    expect(document.querySelector("s-banner")).toBeNull();
  });
});

describe("Order panel", () => {
  it("shows the order, the shortfall in words, payouts and refunds, and the answers with the check to make first", async () => {
    await renderPanel();
    const text = document.body.textContent ?? "";
    expect(document.querySelector("s-banner")?.getAttribute("heading")).toBe("Cashback of £4.00 needs a look");
    expect(text).toContain("Check the buyer's store credit in Shopify first. If you already added it by hand, choose It arrived.");
    expect(document.querySelector('s-banner s-link[href="shopify://admin/customers/8001"]')).not.toBeNull();
    expect(text).toContain("Took back £0.40 of £1.00; the buyer had spent the rest");
    expect(text).toContain("Cashback base: £40.00");
    expect([...document.querySelectorAll('s-banner s-button[slot="secondary-actions"]')].map((button) => button.textContent)).toEqual([
      "It arrived",
      "It didn't arrive, send it",
    ]);
    expect(cells(document.querySelector('s-section[heading="Payouts"]')!)).toEqual([["Store credit", "£4.00", "Needs a look", "Not sent", "1"]]);
    expect(cells(document.querySelector('s-section[heading="Refunds"]')!)).toEqual([["June 6, 2026", "£20.00", "£1.00"]]);
  });
});
