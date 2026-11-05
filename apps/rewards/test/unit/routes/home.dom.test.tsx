// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { abortedByPage, fieldsOf, letFetchersPost } from "../helpers/fetcher-posts";

// The page's loader and action are replaced by the stub's hydration data;
// nothing here reaches Shopify or the database. Every post goes to a
// stand-in action that never answers, so each stays in flight.
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));
// The reload schedule is its own unit (polling.dom.test); here, only when Home asks for it
const usePolling = vi.fn();
vi.mock("~/admin/polling", () => ({ usePolling: (...args: unknown[]) => usePolling(...args) }));

const { default: Home } = await import("~/routes/app._index");

type HomeData = Record<string, unknown>;

/** Home's loader data for a GBP shop, with `overrides`. */
function homeData(
  overrides: {
    running?: boolean;
    hasTiers?: boolean;
    setupCompleted?: boolean;
    importState?: string;
    importDismissed?: boolean;
    importedOrders?: number;
    importedBuyers?: number;
    unreadable?: boolean;
    placing?: boolean;
    storeCreditReady?: boolean | null;
    reviewDue?: boolean;
    needsLook?: number;
    needsLookOrderId?: string | null;
    daily?: Array<{ date: string; given: string; spent: string }>;
  } = {},
): HomeData {
  const hasTiers = overrides.hasTiers ?? true;
  return {
    shop: "home-dom.myshopify.com",
    currency: "GBP",
    running: overrides.running ?? true,
    stats: {
      cashbackGiven: "24.50",
      creditSpent: "11.00",
      cameBack: 9,
      daily: overrides.daily ?? [
        { date: "2026-11-01", given: "2.50", spent: "0" },
        { date: "2026-11-02", given: "4.20", spent: "11.00" },
      ],
      recent: [
        { orderId: "o1", orderName: "#1012", buyer: "Sam K.", tierName: "Everyone", ratePercent: "5", amount: "£2.50", status: "Issued", tone: "success", detail: null },
        { orderId: "o2", orderName: "#1011", buyer: "Priya R.", tierName: "Gold", ratePercent: "10", amount: "£4.20", status: "Waiting", tone: "info", detail: null },
        {
          orderId: "o3",
          orderName: "#1009",
          buyer: "Customer ····7001",
          tierName: "Everyone",
          ratePercent: "5",
          amount: "-£0.40",
          status: "Taken back",
          tone: "neutral",
          detail: "Took back £0.40 of £1.00; the buyer had spent the rest",
        },
      ],
      tiers: hasTiers ? [{ id: "t1", name: "Everyone", percent: "5", members: 14 }] : [],
    },
    bannerFacts: {
      privacyDueAt: null,
      spendProblems: [],
      needsLook: overrides.needsLook ?? 0,
      needsLookOrderId: overrides.needsLookOrderId ?? null,
      timezone: "Europe/London",
      themeEditorUrl: "https://home-dom.myshopify.com/admin/themes/current/editor",
    },
    setup: {
      completed: overrides.setupCompleted ?? false,
      importState: overrides.importState ?? "done",
      importDismissed: overrides.importDismissed ?? false,
      importHorizonDays: 365,
      importedOrders: overrides.importedOrders ?? 40,
      importedBuyers: overrides.importedBuyers ?? 14,
      unreadable: overrides.unreadable ?? false,
      placing: overrides.placing ?? false,
    },
    reviewDue: overrides.reviewDue ?? false,
    storeCreditReady: overrides.storeCreditReady === undefined ? true : overrides.storeCreditReady,
    themeEditorUrl: "https://home-dom.myshopify.com/admin/themes/current/editor",
  };
}

/** App Bridge's `shopify` global, with the widget embed in the given state. */
function stubAppBridge(embed: "active" | "available", review: () => Promise<{ code: string }> = vi.fn()) {
  const extensions = vi.fn(async () => [
    {
      handle: "rewardspro-theme-extension",
      type: "theme_app_extension",
      activations: [{ handle: "membership_widget", name: "Rewards widget", target: "body", status: embed, activations: [] }],
    },
  ]);
  vi.stubGlobal("shopify", { app: { extensions }, reviews: { request: review } });
  return extensions;
}

/** Each post Home makes, with its request. */
type Posted = { fields: Record<string, string>; request: Request };

