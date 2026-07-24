// @vitest-environment node
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const EXTENSION = path.resolve(
  __dirname,
  "../../extensions/theme-app-extension-rewardspro"
);
const ASSETS = path.join(EXTENSION, "assets");
const BLOCKS = path.join(EXTENSION, "blocks");
const LOADER_PATH = path.join(ASSETS, "rp-widget-loader.js");
const LOADER_SOURCE = fs.readFileSync(LOADER_PATH, "utf-8");

const BLOCK_RUNTIMES: Record<string, string> = {
  "gift_cards.liquid": "gift-cards.js",
  "membership_widget.liquid": "membership-widget.js",
  "missions_section.liquid": "missions-widget.js",
  "missions_widget.liquid": "missions-widget.js",
  "mystery_boxes.liquid": "mystery-boxes-widget.js",
  "raffles.liquid": "raffles.js",
};

type MockObserver = {
  observed: Set<Element>;
  trigger: (target: Element, isIntersecting?: boolean) => void;
};

type LoaderHarness = {
  dom: JSDOM;
  document: Document;
  root: HTMLElement;
  observer?: MockObserver;
  scripts: () => HTMLScriptElement[];
};

const openDoms: JSDOM[] = [];

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createHarness(
  body: string,
  options: { intersectionObserver?: boolean } = { intersectionObserver: true }
): LoaderHarness {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    runScripts: "outside-only",
    url: "https://shop.example/products/cards",
  });
  openDoms.push(dom);

  const win = dom.window as unknown as Window & typeof globalThis;
  const document = win.document;
  let observer: MockObserver | undefined;

  if (options.intersectionObserver !== false) {
    const observed = new Set<Element>();
    let callback: ((entries: Array<{
      target: Element;
      isIntersecting: boolean;
      intersectionRatio: number;
    }>) => void) | undefined;

    class TestIntersectionObserver {
      constructor(cb: typeof callback) {
        callback = cb;
      }

      observe(target: Element): void {
        observed.add(target);
      }

      unobserve(target: Element): void {
        observed.delete(target);
      }

      disconnect(): void {
        observed.clear();
      }
    }

    Object.defineProperty(win, "IntersectionObserver", {
      configurable: true,
      value: TestIntersectionObserver,
    });

    observer = {
      observed,
      trigger(target, isIntersecting = true) {
        callback?.([{
          target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
        }]);
      },
    };
  }

  const loaderScript = document.createElement("script");
  loaderScript.src = "/assets/rp-widget-loader.js";
  document.head.appendChild(loaderScript);
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: loaderScript,
  });
  win.eval(LOADER_SOURCE);
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: null,
  });
  document.dispatchEvent(new win.Event("DOMContentLoaded"));

  const root = document.querySelector<HTMLElement>(
    "[data-rp-utils-src][data-rp-widget-src]"
  );
  if (!root) throw new Error("Loader harness requires a widget root");

  return {
    dom,
    document,
    root,
    observer,
    scripts: () => Array.from(
      document.querySelectorAll<HTMLScriptElement>("script[data-rp-loader-src]")
    ),
  };
}

function markUtilsReady(dom: JSDOM): void {
  (dom.window as unknown as { RPUtils: { VERSION: string } }).RPUtils = {
    VERSION: "1.0.0",
  };
}

function dispatchScriptEvent(dom: JSDOM, script: HTMLScriptElement, type: "load" | "error"): void {
  script.dispatchEvent(new dom.window.Event(type));
}

function installRuntimeStub(dom: JSDOM): void {
  const win = dom.window;
  const escapeHtml = (value: unknown): string => {
    const element = win.document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
  };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  (win as unknown as {
    RPUtils: Record<string, unknown>;
  }).RPUtils = {
    VERSION: "1.0.0",
    logger: () => logger,
    escapeHtml,
    sanitize: {
      color: (value: unknown, fallback: string) =>
        typeof value === "string" && value ? value : fallback,
      number: (value: unknown, fallback: number) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      },
      fontFamily: (value: unknown, fallback: string) =>
        typeof value === "string" && value ? value : fallback,
    },
    cache: {
      read: () => null,
      write: vi.fn(),
      bust: vi.fn(),
      key: () => "rp:test",
    },
    fetchWithRetry: vi.fn(),
    format: {
      currency: (value: unknown) => String(value),
      number: (value: unknown) => String(value),
      currencySymbol: () => "$",
    },
  };
}

