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
    const response = new Response("{}", {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="request-r1.json"' },
    });

    await saveResponseAsFile(response, "fallback.json", "application/json");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([{ href: "blob:report", download: "request-r1.json", attached: true }]);
    expect(document.querySelector("a")).toBeNull();
    // Not revoked in the same task as the click
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  // A23-F4: an answer of another kind (a sign-in page, an error page) is never saved as the file
  it("saves only an answer of the kind asked for, and saves nothing otherwise", async () => {
    const csv = new Response("a,b\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8" } });
    await saveResponseAsFile(csv, "customers.csv", "text/csv");
    expect(clicked).toHaveLength(1);

    for (const [body, type, expected] of [
      ["<html>Sign in</html>", "text/html; charset=utf-8", "application/json"],
      ["{}", "application/json", "text/csv"],
      ["{}", null, "application/json"],
      ["{}", "application/jsonp", "application/json"],
    ] as const) {
      const response = new Response(body, { headers: type ? { "Content-Type": type } : {} });
      if (!type) response.headers.delete("Content-Type");
      await expect(saveResponseAsFile(response, "file", expected), String(type)).rejects.toThrow(/not the file/);
    }
    expect(clicked).toHaveLength(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("falls back to the given name", () => {
    expect(filenameFrom(new Response(""), "customers.csv")).toBe("customers.csv");
    expect(filenameFrom(new Response("", { headers: { "Content-Disposition": "attachment" } }), "customers.csv")).toBe("customers.csv");
  });
});
