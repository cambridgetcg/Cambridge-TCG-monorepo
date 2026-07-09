/**
 * The instant lights flip contract (2026-07-07 wardrobe fast path).
 *
 * The Nav's lights switch stays a plain <a> (the no-JS path is the
 * 2026-06-10 wardrobe idiom: cookie writer + back-redirect). With JS,
 * the flip must be perceived-instant: re-ink the root NOW, persist the
 * cookie in the background over the SAME url the <a> would navigate to.
 */
import { describe, expect, it, vi } from "vitest";
import { applyLightsFlip } from "./flip";

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
