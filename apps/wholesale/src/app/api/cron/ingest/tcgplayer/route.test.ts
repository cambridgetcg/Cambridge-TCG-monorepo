import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: vi.fn(() => null) }));

import { POST } from "./route";

describe("POST /api/cron/ingest/tcgplayer", () => {
  it("fails closed before dispatching an ingest mode", async () => {
    const response = await POST(
      new NextRequest("https://wholesale.example/api/cron/ingest/tcgplayer?mode=catalog", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
    expect(body.network_request_made).toBe(false);
  });
});
