import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

function classes(markup: string, tag: "h1" | "p") {
  return markup.match(new RegExp(`<${tag} class="([^"]*)"`))?.[1].split(/\s+/) ?? [];
}

describe("PageHeader size", () => {
  it("keeps the original default heading and description scale", () => {
    const markup = renderToStaticMarkup(
      <PageHeader title="Prices" description="Reference prices, not offers." />,
    );

    expect(classes(markup, "h1")).toEqual(expect.arrayContaining([
      "font-display", "text-2xl", "font-semibold", "text-ink",
    ]));
    expect(classes(markup, "p")).toEqual(expect.arrayContaining([
      "text-sm", "text-ink-muted", "mt-1",
    ]));
    expect(classes(markup, "h1")).not.toContain("text-3xl");
    expect(classes(markup, "p")).not.toContain("text-base");
    expect(renderToStaticMarkup(
      <PageHeader size="default" title="Prices" description="Reference prices, not offers." />,
    )).toBe(markup);
  });

  it("opts into the large tool heading without competing type or spacing classes", () => {
    const markup = renderToStaticMarkup(
      <PageHeader size="large" title="Prices" description="Reference prices, not offers." />,
    );

    expect(classes(markup, "h1")).toEqual(expect.arrayContaining([
      "font-display", "text-3xl", "leading-9", "font-semibold", "text-ink",
    ]));
    expect(classes(markup, "p")).toEqual(expect.arrayContaining([
      "text-base", "leading-7", "text-ink-muted", "mt-3",
    ]));
    expect(classes(markup, "h1")).not.toContain("text-2xl");
    expect(classes(markup, "p")).not.toContain("text-sm");
    expect(classes(markup, "p")).not.toContain("mt-1");
  });
});

describe.each(["default", "large"] as const)("PageHeader %s semantics", (size) => {
  it("retains one h1, rich description, provenance beside the title, and the action slot", () => {
    const markup = renderToStaticMarkup(
      <PageHeader
        size={size}
        title="Prices & sources"
        description={<>Reference only. <a href="/methodology/prices">How prices work</a></>}
        provenance={<span data-provenance="snapshot">Snapshot</span>}
        action={<button type="button" aria-label="Change filters">Filters</button>}
      />,
    );

    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toContain(">Prices &amp; sources</h1>");
    expect(markup).not.toMatch(/<h[2-6]\b/);
    expect(markup).toContain('</h1><span data-provenance="snapshot">Snapshot</span></div>');
    expect(markup).toContain('Reference only. <a href="/methodology/prices">How prices work</a></p>');
    expect(markup).toContain('<div class="shrink-0 flex items-center gap-2"><button type="button" aria-label="Change filters">Filters</button></div>');
    expect(markup).not.toMatch(/\ssize=/);
  });

  it("renders only the heading when optional slots are absent", () => {
    const markup = renderToStaticMarkup(<PageHeader size={size} title="Prices" />);

    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).not.toMatch(/<p\b|<button\b|<a\b/);
    expect(markup).not.toContain("shrink-0");
    expect(markup).not.toMatch(/\ssize=/);
  });
});
