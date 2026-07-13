import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ReferenceComparison,
  ReferencePriceSummary,
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
});