afterEach(() => {
  while (openDoms.length > 0) openDoms.pop()?.window.close();
  vi.restoreAllMocks();
});

describe("rp-widget-loader", () => {
  const ROOT = `
    <div class="rp-giftcards-root"
      data-rp-utils-src="/assets/rp-utils.js"
      data-rp-widget-src="/assets/gift-cards.js"></div>`;

  it("waits for visibility and ordered-loads RPUtils before the widget runtime", async () => {
    const harness = createHarness(ROOT);
    const ready = vi.fn();
    harness.root.addEventListener("rewardspro:widget-ready", ready);

    expect(harness.scripts()).toHaveLength(0);
    expect(harness.observer?.observed.has(harness.root)).toBe(true);

    harness.observer?.trigger(harness.root);
    expect(harness.scripts().map((script) => script.src)).toEqual([
      "https://shop.example/assets/rp-utils.js",
    ]);

    markUtilsReady(harness.dom);
    dispatchScriptEvent(harness.dom, harness.scripts()[0], "load");
    await flush();

    expect(harness.scripts().map((script) => script.src)).toEqual([
      "https://shop.example/assets/rp-utils.js",
      "https://shop.example/assets/gift-cards.js",
    ]);

    dispatchScriptEvent(harness.dom, harness.scripts()[1], "load");
    await flush();

    expect(harness.root.dataset.rpLoaderState).toBe("ready");
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("deduplicates equivalent utility and runtime URLs across roots", async () => {
    const harness = createHarness(`
      <div id="first" class="rp-giftcards-root"
        data-rp-utils-src="/assets/rp-utils.js"
        data-rp-widget-src="/assets/gift-cards.js"></div>
      <div id="second" class="rp-giftcards-root"
        data-rp-utils-src="https://shop.example/assets/rp-utils.js"
        data-rp-widget-src="https://shop.example/assets/gift-cards.js"></div>
    `);
    const second = harness.document.getElementById("second") as HTMLElement;

    harness.observer?.trigger(harness.root);
    harness.observer?.trigger(second);
    expect(harness.scripts()).toHaveLength(1);

    markUtilsReady(harness.dom);
    dispatchScriptEvent(harness.dom, harness.scripts()[0], "load");
    await flush();
    expect(harness.scripts()).toHaveLength(2);

    dispatchScriptEvent(harness.dom, harness.scripts()[1], "load");
    await flush();

    expect(harness.root.dataset.rpLoaderState).toBe("ready");
    expect(second.dataset.rpLoaderState).toBe("ready");
    expect(harness.scripts().filter((script) =>
      script.src.endsWith("/assets/gift-cards.js")
    )).toHaveLength(1);
  });

  it("loads on first interaction and falls back immediately without IntersectionObserver", () => {
    const interactive = createHarness(ROOT);
    interactive.root.dispatchEvent(new interactive.dom.window.Event("pointerdown", {
      bubbles: true,
    }));
    expect(interactive.scripts()[0]?.src).toBe(
      "https://shop.example/assets/rp-utils.js"
    );

    const fallback = createHarness(ROOT, { intersectionObserver: false });
    expect(fallback.scripts()[0]?.src).toBe(
      "https://shop.example/assets/rp-utils.js"
    );
  });

  it("does not request a runtime when RPUtils fails and exposes a retryable error state", async () => {
    const harness = createHarness(ROOT);
    const loadError = vi.fn();
    const consoleError = vi.spyOn(harness.dom.window.console, "error").mockImplementation(() => {});
    harness.root.addEventListener("rewardspro:load-error", loadError);

    harness.observer?.trigger(harness.root);
    dispatchScriptEvent(harness.dom, harness.scripts()[0], "error");
    await flush();

    expect(harness.scripts()).toHaveLength(0);
    expect(harness.root.dataset.rpLoaderState).toBe("error");
    expect(loadError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(harness.root.querySelector('[role="status"]')).not.toBeNull();
    expect(harness.root.querySelector("[data-rp-loader-retry]")).not.toBeNull();

    harness.root.dispatchEvent(new harness.dom.window.Event("focusin", {
      bubbles: true,
    }));
    expect(harness.scripts()).toHaveLength(1);
  });

  it("reuses a cached runtime and still readies a theme-editor root inserted later", async () => {
    const harness = createHarness(ROOT);
    harness.observer?.trigger(harness.root);
    markUtilsReady(harness.dom);
    dispatchScriptEvent(harness.dom, harness.scripts()[0], "load");
    await flush();
    dispatchScriptEvent(harness.dom, harness.scripts()[1], "load");
    await flush();

    const inserted = harness.document.createElement("div");
    inserted.className = "rp-giftcards-root";
    inserted.dataset.rpUtilsSrc = "/assets/rp-utils.js";
    inserted.dataset.rpWidgetSrc = "/assets/gift-cards.js";
    const ready = vi.fn();
    inserted.addEventListener("rewardspro:widget-ready", ready);
    harness.document.body.appendChild(inserted);

    inserted.dispatchEvent(new harness.dom.window.CustomEvent("shopify:section:load", {
      bubbles: true,
    }));
    expect(harness.observer?.observed.has(inserted)).toBe(true);

    harness.observer?.trigger(inserted);
    await flush();

    expect(harness.scripts()).toHaveLength(2);
    expect(inserted.dataset.rpLoaderState).toBe("ready");
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("rejects untrusted origins and runtime filenames without appending scripts", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const external = createHarness(`
      <div class="rp-giftcards-root"
        data-rp-utils-src="https://evil.example/rp-utils.js"
        data-rp-widget-src="https://evil.example/gift-cards.js"></div>
    `, { intersectionObserver: false });
    await flush();

    expect(external.scripts()).toHaveLength(0);
    expect(external.root.dataset.rpLoaderState).toBe("error");
    expect(external.root.querySelector("[data-rp-loader-retry]")).not.toBeNull();

    const wrongRuntime = createHarness(`
      <div class="rp-giftcards-root"
        data-rp-utils-src="/assets/rp-utils.js"
        data-rp-widget-src="/assets/raffles.js"></div>
    `);
    markUtilsReady(wrongRuntime.dom);
    wrongRuntime.observer?.trigger(wrongRuntime.root);
    await flush();

    expect(wrongRuntime.scripts()).toHaveLength(0);
    expect(wrongRuntime.root.dataset.rpLoaderState).toBe("error");
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it("evicts a semantically broken RPUtils load so retry requests it again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const harness = createHarness(ROOT);
    harness.observer?.trigger(harness.root);
    const firstScript = harness.scripts()[0];
    dispatchScriptEvent(harness.dom, firstScript, "load");
    await flush();

    expect(harness.root.dataset.rpLoaderState).toBe("error");
    expect(harness.scripts()).toHaveLength(0);

    harness.root.querySelector<HTMLElement>("[data-rp-loader-retry]")?.click();
    expect(harness.scripts()).toHaveLength(1);
    expect(harness.scripts()[0]).not.toBe(firstScript);
    expect(harness.scripts()[0].src).toBe(
      "https://shop.example/assets/rp-utils.js"
    );
  });
});

describe("runtime bootstrap lifecycle", () => {
  it("initializes lazy and theme-editor gift-card roots exactly once", async () => {
    const dom = new JSDOM(`<!doctype html><body>
      <div class="rp-giftcards-root"
        data-state="guest"
        data-heading="Gift Cards"
        data-guest-message="Sign in"
        data-guest-cta="Sign In"
        data-guest-url="/account/login"></div>
    </body>`, { runScripts: "outside-only", url: "https://shop.example" });
    openDoms.push(dom);
    installRuntimeStub(dom);

    dom.window.eval(fs.readFileSync(path.join(ASSETS, "gift-cards.js"), "utf-8"));
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    await flush();

    const first = dom.window.document.querySelector<HTMLElement>(".rp-giftcards-root")!;
    expect(first.dataset.initialized).toBe("true");
    expect(first.querySelector(".rp-gc-guest")).not.toBeNull();

    const inserted = first.cloneNode(false) as HTMLElement;
    inserted.removeAttribute("data-initialized");
    dom.window.document.body.appendChild(inserted);
    inserted.dispatchEvent(new dom.window.CustomEvent("rewardspro:widget-ready", {
      bubbles: true,
    }));
    await flush();

    expect(inserted.dataset.initialized).toBe("true");
    expect(inserted.querySelector(".rp-gc-guest")).not.toBeNull();

    inserted.innerHTML = '<span id="sentinel">unchanged</span>';
    inserted.dispatchEvent(new dom.window.CustomEvent("rewardspro:widget-ready", {
      bubbles: true,
    }));
    await flush();
    expect(inserted.querySelector("#sentinel")).not.toBeNull();
  });

  it("initializes interactive missions roots without replacing the server-rendered guest section", async () => {
    const dom = new JSDOM(`<!doctype html><body>
      <div id="missions-widget-root" class="rp-missions-root" data-state="guest"></div>
      <div class="rp-missions-section-root" data-state="authenticated" data-inline="true"></div>
      <div class="rp-missions-section-root" data-state="guest" data-inline="true">
        <div id="guest-preview">Localized mission preview</div>
        <a href="/en/account/login">Market-aware sign in</a>
      </div>
    </body>`, { runScripts: "outside-only", url: "https://shop.example" });
    openDoms.push(dom);
    installRuntimeStub(dom);

    dom.window.eval(fs.readFileSync(path.join(ASSETS, "missions-widget.js"), "utf-8"));
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    await flush();

    const initialRoots = Array.from(
      dom.window.document.querySelectorAll<HTMLElement>(
        "#missions-widget-root, .rp-missions-section-root"
      )
    );
    expect(initialRoots).toHaveLength(3);
    initialRoots.slice(0, 2).forEach((root) => {
      expect(root.dataset.initialized).toBe("true");
      expect(root.querySelector(".rp-missions-widget")).not.toBeNull();
    });
    expect(initialRoots[2].dataset.initialized).toBeUndefined();
    expect(initialRoots[2].querySelector("#guest-preview")?.textContent).toBe(
      "Localized mission preview"
    );
    expect(initialRoots[2].querySelector("a")?.getAttribute("href")).toBe(
      "/en/account/login"
    );

    const inserted = dom.window.document.createElement("div");
    inserted.className = "rp-missions-section-root";
    inserted.dataset.state = "authenticated";
    inserted.dataset.inline = "true";
    dom.window.document.body.appendChild(inserted);
    inserted.dispatchEvent(new dom.window.CustomEvent("rewardspro:widget-ready", {
      bubbles: true,
    }));
    await flush();

    expect(inserted.dataset.initialized).toBe("true");
    expect(inserted.querySelector(".rp-missions-widget")).not.toBeNull();
  });
});

describe("theme extension loader wiring", () => {
  it("keeps the schema entry below Shopify's 10 KB suggested threshold", () => {
    expect(Buffer.byteLength(LOADER_SOURCE, "utf-8")).toBeLessThan(10_000);
  });

  it.each(Object.entries(BLOCK_RUNTIMES))(
    "%s references the shared loader and Liquid-provided runtime URLs",
    (block, runtime) => {
      const source = fs.readFileSync(path.join(BLOCKS, block), "utf-8");

      expect(source).toContain('"javascript": "rp-widget-loader.js"');
      expect(source).toContain(
        `data-rp-utils-src="{{ 'rp-utils.js' | asset_url }}"`
      );
      expect(source).toContain(
        `data-rp-widget-src="{{ '${runtime}' | asset_url }}"`
      );
      expect(fs.existsSync(path.join(ASSETS, runtime))).toBe(true);
      expect(source).not.toMatch(/href="\/account(?:\/login)?"/);
      expect(source).not.toContain('"default": "/account/login"');
      expect(source).toContain(
        "assign guest_cta_url = routes.account_login_url"
      );
    }
  );

  it("keeps the shared style snippet free of parser-blocking scripts", () => {
    const snippet = fs.readFileSync(
      path.join(EXTENSION, "snippets", "rp_utils_loader.liquid"),
      "utf-8"
    );
    expect(snippet).not.toMatch(/<script\b/i);
    expect(snippet).toContain("'rp-shared.css' | asset_url");
  });
});
