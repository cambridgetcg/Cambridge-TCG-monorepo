// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub, useRevalidator } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE } from "~/admin/guide-words";
import { MAX_BINS } from "~/lib/ladder";
import { TIER_ERRORS } from "~/lib/tiers.server";
import type { WelcomeData } from "~/routes/app.welcome";
import { fieldsOf, letFetchersPost } from "../helpers/fetcher-posts";

// The guide's loader and action are replaced by stand-ins; nothing here
// reaches Shopify or the database. What they read and write is in the
// Postgres suite (welcome-page); here the page's posts go to a stand-in
// action (letFetchersPost) that records them.
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

// What the page asks of polling is recorded, and the page's revalidator is
// kept so a test can refresh the page's data as a poll would
const usePolling = vi.fn();
let refresh: (() => Promise<void>) | null = null;
vi.mock("~/admin/polling", async (original) => ({
  ...(await original<typeof import("~/admin/polling")>()),
  usePolling: (...args: unknown[]) => {
    usePolling(...args);
    refresh = useRevalidator().revalidate;
  },
}));

const { default: Welcome } = await import("~/routes/app.welcome");

const SHOP = "welcome-dom.myshopify.com";

// jsdom lays nothing out and has no pointer capture or PointerEvent: the
// picture's drag reads only clientX, buttons and pointerId (as the chart's own test)
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.hasPointerCapture = () => false;
if (typeof window.PointerEvent === "undefined") {
  class PointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEvent as typeof window.PointerEvent;
}

// 10 buyers who spent under 60, 6 in 250-259, 3 in 350-359, 2 in 600-609, at a bin width of 10;
// the replay's base in the same bins
const BIN_WIDTH = 10;
const buyers = Array.from({ length: MAX_BINS }, () => 0);
buyers[5] = 10;
buyers[25] = 6;
buyers[35] = 3;
buyers[60] = 2;
const earnBase = Array.from({ length: MAX_BINS }, () => "0");
earnBase[5] = "100";
earnBase[25] = "300";
earnBase[35] = "200";
earnBase[60] = "400";

type Ladder = NonNullable<WelcomeData["ladder"]>;
const ladder = (o: Partial<Ladder> = {}): Ladder => ({
  binWidth: BIN_WIDTH,
  buyers,
  earnBase,
  estimate: false,
  spenders: 21,
  p80: "200",
  p95: "500",
  medianOrder: "45",
  multiCurrency: false,
  suggested: [200, 500],
  fromData: true,
  ...o,
});

const ORDER_1001 = {
  orderId: "o1",
  name: "#1001",
  externalCustomerId: "7001",
  status: { key: "waiting", label: "Waiting", detail: null },
  cashback: { amount: "0.30", currency: "GBP" },
} as const;
const ORDER_1002 = {
  orderId: "o2",
  name: "#1002",
  externalCustomerId: "7002",
  status: { key: "issued", label: "Issued", detail: null },
  cashback: { amount: "0.60", currency: "GBP" },
} as const;

const welcomeData = (o: Partial<WelcomeData> = {}): WelcomeData => ({
  step: 1,
  editable: true,
  canGoLive: false,
  running: false,
  currency: "GBP",
  period: "12 months",
  importState: "done",
  importedOrders: 120,
  importLines: [],
  medianOrder: "45",
  multiCurrency: false,
  ladder: null,
  everyonePercent: null,
  firstPercent: null,
  storeCredit: true,
  storeCreditBanner: null,
  storeCreditLink: null,
  themeEditorUrl: `https://${SHOP}/admin/themes/current/editor?context=apps&activateAppId=k1/membership_widget`,
  draftOrderUrl: `https://${SHOP}/admin/draft_orders/new`,
  placing: false,
  switchedOnAt: null,
  tryIt: [],
  ...o,
});
const step2 = (o: Partial<WelcomeData> = {}) => welcomeData({ step: 2, ladder: ladder(), ...o });
const step3 = (o: Partial<WelcomeData> = {}) => welcomeData({ step: 3, editable: false, canGoLive: true, firstPercent: 3, ...o });
const live = (o: Partial<WelcomeData> = {}) => step3({ running: true, switchedOnAt: "2026-11-08T10:00:00.000Z", ...o });

/** App Bridge's `shopify` global, with the widget embed in the given state. */
function stubAppBridge(status: "active" | "available") {
  const extensions = vi.fn(async () => [
    {
      handle: "rewardspro-theme-extension",
      type: "theme_app_extension",
      activations: [{ handle: "membership_widget", name: "Rewards widget", target: "body", status, activations: [] }],
    },
  ]);
  vi.stubGlobal("shopify", { app: { extensions } });
}

