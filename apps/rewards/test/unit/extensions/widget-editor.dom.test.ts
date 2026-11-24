// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runWidgetScript, unloadWidgetScript, widgetListenerTypes, widgetObserverCount } from "../helpers/widget-script";

/**
 * The storefront widget in Shopify's theme editor, which is the widget's
 * live preview (Built for Shopify 4.2.6). Per Shopify's "Integrate sections
 * and blocks with the theme editor", the editor prints a block's HTML again
 * after a settings change without reloading the page, so script that ran at
 * page load doesn't run again, and it sends bubbling shopify:* events whose
 * target is the block's or section's element. Shopify wraps an app embed in
 * an element of its own. These tests play the editor's part; nobody has yet
 * watched the real editor do it (docs/gates.md).
 */

const EXTENSION = resolve(__dirname, "../../../extensions/rewards-widget");
const copy = (JSON.parse(readFileSync(resolve(EXTENSION, "locales/en.default.json"), "utf8")) as { rewards_widget: Record<string, string> })
  .rewards_widget;

type Printed = { editor: boolean; running?: "true" | "false" | ""; message?: string };

/** The embed as the editor prints it: Shopify's wrapper around the root membership_widget.liquid prints. */
function printed({ editor, running = "true", message = "" }: Printed): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.id = "shopify-block-rewards";
  wrapper.className = "shopify-block shopify-app-block";
  const root = document.createElement("div");
  root.className = "rw";
  root.hidden = true;
  const attributes: Record<string, string> = {
    "data-rewards-widget": "",
    "data-look": "light",
    "data-locale": "en-US",
    "data-state": "guest",
    "data-running": running,
    "data-base-percent": "5",
    "data-message": message,
    "data-cta-text": "",
    "data-cta-url": "",
    "data-login-url": "/account/login",
  };
  for (const [key, value] of Object.entries(copy)) {
    // Liquid prints the preview note, like the flag, only in the editor
    if (key !== "preview" || editor) attributes[`data-t-${key.replaceAll("_", "-")}`] = value;
  }
  if (editor) attributes["data-design-mode"] = "";
  for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value);
  wrapper.append(root);
  return wrapper;
}

/** A page load with the embed on: the wrapper is printed and the script runs. */
function page(options: Printed): HTMLElement {
  const wrapper = printed(options);
  document.body.append(wrapper);
  runWidgetScript();
  return wrapper;
}

const send = (target: Element, type: string, detail: Record<string, unknown> = {}) =>
  target.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable: false, detail }));

/** A settings change: the editor unloads the block's HTML, prints the new HTML in its place and loads it. */
function rerender(old: HTMLElement, options: Printed, { events = true } = {}): HTMLElement {
  if (events) send(old, "shopify:section:unload", { sectionId: old.id });
  const fresh = printed(options);
  old.replaceWith(fresh);
  if (events) send(fresh, "shopify:section:load", { sectionId: fresh.id });
  return fresh;
}

const rootOf = (wrapper: Element) => wrapper.querySelector("[data-rewards-widget]") as HTMLElement;
const panelOf = (wrapper: Element) => rootOf(wrapper).querySelector(".rw-panel") as HTMLElement;
const buttonOf = (wrapper: Element) => rootOf(wrapper).querySelector(".rw-button") as HTMLButtonElement;

/** The words a reader meets, one text node after another. */
function text(root: Element): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent ?? "");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

