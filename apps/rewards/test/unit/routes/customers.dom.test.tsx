// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  searchUnread: false,
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
  progress: {
    percent: 66,
    isTop: false,
    nextTierName: "Gold" as string | null,
    nextTierPercent: "10" as string | null,
    amountRemaining: "£100.00",
    movesTo: null as string | null,
  },
  balances: null as Array<{ currency: string; amount: string }> | null,
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
      tone: "neutral",
      detail: "Amount unknown",
    },
  ],
  orders: [
    { id: "o1", name: "#1001", processed: "June 1, 2026", total: "£100.00", cashback: null, status: "No cashback", tone: "neutral", notes: ["From before install"] },
    { id: "o2", name: "#1002", processed: "June 2, 2026", total: "£20.00", cashback: "£1.00", status: "Taken back", tone: "neutral", notes: [] },
  ],
};

async function renderPanel(data = PANEL) {
  const Stub = createRoutesStub([{ id: "routes/app.customers.$id", path: "/app/customers/:id", Component: Buyer }]);
  render(<Stub initialEntries={["/app/customers/c1"]} hydrationData={{ loaderData: { "routes/app.customers.$id": data } }} />);
  await screen.findByText("Open the buyer in Shopify");
}

const cells = (scope: ParentNode = document) =>
  [...scope.querySelectorAll("s-table-body s-table-row")].map((row) =>
    [...row.querySelectorAll("s-table-cell")].map((cell) => cell.textContent?.trim()),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  // A21-F4: "No buyers yet" only where it is true
  it("says no buyers yet only on page 1 with no filter, and offers page 1 from a page past the last", async () => {
    await renderList(listData({ rows: [], hasNext: false }));
    expect(document.body.textContent).toContain("No buyers yet. They appear here after their first paid order.");
    cleanup();

    await renderList(listData({ rows: [], hasNext: false, page: 4, hasPrevious: true }));
    expect(document.body.textContent).toContain("No buyers on this page.");
    expect(document.body.textContent).not.toContain("No buyers yet");
    expect(document.querySelector('s-link[href="/app/customers"]')?.textContent).toBe("Go to page 1");
    cleanup();

    await renderList(listData({ rows: [], hasNext: false, page: 3, hasPrevious: true, query: "ann", tierId: "t1" }));
    expect(document.body.textContent).toContain("No buyers on this page.");
    expect(document.querySelector('s-link[href="/app/customers?q=ann&tier=t1"]')?.textContent).toBe("Go to page 1");
  });

  // BOUNDARY-5
  it("says when Shopify couldn't read the search", async () => {
    await renderList(listData({ query: "name:x", searchUnread: true }));
    expect(document.body.textContent).toContain("Shopify couldn't read all of this search, so some buyers may be missing. Try other words.");
  });

  // Ruling 63 and A23-F4: the export's own words for a search cut short; anything that isn't a CSV is no file
  it("shows why the file couldn't be made", async () => {
    const answers = [
      new Response("Too many buyers match this search for one file. Narrow the search, or export without one.", {
        status: 422,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
      new Response("<html>Sign in</html>", { headers: { "Content-Type": "text/html" } }),
    ];
    const fetch = vi.fn(async () => answers.shift()!);
    vi.stubGlobal("fetch", fetch);
    await renderList(listData({ query: "a" }));

    await act(async () => {
      fireEvent.click(screen.getByText("Export CSV"));
    });
    expect(fetch.mock.calls[0]).toEqual(["/app/customers/export?q=a"]);
    expect(await screen.findByText("Too many buyers match this search for one file. Narrow the search, or export without one.")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Export CSV"));
    });
    expect(await screen.findByText("The file couldn't be made. Try again.")).toBeTruthy();
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
    expect(text).toContain("Amount unknown");
    expect(text).toContain("From before install");
    expect(document.querySelector('s-button[href="shopify://admin/customers/8001"]')?.textContent).toBe("Open the buyer in Shopify");
    // An admin page opens in the admin, not a new tab (docs Q3)
    expect(document.querySelector('s-button[href="shopify://admin/customers/8001"]')?.getAttribute("target")).toBe("_top");
    expect(screen.getByText("Lock", { selector: "s-button" })).toBeTruthy();
    expect(document.querySelector('s-select[label="Lock to a tier"]')).not.toBeNull();
  });

  // TRUTH-14: each order's status beside its cashback, as on Orders
  it("shows each order's status beside its cashback", async () => {
    await renderPanel();
    const orders = cells(document.querySelector('s-section[heading="Orders"]')!);
    expect(orders).toEqual([
      ["#1001From before install", "June 1, 2026", "£100.00", "None", "No cashback"],
      ["#1002", "June 2, 2026", "£20.00", "£1.00", "Taken back"],
    ]);
  });

  // A21-F2: spend doesn't move a locked buyer, so no progress shows
  it("offers Return to automatic for a locked buyer, with no progress, and shows a known balance in each currency", async () => {
    await renderPanel({
      ...PANEL,
      lockedTierId: "t1",
      balances: [
        { currency: "GBP", amount: "£12.50" },
        { currency: "EUR", amount: "€5.00" },
      ],
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Locked to Gold.");
    expect(text).toContain("Spend doesn't move this buyer while they're locked to Gold.");
    expect(document.querySelector("s-progress")).toBeNull();
    expect(text).not.toContain("more to reach");
    expect(screen.getByText("Return to automatic", { selector: "s-button" })).toBeTruthy();
    expect([...document.querySelectorAll('s-section[heading="Store credit"] s-heading')].map((h) => h.textContent)).toEqual(["£12.50", "€5.00"]);
    expect(text).not.toContain("Shows at checkout");
  });

  // TRUTH-11: a buyer the tier pass hasn't reached yet
  it("says a buyer who already qualifies for a higher tier moves at the next tier update", async () => {
    await renderPanel({ ...PANEL, progress: { ...PANEL.progress, percent: 99, amountRemaining: "£0.00", movesTo: "Gold" } });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Moves to Gold at the next tier update.");
    expect(document.querySelector("s-progress")).toBeNull();
    expect(text).not.toContain("£0.00 more");
  });
});