/**
 * The guide at its step with `first` as its data; each later load (a
 * refresh, or the revalidation after a post) reads `next()`. Each post goes
 * to `posted`; `answer` is what the action gives back (a promise that never
 * settles keeps the post in flight). /app is a stand-in Home.
 */
async function renderWelcome(
  first: WelcomeData,
  o: { next?: () => WelcomeData; posted?: Array<Record<string, string>>; answer?: () => unknown } = {},
) {
  letFetchersPost();
  const Stub = createRoutesStub([
    {
      id: "routes/app.welcome",
      path: "/app/welcome",
      Component: Welcome,
      loader: () => (o.next ?? (() => first))(),
      action: async ({ request }) => {
        o.posted?.push(await fieldsOf(request));
        return o.answer ? o.answer() : { ok: true };
      },
    },
    { id: "routes/app._index", path: "/app", Component: () => <p>Home page</p> },
  ]);
  render(<Stub initialEntries={[`/app/welcome?step=${first.step}`]} hydrationData={{ loaderData: { "routes/app.welcome": first } }} />);
  await screen.findByText(GUIDE.steps[0]);
  // Let the widget check settle
  await act(async () => {});
}

/** Type `value` into a Polaris field, as its input event reports it. */
const type = (field: Element, value: string) =>
  act(async () => {
    Object.defineProperty(field, "value", { value, configurable: true, writable: true });
    fireEvent.input(field);
  });

/** A field by its name. */
const field = (name: string) => document.querySelector(`[name="${name}"]`)!;

/** What a field shows: the value React set on it (a property once typed into, an attribute before). */
const shown = (name: string) => {
  const element = field(name) as Element & { value?: string };
  return element.value ?? element.getAttribute("value");
};

/** A button by its text. */
const button = (text: string) => [...document.querySelectorAll("s-button")].find((b) => b.textContent === text)!;

const click = (element: Element) =>
  act(async () => {
    fireEvent.click(element);
  });

/** The polite live region's text. */
const liveText = () => document.querySelector('[role="status"]')?.textContent ?? null;

beforeEach(() => {
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  usePolling.mockClear();
  refresh = null;
});

describe("The guide, every step", () => {
  it("shows its heading, the progress and the step names", async () => {
    await renderWelcome(step2());
    expect(document.querySelector("s-page")?.getAttribute("heading")).toBe(GUIDE.heading);
    const progress = document.querySelector("s-progress")!;
    expect([progress.getAttribute("value"), progress.getAttribute("max"), progress.getAttribute("accessibilityLabel")]).toEqual(["2", "3", "Step 2 of 3"]);
    for (const name of GUIDE.steps) screen.getByText(name);
  });

  it("shows the widget's status on every step", async () => {
    for (const data of [welcomeData(), step2(), step3()]) {
      stubAppBridge("available");
      await renderWelcome(data);
      expect(screen.getAllByText(GUIDE.widgetNo)).toHaveLength(1);
      cleanup();
    }
  });

  it("posts Finish later and goes Home only once it's recorded", async () => {
    const posted: Array<Record<string, string>> = [];
    let answer: (value: unknown) => void = () => {};
    await renderWelcome(welcomeData(), { posted, answer: () => new Promise((resolve) => (answer = resolve)) });

    await click(button(GUIDE.finishLater));
    expect(posted).toEqual([{ intent: "finish-later" }]);
    expect(screen.queryByText("Home page")).toBeNull();
    screen.getByText(GUIDE.creditTitle);

    await act(async () => answer({ ok: true }));
    await screen.findByText("Home page");
  });

  it("polls once for the page, and restarts when the merchant returns", async () => {
    stubAppBridge("available");
    await renderWelcome(step2({ importState: "running", importedOrders: 40 }));
    // One call for the whole page, on each render
    expect(new Set(usePolling.mock.calls.map((call) => call[1]))).toEqual(new Set([10_000]));
    expect(usePolling).toHaveBeenLastCalledWith(true, 10_000, { forMs: undefined, restartKey: "running::0" });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(usePolling).toHaveBeenLastCalledWith(true, 10_000, { forMs: undefined, restartKey: "running::1" });
  });

  it("follows the tier pass for two minutes, and stops once nothing is moving", async () => {
    await renderWelcome(step3({ placing: true }));
    expect(usePolling).toHaveBeenLastCalledWith(true, 10_000, { forMs: 120_000, restartKey: "done::0" });
    cleanup();
    usePolling.mockClear();
    await renderWelcome(step3());
    expect(usePolling).toHaveBeenLastCalledWith(false, 10_000, { forMs: 120_000, restartKey: "done::0" });
  });
});