async function renderHome(data: HomeData, posted: Posted[] = []) {
  letFetchersPost();
  const action = async ({ request }: { request: Request }) => {
    posted.push({ fields: await fieldsOf(request), request });
    return new Promise(() => {});
  };
  const Stub = createRoutesStub([{ id: "routes/app._index", path: "/app", Component: Home, action }]);
  render(<Stub initialEntries={["/app"]} hydrationData={{ loaderData: { "routes/app._index": data } }} />);
  await screen.findByText("All orders", { selector: "s-button" });
  // Let the widget check settle
  await act(async () => {});
}

const card = () => document.querySelector("[data-setup-card]");

/** Where the page puts a thing by width (Ruling 70): beside the main column, or below it. */
const BESIDE = "@container home (inline-size >= 784px) auto, none";
const BELOW = "@container home (inline-size >= 784px) none, auto";
const WIDE_ONLY = "@container main (inline-size > 415px) auto, none";
/** The first s-box under `scope` shown by `display` (jsdom's selectors can't match these values in an attribute selector). */
const boxShown = (display: string, scope: ParentNode = document) => [...scope.querySelectorAll("s-box")].find((box) => box.getAttribute("display") === display)!;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  usePolling.mockClear();
});

describe("Home", () => {
  it("shows the setup card while a step is left, and hides it once every step is done", async () => {
    const extensions = stubAppBridge("active");
    await renderHome(homeData({ running: false }));
    expect(extensions).toHaveBeenCalledTimes(1);
    expect(card()).not.toBeNull();
    expect(card()?.getAttribute("heading")).toBe("Set up cashback");
    expect(screen.getByText("Switch cashback on")).toBeTruthy();
    cleanup();

    stubAppBridge("available");
    await renderHome(homeData({ running: true }));
    expect(card()).not.toBeNull();
    expect(screen.getByText("Turn on the widget in your theme")).toBeTruthy();
    cleanup();

    // Every step done, and the import's outcome already dismissed
    stubAppBridge("active");
    await renderHome(homeData({ running: true, importDismissed: true }));
    expect(card()).toBeNull();
  });

  // Ruling 60
  it("records setup as completed the first time it sees every step done, and only then", async () => {
    stubAppBridge("active");
    const posted: Posted[] = [];
    await renderHome(homeData({ running: true, importDismissed: true }), posted);
    expect(posted.map((post) => post.fields)).toEqual([{ intent: "setup-done" }]);
    cleanup();

    for (const [embed, data] of [
      ["available", homeData({ running: true, importDismissed: true })],
      ["active", homeData({ running: false, importDismissed: true })],
      ["active", homeData({ running: true, importDismissed: true, setupCompleted: true })],
    ] as const) {
      stubAppBridge(embed);
      const none: Posted[] = [];
      await renderHome(data, none);
      expect(none).toEqual([]);
      cleanup();
    }
  });

  it("doesn't bring the setup card back after a pause once setup was completed", async () => {
    stubAppBridge("available");
    await renderHome(homeData({ setupCompleted: true, running: false, importDismissed: true }));
    expect(card()).toBeNull();
    // The pause and the embed are the Running checks' and the banners' to say
    expect(document.querySelector('[slot="supplemental-start"]')?.textContent).toContain("The rewards widget is off in your theme.");
    expect(screen.getByText("Cashback is off. 1 check needs you.")).toBeTruthy();
  });

  it("keeps the card for the import's outcome after setup was completed, showing only that", async () => {
    stubAppBridge("available");
    await renderHome(homeData({ setupCompleted: true, running: false, importState: "done" }));
    expect(card()?.getAttribute("heading")).toBe("Your past orders");
    expect(card()?.textContent).toContain("Done: 14 buyers placed in tiers");
    expect(card()?.textContent).not.toContain("Switch cashback on");
    expect(card()?.textContent).not.toContain("Turn on the widget");
  });

  // Ruling 76 and Ruling 74: the outcome counts the buyers brought in, in plain sentences
  describe("the import's outcome", () => {
    it("keeps the card for it when it ends after every other step, until it is dismissed", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ running: true, importState: "done", unreadable: true, importedOrders: 1200 }));
      expect(card()?.textContent).toContain("Brought in 1,200 of your past orders; the rest couldn't be read.");
      expect(card()?.textContent).toContain("Done: 14 buyers placed in tiers");
      // The other steps show as done
      expect(card()?.textContent).toContain("Your base cashback rate: 5%");
      expect(card()?.textContent).toContain("Cashback is on");
      expect(card()?.textContent).toContain("The widget is on in your theme");
      const outcome = card()?.querySelector("[data-import-outcome]");
      expect([...(outcome?.querySelectorAll("s-button") ?? [])].map((button) => button.textContent)).toEqual(["Dismiss"]);
      cleanup();

      // Dismissed: every step is done, so the card goes
      await renderHome(homeData({ running: true, importState: "done", importDismissed: true }));
      expect(card()).toBeNull();
    });

    it("names the buyers it brought in before there are tiers, and says they are placed at the base rate", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ hasTiers: false, running: false, importState: "done", importedBuyers: 14 }));
      expect(card()?.textContent).toContain("Brought in 14 buyers' past orders. They're placed in tiers when you save your base rate.");
      expect(card()?.textContent).not.toContain("0 buyers");
    });

    it("says they are being placed while the pass runs, and follows it until it has", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ importState: "done", placing: true }));
      expect(card()?.textContent).toContain("Brought in 14 buyers' past orders. They're being placed in tiers.");
      expect(usePolling).toHaveBeenLastCalledWith(true, expect.any(Number));
      cleanup();

      await renderHome(homeData({ importState: "done" }));
      expect(usePolling).toHaveBeenLastCalledWith(false, expect.any(Number));
    });

    it("gives a failed import one plain sentence, counting what it brought in", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ importState: "failed", importedOrders: 0 }));
      expect(card()?.querySelector("[data-import-outcome]")?.textContent).toBe(
        "Your past orders couldn't be brought in, so buyers start in the lowest tier.Dismiss",
      );
      cleanup();

      await renderHome(homeData({ importState: "failed", importedOrders: 120 }));
      expect(card()?.querySelector("[data-import-outcome]")?.textContent).toBe("Brought in 120 of your past orders; the rest couldn't be read.Dismiss");
    });

    it("shows its progress while it runs, and follows it", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ importState: "running" }));
      expect(card()?.textContent).toContain("Bringing in your last 12 months of orders so buyers start in the right tier");
      expect(usePolling).toHaveBeenLastCalledWith(true, expect.any(Number));
    });
  });

  describe("Running", () => {
    // Ruling 70 (DESIGN-1, DESIGN-5): one switch on every width
    it("puts the switch in one line above the numbers when the side column is below, and in the side column when it is beside", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ running: true }));
      const page = document.querySelector("s-page")!;
      expect(page.parentElement?.tagName.toLowerCase()).toBe("s-query-container");
      expect(page.parentElement?.getAttribute("containerName")).toBe("home");

      // The line: first in the main column after the setup card, its own section, with the switch
      const line = boxShown(BELOW);
      expect(line.querySelector("s-section")?.textContent).toContain("Cashback is on. All checks pass.");
      expect(line.querySelector("s-switch")?.getAttribute("label")).toBe("Cashback");
      expect(line.compareDocumentPosition(document.querySelector('s-section[heading="This month"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      // The side column's card, only when it is beside the main one
      const aside = document.querySelector('s-page > [slot="aside"]')!;
      expect(aside.tagName.toLowerCase()).toBe("s-box");
      expect(aside.getAttribute("display")).toBe(BESIDE);
      expect(aside.querySelector("s-section")?.getAttribute("heading")).toBe("Running");
      expect(aside.querySelectorAll("s-switch")).toHaveLength(1);
      expect(document.querySelectorAll("s-switch")).toHaveLength(2);
      // Tiers stays in the side column at every width, last on a phone
      expect(document.querySelectorAll('s-page > [slot="aside"]')[1].getAttribute("heading")).toBe("Tiers");
    });

    it("says what the switch does, matching it", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ running: true }));
      expect(screen.getByText("On: every paid order earns cashback as store credit.")).toBeTruthy();
      expect(screen.queryByText("Off: orders still count toward tiers but earn no cashback.")).toBeNull();
      expect([...document.querySelectorAll("s-switch")].map((toggle) => toggle.hasAttribute("checked"))).toEqual([true, true]);
      cleanup();

      await renderHome(homeData({ running: false }));
      expect(screen.getByText("Off: orders still count toward tiers but earn no cashback.")).toBeTruthy();
      expect(screen.queryByText("On: every paid order earns cashback as store credit.")).toBeNull();
      expect([...document.querySelectorAll("s-switch")].map((toggle) => toggle.hasAttribute("checked"))).toEqual([false, false]);
    });

    // Ruling 59: a check Shopify couldn't answer is shown as not checked, never as passing
    it("shows the store credit check as unknown when Shopify didn't say, and claims no pass", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ storeCreditReady: null }));
      const check = screen.getByText("Store credit: Shopify didn't say").closest("s-stack");
      expect(check?.querySelector("s-icon")?.getAttribute("type")).toBe("circle-dashed");
      expect(check?.querySelector("s-icon")?.getAttribute("tone")).toBe("neutral");
      expect(screen.getByText("Cashback is on.")).toBeTruthy();
      expect(document.body.textContent).not.toContain("All checks pass");
      cleanup();

      await renderHome(homeData({ storeCreditReady: true }));
      expect(screen.getByText("Cashback is on. All checks pass.")).toBeTruthy();
    });
  });

  describe("This month", () => {
    // DESIGN-10: sections headed one way, values not marked up as headings
    it("shows the numbers in the shop's currency as emphasised numbers, under the section's heading", async () => {
      stubAppBridge("active");
      await renderHome(homeData());
      const month = document.querySelector('s-section[heading="This month"]')!;
      expect([...month.querySelectorAll("s-number")].map((n) => [n.textContent, n.getAttribute("fontSize"), n.getAttribute("fontWeight")])).toEqual([
        ["£24.50", "large", "bold"],
        ["£11.00", "large", "bold"],
        ["9", "large", "bold"],
      ]);
      // Every section is headed by its heading, a link beside it in the section's own action slot
      expect(document.querySelectorAll("s-heading")).toHaveLength(0);
      expect([...document.querySelectorAll("s-section[heading]")].map((section) => section.getAttribute("heading"))).toEqual([
        "Set up cashback",
        "This month",
        "Recent rewards",
        "Running",
        "Tiers",
      ]);
      expect(
        [...document.querySelectorAll('s-section > s-button[slot="secondary-actions"]')].map((link) => [link.closest("s-section")?.getAttribute("heading"), link.textContent, link.getAttribute("href")]),
      ).toEqual([
        ["Recent rewards", "All orders", "/app/orders"],
        ["Tiers", "Edit", "/app/tiers"],
      ]);
    });

    // Ruling 71
    it("charts the last 30 days on wider columns only, and says so in a sentence when nothing happened", async () => {
      stubAppBridge("active");
      await renderHome(homeData());
      const chart = boxShown(WIDE_ONLY, document.querySelector('s-section[heading="This month"]')!);
      expect(chart.textContent).toContain("Last 30 days");
      expect(chart.querySelector("svg")?.getAttribute("aria-label")).toBe("Last 30 days, Nov 1 to Nov 2: Cashback given £6.70, Store credit spent £11.00");
      cleanup();

      await renderHome(homeData({ daily: [{ date: "2026-11-01", given: "0", spent: "0" }, { date: "2026-11-02", given: "0.00", spent: "0" }] }));
      expect(document.querySelector("svg")).toBeNull();
      expect(screen.getByText("No cashback given or store credit spent in the last 30 days.")).toBeTruthy();
    });
  });

  // DESIGN-6: the tier as every page shows it, and amounts in one column
  it("lists recent rewards with their tier chip, status and amount, the amounts in a column of their own", async () => {
    stubAppBridge("active");
    await renderHome(homeData());
    const text = document.body.textContent ?? "";
    expect(text).toContain("Sam K.");
    // A take-back at what it took, with the spec's sentence (Ruling 65)
    expect(text).toContain("Took back £0.40 of £1.00; the buyer had spent the rest");
    const rows = [...document.querySelectorAll("[data-reward]")];
    expect(rows.map((row) => row.querySelector("s-grid")?.getAttribute("gridTemplateColumns"))).toEqual(
      Array(3).fill("@container main (inline-size > 415px) 'minmax(0, 1fr) auto 7rem', 'minmax(0, 1fr) auto'"),
    );
    expect(
      rows.map((row) => {
        const grid = row.querySelector("s-grid")!;
        return [...grid.children].map((cell) => cell.textContent);
      }),
    ).toEqual([
      ["#1012Sam K.Everyone 5%", "Issued", "£2.50"],
      ["#1011Priya R.Gold 10%", "Waiting", "£4.20"],
      ["#1009Customer ····7001Everyone 5%", "Taken back", "-£0.40"],
    ]);
    // On a phone: the newest two, amount only
    expect(rows.map((row) => row.getAttribute("display"))).toEqual([null, null, WIDE_ONLY]);
    expect(rows[0].querySelector("s-grid > :nth-child(2)")?.getAttribute("display")).toBe(WIDE_ONLY);
    expect(rows[0].querySelector("s-number")?.textContent).toBe("£2.50");
    expect(text).toContain("14 members");
    // The widget is on, so no banner
    expect(document.querySelector('[slot="supplemental-start"]')).toBeNull();
  });

  // docs Q2, Q3: an admin settings link opens in the admin, as the theme editor's does
  it("opens Shopify's own settings from a banner in the admin, not a new tab", async () => {
    stubAppBridge("available");
    const data = homeData();
    data.bannerFacts = { ...(data.bannerFacts as Record<string, unknown>), spendProblems: ["store-credit-off"] };
    await renderHome(data);
    expect(document.querySelector('s-banner s-link[href="shopify://admin/settings/customer_accounts"]')?.getAttribute("target")).toBe("_top");
    expect(document.querySelector('s-banner s-link[href^="https://home-dom.myshopify.com/admin/themes"]')?.getAttribute("target")).toBe("_top");
  });

  // DESIGN-12
  it("links the needs-a-look banner straight to the order when one needs a look", async () => {
    stubAppBridge("active");
    await renderHome(homeData({ needsLook: 1, needsLookOrderId: "o7" }));
    expect(document.querySelector('s-banner s-link[href="/app/orders/o7"]')?.textContent).toBe("Open the order");
    cleanup();

    await renderHome(homeData({ needsLook: 2 }));
    expect(document.querySelector('s-banner s-link[href="/app/orders?look=1"]')?.textContent).toBe("Open orders");
  });

  it("warns when the widget embed is off", async () => {
    stubAppBridge("available");
    await renderHome(homeData());
    expect(document.querySelector('[slot="supplemental-start"]')?.textContent).toContain("The rewards widget is off in your theme.");
  });
});

