// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldsOf, letFetchersPost } from "../helpers/fetcher-posts";

// The page's loader and action are replaced by stand-ins; nothing here
// reaches Shopify or the database. What saves and deletes do runs in the
// Postgres suite (tiers-page); here a post goes to a stand-in action
// (letFetchersPost) that records it.
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

const { default: Tiers } = await import("~/routes/app.tiers");

// jsdom lays nothing out, so it has no scrollIntoView; Edit calls it
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;

const TIERS = [
  { id: "t0", name: "Bronze", minSpend: "0", percent: "5", members: 14, lowest: true, version: "2026-11-01T10:00:00.000Z" },
  { id: "t1", name: "Gold", minSpend: "500", percent: "10", members: 1, lowest: false, version: "2026-11-02T10:00:00.000Z" },
];

type Page = { currency: string; tierWindow: string; nameMax: number; moving: boolean; goneError: string; tiers: typeof TIERS };

const page = (o: Partial<Page> = {}): Page => ({
  currency: "GBP",
  tierWindow: "rolling_12_months",
  nameMax: 40,
  moving: false,
  goneError: "This tier is no longer there. Reload the page.",
  tiers: TIERS,
  ...o,
});

/**
 * The page with `first` as its data; each later load (the revalidation after
 * a post) reads `next()`. Each post goes to `posted`; `answer` is what the
 * action gives back (a promise that never settles keeps the post in flight).
 */
async function renderTiers(
  first: Page = page(),
  o: { next?: () => Page; posted?: Array<Record<string, string>>; answer?: () => Promise<unknown> } = {},
) {
  const Stub = createRoutesStub([
    {
      id: "routes/app.tiers",
      path: "/app/tiers",
      Component: Tiers,
      loader: () => (o.next ?? (() => first))(),
      action: async ({ request }) => {
        o.posted?.push(await fieldsOf(request));
        return o.answer ? o.answer() : { ok: true };
      },
    },
  ]);
  render(<Stub initialEntries={["/app/tiers"]} hydrationData={{ loaderData: { "routes/app.tiers": first } }} />);
  await screen.findByText("Cashback is paid on", { exact: false });
}

