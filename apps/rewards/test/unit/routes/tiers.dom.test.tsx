// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldsOf, letFetchersPost } from "../helpers/fetcher-posts";

// The page's loader and action are replaced by stand-ins; nothing here
// reaches Shopify or the database. What saves and deletes do runs in the
// Postgres suite (tiers-page); here a post goes to a stand-in action
// (letFetchersPost) that records it.
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

// The real polling, with what the page asks of it recorded (Ruling 82)
const pollingCalls: unknown[][] = [];
vi.mock("~/admin/polling", async (original) => {
  const actual = await original<typeof import("~/admin/polling")>();
  return {
    ...actual,
    usePolling: (...args: Parameters<typeof actual.usePolling>) => {
      pollingCalls.push(args);
      actual.usePolling(...args);
    },
  };
});

const { default: Tiers } = await import("~/routes/app.tiers");

const TIERS = [
  { id: "t0", name: "Bronze", minSpend: "0", percent: "5", members: 14, lowest: true, version: "2026-11-01T10:00:00.000Z" },
  { id: "t1", name: "Gold", minSpend: "500", percent: "10", members: 1, lowest: false, version: "2026-11-02T10:00:00.000Z" },
];

type Page = { currency: string; reviewDue: boolean; tierWindow: string; nameMax: number; moving: boolean; goneError: string; tiers: typeof TIERS };

