import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UI_LANGS } from "@/lib/lang-mode";
import { DATA_FOUNDATIONS } from "@/content/platform";
import HomeLanding from "./HomeLanding";

vi.mock("server-only", () => ({}));

describe("visitor landing", () => {
  it.each(UI_LANGS)("keeps native search and task destinations in $lang", ({ lang }) => {
    const html = renderToStaticMarkup(<HomeLanding uiLang={lang} />);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('data-cambridge-audience="consumer"');
    const form = html.match(/<form\b[^>]*>/)?.[0] ?? "";
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/prices/search"');
    expect(html).toContain('name="game"');
    expect(html).toContain('name="q"');
    expect(html).toContain('value="op"');
    expect(html).not.toContain('value="tst"');
    for (const href of ["/prices", "/services", "/standards", "/roadmap", "/about", "/account/portfolio", "/play", "/agents", "/contact", "/methodology/pricing", "/lineage", "/gallery-next-door"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toMatch(/href="\/(?:market\/list|checkout|subscribe|identify)"/);
  });

  it("connects standards and agent access while keeping native search and account labels clear", () => {
    const html = renderToStaticMarkup(<HomeLanding uiLang="en" provenance={<span>registry provenance</span>} />);
    expect(html).toContain("TCG data.<br/>");
    expect(html).toContain("Made to connect.");
    expect(html).toContain("No account needed to search.");
    expect(html).toContain("Existing account");
    expect(html).toContain("Some prices are withheld.");
    expect(html).toContain("registry provenance");
    expect(html).toMatch(/<nav aria-label="Build with card data"[\s\S]*?href="\/standards"[\s\S]*?href="\/agents"[\s\S]*?<\/nav>/);
    expect(html).toMatch(/<aside aria-label="Open-source development"[\s\S]*?href="\/about"[\s\S]*?<\/aside>/);
    expect(html).not.toMatch(/method="post"|type="password"|name="(?:token|api_key)"/);
    // The first task remains discoverable before artwork and tool navigation.
    expect(html.indexOf('action="/prices/search"')).toBeLessThan(html.indexOf("<figure"));
    expect(html.indexOf('action="/prices/search"')).toBeLessThan(html.indexOf('id="home-foundations"'));
  });

  it("shows each data foundation with its actual status and roadmap destination", () => {
    const html = renderToStaticMarkup(<HomeLanding uiLang="en" />);
    const foundations = html.slice(html.indexOf('aria-labelledby="home-foundations"'), html.indexOf("</section>", html.indexOf('aria-labelledby="home-foundations"')));
    expect(foundations).toContain('id="home-foundations"');
    for (const area of DATA_FOUNDATIONS) {
      expect(foundations).toContain(`href="/roadmap#${area.id}"`);
      expect(foundations).toContain(renderToStaticMarkup(<>{area.title}</>));
      expect(foundations).toContain(renderToStaticMarkup(<>{area.status}</>));
    }
  });
});
