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
    "/path\\evil.example",
    "/\t/evil.example/path",
    "/\n/evil.example/path",
    "/\r/evil.example/path",
    "/\u0000/evil.example/path",
    "/\u007f/evil.example/path",
    "/ /evil.example/path",
    "/safe/..//evil.example/path",
    "/%2e%2e//evil.example/path",
    "relative/path",
  ])("rejects a foreign or ambiguous path: %s", (candidate) => {
    expect(safeRelativeRedirectPath(candidate, "/prices")).toBe("/prices");
  });

  it("retains the path, query and fragment while encoding Unicode for a header", () => {
    expect(safeRelativeRedirectPath("/カード?q=ピカチュウ#説明", "/")).toBe(
      "/%E3%82%AB%E3%83%BC%E3%83%89?q=%E3%83%94%E3%82%AB%E3%83%81%E3%83%A5%E3%82%A6#%E8%AA%AC%E6%98%8E",
    );
    expect(safeRelativeRedirectPath("/prices?q=Mr%20Mime#results", "/")).toBe("/prices?q=Mr%20Mime#results");
  });

  it("fails closed even when the fallback is unsafe", () => {
    expect(safeRelativeRedirectPath(null, "https://evil.example")).toBe("/");
    expect(safeRelativeRedirectPath("", "//evil.example")).toBe("/");
  });
});
