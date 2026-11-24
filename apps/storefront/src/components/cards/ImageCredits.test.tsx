import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImageCredits } from "./ImageCredits";

describe("ImageCredits", () => {
  it("prints each credit line once, with the label the pictures are shown under", () => {
    const markup = renderToStaticMarkup(<ImageCredits credits={["© One", null, "© Two", "© One", undefined, " "]} />);
    expect(markup).toContain("English reference images · printing not verified · © One · © Two");
  });

  it("prints nothing when no picture on screen is an official one", () => {
    expect(renderToStaticMarkup(<ImageCredits credits={[null, undefined, ""]} />)).toBe("");
  });
});
