import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/play/adventure/1" }));
import PlayNav from "./PlayNav";

describe("play navigation", () => {
  it("preserves destinations, identifies the active practice path and avoids reward marketing", () => {
    const html = renderToStaticMarkup(<PlayNav />);
    for (const path of ["/play", "/play/adventure", "/play/starters", "/play/tutorial", "/play/deck-check", "/play/meta"]) {
      expect(html).toContain(`href="${path}"`);
    }
    const active = html.match(/<a\b[^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('href="/play/adventure"');
    expect(html).not.toMatch(/play-to-earn|battles paused|sticky/);
  });
});