const page = (o: Partial<Page> = {}): Page => ({
  currency: "GBP",
  reviewDue: false,
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
 * A post to Home's action (the review request's record) goes to `home`.
 */
async function renderTiers(
  first: Page = page(),
  o: { next?: () => Page; posted?: Array<Record<string, string>>; answer?: () => Promise<unknown>; home?: Array<Record<string, string>> } = {},
) {
  const Stub = createRoutesStub([
    {
      path: "/app",
      action: async ({ request }) => {
        o.home?.push(await fieldsOf(request));
        return { ok: true };
      },
    },
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

/** Type `value` into a Polaris field, as its input event reports it. */
const type = (field: Element, value: string) =>
  act(async () => {
    Object.defineProperty(field, "value", { value, configurable: true, writable: true });
    fireEvent.input(field);
  });

const rows = () =>
  [...document.querySelectorAll("s-table-body s-table-row")].map((row) =>
    [...row.querySelectorAll("s-table-cell")].map((cell) => cell.textContent?.trim()),
  );

/** The add and edit form's modal, its Save (primary action) and the button that opens it to add. */
const tierModal = () => document.querySelector('s-modal[id="tier-form"]') as HTMLElement & { hideOverlay?: () => void };
const modalSave = () => tierModal().querySelector('s-button[slot="primary-action"]') as HTMLElement;
const addTierButton = () => screen.getByText("Add tier", { selector: "s-section s-button" });

/** App Bridge's save bar API, recording each call as [method, id]. */
function stubSaveBar() {
  const calls: Array<[string, string]> = [];
  const saveBar = {
    show: vi.fn(async (id: string) => void calls.push(["show", id])),
    hide: vi.fn(async (id: string) => void calls.push(["hide", id])),
  };
  vi.stubGlobal("shopify", { saveBar });
  return { calls, shown: () => calls.filter(([, id]) => id === "tier-window-save-bar").at(-1)?.[0] === "show" };
}
const saveBarButton = (primary: boolean) =>
  document.querySelector(`ui-save-bar[id="tier-window-save-bar"] > button${primary ? '[variant="primary"]' : ":not([variant])"}`) as HTMLButtonElement;

/** Pick `value` in the "Spend counted over" choice, as Polaris's change event reports it. */
const chooseWindow = (value: string) =>
  act(async () => {
    const list = document.querySelector("s-choice-list")!;
    Object.defineProperty(list, "values", { value: [value], configurable: true });
    fireEvent.change(list);
  });
const selectedWindow = () => [...document.querySelectorAll("s-choice")].filter((c) => c.hasAttribute("selected")).map((c) => c.getAttribute("value"));

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
      "Cashback is paid on the product price after discounts, less anything paid with store credit or gift cards. Shipping, duties, tips and gift cards bought earn nothing.",
    );
  });

  it("offers the two windows, with the shop's chosen", async () => {
    await renderTiers(page({ tierWindow: "lifetime" }));
    const list = document.querySelector("s-choice-list");
    expect(list?.getAttribute("label")).toBe("Spend counted over");
    // Built for Shopify 4.2.1: the line says what the choice decides
    expect(list?.getAttribute("details")).toBe("Which of a buyer's orders count toward their tier.");
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
    expect(tierModal().getAttribute("heading")).toBe("Edit Bronze");
    expect(document.querySelector('s-money-field[name="minSpend"]')).toBeNull();
    expect(document.body.textContent).toContain("Minimum spend: £0.00");

    // Each opening starts afresh: Add tier opens it empty, whatever was edited before
    fireEvent.click(addTierButton());
    await act(async () => {});
    expect(tierModal().getAttribute("heading")).toBe("Add a tier");
    expect(document.querySelector('s-text-field[name="name"]')?.getAttribute("value")).toBe("");
  });

  // Built for Shopify 4.1.5 and 4.1.6: the form is a modal's, its Save and
  // Cancel in the modal's slots, and the page has no Save of its own
  it("adds and edits a tier in a modal whose Save and Cancel are in its slots", async () => {
    await renderTiers();
    const opener = addTierButton();
    expect([opener.getAttribute("commandFor"), opener.getAttribute("command")]).toEqual(["tier-form", "--show"]);
    const edit = screen.getAllByText("Edit")[1];
    expect([edit.getAttribute("commandFor"), edit.getAttribute("command")]).toEqual(["tier-form", "--show"]);

    // The fields are the modal's
    for (const name of ["name", "minSpend", "percent"]) expect(tierModal().querySelector(`[name="${name}"]`), name).not.toBeNull();
    expect(modalSave().getAttribute("variant")).toBe("primary");
    expect(modalSave().textContent).toBe("Add tier");
    const cancel = tierModal().querySelector('s-button[slot="secondary-actions"]')!;
    expect([cancel.textContent, cancel.getAttribute("commandFor"), cancel.getAttribute("command")]).toEqual(["Cancel", "tier-form", "--hide"]);
    // Nothing in the page's cards saves or cancels
    expect([...document.querySelectorAll("s-section s-button")].map((b) => b.textContent)).toEqual(["Edit", "Edit", "Delete", "Add tier"]);

    fireEvent.click(edit);
    await act(async () => {});
    expect(tierModal().getAttribute("heading")).toBe("Edit Gold");
    expect(modalSave().textContent).toBe("Save");
  });

  // Built for Shopify 4.2.1: what the percent is of, in Home's words
  it("says what the tier's cashback percent is of", async () => {
    await renderTiers();
    expect(document.querySelector('s-number-field[name="percent"]')?.getAttribute("details")).toBe(
      "Cashback is paid on the product price after discounts, less anything paid with store credit or gift cards. Shipping, duties, tips and gift cards bought earn nothing.",
    );
  });

  // Built for Shopify 4.2.4: a refused save keeps the form, its errors beside their fields
  it("keeps the modal open with the action's errors beside their fields, and closes it once the save is taken", async () => {
    letFetchersPost();
    let answers = 0;
    await renderTiers(page(), {
      answer: async () =>
        answers++ === 0 ? { ok: false, errors: { name: "Another tier has this name.", form: "Something else." } } : { ok: true },
    });
    const hideOverlay = vi.fn();
    tierModal().hideOverlay = hideOverlay;

    fireEvent.click(addTierButton());
    await type(document.querySelector('s-text-field[name="name"]')!, "Gold");
    await type(document.querySelector('s-money-field[name="minSpend"]')!, "250");
    await type(document.querySelector('s-number-field[name="percent"]')!, "7");
    await act(async () => {
      fireEvent.click(modalSave());
    });
    await waitFor(() => expect(modalSave().hasAttribute("loading")).toBe(false));
    expect(document.querySelector('s-text-field[name="name"]')?.getAttribute("error")).toBe("Another tier has this name.");
    expect(screen.getByText("Something else.").closest("s-modal")).toBe(tierModal());
    expect(screen.getByText("Something else.").getAttribute("tone")).toBe("critical");
    expect(hideOverlay).not.toHaveBeenCalled();

    await type(document.querySelector('s-text-field[name="name"]')!, "Silver");
    await act(async () => {
      fireEvent.click(modalSave());
    });
    await waitFor(() => expect(hideOverlay).toHaveBeenCalledTimes(1));
    expect(document.querySelector('s-text-field[name="name"]')?.hasAttribute("error")).toBe(false);
  });

  // DESIGN-18: Polaris's money field, in the shop's currency, whole amounts from 0
  it("asks for the minimum spend in a money field in the shop's currency", async () => {
    await renderTiers(page({ currency: "JPY" }));
    const field = document.querySelector('s-money-field[name="minSpend"]')!;
    expect([field.getAttribute("label"), field.getAttribute("currencyCode"), field.getAttribute("min")]).toEqual(["Minimum spend", "JPY", "0"]);
    expect(field.getAttribute("details")).toBe("Buyers reach this tier once they spend this much. Whole amounts only.");
  });

  // DESIGN-14
  it("opens the form with Name focused, and keeps the actions beside each tier on a phone", async () => {
    await renderTiers();
    expect([...document.querySelectorAll("s-table-header")].at(-1)?.getAttribute("listSlot")).toBe("inline");
    const name = document.querySelector('s-text-field[name="name"]') as HTMLElement;
    const focus = vi.spyOn(name, "focus");

    fireEvent.click(screen.getAllByText("Edit")[1]);
    await act(async () => {});
    expect(focus).not.toHaveBeenCalled();
    // Once the modal is open, as Polaris's says
    await act(async () => {
      tierModal().dispatchEvent(new Event("aftershow"));
    });

    expect(tierModal().getAttribute("heading")).toBe("Edit Gold");
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("moves focus to Add tier once a delete is done and the modal has closed", async () => {
    letFetchersPost();
    await renderTiers(page(), { next: () => page({ tiers: [TIERS[0]] }) });
    const focus = vi.spyOn(addTierButton(), "focus");
    const modal = document.querySelector('s-modal[id="delete-tier"]') as HTMLElement & { hideOverlay?: () => void };
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
    const modal = document.querySelector('s-modal[id="delete-tier"]');
    expect(modal?.getAttribute("heading")).toBe("Delete Gold?");
    expect(modal?.textContent).toContain(
      "1 member moves to the tier their spend qualifies for. Buyers locked to Gold go back to automatic.",
    );
  });

  // Built for Shopify 4.1.5: a new window waits for the save bar's Save
  it("holds a new window under App Bridge's save bar, and posts it only from the bar's Save", async () => {
    letFetchersPost();
    const bar = stubSaveBar();
    const posted: Array<Record<string, string>> = [];
    let data = page();
    await renderTiers(data, { posted, next: () => data });
    expect(bar.shown()).toBe(false);

    await chooseWindow("lifetime");
    expect(posted).toEqual([]);
    expect(bar.shown()).toBe(true);
    expect(selectedWindow()).toEqual(["lifetime"]);

    data = page({ tierWindow: "lifetime" });
    await act(async () => {
      fireEvent.click(saveBarButton(true));
    });
    expect(posted).toEqual([{ intent: "window", tierWindow: "lifetime" }]);
    // Saved and reloaded: the bar goes, and the saved window shows
    await waitFor(() => expect(bar.shown()).toBe(false));
    expect(selectedWindow()).toEqual(["lifetime"]);
  });

  it("puts the saved window back on the save bar's Discard, posting nothing", async () => {
    letFetchersPost();
    const bar = stubSaveBar();
    const posted: Array<Record<string, string>> = [];
    await renderTiers(page(), { posted });

    await chooseWindow("lifetime");
    expect(bar.shown()).toBe(true);
    await act(async () => {
      fireEvent.click(saveBarButton(false));
    });

    expect(bar.shown()).toBe(false);
    expect(selectedWindow()).toEqual(["rolling_12_months"]);
    expect(posted).toEqual([]);

    // Choosing the saved window again is no change either
    await chooseWindow("lifetime");
    await chooseWindow("rolling_12_months");
    expect(bar.shown()).toBe(false);
  });

  // Built for Shopify 4.1.5 reason 2: a refused save leaves the bar up, so the change can't be left behind
  it("keeps the save bar up after a refused window save, with the error under the choice", async () => {
    letFetchersPost();
    const bar = stubSaveBar();
    await renderTiers(page(), { answer: async () => ({ ok: false, errors: { form: "Unknown window." } }) });

    await chooseWindow("lifetime");
    await act(async () => {
      fireEvent.click(saveBarButton(true));
    });
    await waitFor(() => expect(document.querySelector("s-choice-list")?.getAttribute("error")).toBe("Unknown window."));
    expect(bar.shown()).toBe(true);
    expect(bar.calls.filter(([method]) => method === "show")).toHaveLength(1);
    expect(selectedWindow()).toEqual(["lifetime"]);
  });

  // CONCURRENCY-2: one window change at a time
  it("disables the window choice and the bar's buttons while its change is posted, and posts one change", async () => {
    letFetchersPost();
    stubSaveBar();
    const posted: Array<Record<string, string>> = [];
    await renderTiers(page(), { posted, answer: () => new Promise(() => {}) });
    const list = document.querySelector("s-choice-list")!;
    expect(list.hasAttribute("disabled")).toBe(false);

    await chooseWindow("lifetime");
    await act(async () => {
      fireEvent.click(saveBarButton(true));
    });
    await chooseWindow("rolling_12_months");
    await act(async () => {
      fireEvent.click(saveBarButton(true));
    });

    expect(posted).toEqual([{ intent: "window", tierWindow: "lifetime" }]);
    expect(list.hasAttribute("disabled")).toBe(true);
    expect([saveBarButton(true).disabled, saveBarButton(true).hasAttribute("loading"), saveBarButton(false).disabled]).toEqual([true, true, true]);
  });

  // OPERATIONS-9: the fields as typed, under the names the action reads
  it("posts a new tier's name, minimum spend and cashback as typed", async () => {
    letFetchersPost();
    const posted: Array<Record<string, string>> = [];
    await renderTiers(page(), { posted });

    await type(document.querySelector('s-text-field[name="name"]')!, "Silver");
    await type(document.querySelector('s-money-field[name="minSpend"]')!, "250");
    await type(document.querySelector('s-number-field[name="percent"]')!, "7");
    await act(async () => {
      fireEvent.click(modalSave());
    });

    expect(posted).toEqual([{ intent: "save", id: "", name: "Silver", percent: "7", minSpend: "250" }]);
  });

  // OPERATIONS-9: the lowest tier's minimum stays 0, so its save posts none
  it("posts no minimum spend with the lowest tier's save", async () => {
    letFetchersPost();
    const posted: Array<Record<string, string>> = [];
    await renderTiers(page(), { posted });

    fireEvent.click(screen.getAllByText("Edit")[0]);
    await act(async () => {});
    await type(document.querySelector('s-number-field[name="percent"]')!, "6");
    await act(async () => {
      fireEvent.click(modalSave());
    });

    expect(posted).toEqual([{ intent: "save", id: "t0", name: "Bronze", percent: "6", version: "2026-11-01T10:00:00.000Z" }]);
  });

  // CONCURRENCY-3: an edit says which version of the tier it was made on
  it("posts the edited tier's version with its save", async () => {
    letFetchersPost();
    const posted: Array<Record<string, string>> = [];
    await renderTiers(page(), { posted });

    fireEvent.click(screen.getAllByText("Edit")[1]);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(modalSave());
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
      fireEvent.click(modalSave());
    });
    expect(document.querySelector('s-number-field[name="percent"]')?.getAttribute("error")).toBe("Enter a whole number from 0 to 100.");
    // The edit still shows the fields it was opened on
    expect(document.querySelector('s-number-field[name="percent"]')?.getAttribute("value")).toBe("10");

    await act(async () => {
      fireEvent.click(modalSave());
    });

    expect(posted.map((p) => p.version)).toEqual(["2026-11-02T10:00:00.000Z", "2026-11-02T10:00:00.000Z"]);
  });

  // Ruling 82: follows a pending pass for 2 minutes from the page load and from each change made here
  it("follows the pass for two minutes, counted again from each change it makes", async () => {
    letFetchersPost();
    pollingCalls.length = 0;
    await renderTiers(page({ moving: true }), { next: () => page({ moving: true }) });
    expect(pollingCalls.at(-1)).toEqual([true, 10_000, { forMs: 120_000, restartKey: 0 }]);

    // A save
    await type(document.querySelector('s-text-field[name="name"]')!, "Silver");
    await type(document.querySelector('s-money-field[name="minSpend"]')!, "200");
    await type(document.querySelector('s-number-field[name="percent"]')!, "7");
    await act(async () => {
      fireEvent.click(modalSave());
    });
    expect(pollingCalls.at(-1)).toEqual([true, 10_000, { forMs: 120_000, restartKey: 1 }]);

    // A window change, saved from the save bar
    await chooseWindow("lifetime");
    expect(pollingCalls.at(-1)).toEqual([true, 10_000, { forMs: 120_000, restartKey: 1 }]);
    await act(async () => {
      fireEvent.click(saveBarButton(true));
    });
    expect(pollingCalls.at(-1)).toEqual([true, 10_000, { forMs: 120_000, restartKey: 2 }]);
  });

  // A20-F4: an edit of a tier deleted elsewhere can't come back as a new tier
  it("lets go of an edit whose tier is gone after a reload, saying so", async () => {
    letFetchersPost();
    let data = page();
    await renderTiers(data, { next: () => data, answer: async () => ({ ok: false, errors: { percent: "Enter a whole number from 0 to 100." } }) });

    fireEvent.click(screen.getAllByText("Edit")[1]);
    await act(async () => {});
    expect(tierModal().getAttribute("heading")).toBe("Edit Gold");

    // Another tab deletes Gold; this tab's next save reloads the page's data
    data = page({ tiers: [TIERS[0]] });
    await act(async () => {
      fireEvent.click(modalSave());
    });

    expect(tierModal().getAttribute("heading")).toBe("Add a tier");
    expect(document.querySelector('s-text-field[name="name"]')?.getAttribute("value")).toBe("");
    expect(document.body.textContent).toContain("This tier is no longer there. Reload the page.");
    expect(modalSave().textContent).toBe("Add tier");
  });

  // Ruling 76 (TRUTH-10)
  it("says buyers are moving while a requested pass hasn't reached them", async () => {
    await renderTiers(page({ moving: true }));
    expect(document.querySelector('s-banner[tone="info"]')?.textContent).toBe("Buyers are moving to their new tiers.");
    // M3d-F6: in the page's one stack of banners, as on Home
    expect(document.querySelector('s-stack[slot="supplemental-start"][gap="base"] s-banner[tone="info"]')).not.toBeNull();
    expect(document.querySelectorAll("s-banner[slot]")).toHaveLength(0);
    cleanup();

    await renderTiers(page({ moving: false }));
    expect(document.querySelector("s-banner")).toBeNull();
  });

  // #173: the review request follows a save that worked, never the page's load
  describe("the review request", () => {
    const addTier = async (name: string) => {
      fireEvent.click(addTierButton());
      await type(document.querySelector('s-text-field[name="name"]')!, name);
      await type(document.querySelector('s-money-field[name="minSpend"]')!, "250");
      await type(document.querySelector('s-number-field[name="percent"]')!, "7");
      const hideOverlay = vi.fn();
      tierModal().hideOverlay = hideOverlay;
      await act(async () => {
        fireEvent.click(modalSave());
      });
      // The modal closes once the save is answered and the page reloaded
      await waitFor(() => expect(hideOverlay).toHaveBeenCalled());
    };

    it("asks once a visit, right after a tier is saved while it is due, and records what Shopify showed", async () => {
      letFetchersPost();
      const request = vi.fn(async () => ({ code: "success" }));
      vi.stubGlobal("shopify", { reviews: { request } });
      const home: Array<Record<string, string>> = [];
      await renderTiers(page({ reviewDue: true }), { home });
      await act(async () => {});
      expect(request).not.toHaveBeenCalled();

      await addTier("Silver");
      await waitFor(() => expect(home).toEqual([{ intent: "review-shown", code: "success" }]));
      expect(request).toHaveBeenCalledTimes(1);

      await addTier("Platinum");
      expect(request).toHaveBeenCalledTimes(1);
    });

    it("doesn't ask after a save that failed, or while it isn't due", async () => {
      for (const [due, answer] of [
        [true, { ok: false, errors: { percent: "Enter a whole number from 0 to 100." } }],
        [false, { ok: true }],
      ] as const) {
        letFetchersPost();
        const request = vi.fn(async () => ({ code: "success" }));
        vi.stubGlobal("shopify", { reviews: { request } });
        const posted: Array<Record<string, string>> = [];
        await renderTiers(page({ reviewDue: due }), { posted, answer: async () => answer });

        await type(document.querySelector('s-text-field[name="name"]')!, "Silver");
        await type(document.querySelector('s-number-field[name="percent"]')!, "7");
        await act(async () => {
          fireEvent.click(modalSave());
        });
        await waitFor(() => expect(modalSave().hasAttribute("loading")).toBe(false));

        expect(posted).toHaveLength(1);
        expect(request).not.toHaveBeenCalled();
        cleanup();
        vi.unstubAllGlobals();
      }
    });
  });
});
