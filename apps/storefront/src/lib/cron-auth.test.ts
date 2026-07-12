import { afterEach, describe, expect, it } from "vitest";
import { requireCronAuth } from "./cron-auth";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("cron authentication", () => {
  it("accepts only the configured Bearer secret", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    expect(requireCronAuth(new Request("https://example.test/api/cron", {
      headers: { authorization: "Bearer test-cron-secret" },
    }))).toBeNull();

    const spoofed = requireCronAuth(new Request("https://example.test/api/cron", {
      headers: { "x-vercel-cron": "true" },
    }));
    expect(spoofed?.status).toBe(401);

    const querySecret = requireCronAuth(
      new Request("https://example.test/api/cron?secret=test-cron-secret"),
    );
    expect(querySecret?.status).toBe(401);
  });

  it("fails closed when no secret is configured", () => {
    delete process.env.CRON_SECRET;
    const response = requireCronAuth(new Request("https://example.test/api/cron"));
    expect(response?.status).toBe(503);
  });
});
