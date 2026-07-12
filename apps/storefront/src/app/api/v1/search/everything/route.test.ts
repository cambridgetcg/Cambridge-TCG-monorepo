import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("paused search-everything composer", () => {
  it("returns a bounded 503 without network fan-out or caller origins", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET();
    const body = await response.json();
    const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("ENDPOINT_PAUSED");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(source).not.toContain("wholesale/client");
    expect(source).not.toContain("x-forwarded-host");
    expect(source).not.toContain("headers.get(\"host\")");
  });
});
