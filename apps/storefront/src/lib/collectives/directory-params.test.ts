import { describe, expect, it } from "vitest";
import {
  normalizeDirectoryPageParams,
  reconcileDirectoryPage,
} from "./directory-params";

describe("organisation directory HTML query normalization", () => {
  it("ignores repeated values with a visible adjustment signal", () => {
    expect(
      normalizeDirectoryPageParams({
        q: ["first", "second"],
        kind: ["lab", "shop"],
        page: ["2", "3"],
      }),
    ).toEqual({ active: {}, pageNumber: 1, adjusted: true });
  });

  it("keeps one bounded value and clamps a huge page visibly", () => {
    expect(
      normalizeDirectoryPageParams({
        q: "  quiet lab  ",
        kind: "lab",
        page: "999999999999999999999999",
      }),
    ).toEqual({
      active: { q: "quiet lab", kind: "lab" },
      pageNumber: 101,
      adjusted: true,
    });
  });

  it("ignores an unknown kind rather than broadening it invisibly", () => {
    expect(normalizeDirectoryPageParams({ kind: "everyone" })).toEqual({
      active: {},
      pageNumber: 1,
      adjusted: true,
    });
  });

  it("visibly ignores malformed pages and control-bearing text", () => {
    expect(
      normalizeDirectoryPageParams({ page: "abc", q: "quiet\0lab" }),
    ).toEqual({
      active: {},
      pageNumber: 1,
      adjusted: true,
    });
  });

  it("normalizes an empty directory to page one without a redundant query", () => {
    expect(reconcileDirectoryPage(100, 0)).toEqual({
      pageNumber: 1,
      lastPage: 1,
      adjusted: true,
      needsRequery: false,
    });
  });

  it("never advertises pagination beyond the bounded offset window", () => {
    expect(reconcileDirectoryPage(101, 10_000)).toEqual({
      pageNumber: 101,
      lastPage: 101,
      adjusted: false,
      needsRequery: false,
    });
  });
});
