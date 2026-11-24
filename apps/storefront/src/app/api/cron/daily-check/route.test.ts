import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDailyCheck } from "@/lib/observability/daily-check";
import { GET, maxDuration } from "./route";

vi.mock("@/lib/observability/daily-check", () => ({ runDailyCheck: vi.fn() }));
const call = (authorization: string) => GET(new Request("https://cambridgetcg.example/api/cron/daily-check", { headers: { authorization } }));

beforeEach(() => { vi.mocked(runDailyCheck).mockReset(); vi.stubEnv("CRON_SECRET", "test-cron-secret"); });
afterEach(() => vi.unstubAllEnvs());

describe("daily check cron", () => {
  it("does nothing without the cron secret", async () => {
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(runDailyCheck).not.toHaveBeenCalled();
  });

  it("answers 503 only when a message was due and could not be sent", async () => {
    vi.mocked(runDailyCheck).mockResolvedValueOnce({ ok: true, mailed: true, outcome: "ran", found: ["a fault it reported"] });
    expect((await call("Bearer test-cron-secret")).status).toBe(200);
    vi.mocked(runDailyCheck).mockResolvedValueOnce({ ok: false, mailed: false, outcome: "unavailable:mail-refused", found: [] });
    expect((await call("Bearer test-cron-secret")).status).toBe(503);
  });

  it("has room for the walk, the reads, the message and the record", () => {
    expect(maxDuration).toBeGreaterThanOrEqual(75 + 3 * 10 + 20 + 10);
    expect(maxDuration).toBeLessThanOrEqual(300);
  });
});
