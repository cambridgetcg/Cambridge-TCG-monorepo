// @vitest-environment jsdom
/**
 * The instant lights flip contract (2026-07-07 wardrobe fast path).
 *
 * The Nav's lights switch stays a plain <a> (the no-JS path is the
 * 2026-06-10 wardrobe idiom: cookie writer + back-redirect). With JS,
 * the flip must be perceived-instant: re-ink the root NOW, persist the
 * cookie in the background over the SAME url the <a> would navigate to.
 */
import { describe, expect, it, vi } from "vitest";
import { applyLightsFlip, applyThemeViewport, keepThemeViewport } from "./flip";

describe("the instant lights flip", () => {
  it("re-inks the root immediately and persists over the anchor's own url", () => {
    const root = { setAttribute: vi.fn() };
    const fetchFn = vi.fn().mockResolvedValue(undefined);
    applyLightsFlip(
      { target: "midnight", href: "/api/appearance?theme=midnight&back=%2F" },
      root,
      fetchFn,
    );
    expect(root.setAttribute).toHaveBeenCalledWith("data-theme", "midnight");
    // redirect: "manual" — the 302's Set-Cookie is applied by the browser
    // at the network layer; we never download the redirected page body.
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/appearance?theme=midnight&back=%2F",
      { redirect: "manual" },
    );
  });

  it("survives a failed persist — the flip stands, no unhandled rejection", async () => {
    const root = { setAttribute: vi.fn() };
    const fetchFn = vi.fn().mockRejectedValue(new Error("offline"));
    applyLightsFlip({ target: "gallery", href: "/x" }, root, fetchFn);
    await new Promise((r) => setTimeout(r, 0));
    expect(root.setAttribute).toHaveBeenCalledWith("data-theme", "gallery");
  });
});

// The tags as generateViewport renders them (layout.tsx).
const SYSTEM_HEAD = `
  <meta name="theme-color" content="#fbf7f1" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#1d1425" media="(prefers-color-scheme: dark)">
  <meta name="color-scheme" content="light dark">`;
const MIDNIGHT_HEAD = `
  <meta name="theme-color" content="#1d1425">
  <meta name="color-scheme" content="dark">`;

function page(head: string) {
  const doc = document.implementation.createHTMLDocument();
  doc.head.innerHTML = head;
  return doc;
}

const themeColors = (doc: Document) =>
  [...doc.querySelectorAll('meta[name="theme-color"]')].map((meta) => [meta.getAttribute("media"), meta.getAttribute("content")]);
const colorScheme = (doc: Document) => doc.querySelector('meta[name="color-scheme"]')?.getAttribute("content");

describe("the browser bar follows the flip", () => {
  it("puts Dark's ground on both of a system page's tags, keeping each tag", () => {
    const doc = page(SYSTEM_HEAD);
    const fetchFn = vi.fn().mockResolvedValue(undefined);
    applyLightsFlip({ target: "midnight", href: "/x" }, doc.documentElement, fetchFn, doc.head);
    expect(doc.documentElement.getAttribute("data-theme")).toBe("midnight");
    expect(themeColors(doc)).toEqual([
      ["(prefers-color-scheme: light)", "#1d1425"],
      ["(prefers-color-scheme: dark)", "#1d1425"],
    ]);
    expect(colorScheme(doc)).toBe("dark");
  });

  it("moves a saved theme's one tag to the new theme", () => {
    const doc = page(MIDNIGHT_HEAD);
    const fetchFn = vi.fn().mockResolvedValue(undefined);
    applyLightsFlip({ target: "gallery", href: "/x" }, doc.documentElement, fetchFn, doc.head);
    expect(themeColors(doc)).toEqual([[null, "#fbf7f1"]]);
    expect(colorScheme(doc)).toBe("light");
  });

  it("gives the pair back by media when the page follows the system again", () => {
    const doc = page(SYSTEM_HEAD);
    applyThemeViewport("terminal", doc.head);
    expect(themeColors(doc).map(([, colour]) => colour)).toEqual(["#0a0a0a", "#0a0a0a"]);
    applyThemeViewport("system", doc.head);
    expect(themeColors(doc)).toEqual([
      ["(prefers-color-scheme: light)", "#fbf7f1"],
      ["(prefers-color-scheme: dark)", "#1d1425"],
    ]);
    expect(colorScheme(doc)).toBe("light dark");
  });

  it("writes nothing when the tags already say it", () => {
    const doc = page(MIDNIGHT_HEAD);
    const setAttribute = vi.spyOn(Element.prototype, "setAttribute");
    applyThemeViewport("midnight", doc.head);
    expect(setAttribute).not.toHaveBeenCalled();
    setAttribute.mockRestore();
  });
});

// MutationObserver callbacks run as microtasks; let every pass finish.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a cached route's head after a flip (Back, Forward)", () => {
  it("puts the restored tags back on the theme <html> wears", async () => {
    const doc = page(SYSTEM_HEAD);
    const stop = keepThemeViewport(doc.documentElement, doc.head);
    const fetchFn = vi.fn().mockResolvedValue(undefined);
    applyLightsFlip({ target: "midnight", href: "/x" }, doc.documentElement, fetchFn, doc.head);
    // Back: React re-renders the head the route had before the flip.
    doc.head.querySelectorAll('meta[name="theme-color"]')[0].setAttribute("content", "#fbf7f1");
    doc.head.querySelectorAll('meta[name="theme-color"]')[1].setAttribute("content", "#1d1425");
    doc.head.querySelector('meta[name="color-scheme"]')?.setAttribute("content", "light dark");
    await settle();
    expect(themeColors(doc)).toEqual([
      ["(prefers-color-scheme: light)", "#1d1425"],
      ["(prefers-color-scheme: dark)", "#1d1425"],
    ]);
    expect(colorScheme(doc)).toBe("dark");
    stop();
  });

  it("holds tags React swaps in, and stops when disconnected", async () => {
    const doc = page(SYSTEM_HEAD);
    doc.documentElement.setAttribute("data-theme", "gallery");
    const stop = keepThemeViewport(doc.documentElement, doc.head);
    expect(themeColors(doc).map(([, colour]) => colour)).toEqual(["#fbf7f1", "#fbf7f1"]);
    // A route rendered under Dark: one tag replaces the pair.
    doc.head.innerHTML = MIDNIGHT_HEAD;
    await settle();
    expect(themeColors(doc)).toEqual([[null, "#fbf7f1"]]);
    expect(colorScheme(doc)).toBe("light");
    stop();
    doc.head.innerHTML = MIDNIGHT_HEAD;
    await settle();
    expect(themeColors(doc)).toEqual([[null, "#1d1425"]]);
  });
});
