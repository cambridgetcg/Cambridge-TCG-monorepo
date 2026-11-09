// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useId } from "react";
import { type ShouldRevalidateFunctionArgs, createRoutesStub, data, useRevalidator } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE } from "~/admin/guide-words";
import { MAX_BINS } from "~/lib/ladder";
import { TIER_ERRORS, TIER_NAME_MAX } from "~/lib/tiers.server";
import type { GoLiveData, WelcomeData } from "~/routes/app.welcome";
import { fieldsOf, letFetchersPost } from "../helpers/fetcher-posts";

// The guide's loader and action are replaced by stand-ins; nothing here
// reaches Shopify or the database. What they read and write is in the
// Postgres suite (welcome-page); here the page's posts go to a stand-in
// action (letFetchersPost) that records them.
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));

// What the page asks of polling is recorded, with the hook it came from
// (useId, one per call site), and the page's revalidator is kept so a test
// can refresh the page's data as a poll would
const usePolling = vi.fn();
const pollingSites: string[] = [];
let refresh: (() => Promise<void>) | null = null;
vi.mock("~/admin/polling", async (original) => ({
  ...(await original<typeof import("~/admin/polling")>()),
  usePolling: (...args: unknown[]) => {
    usePolling(...args);
    pollingSites.push(useId());
    refresh = useRevalidator().revalidate;
  },
}));

const { default: Welcome, shouldRevalidate } = await import("~/routes/app.welcome");

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
  reading: false,
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
  nameMax: TIER_NAME_MAX,
  ladder: null,
  everyonePercent: null,
  firstPercent: null,
  goLive: null,
  themeEditorUrl: `https://${SHOP}/admin/themes/current/editor?context=apps&activateAppId=k1/membership_widget`,
  draftOrderUrl: `https://${SHOP}/admin/draft_orders/new`,
  placing: false,
  ...o,
});
const step2 = (o: Partial<WelcomeData> = {}) => welcomeData({ step: 2, ladder: ladder(), ...o });
/** Step 3, with its own reads (`g`) beside the page's data (`o`). */
const step3 = (o: Partial<WelcomeData> = {}, g: Partial<GoLiveData> = {}) =>
  welcomeData({
    step: 3,
    editable: false,
    canGoLive: true,
    firstPercent: 3,
    goLive: { storeCredit: true, storeCreditBanner: null, storeCreditLink: null, switchedOnAt: null, tryIt: [], ...g },
    ...o,
  });
const live = (o: Partial<WelcomeData> = {}, g: Partial<GoLiveData> = {}) => step3({ running: true, ...o }, { switchedOnAt: "2026-11-08T10:00:00.000Z", ...g });

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
 * The guide at its step with `first` as its data, at `?step=` and `search`;
 * each later load (a refresh, or the revalidation after a post) reads
 * `next()`, and `loads` counts them. Each post goes to `posted`; `answer` is
 * what the action gives back (a promise that never settles keeps the post in
 * flight). The route revalidates by its own shouldRevalidate. /app is a
 * stand-in Home.
 */
