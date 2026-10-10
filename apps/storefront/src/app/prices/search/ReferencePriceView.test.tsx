import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ReferenceComparison,
  ReferencePriceSummary,
  formatGbp,
  type ReferencePrice,
} from "./ReferencePriceView";

const REFERENCE: ReferencePrice = {
  reference_price_gbp: 12.34,
  provenance:
    "CardRush-derived pricing pipeline — policy-bound reference only",
  is_offer: false,
};

describe("reference-price search view", () => {
  it("renders the composer reference without reviving shop inventory claims", () => {
    const html = renderToStaticMarkup(
      <ReferencePriceSummary reference={REFERENCE} />,
    );

    expect(html).toContain("Reference price:");
    expect(html).toContain("£12.34");
    expect(html).toContain("not an offer");
    expect(html).not.toContain("Cambridge TCG sells");
    expect(html).not.toContain("in stock");
    expect(html).not.toContain("out of stock");
  });

  it("keeps a lone reference honest when restricted source rows are withheld", () => {
    const html = renderToStaticMarkup(
      <ReferenceComparison reference={REFERENCE} rows={[]} />,
    );

    expect(html).toContain("Reference value and published sources");
    expect(html).toContain("No publishable source row is available");
    expect(html).toContain("not an offer or an open-data grant");
    expect(html).toContain("Restricted source rows remain withheld");
    expect(html).toContain(REFERENCE.provenance);
    expect(html).toMatch(/<h2[^>]*>Reference value and published sources<\/h2>/);
    expect(html).not.toContain("<h1");
    expect(html).toContain('href="/methodology/pricing"');
    expect(html).toContain("bg-surface");
    expect(html).toContain("sm:p-6");
  });

  it("compares only publishable data points and never describes a deal", () => {
    const html = renderToStaticMarkup(
      <ReferenceComparison
        reference={REFERENCE}
        rows={[
          { source: "collector-witness", amount_gbp: 10 },
          { source: "open-index", amount_gbp: 14 },
        ]}
      />,
    );

    expect(html).toContain("Lowest publishable source");
    expect(html).toContain("Published-source average");
    expect(html).toContain("Data-point comparison only");
    expect(html).toContain("Cambridge does not buy or sell");
    expect(html).not.toContain("good deal");
    expect(html).not.toContain("cheapest elsewhere");
  });

  it("renders no comparison card when neither a reference nor a row exists", () => {
    const html = renderToStaticMarkup(
      <ReferenceComparison
        reference={{ ...REFERENCE, reference_price_gbp: null }}
        rows={[]}
      />,
    );

    expect(html).toBe("");
  });

  it("does not turn a missing reference into zero when source rows exist", () => {
    const reference = { ...REFERENCE, reference_price_gbp: null };
    const summary = renderToStaticMarkup(<ReferencePriceSummary reference={reference} />);
    const html = renderToStaticMarkup(
      <ReferenceComparison reference={reference} rows={[{ source: "open-index", amount_gbp: 10 }]} />,
    );

    expect(summary).toBe("");
    expect(html).toContain("Cambridge holds no reference value for this print");
    expect(html).toContain("not Cambridge offers");
    expect(html).toContain("—");
    expect(html).toContain("£10.00");
    expect(html).not.toContain("£0.00");
    expect(html).not.toContain("Derivation:");
    expect(html).not.toContain("Published-source average");
  });

  it.each([
    [10, "matches the lowest publishable source row (open-index)"],
    [8, "£2.00 (20%) below"],
    [12.34, "£2.34 (23%) above"],
  ] as const)("keeps the comparison calculation for reference %s", (value, explanation) => {
    const html = renderToStaticMarkup(
      <ReferenceComparison
        reference={{ ...REFERENCE, reference_price_gbp: value }}
        rows={[{ source: "open-index", amount_gbp: 10 }]}
      />,
    );

    expect(html).toContain(explanation);
    expect(html).toContain("not an offer");
    expect(html).toContain("Compared with 1 publishable source: open-index.");
  });

  it("preserves finite-source sorting and averages without mutating the supplied rows", () => {
    const rows = [
      { source: "higher-source", amount_gbp: 14 },
      { source: "unusable-source", amount_gbp: Number.NaN },
      { source: "lower-source", amount_gbp: 10 },
    ];
    const html = renderToStaticMarkup(<ReferenceComparison reference={REFERENCE} rows={rows} />);

    expect(html).toContain("£12.00");
    expect(html).toContain("Compared with 2 publishable sources: lower-source, higher-source.");
    expect(html).not.toContain("unusable-source");
    expect(rows.map((row) => row.source)).toEqual(["higher-source", "unusable-source", "lower-source"]);
  });

  it("keeps a real zero visible and invalid or missing amounts unavailable", () => {
    const html = renderToStaticMarkup(
      <ReferencePriceSummary reference={{ ...REFERENCE, reference_price_gbp: 0 }} />,
    );

    expect(html).toContain("£0.00");
    expect(html).toContain("not an offer");
    expect(formatGbp(0)).toBe("£0.00");
    for (const value of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatGbp(value)).toBe("—");
    }
  });
});
