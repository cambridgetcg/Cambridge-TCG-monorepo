/**
 * The theme app extension must show shoppers only real data or the
 * merchant's own words: no invented raffles, boxes or missions, entry
 * counts, deadlines or prices (App Store requirement 1.1.4).
 */
import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

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
