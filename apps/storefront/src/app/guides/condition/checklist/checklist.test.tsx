import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConditionChecklistPage, { metadata } from "./page";
import { BorderAxis } from "./Worksheet";

const renderPage = () => renderToStaticMarkup(<ConditionChecklistPage />);

describe("server-rendered manual condition companion", () => {
  it("renders the worksheet, boundaries and explicit English before hydration", () => {
    const html = renderPage();
    expect(html).toContain('lang="en"');
    expect(html).toContain("Manual card condition worksheet");
    for (const label of ["Card identity", "Front surface", "Back surface", "Edges", "Corners", "Structure", "Notes, photos and disclosure"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Reloading clears its state");
    expect(html).toContain("No condition tier, grading-company result, authenticity or value is predicted");
    expect(html).toContain("Not measured — enter both border widths");
    expect(html).toContain("not a grading service");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('type="submit"');
    expect(html).not.toContain("<img");
  });

  it("pairs every rendered control with an explicit label and unique id", () => {
    const html = renderPage();
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const controls = [...html.matchAll(/<(?:input|textarea|select)\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(controls.length).toBeGreaterThan(20);
    for (const id of controls) expect(html).toContain(`for="${id}"`);
    expect(html).toContain('id="include-back"');
    expect(html).toContain('hidden=""');
    expect(html).toContain("Borderless / irregular / not measurable");
  });

  it("supplies matching canonical and only breadcrumb structured data", () => {
    const canonical = "https://cambridgetcg.com/guides/condition/checklist";
    expect(metadata.alternates?.canonical).toBe(canonical);
    const html = renderPage();
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    const json = JSON.parse(scripts[0][1]);
    expect(json["@type"]).toBe("BreadcrumbList");
    expect(json.itemListElement.at(-1).item).toBe(canonical);
    expect(html).toContain(`href="${canonical}"`);
    expect(html).toContain('href="/standards/validator"');
  });

  it("renders separate labelled arithmetic outputs without thresholds", () => {
    const html = renderToStaticMarkup(<>
      <BorderAxis face="Front" axis="horizontal" measurable initialValues={["3", "2"]} />
      <BorderAxis face="Front" axis="vertical" measurable initialValues={["1", "3"]} />
    </>);
    expect(html).toContain("Left / Right: 60 / 40 (%)");
    expect(html).toContain("Top / Bottom: 25 / 75 (%)");
    expect(html).not.toMatch(/PSA|BGS|grade|tier|pass|fail/i);
    expect(html).toContain('role="status"');
    // Print mirrors contain raw entered values, not clipped form screenshots.
    expect(html).toMatch(/<span class="[^"]*printValue[^"]*">3<\/span>/);
  });

  it("renders field-associated errors and suppresses numeric output for invalid pairs", () => {
    const html = renderToStaticMarkup(<BorderAxis face="Front" axis="horizontal" measurable initialValues={["-1", "2"]} />);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="front-horizontal-result front-horizontal-0-error"');
    expect(html).toContain('id="front-horizontal-0-error"');
    expect(html).toContain("Use zero or a positive border width");
    expect(html).not.toContain("(%)");
    const zero = renderToStaticMarkup(<BorderAxis face="Back" axis="vertical" measurable initialValues={["0", "0"]} />);
    expect(zero).toContain("both borders are zero");
    const borderless = renderToStaticMarkup(<BorderAxis face="Back" axis="vertical" measurable={false} initialValues={["3", "1"]} />);
    expect(borderless).toContain("Not measurable — no ratio calculated");
    expect(borderless).not.toContain("(%)");
  });

  it("retains explicit printable values and scopes chrome removal to this page", () => {
    const html = renderPage();
    expect(html).toContain("[Not checked]");
    expect(html).toContain("Not recorded");
    const css = readFileSync(new URL("./worksheet.module.css", import.meta.url), "utf8");
    expect(css).toContain("@media print");
    expect(css).toContain(":global(body):has(.page)");
    expect(css).toContain("white-space: pre-wrap");
    expect(css).toContain("display: block !important");
    expect(css).toContain(":global(body.text-mode) .diagram");
  });

  it("loads the existing CJK fallback on visible entries before printing their mirrors", () => {
    const css = readFileSync(new URL("./worksheet.module.css", import.meta.url), "utf8");
    const beforePrint = css.split("@media print")[0];
    expect(beforePrint).toMatch(/\.page :is\(input, textarea\),\s*\.printValue\s*\{\s*font-family: var\(--font-schibsted\), var\(--font-noto-serif-jp\), system-ui, sans-serif;/);
    const source = readFileSync(new URL("./Worksheet.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/await document\.fonts\.ready;\s*window\.print\(\)/);
  });

  it("links the companion and official sources without re-dating the parent guide", () => {
    const parent = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");
    expect(parent).toContain('href="/guides/condition/checklist"');
    expect(parent).toContain('href="https://www.psacard.com/gradingstandards"');
    expect(parent).toContain('href="https://help.tcgplayer.com/hc/en-us/articles/26141121045143-Understanding-Card-Condition-Imperfections-A-Comprehensive-Guide"');
    expect(parent).toContain('href="https://help.tcgplayer.com/hc/en-us/articles/221430307-Card-Conditioning-Overview"');
    expect(parent).toContain("1 August 2026");
    expect(parent).toContain("checked 1 Aug 2026 — verify live");
    expect(parent).toContain("does not re-date the historical checks");
  });

  it("adds no entry persistence, tracking, network calls or submission action", () => {
    const source = readFileSync(new URL("./Worksheet.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon|XMLHttpRequest|action=/);
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("window.print()");
  });
});
