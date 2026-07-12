import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { requireCronAuth } from "./cron-auth";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("cron authentication", () => {
  it("accepts Bearer and rejects spoofable or URL-carried signals", () => {
    process.env.CRON_SECRET = "test-cron-secret";
    expect(requireCronAuth(new NextRequest("https://example.test/api/cron", {
      headers: { authorization: "Bearer test-cron-secret" },
    }))).toBeNull();
    expect(requireCronAuth(new NextRequest("https://example.test/api/cron", {
      headers: { "x-vercel-cron": "true" },
    }))?.status).toBe(401);
    expect(requireCronAuth(
      new NextRequest("https://example.test/api/cron?secret=test-cron-secret"),
    )?.status).toBe(401);
  });
});