async function renderWelcome(
  first: WelcomeData,
  o: { next?: () => WelcomeData; posted?: Array<Record<string, string>>; answer?: () => unknown; search?: string; loads?: { count: number } } = {},
) {
  letFetchersPost();
  const Stub = createRoutesStub([
    {
      id: "routes/app.welcome",
      path: "/app/welcome",
      Component: Welcome,
      shouldRevalidate,
      loader: () => {
        if (o.loads) o.loads.count++;
        return (o.next ?? (() => first))();
      },
      action: async ({ request }) => {
        o.posted?.push(await fieldsOf(request));
        return o.answer ? o.answer() : { ok: true };
      },
    },
    { id: "routes/app._index", path: "/app", Component: () => <p>Home page</p> },
  ]);
  render(<Stub initialEntries={[`/app/welcome?step=${first.step}${o.search ?? ""}`]} hydrationData={{ loaderData: { "routes/app.welcome": first } }} />);
  await waitFor(() => expect(document.querySelector("s-page")).not.toBeNull());
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

/** Step 3's line about buyer emails, with its Settings link. */
const emailsLine = () => [...document.querySelectorAll("s-text")].find((text) => text.textContent?.startsWith("Shopify emails a buyer")) ?? null;

/** A button by its text. */
const button = (text: string) => [...document.querySelectorAll("s-button")].find((b) => b.textContent === text)!;

const click = (element: Element) =>
  act(async () => {
    fireEvent.click(element);
  });

/** The live region's text: a Polaris box in the status role, polite. */
const liveText = () => document.querySelector('s-box[accessibilityRole="status"]')?.textContent ?? null;

/** The sign-in limit on spending credit (spec 5), as the guide words it: "signed in" or "Signed-in". */
const SIGNED_IN = /signed[ -]in/i;
/** What buyers spent on orders, which the tiers measure: not spending credit, so no limit goes with it. */
const ORDER_SPEND = /their spend grows|what they spent|the highest spend/gi;

/**
 * Every mention of spending on the page that has no sign-in limit with it:
 * an element whose own text says spend or spent must say "signed in" itself,
 * or sit in a tile (s-box), or else a section, that does. Also the number of
 * mentions looked at, so a step with none can't pass by saying nothing.
 */
function spendingWithoutLimit(): { mentions: number; unlimited: string[] } {
  const unlimited: string[] = [];
  let mentions = 0;
  for (const element of document.body.querySelectorAll("*")) {
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join("");
    if (!/spen[dt]/i.test(own.replace(ORDER_SPEND, ""))) continue;
    mentions++;
    const around = element.closest("s-box") ?? element.closest("s-section");
    if (!SIGNED_IN.test(own) && !SIGNED_IN.test(around?.textContent ?? "")) unlimited.push(own);
  }
  return { mentions, unlimited };
}

beforeEach(() => {
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  usePolling.mockClear();
  pollingSites.length = 0;
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

  // M-4: on every step, a widget that's off comes with the way to turn it on
  it("gives the theme editor's link and Check again beside a widget that's off, once, and neither once it's on", async () => {
    const editorLinks = () => [...document.querySelectorAll("s-link")].filter((link) => link.textContent === GUIDE.turnOnWidget);
    for (const data of [welcomeData(), step2(), step3()]) {
      const page = `step ${data.step}`;
      stubAppBridge("available");
      await renderWelcome(data);
      expect(editorLinks(), page).toHaveLength(1);
      expect([editorLinks()[0].getAttribute("href"), editorLinks()[0].getAttribute("target")], page).toEqual([welcomeData().themeEditorUrl, "_blank"]);
      expect(screen.getAllByText(GUIDE.saveInEditor), page).toHaveLength(1);
      expect(button(GUIDE.checkAgain), page).toBeDefined();
      cleanup();

      stubAppBridge("active");
      await renderWelcome(data);
      await screen.findByText(GUIDE.widgetYes);
      expect(editorLinks(), page).toHaveLength(0);
      expect(screen.queryByText(GUIDE.saveInEditor), page).toBeNull();
      expect(button(GUIDE.checkAgain), page).toBeUndefined();
      cleanup();
    }
  });

  it("asks App Bridge again on Check again, on steps 1 and 2 too", async () => {
    for (const data of [welcomeData(), step2()]) {
      stubAppBridge("available");
      await renderWelcome(data);
      screen.getByText(GUIDE.widgetNo);
      stubAppBridge("active");
      await click(button(GUIDE.checkAgain));
      await screen.findByText(GUIDE.widgetYes);
      cleanup();
    }
  });

  it("posts Finish later and goes Home only once it's recorded, without reloading the guide first", async () => {
    const posted: Array<Record<string, string>> = [];
    const loads = { count: 0 };
    let answer: (value: unknown) => void = () => {};
    await renderWelcome(welcomeData(), { posted, loads, answer: () => new Promise((resolve) => (answer = resolve)) });

    await click(button(GUIDE.finishLater));
    expect(posted).toEqual([{ intent: "finish-later" }]);
    expect(screen.queryByText("Home page")).toBeNull();
    screen.getByText(GUIDE.creditTitle);

    await act(async () => answer({ ok: true }));
    await screen.findByText("Home page");
    // The page is leaving, so its data isn't read again on the way
    expect(loads.count).toBe(0);
  });

  // 9-F7: a second usePolling, in the page or in a step, would be a second call site
  it("polls once for the page, and restarts when the merchant returns", async () => {
    stubAppBridge("available");
    await renderWelcome(step2({ importState: "running", importedOrders: 40 }));
    expect(usePolling).toHaveBeenLastCalledWith(true, 10_000, { forMs: undefined, restartKey: "running::0" });
    const firstRenders = usePolling.mock.calls.length;

    // Coming back re-renders the page
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(usePolling.mock.calls.length).toBeGreaterThan(firstRenders);
    expect(usePolling).toHaveBeenLastCalledWith(true, 10_000, { forMs: undefined, restartKey: "running::1" });
    // Across every render, every call came from one hook, and each asked for the page's one poll
    expect(new Set(pollingSites).size).toBe(1);
    for (const [i, call] of usePolling.mock.calls.entries()) {
      expect(call, `call ${i}`).toEqual([true, 10_000, { forMs: undefined, restartKey: i < firstRenders ? "running::0" : expect.stringMatching(/^running::[01]$/) }]);
    }
  });

  // Spec 5 (I-1): a guest can't spend store credit, so every mention of spending says who can
  it("says the sign-in limit wherever it mentions spending, on every step", async () => {
    const banner = "Buyers can't spend their store credit yet: store credit is turned off in Settings > Customer accounts.";
    const pages: Array<[string, WelcomeData]> = [
      ["step 1", welcomeData({ multiCurrency: true })],
      ["step 2", step2()],
      ["step 3", step3()],
      ["step 3, store credit off", step3({}, { storeCredit: false, storeCreditBanner: banner })],
      ["step 3, live", live({}, { tryIt: [ORDER_1001] })],
    ];
    for (const [page, data] of pages) {
      stubAppBridge("available");
      await renderWelcome(data);
      const found = spendingWithoutLimit();
      expect(found.unlimited, page).toEqual([]);
      // Step 2 mentions only what buyers spent on orders
      if (page !== "step 2") expect(found.mentions, page).toBeGreaterThan(0);
      cleanup();
    }
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

describe("Reading from Settings", () => {
  // I-3: How RewardsPro works, as Settings opens it: step 1 to read, sending nobody anywhere
  const reading = () => welcomeData({ reading: true, editable: false, canGoLive: true, running: true });

  it("shows step 1 under How RewardsPro works, without the setup's frame", async () => {
    stubAppBridge("available");
    await renderWelcome(reading());
    expect(document.querySelector("s-page")?.getAttribute("heading")).toBe(GUIDE.howItWorks);
    screen.getByText(GUIDE.creditTitle);
    screen.getByText(GUIDE.nextTimeTitle);
    // No progress, no step names (as text or as a heading), no Finish later and no Next
    expect(document.querySelector("s-progress")).toBeNull();
    const headings = [...document.querySelectorAll("[heading]")].map((element) => element.getAttribute("heading"));
    for (const name of GUIDE.steps) {
      expect(screen.queryByText(name)).toBeNull();
      expect(headings).not.toContain(name);
    }
    expect(screen.queryByText(GUIDE.heading)).toBeNull();
    expect(button(GUIDE.finishLater)).toBeUndefined();
    expect(button(GUIDE.next)).toBeUndefined();
    // The Tiers link and the widget's status stay
    expect(document.querySelector('s-link[href="/app/tiers"]')?.textContent).toBe(GUIDE.editTiers);
    screen.getByText(GUIDE.widgetNo);
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
    expect(liveText()).toContain(GUIDE.tierCount("Bronze", 10));
    expect(liveText()).toContain(GUIDE.tierCount("Silver", 9));
    expect(liveText()).toContain(GUIDE.tierCount("Gold", 2));
    expect(liveText()).toContain(GUIDE.cost("£60.00", "12 months"));

    await type(field("minSpend1"), "300");
    // 10 + 6 below 300; 3 from 300; 2 from 500. 400 at 3%, 200 at 5%, 400 at 8%
    expect(liveText()).toContain(GUIDE.tierCount("Bronze", 16));
    expect(liveText()).toContain(GUIDE.tierCount("Silver", 3));
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
    expect(liveText()).toContain(GUIDE.tierCount("Bronze", 10));
    expect(liveText()).toContain(GUIDE.tierCount("Silver", 9));
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
    expect(liveText()).toContain(GUIDE.tierCount("Silver", 11));
    expect(liveText()).toContain(GUIDE.tierCount("Gold", 0));
    expect(liveText()).not.toContain(GUIDE.beyondPicture);
  });

  it("says when a start is above the picture's highest spend", async () => {
    await renderWelcome(step2());
    // The last bin starts at 1990
    await type(field("minSpend2"), "1990");
    expect(liveText()).not.toContain(GUIDE.beyondPicture);
    await type(field("minSpend2"), "2500");
    expect(liveText()).toContain(GUIDE.beyondPicture);
    expect(liveText()).toContain(GUIDE.tierCount("Gold", 0));
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
    expect(liveText()).toContain(GUIDE.tierCount("Bronze", 10));
    // The cost in yen: 3 + 25 + 32
    expect(liveText()).toContain(GUIDE.cost("¥60", "12 months"));
  });

  // 9-F9 and M-6: each row's fields say their tier, and take the Tiers page's limits
  it("labels each row's fields by its tier, with the Tiers page's limits and hint", async () => {
    await renderWelcome(step2());
    const label = (name: string) => field(name).getAttribute("label");
    expect(["name0", "name1", "name2"].map(label)).toEqual(["Tier 1 name", "Tier 2 name", "Tier 3 name"]);
    expect(["minSpend1", "minSpend2"].map(label)).toEqual(["Tier 2 starts at", "Tier 3 starts at"]);
    expect(["percent0", "percent1", "percent2"].map(label)).toEqual(["Tier 1 cashback", "Tier 2 cashback", "Tier 3 cashback"]);
    screen.getByText(GUIDE.firstStart("£0.00"));
    for (const name of ["name0", "name1", "name2"]) expect(field(name).getAttribute("maxLength"), name).toBe(String(TIER_NAME_MAX));
    for (const name of ["minSpend1", "minSpend2"]) expect(field(name).getAttribute("details"), name).toBe(GUIDE.wholeAmounts);
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

  // M-1: the action refuses with a 4xx, so the page isn't reloaded: a reload would serve step 1 here
  it("says why a whole save was refused, stays on step 2 and links the Tiers page", async () => {
    const loads = { count: 0 };
    await renderWelcome(step2(), {
      loads,
      next: () => welcomeData({ editable: false, canGoLive: true }),
      answer: async () => data({ ok: false, errors: { rows: [{}, {}, {}], form: TIER_ERRORS.ladderStale } }, { status: 409 }),
    });
    await type(field("name1"), "Silver Club");
    await click(button(GUIDE.saveTiers));
    await screen.findByText(TIER_ERRORS.ladderStale);
    expect(loads.count).toBe(0);
    expect(document.querySelector(`s-section[heading="${GUIDE.steps[1]}"]`)).not.toBeNull();
    expect(screen.queryByText(GUIDE.creditTitle)).toBeNull();
    expect(shown("name1")).toBe("Silver Club");
    expect(document.querySelector('s-link[href="/app/tiers"]')?.textContent).toBe(GUIDE.editTiers);
  });

  it("keeps step 2 and its fields' errors after a refusal of its rows", async () => {
    const loads = { count: 0 };
    await renderWelcome(step2(), {
      loads,
      next: () => welcomeData(),
      answer: async () => data({ ok: false, errors: { rows: [{}, { minSpend: TIER_ERRORS.ladderOrder }, {}] } }, { status: 422 }),
    });
    await click(button(GUIDE.saveTiers));
    await waitFor(() => expect(field("minSpend1").getAttribute("error")).toBe(TIER_ERRORS.ladderOrder));
    expect(loads.count).toBe(0);
    // No Tiers link for a row's problem: the merchant fixes it here
    expect(document.querySelector('s-link[href="/app/tiers"]')).toBeNull();
  });

  // M-2
  it("goes back to step 1, keeping the page's other search parameters", async () => {
    await renderWelcome(step2(), { search: "&shop=s.myshopify.com&host=aG9zdA" });
    expect(button(GUIDE.back).getAttribute("href")).toBe("/app/welcome?step=1&shop=s.myshopify.com&host=aG9zdA");
    cleanup();
    await renderWelcome(step2());
    expect(button(GUIDE.back).getAttribute("href")).toBe("/app/welcome?step=1");
  });

  // M-7: no buyer has spent, so there is nothing to count; the tiers and one sentence stay
  it("hides the picture, the counts and the cost with no past orders, and says so", async () => {
    await renderWelcome(step2({ importedOrders: 0, ladder: ladder({ fromData: false, spenders: 0, buyers: buyers.map(() => 0) }) }));
    screen.getByText(GUIDE.tiersNoOrders);
    expect(document.querySelector('[role="img"]')).toBeNull();
    expect(["name0", "name1", "name2"].map(shown)).toEqual(["Bronze", "Silver", "Gold"]);
    // The live region stays, empty
    expect(liveText()).toBe("");
  });

  // I-2: partial figures from a running import would understate the cost, and change on every refresh
  it("keeps the counts and the cost back while the import runs, and announces them once it's done", async () => {
    let next = step2({ importState: "running", importedOrders: 40 });
    await renderWelcome(next, { next: () => next });
    screen.getByText(GUIDE.importRunning(40));
    // The live region is there, empty, so the first figures are announced when they appear
    expect(liveText()).toBe("");

    next = step2({ importState: "done", importedOrders: 120 });
    await act(async () => {
      await refresh!();
    });
    expect(liveText()).toContain(GUIDE.tierCount("Bronze", 10));
    expect(liveText()).toContain(GUIDE.tierCount("Silver", 9));
    expect(liveText()).toContain(GUIDE.cost("£60.00", "12 months"));
  });

  it("keeps a failed import's figures for the orders it brought in", async () => {
    const failed = "Brought in 40 of your past orders; the rest couldn't be brought in.";
    await renderWelcome(step2({ importState: "failed", importedOrders: 40, importLines: [failed], ladder: ladder({ fromData: false }) }));
    screen.getByText(failed);
    expect(liveText()).toContain(GUIDE.tierCount("Bronze", 10));
    expect(liveText()).toContain(GUIDE.cost("£60.00", "12 months"));
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
    // On at once: the switch is gone and the live section shows while the post is in flight
    expect(button(GUIDE.switchOn)).toBeUndefined();
    expect(document.querySelector(`s-section[heading="${GUIDE.liveHeading}"]`)).not.toBeNull();
    await click(on);
    expect(posted).toEqual([{ intent: "running", running: "on" }]);
  });

  // 9-F8: a refused switch-on gives the switch back at once, and it posts once while the page reloads
  it("gives the switch back on a refusal, and doesn't post again while the page reloads", async () => {
    const posted: Array<Record<string, string>> = [];
    await renderWelcome(step3(), {
      posted,
      answer: async () => ({ ok: false, error: GUIDE.saveTiersFirst }),
      // The reload after the refusal never ends, so the switch stays busy
      next: () => new Promise<WelcomeData>(() => {}) as unknown as WelcomeData,
    });
    await click(button(GUIDE.switchOn));
    await screen.findByText(GUIDE.saveTiersFirst);
    expect(document.querySelector(`s-section[heading="${GUIDE.liveHeading}"]`)).toBeNull();
    const again = button(GUIDE.switchOn);
    expect(again.hasAttribute("loading")).toBe(true);
    await click(again);
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
      step3(
        { placing: true },
        {
          storeCredit: false,
          storeCreditBanner: banner,
          storeCreditLink: { label: "Open customer account settings", href: "shopify://admin/settings/customer_accounts" },
        },
      ),
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
    await renderWelcome(live({}, { tryIt: [ORDER_1002, ORDER_1001] }));
    expect(document.querySelector(`s-section[heading="${GUIDE.liveHeading}"]`)).not.toBeNull();
    screen.getByText(GUIDE.tryItHeading);
    screen.getByText(GUIDE.tryItSteps("£0.17")[0]);
    expect(screen.getByText(GUIDE.tryItSteps("£0.17")[0]).textContent).toContain("at least £0.17");
    expect(emailsLine()?.textContent).toBe(GUIDE.emails);
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
    // Settled, yet still followed: a refund takes the credit back off (R14)
    expect(usePolling).toHaveBeenLastCalledWith(true, 10_000, { forMs: 120_000, restartKey: "done:2026-11-08T10:00:00.000Z:0" });
  });

  // R14 / 9-F1: the try-it's last step is a refund, which comes after the order has settled
  it("keeps following a settled order, two minutes from each return, to see a refund", async () => {
    await renderWelcome(live({}, { tryIt: [ORDER_1002] }));
    screen.getByText("Issued");
    expect(usePolling).toHaveBeenLastCalledWith(true, 10_000, { forMs: 120_000, restartKey: "done:2026-11-08T10:00:00.000Z:0" });
    // Back from refunding it in Shopify
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(usePolling).toHaveBeenLastCalledWith(true, 10_000, { forMs: 120_000, restartKey: "done:2026-11-08T10:00:00.000Z:1" });
  });

  // 9-F5: the lone order is followed by its id, so a second order coming in doesn't drop it
  it("keeps following the lone order once a newer one comes in", async () => {
    let next = live({}, { tryIt: [ORDER_1001] });
    await renderWelcome(next, { next: () => next });
    screen.getByText("Waiting");

    next = live({}, { tryIt: [ORDER_1002, ORDER_1001] });
    await act(async () => {
      await refresh!();
    });
    const list = document.querySelector("s-choice-list")!;
    expect([...list.querySelectorAll("s-choice")].map((choice) => [choice.textContent, choice.hasAttribute("selected")])).toEqual([
      ["#1002", false],
      ["#1001", true],
    ]);
    screen.getByText("Waiting");
    expect(document.querySelector('s-link[href="/app/orders/o1"]')).not.toBeNull();
    expect(screen.queryByText("Issued")).toBeNull();
  });

  // M-3: once on, the checks are no longer "before" anything
  it("heads the checks neutrally once cashback is on", async () => {
    const checksHeading = () => document.querySelector("s-section[heading]")?.getAttribute("heading");
    await renderWelcome(step3(), { answer: () => new Promise(() => {}) });
    expect(checksHeading()).toBe(GUIDE.checksHeading);
    await click(button(GUIDE.switchOn));
    expect(checksHeading()).toBe(GUIDE.checksHeadingLive);
    cleanup();
    await renderWelcome(live());
    expect(checksHeading()).toBe(GUIDE.checksHeadingLive);
    expect(document.querySelector(`s-section[heading="${GUIDE.checksHeading}"]`)).toBeNull();
  });

  // M-8: the buyer emails switch is RewardsPro's, not Shopify's Settings
  it("links RewardsPro's Settings from the line about buyer emails", async () => {
    await renderWelcome(live());
    expect(emailsLine()?.textContent).toBe(GUIDE.emails);
    const link = emailsLine()!.querySelector("s-link")!;
    expect([link.textContent, link.getAttribute("href"), link.getAttribute("target")]).toEqual([GUIDE.emailsSettings, "/app/settings", null]);
  });

  it("follows a lone order without asking which", async () => {
    await renderWelcome(live({}, { tryIt: [ORDER_1001] }));
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

describe("Revalidating the guide", () => {
  const form = (intent: string) => {
    const formData = new FormData();
    formData.set("intent", intent);
    return formData;
  };
  const args = (o: Partial<ShouldRevalidateFunctionArgs>) =>
    ({
      currentUrl: new URL("https://admin.example/app/welcome?step=2"),
      nextUrl: new URL("https://admin.example/app/welcome?step=2"),
      currentParams: {},
      nextParams: {},
      defaultShouldRevalidate: true,
      ...o,
    }) as ShouldRevalidateFunctionArgs;

  it("skips the reload after Finish later, which leaves the page", () => {
    expect(shouldRevalidate(args({ formMethod: "POST", formData: form("finish-later"), actionResult: { ok: true } }))).toBe(false);
  });

  it("leaves every other reload to React Router", () => {
    for (const intent of ["save-ladder", "running"]) {
      expect(shouldRevalidate(args({ formMethod: "POST", formData: form(intent), defaultShouldRevalidate: true })), intent).toBe(true);
      // A refused post (4xx) is not reloaded by default
      expect(shouldRevalidate(args({ formMethod: "POST", formData: form(intent), defaultShouldRevalidate: false })), intent).toBe(false);
    }
    // A poll's revalidation and a navigation carry no form
    expect(shouldRevalidate(args({}))).toBe(true);
    expect(shouldRevalidate(args({ defaultShouldRevalidate: false }))).toBe(false);
  });
});
