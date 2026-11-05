// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// The page's loader and action are replaced by the stub's hydration data;
// nothing here reaches Shopify or the database. Saves and deletes run in the
// Postgres suite (a fetcher submission builds a Node Request, which refuses
// jsdom's AbortSignal).
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

const { default: Tiers } = await import("~/routes/app.tiers");

const TIERS = [
  { id: "t0", name: "Bronze", minSpend: "0", percent: "5", members: 14, lowest: true },
  { id: "t1", name: "Gold", minSpend: "500", percent: "10", members: 1, lowest: false },
];

async function renderTiers(tiers = TIERS, tierWindow = "rolling_12_months") {
  const Stub = createRoutesStub([{ id: "routes/app.tiers", path: "/app/tiers", Component: Tiers }]);
  render(
    <Stub
      initialEntries={["/app/tiers"]}
      hydrationData={{ loaderData: { "routes/app.tiers": { currency: "GBP", tierWindow, nameMax: 40, tiers } } }}
    />,
  );
  await screen.findByText("Cashback is paid on", { exact: false });
}

const rows = () =>
  [...document.querySelectorAll("s-table-body s-table-row")].map((row) =>
    [...row.querySelectorAll("s-table-cell")].map((cell) => cell.textContent?.trim()),
  );

afterEach(() => {
  cleanup();
});

describe("Tiers page", () => {
  it("lists each tier's name, minimum, cashback and members, the lowest starting everyone at 0", async () => {
    await renderTiers();
    expect(rows()).toEqual([
      ["Bronze", "£0.00Everyone starts here", "5%", "14 members", "Edit"],
      ["Gold", "£500.00", "10%", "1 member", "EditDelete"],
    ]);
  });

  it("says what cashback is paid on", async () => {
    await renderTiers();
    expect(document.body.textContent).toContain(
      "Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing.",
    );
  });

  it("offers the two windows, with the shop's chosen", async () => {
    await renderTiers(TIERS, "lifetime");
    const list = document.querySelector("s-choice-list");
    expect(list?.getAttribute("label")).toBe("Spend counted over");
    const choices = [...(list?.querySelectorAll("s-choice") ?? [])];
    expect(choices.map((c) => [c.getAttribute("value"), c.textContent, c.hasAttribute("selected")])).toEqual([
      ["rolling_12_months", "Last 12 months", false],
      ["lifetime", "All time", true],
    ]);
  });

  it("asks for a minimum when adding, and fixes the lowest tier's at 0 when editing it", async () => {
    await renderTiers();
    expect(document.querySelector('s-number-field[name="minSpend"]')).not.toBeNull();

    fireEvent.click(screen.getAllByText("Edit")[0]);
    await act(async () => {});
    expect(document.querySelector('s-section[heading="Edit Bronze"]')).not.toBeNull();
    expect(document.querySelector('s-number-field[name="minSpend"]')).toBeNull();
    expect(document.body.textContent).toContain("Minimum spend: £0.00");

    fireEvent.click(screen.getByText("Cancel", { selector: "s-section s-button" }));
    await act(async () => {});
    expect(document.querySelector('s-section[heading="Add a tier"]')).not.toBeNull();
  });

  it("starts a store's first tier at 0", async () => {
    await renderTiers([]);
    expect(document.body.textContent).toContain("No tiers yet.");
    expect(document.querySelector('s-number-field[name="minSpend"]')).toBeNull();
    expect(document.body.textContent).toContain("Everyone starts here");
  });

  it("explains a delete before it is made", async () => {
    await renderTiers();
    fireEvent.click(screen.getByText("Delete", { selector: "s-table-cell s-button" }));
    await act(async () => {});
    const modal = document.querySelector("s-modal");
    expect(modal?.getAttribute("heading")).toBe("Delete Gold?");
    expect(modal?.textContent).toContain(
      "1 member moves to the tier their spend qualifies for. Buyers locked to Gold go back to automatic.",
    );
  });
});
