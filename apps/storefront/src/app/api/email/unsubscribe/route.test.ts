import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyUnsubscribe: vi.fn(),
  verifyUnsubscribeToken: vi.fn(),
}));

vi.mock("@/lib/email/preferences", () => ({
  applyUnsubscribe: mocks.applyUnsubscribe,
  verifyUnsubscribeToken: mocks.verifyUnsubscribeToken,
  CATEGORY_LABELS: { marketing: "Newsletters + promotions" },
}));

import { GET, POST } from "./route";

beforeEach(() => {
  mocks.applyUnsubscribe.mockReset();
  mocks.verifyUnsubscribeToken.mockReset();
  mocks.applyUnsubscribe.mockResolvedValue({ changed: true });
  mocks.verifyUnsubscribeToken.mockReturnValue({
    userId: "user-1",
    category: "marketing",
    issuedAt: Date.now(),
  });
});

describe("one-click unsubscribe request privacy", () => {
  it.each([
    ["GET", GET],
    ["POST", POST],
  ] as const)("%s does not pass request metadata into persistence", async (method, handler) => {
    const response = await handler(new Request(
      "https://cambridgetcg.com/api/email/unsubscribe?token=signed",
      {
        method,
        headers: {
          "x-forwarded-for": "203.0.113.2",
          "user-agent": "private-browser-detail",
        },
      },
    ));

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(400);
    expect(mocks.applyUnsubscribe).toHaveBeenCalledWith({
      userId: "user-1",
      category: "marketing",
    });
  });
});
