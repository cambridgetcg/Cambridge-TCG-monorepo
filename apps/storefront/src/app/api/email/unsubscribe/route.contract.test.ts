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

describe("email unsubscribe request-metadata contract", () => {
  beforeEach(() => {
    mocks.applyUnsubscribe.mockReset();
    mocks.verifyUnsubscribeToken.mockReset();
    mocks.verifyUnsubscribeToken.mockReturnValue({
      userId: "user-1",
      category: "marketing",
      issuedAt: Date.now(),
    });
    mocks.applyUnsubscribe.mockResolvedValue(undefined);
  });

  it.each([
    ["GET", GET, "email_link"],
    ["POST", POST, "list_unsubscribe"],
  ] as const)(
    "%s does not pass forwarded IP or user-agent into persistence",
    async (_method, handler, source) => {
      const request = new Request(
        "https://example.test/api/email/unsubscribe?token=signed-token",
        {
          method: _method,
          headers: {
            "x-forwarded-for": "203.0.113.9",
            "user-agent": "privacy-contract-test/1.0",
          },
        },
      );

      const response = await handler(request);

      expect(response.status).toBe(_method === "GET" ? 307 : 200);
      expect(mocks.applyUnsubscribe).toHaveBeenCalledWith({
        userId: "user-1",
        category: "marketing",
        source,
      });
    },
  );
});