// CONCURRENCY-2 and A19-F7: one post per control at a time, each control its own
describe("Home's controls", () => {
  it("disables both cashback switches while a change is posted, and posts one change", async () => {
    stubAppBridge("active");
    const posted: Posted[] = [];
    await renderHome(homeData({ running: true, setupCompleted: true, importDismissed: true }), posted);
    const [line, aside] = [...document.querySelectorAll("s-switch")];
    expect(line.hasAttribute("disabled")).toBe(false);

    const flip = async (toggle: Element, checked: boolean) => {
      await act(async () => {
        Object.defineProperty(toggle, "checked", { value: checked, configurable: true, writable: true });
        fireEvent.change(toggle);
      });
    };
    await flip(line, false);
    await flip(aside, true);

    expect(posted.map((post) => post.fields)).toEqual([{ intent: "running", running: "off" }]);
    expect([line, aside].map((toggle) => toggle.hasAttribute("disabled"))).toEqual([true, true]);
  });

  // OPERATIONS-9: the base rate as typed, under the field name the action reads
  it("posts the base rate as typed in the setup card", async () => {
    stubAppBridge("active");
    const posted: Posted[] = [];
    await renderHome(homeData({ running: false, hasTiers: false }), posted);
    const field = document.querySelector('s-number-field[name="percent"]')!;

    await act(async () => {
      Object.defineProperty(field, "value", { value: "6", configurable: true, writable: true });
      fireEvent.input(field);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save", { selector: "[data-setup-card] s-button" }));
    });

    expect(posted.map((post) => post.fields)).toEqual([{ intent: "base-rate", percent: "6" }]);
  });

  it("dismisses the review request without aborting the post that recorded it shown", async () => {
    stubAppBridge("active", async () => ({ code: "success" }));
    const posted: Posted[] = [];
    await renderHome(homeData({ reviewDue: true, importDismissed: true, setupCompleted: true }), posted);
    await act(async () => {});
    expect(posted.map((post) => post.fields)).toEqual([{ intent: "review-shown", code: "success" }]);

    await act(async () => {
      fireEvent.click(screen.getByText("Dismiss", { selector: "s-section s-button" }));
    });

    expect(posted.map((post) => post.fields)).toEqual([{ intent: "review-shown", code: "success" }, { intent: "review-dismissed" }]);
    expect(abortedByPage(posted[0].request)).toBe(false);
    expect(screen.queryByText("A review helps other merchants find RewardsPro.")).toBeNull();
  });
});
