// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { abortedByPage, fieldsOf, letFetchersPost } from "../helpers/fetcher-posts";

// The page's loader and action are replaced by the stub's hydration data;
// nothing here reaches Shopify or the database. Where a test posts, the post
// goes to a stand-in action (letFetchersPost).
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

const { default: Home } = await import("~/routes/app._index");

type HomeData = Record<string, unknown>;

/** Home's loader data for a GBP shop, with `overrides`. */
function homeData(
  overrides: {
    running?: boolean;
    hasTiers?: boolean;
    importState?: string;
    importError?: string | null;
    importDismissed?: boolean;
    placedBuyers?: number;
    storeCreditReady?: boolean | null;
    reviewDue?: boolean;
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
      daily: [
        { date: "2026-11-01", given: "2.50", spent: "0" },
        { date: "2026-11-02", given: "4.20", spent: "11.00" },
      ],
      recent: [
        { orderId: "o1", orderName: "#1012", buyer: "Sam K.", tierName: "Everyone", amount: "£2.50", status: "Issued", tone: "success", detail: null },
        { orderId: "o2", orderName: "#1011", buyer: "Priya R.", tierName: "Everyone", amount: "£4.20", status: "Waiting", tone: "info", detail: null },
        {
          orderId: "o3",
          orderName: "#1009",
          buyer: "Customer ····7001",
          tierName: "Everyone",
          amount: "-£0.40",
          status: "Taken back",
          tone: "neutral",
          detail: "Took back £0.40 of £1.00; the buyer had spent the rest",
        },
      ],
      tiers: hasTiers ? [{ id: "t1", name: "Everyone", percent: "5", members: 14 }] : [],
      needsLook: 0,
      cashbackOrders: 3,
    },
    bannerFacts: { privacyDueAt: null, spendProblems: [], needsLook: 0, timezone: "Europe/London", themeEditorUrl: "https://home-dom.myshopify.com/admin/themes/current/editor" },
    setup: {
      importState: overrides.importState ?? "done",
      importError: overrides.importError ?? null,
      importDismissed: overrides.importDismissed ?? false,
      importHorizonDays: 365,
      placedBuyers: overrides.placedBuyers ?? 14,
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

/** Each post Home makes, with its request; the stand-in action never answers, so each stays in flight. */
type Posted = { fields: Record<string, string>; request: Request };

async function renderHome(data: HomeData, posted?: Posted[]) {
  const action = async ({ request }: { request: Request }) => {
    posted?.push({ fields: await fieldsOf(request), request });
    return new Promise(() => {});
  };
  const Stub = createRoutesStub([{ id: "routes/app._index", path: "/app", Component: Home, ...(posted ? { action } : {}) }]);
  render(<Stub initialEntries={["/app"]} hydrationData={{ loaderData: { "routes/app._index": data } }} />);
  await screen.findByText("This month");
  // Let the widget check settle
  await act(async () => {});
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("shows the setup card while a step is left, and hides it once every step is done", async () => {
    const extensions = stubAppBridge("active");
    await renderHome(homeData({ running: false }));
    expect(extensions).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-setup-card]")).not.toBeNull();
    expect(screen.getByText("Switch cashback on")).toBeTruthy();
    cleanup();

    stubAppBridge("available");
    await renderHome(homeData({ running: true }));
    expect(document.querySelector("[data-setup-card]")).not.toBeNull();
    expect(screen.getByText("Turn on the widget in your theme")).toBeTruthy();
    cleanup();

    // Every step done, and the import's outcome already dismissed
    stubAppBridge("active");
    await renderHome(homeData({ running: true, importDismissed: true }));
    expect(document.querySelector("[data-setup-card]")).toBeNull();
  });

  // The Dismiss click itself isn't driven here: a fetcher submission builds a
  // Node Request, which refuses jsdom's AbortSignal. The Postgres suite runs
  // the import-dismissed action and the loader that then reports it.
  it("keeps the setup card for the import's outcome when it ends after every other step, until it is dismissed", async () => {
    stubAppBridge("active");
    const error = "1 of 3 past orders could not be read, so their spend is not counted: #1";
    await renderHome(homeData({ running: true, importState: "done", importError: error, placedBuyers: 14 }));

    const card = document.querySelector("[data-setup-card]");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Done: 14 buyers placed in tiers");
    expect(card?.textContent).toContain(error);
    // The other steps show as done
    expect(card?.textContent).toContain("Your base cashback rate: 5%");
    expect(card?.textContent).toContain("Cashback is on");
    expect(card?.textContent).toContain("The widget is on in your theme");

    const outcome = card?.querySelector("[data-import-outcome]");
    expect([...(outcome?.querySelectorAll("s-button") ?? [])].map((button) => button.textContent)).toEqual(["Dismiss"]);
    cleanup();

    // Dismissed: every step is done, so the card goes
    await renderHome(homeData({ running: true, importState: "done", importError: error, importDismissed: true }));
    expect(document.querySelector("[data-setup-card]")).toBeNull();
  });

  it("keeps the setup card for a failed import's sentence and its error when every other step is done", async () => {
    stubAppBridge("active");
    const error = "Shopify could not run the bulk query: THROTTLED";
    await renderHome(homeData({ running: true, importState: "failed", importError: error }));
    const card = document.querySelector("[data-setup-card]");
    expect(card?.textContent).toContain("Your past orders couldn't be brought in, so buyers start in the lowest tier.");
    expect(card?.textContent).toContain(error);
    expect(card?.textContent).not.toContain("placed in tiers");
  });

  it("keeps the setup card while the import runs, then says how many buyers it placed", async () => {
    stubAppBridge("active");
    await renderHome(homeData({ importState: "running" }));
    expect(document.querySelector("[data-setup-card]")?.textContent).toContain(
      "Bringing in your last 12 months of orders so buyers start in the right tier",
    );
    cleanup();

    await renderHome(homeData({ hasTiers: false, importState: "done", placedBuyers: 14 }));
    expect(document.querySelector("[data-setup-card]")?.textContent).toContain("Done: 14 buyers placed in tiers");
  });

  it("says what the switch does, matching it", async () => {
    stubAppBridge("active");
    await renderHome(homeData({ running: true }));
    expect(screen.getByText("On: every paid order earns cashback as store credit.")).toBeTruthy();
    expect(screen.queryByText("Off: orders still count toward tiers but earn no cashback.")).toBeNull();
    expect(document.querySelector("s-switch")?.hasAttribute("checked")).toBe(true);
    cleanup();

    await renderHome(homeData({ running: false }));
    expect(screen.getByText("Off: orders still count toward tiers but earn no cashback.")).toBeTruthy();
    expect(screen.queryByText("On: every paid order earns cashback as store credit.")).toBeNull();
    expect(document.querySelector("s-switch")?.hasAttribute("checked")).toBe(false);
  });

  it("shows the numbers in the shop's currency, the recent rewards and the tiers", async () => {
    stubAppBridge("active");
    await renderHome(homeData());
    const text = document.body.textContent ?? "";
    expect(text).toContain("£24.50");
    expect(text).toContain("£11.00");
    expect(text).toContain("Sam K.");
    // A take-back at what it took, with the spec's sentence (Ruling 65)
    expect(text).toContain("-£0.40");
    expect(text).toContain("Took back £0.40 of £1.00; the buyer had spent the rest");
    expect([...document.querySelectorAll("s-badge")].map((badge) => [badge.textContent, badge.getAttribute("tone")])).toEqual([
      ["Issued", "success"],
      ["Waiting", "info"],
      ["Taken back", "neutral"],
    ]);
    expect(text).toContain("14 members");
    // The widget is on, so no banner
    expect(document.querySelector('[slot="supplemental-start"]')).toBeNull();
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

  // docs Q2, Q3: an admin settings link opens in the admin, as the theme editor's does
  it("opens Shopify's own settings from a banner in the admin, not a new tab", async () => {
    stubAppBridge("available");
    const data = homeData();
    data.bannerFacts = { ...(data.bannerFacts as Record<string, unknown>), spendProblems: ["store-credit-off"] };
    await renderHome(data);
    expect(document.querySelector('s-banner s-link[href="shopify://admin/settings/customer_accounts"]')?.getAttribute("target")).toBe("_top");
    expect(document.querySelector('s-banner s-link[href^="https://home-dom.myshopify.com/admin/themes"]')?.getAttribute("target")).toBe("_top");
  });

  it("warns when the widget embed is off", async () => {
    stubAppBridge("available");
    await renderHome(homeData());
    expect(document.querySelector('[slot="supplemental-start"]')?.textContent).toContain("The rewards widget is off in your theme.");
  });
});

// CONCURRENCY-2 and A19-F7: one post per control at a time, each control its own
describe("Home's controls", () => {
  it("disables the cashback switch while its change is posted, and posts one change", async () => {
    letFetchersPost();
    stubAppBridge("active");
    const posted: Posted[] = [];
    await renderHome(homeData({ running: true }), posted);
    const toggle = document.querySelector("s-switch")!;
    expect(toggle.hasAttribute("disabled")).toBe(false);

    const flip = async (checked: boolean) => {
      await act(async () => {
        Object.defineProperty(toggle, "checked", { value: checked, configurable: true, writable: true });
        fireEvent.change(toggle);
      });
    };
    await flip(false);
    await flip(true);

    expect(posted.map((post) => post.fields)).toEqual([{ intent: "running", running: "off" }]);
    expect(toggle.hasAttribute("disabled")).toBe(true);
  });

  it("dismisses the review request without aborting the post that recorded it shown", async () => {
    letFetchersPost();
    stubAppBridge("active", async () => ({ code: "success" }));
    const posted: Posted[] = [];
    await renderHome(homeData({ reviewDue: true, importDismissed: true }), posted);
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