describe("Step 1: How it works", () => {
  it("teaches the two basics on step 1 and offers Next", async () => {
    await renderWelcome(welcomeData());
    screen.getByText(GUIDE.creditTitle);
    screen.getByText(GUIDE.creditBody);
    screen.getByText(GUIDE.nextTimeTitle);
    screen.getByText(GUIDE.nextTimeBody);
    // The example at the suggested base rate: 50 near the median of 45, 3% of it
    screen.getByText(GUIDE.example("£50.00", "£1.50"));
    expect(button(GUIDE.next).getAttribute("href")).toBe("/app/welcome?step=2");
    expect(screen.queryByText(GUIDE.creditCurrency)).toBeNull();
    // The tiles sit side by side, and stack in a narrow page
    expect(document.querySelector("s-query-container s-grid")?.getAttribute("gridTemplateColumns")).toMatch(/^@container .+ 1fr 1fr, 1fr$/);
  });

  it("uses the store's own example order and says the currency limit when it sells in several", async () => {
    await renderWelcome(welcomeData({ currency: "JPY", medianOrder: "4300", multiCurrency: true }));
    screen.getByText(GUIDE.example("¥5,000", "¥150"));
    screen.getByText(GUIDE.creditCurrency);
  });

  it("gives the example at the first tier's own rate, and none without a round order", async () => {
    await renderWelcome(welcomeData({ firstPercent: 5, medianOrder: null }));
    screen.getByText(GUIDE.example("£100.00", "£5.00"));
    cleanup();
    await renderWelcome(welcomeData({ currency: "JPY", medianOrder: null }));
    expect(screen.queryByText(/^Order /)).toBeNull();
  });

  it("offers the Tiers page instead when the ladder isn't editable", async () => {
    await renderWelcome(welcomeData({ editable: false, canGoLive: true }));
    expect(button(GUIDE.next)).toBeUndefined();
    expect(document.querySelector('s-link[href="/app/tiers"]')?.textContent).toBe(GUIDE.editTiers);
  });
});

