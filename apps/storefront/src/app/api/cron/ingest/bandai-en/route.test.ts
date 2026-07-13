import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

describe("Bandai EN ingest boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  for (const [method, invoke] of [
    ["GET", GET],
    ["POST", POST],
  ] as const) {
    it(`${method} returns before any network work`, async () => {
      vi.stubEnv("CRON_SECRET", "test-cron-secret");
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("network must not be reached"));

      const response = invoke(new Request("https://example.test/api/cron/ingest/bandai-en", {
        headers: { authorization: "Bearer test-cron-secret" },
      }));
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

    it(`${method} rejects an unauthenticated request before the paused contract`, async () => {
      vi.stubEnv("CRON_SECRET", "test-cron-secret");
      const response = invoke(new Request("https://example.test/api/cron/ingest/bandai-en"));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  }
});
