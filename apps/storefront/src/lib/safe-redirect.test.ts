import { describe, expect, it } from "vitest";
import { safeRelativeRedirectPath } from "./safe-redirect";

describe("safeRelativeRedirectPath", () => {
  it("allows an origin-relative path", () => {
    expect(safeRelativeRedirectPath("/prices?game=one-piece", "/")).toBe(
      "/prices?game=one-piece",
    );
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "relative/path",
  ])("rejects a foreign or ambiguous path: %s", (candidate) => {
    expect(safeRelativeRedirectPath(candidate, "/prices")).toBe("/prices");
  });
});
