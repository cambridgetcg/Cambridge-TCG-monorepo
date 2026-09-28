import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UI_LANGS } from "@/lib/lang-mode";
import HomeLanding from "./HomeLanding";

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
    for (const href of ["/prices", "/account/portfolio", "/play", "/agents", "/contact", "/methodology/pricing"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toMatch(/href="\/(?:market\/list|checkout|subscribe|identify)"/);
  });

  it("offers public browsing, labels account access and keeps agents in their own entry", () => {
    const html = renderToStaticMarkup(<HomeLanding uiLang="en" provenance={<span>registry provenance</span>} />);
    expect(html).toContain("No account needed to search.");
    expect(html).toContain("Sign in with an existing account.");
    expect(html).toContain("Some prices are withheld.");
    expect(html).toContain("registry provenance");
    expect(html).toMatch(/<aside[\s\S]*?href="\/agents"[\s\S]*?<\/aside>/);
    expect(html).not.toMatch(/method="post"|type="password"|name="(?:token|api_key)"/);
  });
});
