// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("~/admin/polling", async (original) => ({
  ...(await original<typeof import("~/admin/polling")>()),
  usePolling: (...args: unknown[]) => usePolling(...args),
}));

const { default: Home } = await import("~/routes/app._index");
const { WIDGET_CHECK_MS } = await import("~/admin/home-rules");

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

/** What App Bridge's `app.extensions()` answers with the widget embed in the given state. */
const extensionsWith = (embed: "active" | "available") => [
  {
    handle: "rewardspro-theme-extension",
    type: "theme_app_extension",
    activations: [{ handle: "membership_widget", name: "Rewards widget", target: "body", status: embed, activations: [] }],
  },
];

/** App Bridge's `shopify` global, with the widget embed in the given state. */
function stubAppBridge(embed: "active" | "available", review: () => Promise<{ code: string }> = vi.fn()) {
  const extensions = vi.fn(async () => extensionsWith(embed));
  vi.stubGlobal("shopify", { app: { extensions }, reviews: { request: review } });
  return extensions;
}

/** App Bridge's `shopify` global, whose widget answer waits for `answer()`: the embed's state, or a refusal. */
function stubAppBridgeLater() {
  let settle: (embed: "active" | "available" | "refused") => void = () => {};
  const answered = new Promise<ReturnType<typeof extensionsWith>>((resolve, reject) => {
    settle = (embed) => (embed === "refused" ? reject(new Error("App Bridge refused")) : resolve(extensionsWith(embed)));
  });
  vi.stubGlobal("shopify", { app: { extensions: vi.fn(() => answered) }, reviews: { request: vi.fn() } });
  return {
    answer: async (embed: "active" | "available" | "refused") => {
      await act(async () => settle(embed));
    },
  };
}

/**
 * What the page holds, block by block: each banner and card, by its heading,
 * and how many rows its body has. Words, icons and what sits inside a row
 * (a link, or the text that takes its place) are left out: those may change
 * when App Bridge answers; nothing here may (Built for Shopify 2.1.2, 4.1.1).
 */
const layout = () =>
  [...document.querySelectorAll("s-banner, s-section")].map((block) => {
    const body = [...block.children].find((child) => child.tagName.toLowerCase() === "s-stack");
    const name = block.getAttribute("heading") ?? block.getAttribute("accessibilityLabel") ?? "";
    return `${block.tagName.toLowerCase()} "${name}": ${body?.children.length ?? 0} rows`;
  });

/** The widget's row in the cashback status card. */
const widgetRow = () =>
  [...document.querySelectorAll('s-section[heading="Cashback status"] s-stack[direction="inline"]')].find((row) => row.textContent?.includes("Widget"));

/** Each post Home makes, with its request. */
type Posted = { fields: Record<string, string>; request: Request };

/**
 * Home with `data`. Each post goes to `posted`; by default it never answers.
 * With `answer`, the action gives back what it returns for the post's
 * fields, and each later load (the revalidation after a post) reads `next()`.
 */
