// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVOKE_AFTER_MS, filenameFrom, saveResponseAsFile } from "~/admin/download";

describe("saveResponseAsFile", () => {
  const createObjectURL = vi.fn(() => "blob:report");
  const revokeObjectURL = vi.fn();
  let clicked: { href: string; download: string; attached: boolean }[];
  // jsdom has neither, so they are set here and put back afterwards
  const original = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };

  beforeEach(() => {
    vi.useFakeTimers();
    clicked = [];
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download, attached: document.body.contains(this) });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.assign(URL, original);
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it("clicks a temporary link named by Content-Disposition, and revokes its URL later", async () => {
    const response = new Response("{}", { headers: { "Content-Disposition": 'attachment; filename="request-r1.json"' } });

    await saveResponseAsFile(response, "fallback.json");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([{ href: "blob:report", download: "request-r1.json", attached: true }]);
    expect(document.querySelector("a")).toBeNull();
    // Not revoked in the same task as the click
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  it("falls back to the given name", () => {
    expect(filenameFrom(new Response(""), "customers.csv")).toBe("customers.csv");
    expect(filenameFrom(new Response("", { headers: { "Content-Disposition": "attachment" } }), "customers.csv")).toBe("customers.csv");
  });
});