afterEach(() => {
  unloadWidgetScript();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the widget in the theme editor", () => {
  it("draws a guest's widget while cashback is off, saying guests don't see it, and asks no server", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const wrapper = page({ editor: true, running: "false" });

    expect(rootOf(wrapper).hidden).toBe(false);
    expect(text(wrapper)).toContain("Sign in to see your rewards");
    expect(text(wrapper)).toContain("Theme editor only: guests see no widget while cashback is off");
    // No rate is offered while cashback is off
    expect(text(wrapper)).not.toContain("Earn");
    expect(rootOf(wrapper).querySelector("a")?.textContent).toBe("Sign in");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("adds no note while cashback is on", () => {
    const wrapper = page({ editor: true, running: "true" });
    expect(text(wrapper)).toContain("Earn 5% back as store credit");
    expect(text(wrapper)).not.toContain("Theme editor only");
  });

  it("still shows a shopper nothing while cashback is off, and sets no watch on their page", () => {
    const wrapper = page({ editor: false, running: "false" });
    send(wrapper, "shopify:section:load", { sectionId: wrapper.id });
    send(wrapper, "shopify:block:select", { blockId: "rewards", sectionId: wrapper.id, load: false });

    expect(rootOf(wrapper).hidden).toBe(true);
    expect(text(wrapper)).toBe("");
    expect(widgetObserverCount()).toBe(0);
  });

  it("starts the re-printed widget on shopify:section:load, once", () => {
    // The event alone, with no watch on the page
    vi.stubGlobal("MutationObserver", undefined);
    const first = page({ editor: true, message: "Join the club" });
    expect(text(first)).toContain("Join the club");

    const fresh = rerender(first, { editor: true, message: "Join the rewards club" });
    expect(rootOf(fresh).hidden).toBe(false);
    expect(text(fresh)).toContain("Join the rewards club");

    send(fresh, "shopify:section:load", { sectionId: fresh.id });
    expect(document.querySelectorAll(".rw-button")).toHaveLength(1);
    expect(document.querySelectorAll(".rw-panel")).toHaveLength(1);
  });

  it("starts the re-printed widget even if the editor sends no event", async () => {
    const first = page({ editor: true });
    expect(widgetObserverCount()).toBe(1);

    const fresh = rerender(first, { editor: true, message: "Join the rewards club" }, { events: false });
    await vi.waitFor(() => expect(rootOf(fresh).hidden).toBe(false));
    expect(text(fresh)).toContain("Join the rewards club");
    expect(document.querySelectorAll(".rw-button")).toHaveLength(1);
  });

  for (const kind of ["block", "section"] as const) {
    it(`opens the panel when the merchant selects the widget (shopify:${kind}:select), and closes it on deselect`, () => {
      const wrapper = page({ editor: true });
      expect(panelOf(wrapper).hidden).toBe(true);

      send(wrapper, `shopify:${kind}:select`, { blockId: "rewards", sectionId: wrapper.id, load: false });
      expect(panelOf(wrapper).hidden).toBe(false);
      expect(buttonOf(wrapper).getAttribute("aria-expanded")).toBe("true");

      send(wrapper, `shopify:${kind}:deselect`, { blockId: "rewards", sectionId: wrapper.id });
      expect(panelOf(wrapper).hidden).toBe(true);
      expect(buttonOf(wrapper).getAttribute("aria-expanded")).toBe("false");
    });
  }

  it("keeps the panel open across a re-print while the widget is selected, so the new words show", () => {
    const first = page({ editor: true });
    send(first, "shopify:block:select", { blockId: "rewards", sectionId: first.id, load: false });

    const fresh = rerender(first, { editor: true, message: "Join the rewards club" });
    expect(panelOf(fresh).hidden).toBe(false);
    expect(text(panelOf(fresh))).toContain("Join the rewards club");

    // The editor's own select after a re-render (load: true) changes nothing more
    send(fresh, "shopify:block:select", { blockId: "rewards", sectionId: fresh.id, load: true });
    expect(panelOf(fresh).hidden).toBe(false);
    expect(document.querySelectorAll(".rw-panel")).toHaveLength(1);
  });

  it("leaves the panel alone when another block or section is selected", () => {
    const wrapper = page({ editor: true });
    const other = document.createElement("section");
    document.body.prepend(other);

    send(other, "shopify:section:select", { sectionId: "header", load: false });
    send(other, "shopify:block:select", { blockId: "logo", sectionId: "header", load: false });
    expect(panelOf(wrapper).hidden).toBe(true);
  });

  it("adds its listeners and watch once, however often the editor runs the script again", async () => {
    const first = page({ editor: true });
    runWidgetScript();
    runWidgetScript();

    const types = widgetListenerTypes().filter((type) => type.startsWith("shopify:"));
    expect(types.sort()).toEqual([
      "shopify:block:deselect",
      "shopify:block:select",
      "shopify:section:deselect",
      "shopify:section:load",
      "shopify:section:select",
    ]);
    expect(widgetObserverCount()).toBe(1);
    expect(document.querySelectorAll(".rw-button")).toHaveLength(1);

    // A run that comes with re-printed HTML starts the new root at once, and only once
    const fresh = printed({ editor: true, message: "Join the rewards club" });
    first.replaceWith(fresh);
    runWidgetScript();
    expect(rootOf(fresh).hidden).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelectorAll(".rw-button")).toHaveLength(1);
    expect(text(fresh)).toContain("Join the rewards club");
  });
});
