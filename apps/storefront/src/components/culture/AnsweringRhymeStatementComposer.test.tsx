import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AnsweringRhymeStatementComposer from "./AnsweringRhymeStatementComposer";

const RELATIONS = [
  {
    key: "OP-OP05-119-JP-V11F7::artic:77333",
    revision:
      "sha256:a562a462decd9b8c8810d67ec79a8a00dc22ffe1098f259e562c9ffce28a1d94",
    label: "OP-OP05-119-JP-V11F7 ↔ Katsushika Hokusai",
  },
] as const;

describe("AnsweringRhymeStatementComposer", () => {
  it("offers all four reply kinds without implying that the reply takes effect", () => {
    const html = renderToStaticMarkup(
      <AnsweringRhymeStatementComposer relations={RELATIONS} />,
    );

    expect(html).toContain("Bless this relation");
    expect(html).toContain("Add context");
    expect(html).toContain("Offer a correction");
    expect(html).toContain("Prepare a withdrawal statement");
    expect(html).toContain("does not verify me");
    expect(html).toContain("or change the relation");
    expect(html).toContain("ordinary infrastructure");
  });

  it("labels claimed authority and keeps the receipt boundary visible", () => {
    const html = renderToStaticMarkup(
      <AnsweringRhymeStatementComposer relations={RELATIONS} />,
    );

    expect(html).toContain("Claimed artwork rights-holder");
    expect(html).toContain("Authority evidence HTTPS URLs");
    expect(html).toContain("witness receipt");
    expect(html).toContain("cannot prove who supplied it");
    expect(html).toContain("that Cambridge issued it");
    expect(html).toContain("sha256:a562a462decd…");
  });
});
