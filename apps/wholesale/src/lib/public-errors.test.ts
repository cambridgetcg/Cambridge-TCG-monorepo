import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_INTERNAL_ERROR, redactInternalError } from "./public-errors";

afterEach(() => vi.restoreAllMocks());

describe("public errors", () => {
  it("logs the exception server-side without returning its detail", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretDetail = new Error("PRIVATE_DATABASE_ERROR_DETAIL");

    expect(redactInternalError("test", secretDetail)).toBe(
      PUBLIC_INTERNAL_ERROR,
    );
    expect(log).toHaveBeenCalledWith("[test]", secretDetail);
    expect(redactInternalError("test", secretDetail)).not.toContain(
      "PRIVATE_DATABASE_ERROR_DETAIL",
    );
  });
});
