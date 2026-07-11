import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ANSWERING_RHYMES } from "@/lib/culture/answering-rhymes";
import AnsweringRhymeConstellation from "./AnsweringRhymeConstellation";

describe("AnsweringRhymeConstellation", () => {
  it("states both objects, the relation kinds, and the influence boundary", () => {
    const relation = ANSWERING_RHYMES[0];
    const html = renderToStaticMarkup(
      <AnsweringRhymeConstellation relations={ANSWERING_RHYMES} />,
    );

    expect(html).toContain(relation.card.sku);
    expect(html).toContain(relation.artwork.title);
    expect(html).toContain("material echo");
    expect(html).toContain("historical thread");
    expect(html).toContain("pairing must not be presented as one");
  });

  it("maps identities without copying either object's image", () => {
    const relation = ANSWERING_RHYMES[0];
    const html = renderToStaticMarkup(
      <AnsweringRhymeConstellation relations={ANSWERING_RHYMES} />,
    );

    expect(html).not.toContain("<" + "img");
    expect(html).not.toContain(relation.card.image_url);
    expect(html).not.toContain(relation.artwork.image_url);
    expect(html).toContain("reference-only");
    expect(html).toContain("NOASSERTION");
  });
});