async function renderHome(
  data: HomeData,
  posted: Posted[] = [],
  o: { answer?: (fields: Record<string, string>) => Promise<unknown>; next?: () => HomeData } = {},
) {
  letFetchersPost();
  const action = async ({ request }: { request: Request }) => {
    const fields = await fieldsOf(request);
    posted.push({ fields, request });
    return o.answer ? o.answer(fields) : new Promise(() => {});
  };
  const loader = o.next;
  const Stub = createRoutesStub([{ id: "routes/app._index", path: "/app", Component: Home, action, ...(loader ? { loader: () => loader() } : {}) }]);
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
  it("shows the setup card until setup is completed, ticking each step as it is done", async () => {
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

    // Every step done but not yet recorded: the card was there at the first paint, so it stays for this visit, every
    // step ticked (it used to be left out until App Bridge answered, then never shown)
    stubAppBridge("active");
    await renderHome(homeData({ running: true, importDismissed: true }));
    expect(card()?.textContent).toContain("Your base cashback rate: 5%");
    expect(card()?.textContent).toContain("Cashback is on");
    expect(card()?.textContent).toContain("The widget is on in your theme");
    expect([...(card()?.querySelectorAll("s-icon") ?? [])].map((icon) => icon.getAttribute("type"))).toEqual(Array(3).fill("check-circle"));
    cleanup();

    // Recorded: the next visit has no card
    await renderHome(homeData({ running: true, importDismissed: true, setupCompleted: true }));
    expect(card()).toBeNull();
  });

  // Built for Shopify 2.1.2 and 4.1.1 reason 1: nothing is added above, or taken from, what is already on screen
  it("paints its layout once: App Bridge's answer about the widget, or its refusal, moves nothing", async () => {
    for (const [why, data] of [
      ["setup not completed, every other step done", homeData({ running: true, importDismissed: true })],
      ["setup not completed, no step done", homeData({ running: false, hasTiers: false, importDismissed: true })],
      ["setup completed", homeData({ running: true, setupCompleted: true, importDismissed: true })],
      ["setup completed, paused, with a store credit banner", { ...homeData({ running: false, setupCompleted: true, importDismissed: true, storeCreditReady: false }), bannerFacts: { ...(homeData().bannerFacts as object), spendProblems: ["store-credit-off"] } }],
      ["a data request's banner, store credit not spendable", { ...homeData({ setupCompleted: true, importDismissed: true, storeCreditReady: false }), bannerFacts: { ...(homeData().bannerFacts as object), privacyDueAt: "2026-12-05T10:00:00Z", spendProblems: ["store-credit-off"] } }],
    ] as const) {
      for (const embed of ["active", "available", "refused"] as const) {
        const appBridge = stubAppBridgeLater();
        await renderHome(data);
        const first = layout();
        expect(document.body.textContent).toContain("Widget: checking");

        await appBridge.answer(embed);

        expect(layout(), `${why}, App Bridge ${embed}`).toEqual(first);
        expect(document.body.textContent).not.toContain("Widget: checking");
        cleanup();
      }
    }
  });

  // The same rule after the reload: App Bridge says the widget is on, Home records setup as completed by itself, and
  // the page reloads saying so. The card stays where it is, every step ticked, until the next visit; taking it away
  // would move the page with no click from the merchant
  it("keeps the card, every step ticked, when setup is recorded during the visit and the page reloads", async () => {
    const appBridge = stubAppBridgeLater();
    const posted: Posted[] = [];
    const reloaded = homeData({ running: true, importDismissed: true, setupCompleted: true });
    // A figure that changed meanwhile shows the reload has landed
    reloaded.stats = { ...(reloaded.stats as Record<string, unknown>), cashbackGiven: "30.00" };
    await renderHome(homeData({ running: true, importDismissed: true }), posted, { answer: async () => ({ ok: true }), next: () => reloaded });
    const first = layout();

    await appBridge.answer("active");
    await screen.findByText("£30.00");
    await act(async () => {});

    expect(posted.map((post) => post.fields)).toEqual([{ intent: "setup-done" }]);
    expect(layout()).toEqual(first);
    expect(card()?.getAttribute("heading")).toBe("Set up cashback");
    expect([...(card()?.querySelectorAll("s-icon") ?? [])].map((icon) => icon.getAttribute("type"))).toEqual(Array(3).fill("check-circle"));
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
    // The pause and the embed are the cashback status checks' to say, never a banner's (Built for Shopify 4.3.4)
    expect(document.querySelector("s-banner")).toBeNull();
    expect(widgetRow()?.textContent).toBe("Widget is offTurn it on");
    expect(screen.getByText("Cashback is off. 1 check needs you.")).toBeTruthy();
  });

  // Built for Shopify 4.2.2 reason 6: a merchant who won't use the widget can be rid of the steps
  describe("the setup card's Dismiss", () => {
    const dismiss = () => card()?.querySelector(':scope > s-button[slot="secondary-actions"]');
    /** The card's buttons whose visible words are "Dismiss". */
    const dismissWords = () => [...(card()?.querySelectorAll("s-button") ?? [])].filter((button) => button.textContent === "Dismiss");

    it("dismisses the steps once the base rate is set and cashback is on, and records setup as completed", async () => {
      stubAppBridge("available");
      const posted: Posted[] = [];
      await renderHome(homeData({ running: true, importDismissed: true }), posted);
      // The setup guide composition's icon-only "x", named for assistive technology
      expect(["variant", "tone", "icon", "accessibilityLabel"].map((name) => dismiss()?.getAttribute(name))).toEqual(["tertiary", "neutral", "x", "Dismiss setup"]);
      expect(dismiss()?.textContent).toBe("");

      await act(async () => {
        fireEvent.click(dismiss()!);
      });

      expect(posted.map((post) => post.fields)).toEqual([{ intent: "setup-dismissed" }]);
      // Gone at once, and the widget's row, which the steps said, now sits under the phone's status line
      expect(card()).toBeNull();
      expect(boxShown(BELOW).textContent).toContain("Widget is off");
    });

    // Without the post's answer kept, the card, with its steps, would come back the moment the reload lands
    it("stays dismissed once the post is answered and the page reloads", async () => {
      stubAppBridge("available");
      const posted: Posted[] = [];
      const reloaded = homeData({ running: true, importDismissed: true, setupCompleted: true });
      reloaded.stats = { ...(reloaded.stats as Record<string, unknown>), cashbackGiven: "30.00" };
      await renderHome(homeData({ running: true, importDismissed: true }), posted, { answer: async () => ({ ok: true }), next: () => reloaded });

      await act(async () => {
        fireEvent.click(dismiss()!);
      });
      await screen.findByText("£30.00");
      await act(async () => {});

      expect(posted.map((post) => post.fields)).toEqual([{ intent: "setup-dismissed" }]);
      expect(card()).toBeNull();
    });

    // Built for Shopify 4.2.1 reason 2: two buttons with the same words in one card wouldn't say which hides what
    it("leaves the import's outcome, with its own Dismiss, when it is still shown", async () => {
      stubAppBridge("available");
      await renderHome(homeData({ running: true, importState: "failed", importedOrders: 0 }));
      // Both on the card: one button reads Dismiss, the import's; the setup's is the "x"
      expect(dismissWords()).toHaveLength(1);
      expect(dismissWords()[0].closest("[data-import-outcome]")).not.toBeNull();
      expect(dismiss()?.textContent).toBe("");

      await act(async () => {
        fireEvent.click(dismiss()!);
      });
      expect(card()?.getAttribute("heading")).toBe("Your past orders");
      expect(card()?.textContent).not.toContain("Turn on the widget");
      expect(card()?.querySelector("[data-import-outcome]")?.textContent).toContain("Dismiss");
    });

    it("isn't offered before the base rate is set and cashback is on, nor once setup is completed", async () => {
      for (const data of [
        homeData({ running: false }),
        homeData({ running: false, hasTiers: false }),
        homeData({ running: true, setupCompleted: true, importState: "done" }),
      ]) {
        stubAppBridge("available");
        await renderHome(data);
        expect(card()).not.toBeNull();
        expect(dismiss()).toBeNull();
        cleanup();
      }
    });
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

      // Dismissed, and setup completed: the card goes
      await renderHome(homeData({ running: true, importState: "done", importDismissed: true, setupCompleted: true }));
      expect(card()).toBeNull();
    });

    it("names the buyers it brought in before there are tiers, and says they are placed at the base rate", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ hasTiers: false, running: false, importState: "done", importedBuyers: 14 }));
      expect(card()?.textContent).toContain("Brought in 14 buyers' past orders. They're placed in tiers when you save your base rate.");
      expect(card()?.textContent).not.toContain("0 buyers");
    });

    // Ruling 82: followed for two minutes, and only while the outcome says so
    it("says they are being placed while the pass runs, and follows it until it has", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ importState: "done", placing: true }));
      expect(card()?.textContent).toContain("Brought in 14 buyers' past orders. They're being placed in tiers.");
      // Counted again from the import's end, which changes the key
      expect(usePolling).toHaveBeenLastCalledWith(true, expect.any(Number), { forMs: 120_000, restartKey: "done" });
      cleanup();

      await renderHome(homeData({ importState: "done" }));
      expect(usePolling).toHaveBeenLastCalledWith(false, expect.any(Number), { forMs: 120_000, restartKey: "done" });
      cleanup();

      // A pass asked for on Tiers, the outcome long dismissed: nothing on Home says it, so nothing follows it
      await renderHome(homeData({ importState: "done", importDismissed: true, placing: true }));
      expect(usePolling).toHaveBeenLastCalledWith(false, expect.any(Number), { forMs: 120_000, restartKey: "done" });
      cleanup();

      // No tiers yet: the outcome says they are placed when the base rate is saved, which nothing follows yet
      await renderHome(homeData({ hasTiers: false, running: false, importState: "done", placing: true }));
      expect(usePolling).toHaveBeenLastCalledWith(false, expect.any(Number), { forMs: 120_000, restartKey: "done" });
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

    // Built for Shopify 4.2.4 reason 2: errors are red
    it("shows what couldn't be brought in in red, and the rest of the outcome as before", async () => {
      const lines = () =>
        [...(card()?.querySelectorAll("[data-import-outcome] s-text") ?? [])].map((line) => [line.textContent, line.getAttribute("tone"), line.getAttribute("color")]);
      stubAppBridge("active");
      await renderHome(homeData({ importState: "failed", importedOrders: 0 }));
      expect(lines()).toEqual([["Your past orders couldn't be brought in, so buyers start in the lowest tier.", "critical", null]]);
      cleanup();

      await renderHome(homeData({ importState: "done", unreadable: true, importedOrders: 1200 }));
      expect(lines()).toEqual([
        ["Brought in 1,200 of your past orders; the rest couldn't be read.", "critical", null],
        ["Done: 14 buyers placed in tiers", null, "subdued"],
      ]);
      cleanup();

      await renderHome(homeData({ importState: "done" }));
      expect(lines()).toEqual([["Done: 14 buyers placed in tiers", null, "subdued"]]);
    });

    it("shows its progress while it runs, and follows it", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ importState: "running" }));
      expect(card()?.textContent).toContain(
        "Bringing in your last 12 months of orders so buyers start in the right tier. These orders earn no cashback.",
      );
      // For as long as it runs (plan Decision 13)
      expect(usePolling).toHaveBeenLastCalledWith(true, expect.any(Number), { forMs: undefined, restartKey: "running" });
    });
  });

  describe("Cashback status", () => {
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

      // Named for what it is about (Built for Shopify 4.2.1), for assistive technology too where it has no heading
      expect(line.querySelector("s-section")?.getAttribute("accessibilityLabel")).toBe("Cashback status");

      // The side column's card, only when it is beside the main one
      const aside = document.querySelector('s-page > [slot="aside"]')!;
      expect(aside.tagName.toLowerCase()).toBe("s-box");
      expect(aside.getAttribute("display")).toBe(BESIDE);
      expect(aside.querySelector("s-section")?.getAttribute("heading")).toBe("Cashback status");
      expect(aside.querySelectorAll("s-switch")).toHaveLength(1);
      expect(document.querySelectorAll("s-switch")).toHaveLength(2);
      // Tiers stays in the side column at every width, last on a phone
      expect(document.querySelectorAll('s-page > [slot="aside"]')[1].getAttribute("heading")).toBe("Tiers");
    });

    it("says what the switch does, matching it", async () => {
      stubAppBridge("active");
      await renderHome(homeData({ running: true }));
      expect(screen.getByText("On: paid orders earn cashback as store credit, at the rate of the buyer's tier before the order counts. Some earn nothing, such as test orders, orders with no customer attached and orders placed before RewardsPro was installed.")).toBeTruthy();
      expect(screen.queryByText("Off: orders still count toward tiers but earn no cashback.")).toBeNull();
      expect([...document.querySelectorAll("s-switch")].map((toggle) => toggle.hasAttribute("checked"))).toEqual([true, true]);
      cleanup();

      await renderHome(homeData({ running: false }));
      expect(screen.getByText("Off: orders still count toward tiers but earn no cashback.")).toBeTruthy();
      expect(screen.queryByText("On: paid orders earn cashback as store credit, at the rate of the buyer's tier before the order counts. Some earn nothing, such as test orders, orders with no customer attached and orders placed before RewardsPro was installed.")).toBeNull();
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

    // Built for Shopify 4.2.3: the widget's status where App Bridge can't give it (the Shopify app on a phone, Ruling 59)
    it("says it can't check the widget where App Bridge can't answer, and is checking only while it waits", async () => {
      const completed = homeData({ setupCompleted: true, importDismissed: true });
      // No App Bridge to ask
      vi.stubGlobal("shopify", undefined);
      await renderHome(completed);
      expect(widgetRow()?.textContent).toBe("Widget: can't check here");
      expect(widgetRow()?.querySelector("s-icon")?.getAttribute("type")).toBe("circle-dashed");
      // On a phone too, under the one line
      expect(boxShown(BELOW).textContent).toContain("Widget: can't check here");
      cleanup();

      // A refusal
      const refused = stubAppBridgeLater();
      await renderHome(completed);
      expect(widgetRow()?.textContent).toBe("Widget: checking");
      await refused.answer("refused");
      expect(widgetRow()?.textContent).toBe("Widget: can't check here");
      cleanup();

      // No answer in time, then a late one, which still counts. The clock also runs on by itself, so the page's own
      // short waits (the router's, the test library's) pass as they would
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
      try {
        const late = stubAppBridgeLater();
        await renderHome(completed);
        expect(widgetRow()?.textContent).toBe("Widget: checking");
        // A second short of the wait (the clock's own running adds a few milliseconds), then past it
        await act(async () => {
          vi.advanceTimersByTime(WIDGET_CHECK_MS - 1_000);
        });
        expect(widgetRow()?.textContent).toBe("Widget: checking");
        await act(async () => {
          vi.advanceTimersByTime(1_000);
        });
        expect(widgetRow()?.textContent).toBe("Widget: can't check here");
        await late.answer("active");
        expect(widgetRow()?.textContent).toBe("Widget is on");
      } finally {
        vi.useRealTimers();
      }
    });

    it("links a widget that is off to the theme editor, in the admin, wherever it says so", async () => {
      stubAppBridge("available");
      await renderHome(homeData({ setupCompleted: true, importDismissed: true }));
      for (const row of [widgetRow(), boxShown(BELOW)]) {
        const link = row?.querySelector("s-link");
        // Named in full for a screen reader's list of links, where "Turn it on" alone says nothing
        expect([link?.textContent, link?.getAttribute("href"), link?.getAttribute("target"), link?.getAttribute("accessibilityLabel")]).toEqual([
          "Turn it on",
          "https://home-dom.myshopify.com/admin/themes/current/editor",
          "_top",
          "Turn on the widget in your theme",
        ]);
      }
      cleanup();

      stubAppBridge("active");
      await renderHome(homeData({ setupCompleted: true, importDismissed: true }));
      expect(widgetRow()?.textContent).toBe("Widget is on");
      expect(widgetRow()?.querySelector("s-link")).toBeNull();
    });

    // One banner at a time (4.3.4) must not hide a problem on a phone, where the card beside is hidden
    it("names store credit that can't be spent under the phone's status line when the one banner is another, with where to fix it", async () => {
      const storeCreditRow = (scope: ParentNode) =>
        [...scope.querySelectorAll('s-stack[direction="inline"]')].find((row) => row.querySelector(":scope > s-text")?.textContent?.startsWith("Store credit"));
      const aside = () => document.querySelector('s-section[heading="Cashback status"]')!;
      const fix = (row: Element | undefined) => {
        const link = row?.querySelector("s-link");
        return [link?.textContent, link?.getAttribute("href"), link?.getAttribute("target")];
      };
      const settings = ["Open customer account settings", "shopify://admin/settings/customer_accounts", "_top"];
      stubAppBridge("active");
      const data = homeData({ setupCompleted: true, importDismissed: true, storeCreditReady: false });
      data.bannerFacts = { ...(data.bannerFacts as Record<string, unknown>), privacyDueAt: "2026-12-05T10:00:00Z", spendProblems: ["store-credit-off"] };
      await renderHome(data);
      // The data request has the one banner
      expect([...document.querySelectorAll("s-banner")].map((banner) => banner.textContent)).toEqual([
        "A customer asked for their data. Download it by December 5, 2026. Open customer data requests",
      ]);
      expect(boxShown(BELOW).textContent).toContain("Cashback is on. 1 check needs you.");
      expect(storeCreditRow(boxShown(BELOW))?.textContent).toBe("Store credit can't be spent yetOpen customer account settings");
      expect(fix(storeCreditRow(boxShown(BELOW)))).toEqual(settings);
      expect(fix(storeCreditRow(aside()))).toEqual(settings);
      cleanup();

      // The banner names it, with its cause: the phone's line doesn't repeat it; the card beside keeps its row and link
      data.bannerFacts = { ...(data.bannerFacts as Record<string, unknown>), privacyDueAt: null };
      await renderHome(data);
      expect(document.querySelector("s-banner")?.textContent).toContain("Buyers can't spend their store credit yet");
      expect(storeCreditRow(boxShown(BELOW))).toBeUndefined();
      expect(fix(storeCreditRow(aside()))).toEqual(settings);
      cleanup();

      // Store credit that can be spent, or that Shopify didn't answer for, has no row under the line and no link
      for (const ready of [true, null]) {
        await renderHome(homeData({ setupCompleted: true, importDismissed: true, storeCreditReady: ready }));
        expect(storeCreditRow(boxShown(BELOW))).toBeUndefined();
        expect(storeCreditRow(aside())?.querySelector("s-link")).toBeNull();
        cleanup();
      }
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
        "Cashback status",
        "Tiers",
      ]);
      expect(
        [...document.querySelectorAll('s-section > s-button[slot="secondary-actions"]')].map((link) => [
          link.closest("s-section")?.getAttribute("heading"),
          link.textContent || link.getAttribute("accessibilityLabel"),
          link.getAttribute("href"),
        ]),
      ).toEqual([
        // The setup card's own Dismiss, an icon-only button with no link, named for assistive technology
        ["Set up cashback", "Dismiss setup", null],
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
    // The page's slot for it, the banner itself
    expect(document.querySelector('s-page > s-banner[slot="supplemental-start"]')).not.toBeNull();
  });

  // Built for Shopify 4.3.4 reason 2: never two banners together
  it("shows one banner, the most urgent, however many apply", async () => {
    stubAppBridge("available");
    const data = homeData({ needsLook: 2 });
    data.bannerFacts = { ...(data.bannerFacts as Record<string, unknown>), privacyDueAt: "2026-12-05T10:00:00Z", spendProblems: ["store-credit-off"] };
    await renderHome(data);
    expect([...document.querySelectorAll("s-banner")].map((banner) => banner.textContent)).toEqual([
      "A customer asked for their data. Download it by December 5, 2026. Open customer data requests",
    ]);
    cleanup();

    data.bannerFacts = { ...(data.bannerFacts as Record<string, unknown>), privacyDueAt: null };
    await renderHome(data);
    expect([...document.querySelectorAll("s-banner")].map((banner) => banner.textContent)).toEqual([
      "Buyers can't spend their store credit yet: store credit is turned off in Settings > Customer accounts. Open customer account settings",
    ]);
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

  // The setup card's step and the cashback status card say it, so a banner would only repeat them (4.3.4), late (2.1.2)
  it("says the widget embed is off in the setup step and the status card, never in a banner", async () => {
    stubAppBridge("available");
    await renderHome(homeData());
    expect(document.querySelector("s-banner")).toBeNull();
    expect(card()?.querySelector('s-link[target="_top"]')?.textContent).toBe("Turn on the widget in your theme");
    expect(widgetRow()?.textContent).toBe("Widget is offTurn it on");
    // While the steps say it, the phone's status line doesn't repeat it
    expect(boxShown(BELOW).textContent).not.toContain("Widget");
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

  // M3d-F7: the pages' one empty-state pattern, and the next step as Tiers gives it
  it("says what comes next where there is nothing yet", async () => {
    stubAppBridge("active");
    const data = homeData({ running: false, hasTiers: false });
    await renderHome({ ...data, stats: { ...(data.stats as Record<string, unknown>), recent: [] } });
    expect(document.querySelector('s-section[heading="Recent rewards"]')?.textContent).toContain(
      "No rewards yet. They appear here after a paid order earns cashback.",
    );
    expect(document.querySelector('s-section[heading="Tiers"]')?.textContent).toContain(
      "No tiers yet. Set your base cashback rate to add your first one; everyone starts there.",
    );
  });

  // OPERATIONS-9: the base rate as typed, under the field name the action reads
  it("posts the base rate as typed in the setup card", async () => {
    stubAppBridge("active");
    const posted: Posted[] = [];
    await renderHome(homeData({ running: false, hasTiers: false }), posted);
    const field = document.querySelector('s-number-field[name="percent"]')!;
    // What the rate is paid on (words.ts CASHBACK_BASE), as order-facts.ts cashbackBase works it out
    expect(field.getAttribute("details")).toBe(
      "Everyone starts at this rate. Cashback is paid on the product price after discounts, less anything paid with store credit or gift cards. Shipping, duties, tips and gift cards bought earn nothing.",
    );

    await act(async () => {
      Object.defineProperty(field, "value", { value: "6", configurable: true, writable: true });
      fireEvent.input(field);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save", { selector: "[data-setup-card] s-button" }));
    });

    expect(posted.map((post) => post.fields)).toEqual([{ intent: "base-rate", percent: "6" }]);
  });

});

// #173: asked only right after a save that worked, never when the page loads, with one neutral sentence
describe("the review request", () => {
  const due = { reviewDue: true, setupCompleted: true, importDismissed: true };
  const switches = () => [...document.querySelectorAll("s-switch")];
  const reviewCard = () => document.querySelector("[data-review-card]");
  const flip = async (checked: boolean) => {
    const toggle = switches()[0];
    await act(async () => {
      Object.defineProperty(toggle, "checked", { value: checked, configurable: true, writable: true });
      fireEvent.change(toggle);
    });
    // The switch is enabled again once the post and the reload after it are done
    await waitFor(() => expect(switches()[0].hasAttribute("disabled")).toBe(false));
  };
  /** Home whose switch saves: each "running" post answers `answer` and the page reloads with its new state. */
  const renderSaving = async (o: { running: boolean; reviewDue?: boolean; answer?: { ok: boolean; error?: string } }, posted: Posted[] = []) => {
    let running = o.running;
    const data = () => homeData({ ...due, reviewDue: o.reviewDue ?? true, running });
    await renderHome(data(), posted, {
      answer: async (fields) => {
        // What Shopify showed is recorded by a post that stays in flight
        if (fields.intent !== "running") return new Promise(() => {});
        const answer = o.answer ?? { ok: true };
        if (answer.ok) running = fields.running === "on";
        return answer;
      },
      next: data,
    });
  };

  it("never asks when the page loads, and shows its one sentence with a link to the review form and Don't ask again", async () => {
    const request = vi.fn(async () => ({ code: "success" }));
    stubAppBridge("active", request);
    const posted: Posted[] = [];
    await renderHome(homeData(due), posted);
    await act(async () => {});

    expect(request).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
    // The whole card: nothing offered, no sentiment asked for (App Store requirement 1.3.1)
    expect(reviewCard()?.textContent).toBe(
      "How is RewardsPro working for your shop? An honest review, good or bad, helps other merchants decide.Leave a reviewDon't ask again",
    );
    const link = reviewCard()?.querySelector("s-link");
    expect([link?.getAttribute("href"), link?.getAttribute("target")]).toEqual(["https://apps.shopify.com/rewards-pro#modal-show=WriteReviewModal", "_blank"]);
    cleanup();

    await renderHome(homeData({ ...due, reviewDue: false }));
    expect(reviewCard()).toBeNull();
  });

  it("asks once a visit, right after cashback is switched on, and records what Shopify showed", async () => {
    const request = vi.fn(async () => ({ code: "success" }));
    stubAppBridge("active", request);
    const posted: Posted[] = [];
    await renderSaving({ running: false }, posted);

    await flip(true);
    await waitFor(() => expect(posted.map((post) => post.fields)).toEqual([{ intent: "running", running: "on" }, { intent: "review-shown", code: "success" }]));
    expect(request).toHaveBeenCalledTimes(1);

    // Off and on again in the same visit asks nothing more
    await flip(false);
    await flip(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask after cashback is switched off, after a save that failed, or while it isn't due", async () => {
    for (const [o, to] of [
      [{ running: true }, false],
      [{ running: false, answer: { ok: false, error: "Set your base cashback rate first." } }, true],
      [{ running: false, reviewDue: false }, true],
    ] as const) {
      const request = vi.fn(async () => ({ code: "success" }));
      stubAppBridge("active", request);
      const posted: Posted[] = [];
      await renderSaving(o, posted);

      await flip(to);

      expect(posted.map((post) => post.fields)).toEqual([{ intent: "running", running: to ? "on" : "off" }]);
      expect(request).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("takes Don't ask again without aborting the post that recorded the request shown", async () => {
    stubAppBridge("active", async () => ({ code: "success" }));
    const posted: Posted[] = [];
    await renderSaving({ running: false }, posted);
    await flip(true);
    await waitFor(() => expect(posted.at(-1)?.fields).toEqual({ intent: "review-shown", code: "success" }));

    await act(async () => {
      fireEvent.click(screen.getByText("Don't ask again", { selector: "s-section s-button" }));
    });

    expect(posted.map((post) => post.fields).slice(1)).toEqual([{ intent: "review-shown", code: "success" }, { intent: "review-dismissed" }]);
    // A19-F7: its own fetcher, so the record stays in flight
    expect(abortedByPage(posted[1].request)).toBe(false);
    expect(reviewCard()).toBeNull();
  });

  // Built for Shopify 4.3.2: going to the review form ends the asking, as Don't ask again does
  it("retires the card when the merchant opens the review form from it, and doesn't ask after a save", async () => {
    const request = vi.fn(async () => ({ code: "success" }));
    stubAppBridge("active", request);
    const posted: Posted[] = [];
    await renderSaving({ running: false }, posted);

    await act(async () => {
      fireEvent.click(screen.getByText("Leave a review", { selector: "[data-review-card] s-link" }));
    });

    expect(posted.map((post) => post.fields)).toEqual([{ intent: "review-opened" }]);
    expect(reviewCard()).toBeNull();

    await flip(true);
    expect(posted.map((post) => post.fields)).toEqual([{ intent: "review-opened" }, { intent: "running", running: "on" }]);
    expect(request).not.toHaveBeenCalled();
  });

  it("doesn't ask after a save made while Don't ask again is still being recorded", async () => {
    const request = vi.fn(async () => ({ code: "success" }));
    stubAppBridge("active", request);
    const posted: Posted[] = [];
    // Its post stays in flight, and each reload still says due
    await renderSaving({ running: false }, posted);
    await act(async () => {
      fireEvent.click(screen.getByText("Don't ask again", { selector: "s-section s-button" }));
    });

    await flip(true);

    expect(posted.map((post) => post.fields)).toEqual([{ intent: "review-dismissed" }, { intent: "running", running: "on" }]);
    expect(request).not.toHaveBeenCalled();
  });
});