const rows = () =>
  [...document.querySelectorAll("s-table-body s-table-row")].map((row) =>
    [...row.querySelectorAll("s-table-cell")].map((cell) => cell.textContent?.trim()),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
    await renderTiers(page({ tierWindow: "lifetime" }));
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
    expect(document.querySelector('s-money-field[name="minSpend"]')).not.toBeNull();

    fireEvent.click(screen.getAllByText("Edit")[0]);
    await act(async () => {});
    expect(document.querySelector('s-section[heading="Edit Bronze"]')).not.toBeNull();
    expect(document.querySelector('s-money-field[name="minSpend"]')).toBeNull();
    expect(document.body.textContent).toContain("Minimum spend: £0.00");

    fireEvent.click(screen.getByText("Cancel", { selector: "s-section s-button" }));
    await act(async () => {});
    expect(document.querySelector('s-section[heading="Add a tier"]')).not.toBeNull();
  });

  // DESIGN-18: Polaris's money field, in the shop's currency, whole amounts from 0
  it("asks for the minimum spend in a money field in the shop's currency", async () => {
    await renderTiers(page({ currency: "JPY" }));
    const field = document.querySelector('s-money-field[name="minSpend"]')!;
    expect([field.getAttribute("label"), field.getAttribute("currencyCode"), field.getAttribute("min")]).toEqual(["Minimum spend", "JPY", "0"]);
    expect(field.getAttribute("details")).toBe("Buyers reach this tier once they spend this much. Whole amounts only.");
  });

  // DESIGN-14
  it("brings the form into view on Edit with Name focused, and keeps the actions beside each tier on a phone", async () => {
    const scrolled = scrollIntoView;
    scrolled.mockClear();
    await renderTiers();
    expect([...document.querySelectorAll("s-table-header")].at(-1)?.getAttribute("listSlot")).toBe("inline");
    const name = document.querySelector('s-text-field[name="name"]') as HTMLElement;
    const focus = vi.spyOn(name, "focus");

    fireEvent.click(screen.getAllByText("Edit")[1]);
    await act(async () => {});

    expect(document.querySelector('s-section[heading="Edit Gold"]')).not.toBeNull();
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.contexts[0]).toBe(document.querySelector('s-section[heading="Edit Gold"]'));
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the form's Name once a delete is done and the modal has closed", async () => {
    letFetchersPost();
    await renderTiers(page(), { next: () => page({ tiers: [TIERS[0]] }) });
    const name = document.querySelector('s-text-field[name="name"]') as HTMLElement;
    const focus = vi.spyOn(name, "focus");
    const modal = document.querySelector("s-modal") as HTMLElement & { hideOverlay?: () => void };
    // The modal closes, then says so, as Polaris's does
    modal.hideOverlay = () => modal.dispatchEvent(new Event("afterhide"));

    fireEvent.click(screen.getByText("Delete", { selector: "s-table-cell s-button" }));
    await act(async () => {
      fireEvent.click(screen.getByText("Delete tier"));
    });
    await act(async () => {});

    expect(focus).toHaveBeenCalledTimes(1);
    // A Cancel moves nothing
    focus.mockClear();
    await act(async () => {
      modal.dispatchEvent(new Event("afterhide"));
    });
    expect(focus).not.toHaveBeenCalled();
  });

  it("starts a store's first tier at 0", async () => {
    await renderTiers(page({ tiers: [] }));
    expect(document.body.textContent).toContain("No tiers yet.");
    expect(document.querySelector('s-money-field[name="minSpend"]')).toBeNull();
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

  // CONCURRENCY-2: one window change at a time
  it("disables the window choice while its change is posted, and posts one change", async () => {
    letFetchersPost();
    const posted: Array<Record<string, string>> = [];
    await renderTiers(page(), { posted, answer: () => new Promise(() => {}) });
    const list = document.querySelector("s-choice-list")!;
    expect(list.hasAttribute("disabled")).toBe(false);

    const choose = async (value: string) => {
      await act(async () => {
        Object.defineProperty(list, "values", { value: [value], configurable: true });
        fireEvent.change(list);
      });
    };
    await choose("lifetime");
    await choose("rolling_12_months");

    expect(posted).toEqual([{ intent: "window", tierWindow: "lifetime" }]);
    expect(list.hasAttribute("disabled")).toBe(true);
  });

  // CONCURRENCY-3: an edit says which version of the tier it was made on
  it("posts the edited tier's version with its save", async () => {
    letFetchersPost();
    const posted: Array<Record<string, string>> = [];
    await renderTiers(page(), { posted });

    fireEvent.click(screen.getAllByText("Edit")[1]);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByText("Save", { selector: "s-section s-button" }));
    });

    expect(posted).toEqual([{ intent: "save", id: "t1", name: "Gold", percent: "10", minSpend: "500", version: "2026-11-02T10:00:00.000Z" }]);
  });

  // M3b-F1: a reload while editing (after a refused save, a window change or
  // the moving poll) can bring a newer version of the tier; the edit's fields
  // were taken from the version it was opened on, so that is the one it posts
  it("keeps posting the version the edit was opened on after a reload brings a newer one", async () => {
    letFetchersPost();
    const posted: Array<Record<string, string>> = [];
    let data = page();
    let answers = 0;
    await renderTiers(data, {
      posted,
      next: () => data,
      answer: async () => (answers++ === 0 ? { ok: false, errors: { percent: "Enter a whole number from 0 to 100." } } : { ok: true }),
    });

    fireEvent.click(screen.getAllByText("Edit")[1]);
    await act(async () => {});

    // Another tab saves Gold at 12%; this tab's refused save reloads it
    data = page({ tiers: [TIERS[0], { ...TIERS[1], percent: "12", version: "2026-11-03T10:00:00.000Z" }] });
    await act(async () => {
      fireEvent.click(screen.getByText("Save", { selector: "s-section s-button" }));
    });
    expect(document.querySelector('s-number-field[name="percent"]')?.getAttribute("error")).toBe("Enter a whole number from 0 to 100.");
    // The edit still shows the fields it was opened on
    expect(document.querySelector('s-number-field[name="percent"]')?.getAttribute("value")).toBe("10");

    await act(async () => {
      fireEvent.click(screen.getByText("Save", { selector: "s-section s-button" }));
    });

    expect(posted.map((p) => p.version)).toEqual(["2026-11-02T10:00:00.000Z", "2026-11-02T10:00:00.000Z"]);
  });

  // A20-F4: an edit of a tier deleted elsewhere can't come back as a new tier
  it("lets go of an edit whose tier is gone after a reload, saying so", async () => {
    letFetchersPost();
    let data = page();
    await renderTiers(data, { next: () => data, answer: async () => ({ ok: false, errors: { percent: "Enter a whole number from 0 to 100." } }) });

    fireEvent.click(screen.getAllByText("Edit")[1]);
    await act(async () => {});
    expect(document.querySelector('s-section[heading="Edit Gold"]')).not.toBeNull();

    // Another tab deletes Gold; this tab's next save reloads the page's data
    data = page({ tiers: [TIERS[0]] });
    await act(async () => {
      fireEvent.click(screen.getByText("Save", { selector: "s-section s-button" }));
    });

    expect(document.querySelector('s-section[heading="Add a tier"]')).not.toBeNull();
    expect(document.querySelector('s-text-field[name="name"]')?.getAttribute("value")).toBe("");
    expect(document.body.textContent).toContain("This tier is no longer there. Reload the page.");
    expect(screen.getByText("Add tier", { selector: "s-section s-button" })).toBeTruthy();
  });

  // Ruling 76 (TRUTH-10)
  it("says buyers are moving while a requested pass hasn't reached them", async () => {
    await renderTiers(page({ moving: true }));
    expect(document.querySelector('s-banner[tone="info"]')?.textContent).toBe("Buyers are moving to their new tiers.");
    cleanup();

    await renderTiers(page({ moving: false }));
    expect(document.querySelector("s-banner")).toBeNull();
  });
});
