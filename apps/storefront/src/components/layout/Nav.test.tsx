import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Nav from "./Nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/prices/search" }));
vi.mock("@/lib/ui", async () => await import("@/lib/ui/Icon"));

describe("global navigation entry actions", () => {
  it("offers card search on desktop and mobile without promoting retired sales", () => {
    const markup = renderToStaticMarkup(<Nav theme="gallery" />);
    expect([...markup.matchAll(/<a\b[^>]*href="\/prices\/search"/g)]).toHaveLength(2);
    expect(markup).toContain('aria-label="Find a card"');
    expect(markup).not.toContain('href="/market/list"');
    expect(markup).toContain('href="/login"');
    expect(markup).toContain('aria-controls="mobile-navigation"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("preserves signed-in account access and high-contrast theme choice", () => {
    const markup = renderToStaticMarkup(<Nav theme="high-contrast" initialLoggedIn />);
    expect(markup).toContain('href="/account"');
    expect(markup).not.toContain('href="/login"');
    expect(markup).not.toContain("/api/appearance?theme=");
    expect(markup).toContain('href="/account/messages"');
  });
});