describe("Step 2: Your tiers", () => {
  it("starts the three tiers at the suggestions and Yu's rates, with the store's period", async () => {
    await renderWelcome(step2());
    screen.getByText(GUIDE.tiersIntro("12 months"));
    expect(["name0", "name1", "name2"].map(shown)).toEqual(["Bronze", "Silver", "Gold"]);
    expect(["minSpend1", "minSpend2"].map(shown)).toEqual(["200", "500"]);
    expect(["percent0", "percent1", "percent2"].map(shown)).toEqual(["3", "5", "8"]);
    // Row 1 starts at 0, so it has no start field
    expect(document.querySelector('[name="minSpend0"]')).toBeNull();
    screen.getByText(GUIDE.firstTier);
    expect(field("minSpend1").getAttribute("currencyCode")).toBe("GBP");
  });

  it("posts the three tiers as typed, under the names the action reads", async () => {
    const posted: Array<Record<string, string>> = [];
    await renderWelcome(step2(), { posted });

    await type(field("name1"), "Silver Club");
    await type(field("minSpend1"), "250");
    await type(field("percent2"), "9");
    await click(button(GUIDE.saveTiers));

    expect(posted).toEqual([
      { intent: "save-ladder", name0: "Bronze", percent0: "3", name1: "Silver Club", minSpend1: "250", percent1: "5", name2: "Gold", minSpend2: "500", percent2: "9" },
    ]);
  });

  it("saves once while a save is in flight", async () => {
    const posted: Array<Record<string, string>> = [];
    await renderWelcome(step2(), { posted, answer: () => new Promise(() => {}) });
    await click(button(GUIDE.saveTiers));
    await click(button(GUIDE.saveTiers));
    expect(posted).toHaveLength(1);
    expect(button(GUIDE.saveTiers).hasAttribute("loading")).toBe(true);
  });

  it("updates the buyer counts and the cost as a start changes, in a live region", async () => {
    await renderWelcome(step2());
    // 10 below 200; 6 + 3 from 200; 2 from 500. 100 at 3%, 500 at 5%, 400 at 8%
    expect(liveText()).toContain(`Bronze: ${GUIDE.buyers(10)}`);
    expect(liveText()).toContain(`Silver: ${GUIDE.buyers(9)}`);
    expect(liveText()).toContain(`Gold: ${GUIDE.buyers(2)}`);
    expect(liveText()).toContain(GUIDE.cost("£60.00", "12 months"));

    await type(field("minSpend1"), "300");
    // 10 + 6 below 300; 3 from 300; 2 from 500. 400 at 3%, 200 at 5%, 400 at 8%
    expect(liveText()).toContain(`Bronze: ${GUIDE.buyers(16)}`);
    expect(liveText()).toContain(`Silver: ${GUIDE.buyers(3)}`);
    expect(liveText()).toContain(GUIDE.cost("£54.00", "12 months"));
    // The picture says the same to a screen reader
    expect(document.querySelector('svg[role="img"]')?.getAttribute("aria-label")).toBe(
      GUIDE.chartSummary(GUIDE.chartLabel("12 months"), [16, 3, 2], "£300.00", "£500.00"),
    );
  });

  it("counts a typed start by the bin it falls in, and never rewrites what was typed", async () => {
    await renderWelcome(step2());
    // 255 falls in the 250-259 bin, whose 6 buyers count from it
    await type(field("minSpend1"), "255");
    expect(liveText()).toContain(`Bronze: ${GUIDE.buyers(10)}`);
    expect(liveText()).toContain(`Silver: ${GUIDE.buyers(9)}`);
    expect(shown("minSpend1")).toBe("255");
    expect(liveText()).not.toContain(GUIDE.beyondPicture);
  });

  it("fits the picture to where its buyers spend, and counts from every bin", async () => {
    await renderWelcome(step2());
    // All 21 buyers are in the first 61 bins (up to 600-609), and a quarter more is 77
    const svg = document.querySelector('svg[role="img"]')!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 77 100");
    expect([...document.querySelectorAll("s-text")].map((text) => text.textContent)).toContain(GUIDE.andAbove("£760.00"));
    // A start above the picture but within the grid is drawn on its edge, and counted where it is
    await type(field("minSpend2"), "1000");
    expect(svg.querySelectorAll("g")[1].querySelector("line")?.getAttribute("x1")).toBe("77");
    expect(liveText()).toContain(`Silver: ${GUIDE.buyers(11)}`);
    expect(liveText()).toContain(`Gold: ${GUIDE.buyers(0)}`);
    expect(liveText()).not.toContain(GUIDE.beyondPicture);
  });

  it("says when a start is above the picture's highest spend", async () => {
    await renderWelcome(step2());
    // The last bin starts at 1990
    await type(field("minSpend2"), "1990");
    expect(liveText()).not.toContain(GUIDE.beyondPicture);
    await type(field("minSpend2"), "2500");
    expect(liveText()).toContain(GUIDE.beyondPicture);
    expect(liveText()).toContain(`Gold: ${GUIDE.buyers(0)}`);
  });

  it("keeps typed starts across a refresh and moves only untouched ones to the suggestions", async () => {
    const running = step2({ importState: "running", importedOrders: 40, ladder: ladder({ suggested: [200, 500], fromData: false }) });
    let next = running;
    await renderWelcome(running, { next: () => next });
    expect(["minSpend1", "minSpend2"].map(shown)).toEqual(["200", "500"]);
    screen.getByText(GUIDE.importRunning(40));
    expect(document.querySelector('svg[role="img"]')).toBeNull();
    await type(field("minSpend1"), "260");

    next = step2({ importState: "done", ladder: ladder({ suggested: [230, 610], fromData: true }) });
    await act(async () => {
      await refresh!();
    });

    screen.getByText(GUIDE.tiersIntro("12 months"));
    expect(["minSpend1", "minSpend2"].map(shown)).toEqual(["260", "610"]);
  });

  it("moves a start to a dragged line and keeps it there", async () => {
    let next = step2();
    await renderWelcome(next, { next: () => next });
    const svg = document.querySelector('svg[role="img"]')!;
    // The picture's 77 bins of 10 laid out one pixel per unit of spend
    svg.getBoundingClientRect = () => ({ left: 0, width: 770, top: 0, height: 100, right: 770, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const line = svg.querySelectorAll("g")[0];
    await act(async () => {
      fireEvent.pointerDown(line, { button: 0, clientX: 200, pointerId: 1 });
      fireEvent.pointerMove(line, { clientX: 300, buttons: 1, pointerId: 1 });
      fireEvent.pointerUp(line, { clientX: 300, pointerId: 1 });
    });
    expect(["minSpend1", "minSpend2"].map(shown)).toEqual(["300", "500"]);

    // Dragged starts are the merchant's: new suggestions don't move them
    next = step2({ ladder: ladder({ suggested: [230, 610] }) });
    await act(async () => {
      await refresh!();
    });
    expect(["minSpend1", "minSpend2"].map(shown)).toEqual(["300", "500"]);
  });

  it("leaves the starts blank without suggestions, and shows no counts until both are valid", async () => {
    await renderWelcome(step2({ currency: "JPY", ladder: ladder({ suggested: null, fromData: false }) }));
    expect(["minSpend1", "minSpend2"].map(shown)).toEqual(["", ""]);
    screen.getByText(GUIDE.tiersBlank);
    // The live region is there from the first render, empty
    expect(liveText()).toBe("");

    await type(field("minSpend1"), "200");
    expect(liveText()).toBe("");
    await type(field("minSpend2"), "500");
    expect(liveText()).toContain(`Bronze: ${GUIDE.buyers(10)}`);
    // The cost in yen: 3 + 25 + 32
    expect(liveText()).toContain(GUIDE.cost("¥60", "12 months"));
  });

  it("starts row 1 at the merchant's own Everyone rate", async () => {
    await renderWelcome(step2({ everyonePercent: 6 }));
    expect(shown("percent0")).toBe("6");
  });

  it("shows each row's error from a refused save", async () => {
    await renderWelcome(step2(), { answer: async () => ({ ok: false, errors: { rows: [{}, { minSpend: TIER_ERRORS.ladderOrder }, {}] } }) });
    await click(button(GUIDE.saveTiers));
    expect(field("minSpend1").getAttribute("error")).toBe(TIER_ERRORS.ladderOrder);
    expect(field("minSpend2").getAttribute("error")).toBeNull();
    expect(field("name0").getAttribute("error")).toBeNull();
  });

  it("says why a whole save was refused", async () => {
    await renderWelcome(step2(), { answer: async () => ({ ok: false, errors: { rows: [{}, {}, {}], form: TIER_ERRORS.ladderStale } }) });
    await click(button(GUIDE.saveTiers));
    screen.getByText(TIER_ERRORS.ladderStale);
  });

  it("hides the picture and the cost with no past orders, and says so", async () => {
    await renderWelcome(step2({ importedOrders: 0, ladder: ladder({ fromData: false, spenders: 0, buyers: buyers.map(() => 0) }) }));
    screen.getByText(GUIDE.tiersNoOrders);
    expect(document.querySelector('[role="img"]')).toBeNull();
    expect(liveText()).not.toContain("would have earned");
    expect(liveText()).toContain(`Bronze: ${GUIDE.buyers(0)}`);
  });

  it("says why the starts are suggestions when there are too few buyers, or Home's words when the import failed", async () => {
    await renderWelcome(step2({ ladder: ladder({ spenders: 4, fromData: false }) }));
    screen.getByText(GUIDE.tiersFewBuyers);
    cleanup();
    const failed = "Your past orders couldn't be brought in, so buyers start in the lowest tier.";
    await renderWelcome(step2({ importState: "failed", importedOrders: 0, importLines: [failed], ladder: ladder({ fromData: false }) }));
    screen.getByText(failed);
    screen.getByText(GUIDE.tiersFallback);
    expect(document.querySelector('[role="img"]')).toBeNull();
  });
});

describe("Step 3: Go live", () => {
  it("enables the switch when the widget check is unknown", async () => {
    const posted: Array<Record<string, string>> = [];
    await renderWelcome(step3(), { posted, answer: () => new Promise(() => {}) });
    screen.getByText(GUIDE.widgetUnknown);
    screen.getByText(GUIDE.storeCreditYes);
    const on = button(GUIDE.switchOn);
    expect(on.getAttribute("variant")).toBe("primary");
    expect(on.hasAttribute("disabled")).toBe(false);

    await click(on);
    await click(on);
    expect(posted).toEqual([{ intent: "running", running: "on" }]);
  });

  it("asks App Bridge again on Check again", async () => {
    stubAppBridge("available");
    await renderWelcome(step3());
    screen.getByText(GUIDE.widgetNo);
    stubAppBridge("active");
    await click(button(GUIDE.checkAgain));
    await screen.findByText(GUIDE.widgetYes);
  });

  it("shows store credit's problems with Home's settings link, and the placing note", async () => {
    const banner = "Buyers can't spend their store credit yet: store credit is turned off in Settings > Customer accounts.";
    await renderWelcome(
      step3({
        storeCredit: false,
        storeCreditBanner: banner,
        storeCreditLink: { label: "Open customer account settings", href: "shopify://admin/settings/customer_accounts" },
        placing: true,
      }),
    );
    screen.getByText(GUIDE.storeCreditNo);
    screen.getByText(banner);
    expect(document.querySelector('s-link[href="shopify://admin/settings/customer_accounts"]')?.textContent).toBe("Open customer account settings");
    screen.getByText(GUIDE.placing);
  });

  it("says the switch's refusal", async () => {
    await renderWelcome(step3(), { answer: async () => ({ ok: false, error: GUIDE.saveTiersFirst }) });
    await click(button(GUIDE.switchOn));
    await screen.findByText(GUIDE.saveTiersFirst);
  });

  it("opens the theme editor and the draft order page in new tabs", async () => {
    stubAppBridge("available");
    await renderWelcome(live());
    const editor = [...document.querySelectorAll("s-link")].find((link) => link.textContent === GUIDE.turnOnWidget)!;
    expect([editor.getAttribute("href"), editor.getAttribute("target")]).toEqual([welcomeData().themeEditorUrl, "_blank"]);
    const draft = [...document.querySelectorAll("s-link")].find((link) => link.textContent === GUIDE.draftOrder)!;
    expect([draft.getAttribute("href"), draft.getAttribute("target")]).toEqual([`https://${SHOP}/admin/draft_orders/new`, "_blank"]);
  });

  it("shows the smallest earning amount and the chosen order's result after switch-on", async () => {
    await renderWelcome(live({ tryIt: [ORDER_1002, ORDER_1001] }));
    expect(document.querySelector(`s-section[heading="${GUIDE.liveHeading}"]`)).not.toBeNull();
    screen.getByText(GUIDE.tryItHeading);
    screen.getByText(GUIDE.tryItSteps("£0.17")[0]);
    expect(screen.getByText(GUIDE.tryItSteps("£0.17")[0]).textContent).toContain("at least £0.17");
    screen.getByText(GUIDE.emails);
    expect(button(GUIDE.goHome).getAttribute("href")).toBe("/app");
    expect(button(GUIDE.finishLater)).toBeUndefined();
    expect(button(GUIDE.switchOn)).toBeUndefined();

    const list = document.querySelector("s-choice-list")!;
    expect(list.getAttribute("label")).toBe(GUIDE.tryItPick);
    expect([...list.querySelectorAll("s-choice")].map((choice) => choice.textContent)).toEqual(["#1002", "#1001"]);
    expect(screen.queryByText("Issued")).toBeNull();
    // Still waiting for the merchant's own order, so the page follows it
    expect(usePolling).toHaveBeenLastCalledWith(true, 10_000, { forMs: 120_000, restartKey: "done:2026-11-08T10:00:00.000Z:0" });

    await act(async () => {
      Object.defineProperty(list, "values", { value: ["o2"], configurable: true });
      fireEvent.change(list);
    });
    screen.getByText("Issued");
    screen.getByText("£0.60");
    expect(document.querySelector('s-link[href="/app/orders/o2"]')?.textContent).toBe(GUIDE.openOrder);
    expect(document.querySelector('s-link[href="shopify://admin/customers/7002"]')?.textContent).toContain("Open the buyer in Shopify");
    // Settled: nothing more to follow
    expect(usePolling).toHaveBeenLastCalledWith(false, 10_000, { forMs: 120_000, restartKey: "done:2026-11-08T10:00:00.000Z:0" });
  });

  it("follows a lone order without asking which", async () => {
    await renderWelcome(live({ tryIt: [ORDER_1001] }));
    expect(document.querySelector("s-choice-list")).toBeNull();
    screen.getByText("Waiting");
    expect(document.querySelector('s-link[href="/app/orders/o1"]')).not.toBeNull();
  });

  it("says when no order has come in since the switch-on", async () => {
    await renderWelcome(live());
    screen.getByText(GUIDE.tryItNone);
  });

  it("explains a first tier at 0% instead of failing", async () => {
    await renderWelcome(live({ firstPercent: 0 }));
    screen.getByText(GUIDE.tryItNoRate);
    expect(screen.queryByText(/at least/)).toBeNull();
  });
});
