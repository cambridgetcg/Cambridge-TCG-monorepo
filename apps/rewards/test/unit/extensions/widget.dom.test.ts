// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetConfig } from "~/shopify/widget-config.server";

/**
 * The storefront widget's script, run against the root its Liquid prints
 * (spec 5). A signed-in buyer's widget asks the app proxy once; a guest's
 * reads the app metafield Liquid printed and asks nothing.
 */

const EXTENSION = resolve(__dirname, "../../../extensions/rewards-widget");
const script = readFileSync(resolve(EXTENSION, "assets/rewards-widget.js"), "utf8");
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

const signedIn = () => mount({ "data-state": "customer", "data-endpoint": "/apps/rewardspro/membership", "data-currency": "GBP" });

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

/** The proxy's answer for a signed-in buyer (app/routes/api.proxy.$.tsx). */
function membership(change: { storeCredit?: number | null; running?: boolean; accounts?: string | null; top?: boolean } = {}) {
  const top = change.top ?? false;
  return {
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
    theme: {},
    running: change.running ?? true,
  };
}

function answering(body: unknown) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => Response.json(body));
  vi.stubGlobal("fetch", fetch);
  return fetch;
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

    for (const accounts of ["CLASSIC", null]) {
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

  it("stays hidden when the proxy has no membership to show", async () => {
    const fetch = answering({ success: false, message: "Rewards are not set up yet" });
    const root = signedIn();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));

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
    const root = signedIn();
    await new Promise((r) => setTimeout(r, 10));

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
