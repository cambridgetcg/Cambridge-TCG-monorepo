/**
 * Cross-widget contract test.
 *
 * Every storefront widget now expects `window.RPUtils` to be defined before
 * its IIFE runs (the `rp_utils_loader` Liquid snippet loads rp-utils.js
 * first). If it's absent, each widget must log a clear, scoped error and
 * refuse to render — it must NOT crash the page with an uncaught
 * ReferenceError, because that would take down the rest of the theme.
 *
 * This file evaluates each widget's IIFE into a fresh jsdom `window` that
 * has NO RPUtils, and asserts that:
 *   1) The widget logs an error identifying itself.
 *   2) No exception leaks past the IIFE.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ASSETS = path.resolve(
  __dirname,
  "../../extensions/theme-app-extension-rewardspro/assets"
);

const WIDGETS: Array<{ file: string; scope: string }> = [
  { file: "membership-widget.js", scope: "RewardsWidget" },
  { file: "raffles.js", scope: "RafflesWidget" },
  { file: "mystery-boxes-widget.js", scope: "MysteryBoxes" },
  { file: "missions-widget.js", scope: "MissionsWidget" },
  { file: "gift-cards.js", scope: "RP:GiftCards" }
];

describe("Storefront widgets — missing RPUtils guard", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Fresh window state: no RPUtils.
    (window as unknown as { RPUtils?: unknown }).RPUtils = undefined;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it.each(WIDGETS)(
    "$file refuses to run when window.RPUtils is missing and logs a scoped error",
    ({ file, scope }) => {
      const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");

      // Eval the IIFE into the current jsdom window. The guard must short-
      // circuit; no exception should surface.
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        new Function(source)();
      }).not.toThrow();

      // Exactly one relevant error log (the scoped warning).
      const relevant = errorSpy.mock.calls.filter((args) =>
        args.some((a) => typeof a === "string" && a.includes(scope))
      );
      expect(relevant.length).toBeGreaterThan(0);
      expect(relevant[0].join(" ")).toMatch(/RPUtils is missing/i);
    }
  );
});
