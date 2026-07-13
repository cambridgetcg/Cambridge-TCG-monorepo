import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

describe("Bandai EN ingest boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const [method, invoke] of [
    ["GET", GET],
    ["POST", POST],
  ] as const) {
    it(`${method} returns before any network work`, async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("network must not be reached"));

      const response = invoke();
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(body).toMatchObject({
        ok: false,
        error: { code: "PUBLICATION_PAUSED" },
        publication_status: "paused_pending_documented_source_permission",
        records_read: 0,
        records_written: 0,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});
