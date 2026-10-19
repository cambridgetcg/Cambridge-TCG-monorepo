/**
 * The theme app extension must show shoppers only real data or the
 * merchant's own words: no invented raffles, boxes or missions, entry
 * counts, deadlines or prices (App Store requirement 1.1.4).
 */
// @vitest-environment jsdom
import * as fs from "fs";
import * as path from "path";
import { beforeEach, describe, expect, it } from "vitest";

const EXTENSION = path.resolve(__dirname, "../../../extensions/theme-app-extension-rewardspro");
const read = (file: string) => fs.readFileSync(path.join(EXTENSION, file), "utf8");
const sources = ["assets", "blocks", "snippets", "locales"].flatMap((dir) =>
  fs.readdirSync(path.join(EXTENSION, dir))
    .filter((file) => /\.(js|liquid|json)$/.test(file))
    .map((file) => `${dir}/${file}`),
);

/** Social proof, urgency and prices only a live record could supply. */
const INVENTED = [
  /\b\d+\s+entered\b/i,
  /\b\d+\s+days?\s+left\b/i,
  /[£$€]\s?\d+[\d,.]*\s+spend/i,
  /\d+\s*pts['"]/i,
  /aria-label="Sample/i,
  /\bteaser/i,
];

describe("storefront copy", () => {
  it.each(sources)("%s invents no raffles, boxes, counts or deadlines", (file) => {
    const source = read(file);
    for (const pattern of INVENTED) {
      expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
    }
  });
});

describe("guest views", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    new Function(read("assets/rp-utils.js"))();
  });

  it.each([
    {
      script: "assets/raffles.js",
      markup: `<div class="rp-raffles-root" data-state="guest" data-heading="Prize draws"
        data-guest-message="Merchant words" data-guest-cta-text="Log in" data-guest-cta-url="/account/login"></div>`,
      heading: "Prize draws",
    },
    {
      script: "assets/mystery-boxes-widget.js",
      markup: `<div id="mystery-boxes-widget-root" class="rp-mb-root" data-state="guest" data-section-title="Boxes"
        data-guest-message="Merchant words" data-guest-cta-text="Log in" data-guest-cta-url="/account/login"></div>`,
      heading: "Boxes",
    },
  ])("$script shows only the merchant's prompt to guests", ({ script, markup, heading }) => {
    document.body.innerHTML = markup;
    new Function(read(script))();

    const root = document.body.firstElementChild as HTMLElement;
    const text = root.textContent!.replace(/\s+/g, " ").trim();
    expect(text).toBe(`${heading} Merchant words Log in`);
    expect(root.querySelector("a")?.getAttribute("href")).toBe("/account/login");
  });
});
