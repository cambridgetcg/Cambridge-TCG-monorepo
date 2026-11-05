// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// The pages' loaders are replaced by the stub's hydration data; nothing here
// reaches Shopify or the database. What the loaders read and how the lock
// acts are in the Postgres suite (customers-page).
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

const { default: Customers } = await import("~/routes/app.customers._index");
const { default: Buyer } = await import("~/routes/app.customers.$id");

const listData = (o: Partial<Record<string, unknown>> = {}) => ({
  query: "",
  tierId: "",
  page: 1,
  tiers: [
    { id: "t0", name: "Bronze", percent: "5" },
    { id: "t1", name: "Gold", percent: "10" },
  ],
  searchFailed: false,
  searchCut: false,
  hasNext: true,
  hasPrevious: false,
  rows: [
    { id: "c1", buyer: "Ann Smith", tierName: "Gold", tierPercent: "10", orders: 3, cashbackGiven: "£12.00" },
    { id: "c2", buyer: "Customer ····1234", tierName: null, tierPercent: null, orders: 0, cashbackGiven: "£0.00" },
  ],
  ...o,
});

async function renderList(data: ReturnType<typeof listData>) {
  const Stub = createRoutesStub([{ id: "routes/app.customers._index", path: "/app/customers", Component: Customers }]);
  render(<Stub initialEntries={["/app/customers"]} hydrationData={{ loaderData: { "routes/app.customers._index": data } }} />);
  await screen.findByText("Export CSV");
}

const PANEL = {
  id: "c1",
  buyer: "Ann Smith",
  adminUrl: "shopify://admin/customers/8001",
  tier: { id: "t0", name: "Bronze", percent: "5" },
  tierSince: "June 5, 2026",
  lockedTierId: null as string | null,
  tiers: [
    { id: "t0", name: "Bronze", percent: "5" },
    { id: "t1", name: "Gold", percent: "10" },
  ],
  spend: "£400.00",
  windowLabel: "Last 12 months",
  progress: { percent: 66, isTop: false, nextTierName: "Gold" as string | null, nextTierPercent: "10" as string | null, amountRemaining: "£100.00" },
  balance: null as string | null,
  history: [
    {
      date: "June 6, 2026",
      orderId: "o1",
      orderName: "#1001",
      label: "Taken back for a refund",
      amount: "-£0.50",
      tierName: "Bronze",
      ratePercent: "5",
      status: "Taken back",
      detail: "Amount taken back: unknown",
    },
  ],
  orders: [{ id: "o1", name: "#1001", processed: "June 1, 2026", total: "£100.00", cashback: null, note: "From before install" }],
};

async function renderPanel(data = PANEL) {
  const Stub = createRoutesStub([{ id: "routes/app.customers.$id", path: "/app/customers/:id", Component: Buyer }]);
  render(<Stub initialEntries={["/app/customers/c1"]} hydrationData={{ loaderData: { "routes/app.customers.$id": data } }} />);
  await screen.findByText("Adjust store credit in Shopify");
}

const cells = (scope: ParentNode = document) =>
  [...scope.querySelectorAll("s-table-body s-table-row")].map((row) =>
    [...row.querySelectorAll("s-table-cell")].map((cell) => cell.textContent?.trim()),
  );

afterEach(() => {
  cleanup();
});

describe("Customers list", () => {
  it("shows each buyer's name, tier chip, orders and cashback given, with paging", async () => {
    await renderList(listData());
    expect(cells()).toEqual([
      ["Ann Smith", "Gold 10%", "3", "£12.00"],
      ["Customer ····1234", "No tier", "0", "£0.00"],
    ]);
    expect(document.querySelector('s-link[href="/app/customers/c1"]')).not.toBeNull();
    const table = document.querySelector("s-table")!;
    expect(table.hasAttribute("paginate")).toBe(true);
    expect([...document.querySelectorAll("s-select s-option")].map((o) => o.textContent)).toEqual(["All tiers", "Bronze", "Gold"]);
  });

  it("says when no one matches, and when Shopify couldn't search", async () => {
    await renderList(listData({ rows: [], hasNext: false, tierId: "t1" }));
    expect(document.body.textContent).toContain("No buyers match.");
    cleanup();

    await renderList(listData({ rows: [], hasNext: false, query: "smith", searchFailed: true }));
    expect(document.querySelector("s-banner")?.textContent).toBe("Shopify didn't answer the search. Try again.");
  });
});

describe("Buyer panel", () => {
  it("shows tier, since when, progress, the balance's fallback, history and orders", async () => {
    await renderPanel();
    const text = document.body.textContent ?? "";
    expect(text).toContain("In this tier since June 5, 2026");
    expect(text).toContain("Spend counted (last 12 months): £400.00");
    expect(text).toContain("£100.00 more to reach Gold (10%)");
    expect(document.querySelector("s-progress")?.getAttribute("value")).toBe("66");
    expect(text).toContain("Shows at checkout");
    expect(text).toContain("Amount taken back: unknown");
    expect(text).toContain("From before install");
    expect(document.querySelector('s-button[href="shopify://admin/customers/8001"]')?.textContent).toBe("Adjust store credit in Shopify");
    expect(screen.getByText("Lock to a tier", { selector: "s-button" })).toBeTruthy();
  });

  it("offers Return to automatic for a locked buyer, and shows a known balance", async () => {
    await renderPanel({ ...PANEL, lockedTierId: "t1", balance: "£12.50" });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Locked to Gold.");
    expect(screen.getByText("Return to automatic", { selector: "s-button" })).toBeTruthy();
    expect(text).toContain("£12.50");
    expect(text).not.toContain("Shows at checkout");
  });
});
