import { afterEach, describe, expect, it } from "vitest";
import { requireCronAuth } from "./cron-auth";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("cron authentication", () => {
  it("accepts only the configured bearer secret", () => {
    process.env.CRON_SECRET = "test-cron-secret";

    expect(
      requireCronAuth(
        new Request("https://cambridgetcg.example/api/cron/job", {
          headers: { authorization: "Bearer test-cron-secret" },
        }),
      ),
    ).toBeNull();
  });

  it("rejects spoofable marker headers and query-string secrets", () => {
    process.env.CRON_SECRET = "test-cron-secret";

    const marker = requireCronAuth(
      new Request("https://cambridgetcg.example/api/cron/job", {
        headers: { "x-vercel-cron": "true" },
      }),
    );
    const query = requireCronAuth(
      new Request(
        "https://cambridgetcg.example/api/cron/job?secret=test-cron-secret",
      ),
    );

    expect(marker?.status).toBe(401);
    expect(query?.status).toBe(401);
    expect(marker?.headers.get("cache-control")).toBe("no-store");
    expect(query?.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed when the secret is missing", () => {
    delete process.env.CRON_SECRET;

    const response = requireCronAuth(
      new Request("https://cambridgetcg.example/api/cron/job", {
        headers: { "x-vercel-cron": "true" },
      }),
    );

    expect(response?.status).toBe(503);
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });
});
