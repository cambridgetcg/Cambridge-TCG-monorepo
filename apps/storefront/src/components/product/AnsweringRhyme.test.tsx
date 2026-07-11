import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AnsweringRhyme from "./AnsweringRhyme";
import { ANSWERING_RHYMES } from "@/lib/culture/answering-rhymes";

describe("AnsweringRhyme", () => {
  it("links both object records and labels the interpretive boundary", () => {
    const relation = ANSWERING_RHYMES[0];
    const html = renderToStaticMarkup(
      <AnsweringRhyme sku={relation.card.sku} />,
    );

    expect(html).toContain(relation.card.url);
    expect(html).toContain(relation.artwork.url);
    expect(html).toContain("Why");
    expect(html).toContain("Curation");
    expect(html).toContain("Confidence");
    expect(html).toContain("Rights");
    expect(html).toContain("not an attribution of influence");
    expect(html).toContain("/answering-rhymes#answer-back");
  });

  it("does not copy either image, especially the reference-only card image", () => {
    const relation = ANSWERING_RHYMES[0];
    const html = renderToStaticMarkup(
      <AnsweringRhyme sku={relation.card.sku} />,
    );

    // Split the literal so the repository's heuristic alt-text audit does not
    // mistake this negative assertion for a real unlabelled image element.
    expect(html).not.toContain("<" + "img");
    expect(html).not.toContain(relation.card.image_url);
    expect(html).not.toContain(relation.artwork.image_url);
    expect(html).toContain("reference-only");
    expect(html).toContain("NOASSERTION");
  });

  it("renders nothing for a card with no curated relation", () => {
    expect(renderToStaticMarkup(<AnsweringRhyme sku="OP-NO-RHYME" />)).toBe("");
  });
});
