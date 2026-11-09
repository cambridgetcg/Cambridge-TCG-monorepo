// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MembershipAnswer, ProxyAnswer } from "~/routes/api.proxy.$";
import type { WidgetConfig } from "~/shopify/widget-config.server";

/**
 * The storefront widget's script, run against the root its Liquid prints
 * (spec 5). A signed-in buyer's widget asks the app proxy once; a guest's
 * reads the app metafield Liquid printed and asks nothing.
 */

const EXTENSION = resolve(__dirname, "../../../extensions/rewards-widget");
const script = readFileSync(resolve(EXTENSION, "assets/rewards-widget.js"), "utf8");
const stylesheet = readFileSync(resolve(EXTENSION, "assets/rewards-widget.css"), "utf8");
const copy = (JSON.parse(readFileSync(resolve(EXTENSION, "locales/en.default.json"), "utf8")) as { rewards_widget: Record<string, string> })
  .rewards_widget;

/** The root as membership_widget.liquid prints it, with the locale's strings. */
function mount(attributes: Record<string, string>): HTMLElement {
  const root = document.createElement("div");
  root.className = "rw";
  root.hidden = true;
  root.setAttribute("data-rewards-widget", "");
  root.setAttribute("data-locale", "en-GB");
  for (const [key, value] of Object.entries(copy)) root.setAttribute(`data-t-${key.replaceAll("_", "-")}`, value);
  for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value);
  document.body.append(root);
  new Function(script)();
  return root;
}

const signedIn = (look?: "light" | "dark") =>
  mount({ "data-state": "customer", "data-endpoint": "/apps/rewardspro/membership", "data-currency": "GBP", ...(look ? { "data-look": look } : {}) });

/** What Liquid prints from `app.metafields.rewards.config.value`; nil prints as nothing. */
const printed = (value: boolean | number | null | undefined) => (value === null || value === undefined ? "" : String(value));
function guest(config: WidgetConfig | undefined, settings: { message?: string; ctaText?: string; ctaUrl?: string } = {}) {
  return mount({
    "data-state": "guest",
    "data-running": printed(config?.running),
    "data-base-percent": printed(config?.basePercent),
    "data-message": settings.message ?? "",
    "data-cta-text": settings.ctaText ?? "",
    "data-cta-url": settings.ctaUrl ?? "",
    "data-login-url": "/customer_authentication/login",
  });
}

type Accounts = MembershipAnswer["settings"]["customerAccountsVersion"];

/** The proxy's answer for a signed-in buyer, typed against the route's own (app/routes/api.proxy.$.tsx). */
function membership(change: { storeCredit?: number | null; running?: boolean; accounts?: Accounts; top?: boolean; noProgress?: boolean } = {}) {
  const top = change.top ?? false;
  const answer = {
    success: true,
    membership: { tier: { id: "t1", name: "Silver", cashbackPercent: 5 }, tierSource: "SPENDING_BASED", configured: true },
    balance: { storeCredit: change.storeCredit === undefined ? 4.2 : change.storeCredit, currency: "GBP" },
    tierProgress: {
      progressPercent: top ? 100 : 40,
      nextTierName: top ? null : "Gold",
      nextTierCashbackPercent: top ? null : 7.5,
      isMaxTier: top,
      amountRemaining: top ? 0 : 30,
      nextTierTarget: top ? null : 50,
      currentSpending: 20,
    },
    settings: { currency: "GBP", customerAccountsVersion: change.accounts === undefined ? "NEW_CUSTOMER_ACCOUNTS" : change.accounts },
    // The released widget's look; this widget ignores it (spec 5)
    theme: {} as MembershipAnswer["theme"],
    running: change.running ?? true,
  } satisfies MembershipAnswer;
  // MONEY-1: a buyer locked to a tier, or one the tier pass hasn't reached, gets no next tier
  if (change.noProgress) {
    Object.assign(answer.tierProgress, { nextTierName: null, nextTierTarget: null, nextTierCashbackPercent: null, amountRemaining: 0 });
  }
  return answer;
}

function responding(make: () => Response) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => make());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const answering = (body: unknown) => responding(() => Response.json(body));

/**
 * Waits for the widget's request chain to end: its last step clears the 8 s
 * timer it set (WIDGET-9), so a "stays hidden" check runs after whatever the
 * widget does with the answer, however many ticks that takes. Call it before
 * mounting, then await what it returns.
 */
function chainEnd(): () => Promise<void> {
  const set = vi.spyOn(globalThis, "setTimeout");
  const cleared = vi.spyOn(globalThis, "clearTimeout");
  return () =>
    vi.waitFor(() => {
      const index = set.mock.calls.findIndex(([, ms]) => ms === 8000);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(cleared).toHaveBeenCalledWith(set.mock.results[index].value);
    });
}

/** The words a reader meets, one text node after another. */
function text(root: HTMLElement): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent ?? "");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
const shown = async (root: HTMLElement) => vi.waitFor(() => expect(root.hidden).toBe(false));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("a signed-in buyer's widget", () => {
  it("asks the proxy once, in the cart's currency, with nothing of its own added", async () => {
    const fetch = answering(membership());
    const root = signedIn();
    await shown(root);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/apps/rewardspro/membership?currency=GBP");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("shows the tier and its rate, the balance and the way to the next tier", async () => {
    answering(membership());
    const root = signedIn();
    await shown(root);

    expect(text(root)).toContain("Silver");
    expect(text(root)).toContain("5% back as store credit");
    expect(text(root)).toContain("Your store credit £4.20");
    expect(text(root)).toContain("£30.00 more to reach Gold");
    const bar = root.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("40");
    expect((bar?.firstElementChild as HTMLElement).style.width).toBe("40%");
  });

  it("says the store credit shows at checkout when Shopify gave no balance", async () => {
    answering(membership({ storeCredit: null }));
    const root = signedIn();
    await shown(root);

    expect(text(root)).toContain("Your store credit shows at checkout");
    expect(text(root)).not.toMatch(/£\s?0/);
  });

  it("explains spending only where the store uses new customer accounts", async () => {
    answering(membership());
    const withNew = signedIn();
    await shown(withNew);
    expect(text(withNew)).toContain("Sign in and choose Apply store credit at checkout");

    for (const accounts of ["CLASSIC", null] as const) {
      document.body.replaceChildren();
      answering(membership({ accounts }));
      const root = signedIn();
      await shown(root);
      expect(text(root)).not.toContain("Apply store credit");
    }
  });

  it("hides the earn line when cashback is switched off, and keeps the rest", async () => {
    answering(membership({ running: false }));
    const root = signedIn();
    await shown(root);

    expect(text(root)).not.toContain("back as store credit");
    expect(text(root)).toContain("Silver");
    expect(text(root)).toContain("£4.20");
  });

  it("says so on the top tier, with no bar", async () => {
    answering(membership({ top: true }));
    const root = signedIn();
    await shown(root);

    expect(text(root)).toContain("You are on the top tier");
    expect(root.querySelector('[role="progressbar"]')).toBeNull();
  });

  // MONEY-1: the proxy names no next tier for a buyer whose spend can't move them (locked, or not placed yet)
  it("draws no progress when the proxy names no next tier", async () => {
    answering(membership({ noProgress: true }));
    const root = signedIn();
    await shown(root);

    expect(text(root)).toContain("Silver");
    expect(text(root)).not.toContain("more to reach");
    expect(text(root)).not.toContain("top tier");
    expect(root.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("stays hidden when the proxy has no membership to show", async () => {
    answering({ success: false, message: "Rewards are not set up yet" } satisfies ProxyAnswer);
    const ended = chainEnd();
    const root = signedIn();
    await ended();

    expect(root.hidden).toBe(true);
    expect(text(root)).toBe("");
  });

  it("stays hidden when the proxy answers with an error status, even with a membership in the body", async () => {
    const fetch = responding(() => Response.json(membership(), { status: 502 }));
    const ended = chainEnd();
    const root = signedIn();
    await ended();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(root.hidden).toBe(true);
    expect(text(root)).toBe("");
  });

  it("stays hidden when the answer is not JSON", async () => {
    const fetch = responding(() => new Response("<html><body>Bad gateway</body></html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    const ended = chainEnd();
    const root = signedIn();
    await ended();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(root.hidden).toBe(true);
    expect(text(root)).toBe("");
  });

  // Decision 10: a signed-in page whose buyer the proxy could only verify as a guest
  it("stays hidden, with no sign-in invitation, when the proxy verified the signed-in page as a guest", async () => {
    const fetch = answering({ success: false, requiresLogin: true, message: "Sign in to see your rewards", running: true } satisfies ProxyAnswer);
    const ended = chainEnd();
    const root = signedIn();
    await ended();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(root.hidden).toBe(true);
    expect(text(root)).toBe("");
  });

  it("gives up after 8 seconds, once, with no retry", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const root = signedIn();

    await vi.advanceTimersByTimeAsync(7_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(root.hidden).toBe(true);
  });

  it("stays hidden after a failed request, without asking again", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetch);
    const ended = chainEnd();
    const root = signedIn();
    await ended();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(root.hidden).toBe(true);
  });

  it("opens and closes its panel from the button, and closes on Escape", async () => {
    answering(membership());
    const root = signedIn();
    await shown(root);
    const button = root.querySelector("button") as HTMLButtonElement;
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "") as HTMLElement;

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });
});

/**
 * WIDGET-2: a theme's own rule on an element beats a colour the element only
 * inherits. With a hostile theme rule on the page, each text element's colour
 * is still the widget's token, read through to its value in the look's
 * custom properties. jsdom applies the later of two matching rules whatever
 * their specificity, so the theme's rule is loaded first: this proves every
 * text element takes its colour from a rule of the widget's own, not by
 * inheritance; widget-bundle.test.ts proves those rules outrank a theme's
 * element rules in a browser.
 */
describe("the widget on a theme that colours its elements", () => {
  /** An element's computed colour, its var() resolved against the custom properties of the element or its ancestors. */
  function colourOf(element: Element): string {
    const value = getComputedStyle(element).color;
    const name = /^var\((--[a-z-]+)\)$/.exec(value)?.[1];
    if (!name) return value;
    for (let node: Element | null = element; node; node = node.parentElement) {
      const token = getComputedStyle(node).getPropertyValue(name).trim();
      if (token) return token;
    }
    return value;
  }
  const styled = (theme: string) => {
    for (const text of [theme, stylesheet]) {
      const style = document.createElement("style");
      style.textContent = text;
      document.head.append(style);
    }
  };

  afterEach(() => {
    document.head.replaceChildren();
  });

  for (const [theme, hostile] of [
    ["p, span, a, button { color: #121212 }", "rgb(18, 18, 18)"],
    ["p, span, a, button { color: #fff }", "rgb(255, 255, 255)"],
  ] as const) {
    for (const look of ["light", "dark"] as const) {
      it(`keeps the widget's text colours in ${look} under \`${theme}\``, async () => {
        styled(theme);
        answering(membership());
        const root = signedIn(look);
        await shown(root);
        (root.querySelector("button") as HTMLButtonElement).click();

        const token = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
        expect(token("--rw-text")).toMatch(/^#[0-9A-F]{6}$/i);
        const lines = [...root.querySelectorAll("p, span, a")].filter((el) => el.childElementCount === 0 && el.textContent);
        expect(lines.length).toBeGreaterThan(5);
        for (const line of lines) {
          const muted = line.matches(".rw-label, .rw-note");
          expect(colourOf(line), line.textContent ?? "").toBe(token(muted ? "--rw-muted" : "--rw-text"));
          expect(colourOf(line)).not.toBe(hostile);
        }
      });
    }
  }
});

describe("a guest's widget", () => {
  it("invites them to sign in, with the base rate, and asks no server", async () => {
    const fetch = answering({});
    const config: WidgetConfig = { running: true, basePercent: 5 };
    const root = guest(config);
    await shown(root);

    expect(text(root)).toContain("Sign in to see your rewards");
    expect(text(root)).toContain("Earn 5% back as store credit");
    const link = root.querySelector("a") as HTMLAnchorElement;
    expect(link.textContent).toBe("Sign in");
    expect(link.getAttribute("href")).toBe("/customer_authentication/login");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a rate with its decimals", async () => {
    const root = guest({ running: true, basePercent: 2.5 });
    await shown(root);
    expect(text(root)).toContain("Earn 2.5% back as store credit");
  });

  it("uses the merchant's guest copy only where it was filled in", async () => {
    const filled = guest({ running: true, basePercent: 5 }, { message: "Join the club", ctaText: "Log in", ctaUrl: "/pages/rewards" });
    await shown(filled);
    expect(text(filled)).toContain("Join the club");
    expect(text(filled)).not.toContain("Sign in to see your rewards");
    expect(filled.querySelector("a")?.textContent).toBe("Log in");
    expect(filled.querySelector("a")?.getAttribute("href")).toBe("/pages/rewards");

    document.body.replaceChildren();
    const blank = guest({ running: true, basePercent: 5 }, { message: "  ", ctaText: "", ctaUrl: "/account/login" });
    await shown(blank);
    expect(text(blank)).toContain("Sign in to see your rewards");
    expect(blank.querySelector("a")?.textContent).toBe("Sign in");
    // The released block's own default address means the store's sign-in route
    expect(blank.querySelector("a")?.getAttribute("href")).toBe("/customer_authentication/login");
  });

  // Ruling 83: the released block's shipped defaults, saved by a theme, are not the merchant's words
  it("shows its own copy where the theme kept the released block's default guest copy", async () => {
    const released = guest({ running: true, basePercent: 5 }, { message: "Join our rewards program!", ctaText: "Sign In", ctaUrl: "/account/login" });
    await shown(released);
    expect(text(released)).toContain("Sign in to see your rewards");
    expect(text(released)).not.toContain("Join our rewards program!");
    expect(released.querySelector("a")?.textContent).toBe("Sign in");
    expect(released.querySelector("a")?.getAttribute("href")).toBe("/customer_authentication/login");

    // Only those exact words: anything else the merchant wrote still overrides
    document.body.replaceChildren();
    const chosen = guest({ running: true, basePercent: 5 }, { message: "Join our rewards program today!", ctaText: "Sign In now" });
    await shown(chosen);
    expect(text(chosen)).toContain("Join our rewards program today!");
    expect(text(chosen)).not.toContain("Sign in to see your rewards");
    expect(chosen.querySelector("a")?.textContent).toBe("Sign In now");
  });

  it("never links to a script address", async () => {
    const root = guest({ running: true, basePercent: 5 }, { ctaUrl: "javascript:alert(1)" });
    await shown(root);
    expect(root.querySelector("a")?.getAttribute("href")).toBe("/customer_authentication/login");
  });

  it("shows nothing when cashback is switched off", async () => {
    const fetch = answering({});
    const root = guest({ running: false, basePercent: 5 });
    await new Promise((r) => setTimeout(r, 0));

    expect(root.hidden).toBe(true);
    expect(text(root)).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows no earn line before the metafield is written, or with no tiers", async () => {
    const unwritten = guest(undefined);
    await shown(unwritten);
    expect(text(unwritten)).toContain("Sign in to see your rewards");
    expect(text(unwritten)).not.toContain("Earn");

    document.body.replaceChildren();
    const noTiers = guest({ running: true, basePercent: null });
    await shown(noTiers);
    expect(text(noTiers)).not.toContain("Earn");
  });
});
